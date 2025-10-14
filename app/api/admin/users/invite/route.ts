import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';

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

  async function fetchAuthUserId(): Promise<string | null> {
    const { data, error } = await admin
      .from('auth.users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      const err = error as PostgrestError;
      if (err.code === 'PGRST116') return null;
      throw new Error(err.message);
    }

    return data?.id ?? null;
  }

  let authUserId: string | null = null;
  let invitationSent = false;

  try {
    authUserId = await fetchAuthUserId();
  } catch (error) {
    return NextResponse.json({ error: formatUnknownError('Failed to query auth.users', error) }, { status: 500 });
  }

  if (!authUserId) {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }
    authUserId = inviteData?.user?.id ?? null;
    invitationSent = true;

    if (!authUserId) {
      try {
        authUserId = await fetchAuthUserId();
      } catch (error) {
        return NextResponse.json(
          { error: formatUnknownError('Invite succeeded but user lookup failed', error) },
          { status: 500 }
        );
      }
    }
  }

  if (!authUserId) {
    return NextResponse.json(
      { error: 'Could not determine Supabase user id after invitation.' },
      { status: 500 }
    );
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

  return NextResponse.json({
    ok: true,
    userId: authUserId,
    invitationSent,
  });
}
