import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const payloadSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'editor']).optional(),
  action: z.enum(['invite', 'magic_link']).default('invite'),
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

function resolveBaseUrl(req: Request): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.SUPABASE_REDIRECT_URL ||
    '';

  if (envUrl) {
    try {
      return new URL(envUrl).origin;
    } catch {
      // ignore invalid env url, fall back to request headers
    }
  }

  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    return `${forwardedProto ?? 'https'}://${forwardedHost}`;
  }

  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function lookupUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const anyAdmin: any = admin as any;

  try {
    const getByEmail = anyAdmin?.auth?.admin?.getUserByEmail;
    if (typeof getByEmail === 'function') {
      const { data, error } = await getByEmail.call(anyAdmin.auth.admin, email);
      if (error) throw error;
      return data?.user?.id ?? null;
    }
  } catch {
    // Ignore and fall through to listUsers
  }

  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((user: any) => (user?.email || '').toLowerCase() === email);
    if (found?.id) return String(found.id);
    const total = (data as any)?.total || 0;
    if (page * perPage >= total || users.length === 0) break;
    page += 1;
  }

  return null;
}

async function sendMagicLink(
  admin: SupabaseClient,
  email: string,
  redirectTo: string
): Promise<void> {
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
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
  const role = parsed.role ?? 'editor';
  const action = parsed.action;

  const admin = supabaseAdmin();
  const redirectBase = resolveBaseUrl(req);
  const redirectTo = new URL('/auth/callback', redirectBase).toString();

  if (action === 'magic_link') {
    let userId: string | null = null;
    try {
      userId = await lookupUserIdByEmail(admin, email);
    } catch (error) {
      return NextResponse.json(
        { error: formatUnknownError('Failed to look up user', error) },
        { status: 500 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'No Supabase account found for this email. Send an invitation first.' },
        { status: 400 }
      );
    }

    try {
      await sendMagicLink(admin, email, redirectTo);
    } catch (error) {
      return NextResponse.json(
        { error: formatUnknownError('Could not send magic link', error) },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId,
      invitationSent: true,
      mode: 'magic_link',
    });
  }

  let authUserId: string | null = null;
  let invitationSent = false;

  try {
    authUserId = await lookupUserIdByEmail(admin, email);
  } catch (error) {
    return NextResponse.json({ error: formatUnknownError('Failed to look up user', error) }, { status: 500 });
  }

  if (!authUserId) {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteError) {
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
        authUserId = await lookupUserIdByEmail(admin, email);
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
    mode: 'invite',
  });
}

