import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const payloadSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'editor']),
});

type InvitePayload = z.infer<typeof payloadSchema>;

function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.errors.map((err) => err.message).join(', ') || 'Invalid payload';
  }
  if (error instanceof Error) return error.message;
  return 'Invalid payload';
}

function formatUnknownError(prefix: string, error: unknown): string {
  const suffix = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${suffix}`;
}

async function lookupUserIdByEmail(email: string) {
  const admin = supabaseAdmin();

  // Try SDK method if available in this version
  const anyAdmin: any = admin as any;
  try {
    const getByEmail = anyAdmin?.auth?.admin?.getUserByEmail;
    if (typeof getByEmail === 'function') {
      const { data, error } = await getByEmail.call(anyAdmin.auth.admin, email);
      if (error) throw error;
      return data?.user?.id ?? null;
    }
  } catch (_) {
    // ignore and fall back to listUsers
  }

  // Fallback: paginate listUsers and filter by email
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = (data?.users || []).find((u: any) => (u?.email || '').toLowerCase() === email);
    if (found?.id) return String(found.id);
    const total = (data as any)?.total || 0;
    const got = (data?.users || []).length;
    if (page * perPage >= total || got === 0) break;
    page += 1;
  }
  return null;
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (currentUserError) {
    return NextResponse.json({ error: currentUserError.message }, { status: 500 });
  }

  if (!currentUser || currentUser.is_active === false || currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let parsed: InvitePayload;
  try {
    const body = await req.json();
    parsed = payloadSchema.parse(body);
  } catch (error) {
    return NextResponse.json({ error: formatValidationError(error) }, { status: 400 });
  }

  const email = parsed.email.trim().toLowerCase();
  const role = parsed.role;

  const admin = supabaseAdmin();

  let authUserId: string | null = null;
  let invitationSent = false;

  try {
    authUserId = await lookupUserIdByEmail(email);
  } catch (error) {
    return NextResponse.json({ error: formatUnknownError('Failed to look up user', error) }, { status: 500 });
  }

  if (!authUserId) {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteError) {
      // If user already exists, fall back to lookup
      const already = /already\s+registered|exists/i.test(inviteError.message || '');
      if (!already) {
        return NextResponse.json({ error: inviteError.message }, { status: 400 });
      }
    } else {
      invitationSent = true;
      authUserId = inviteData?.user?.id ?? null;
    }

    if (!authUserId) {
      try {
        authUserId = await lookupUserIdByEmail(email);
      } catch (error) {
        return NextResponse.json({ error: formatUnknownError('Invite succeeded but user lookup failed', error) }, { status: 500 });
      }
    }
  }

  if (!authUserId) {
    return NextResponse.json({ error: 'Could not determine Supabase user id after invitation.' }, { status: 500 });
  }

  const { error: upsertError } = await admin
    .from('app_users')
    .upsert(
      {
        user_id: authUserId,
        email,
        role,
        is_active: true,
      },
      { onConflict: 'email' }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: authUserId, invitationSent });
}
