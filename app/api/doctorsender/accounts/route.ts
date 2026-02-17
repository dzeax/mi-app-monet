import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { listDoctorSenderAccounts } from '@/lib/doctorsender/accounts';

const ALLOWED_ROLES = new Set(['admin', 'editor']);

type HttpError = Error & { status?: number };

async function createSupabaseRouteClient() {
 const cookieStore = await cookies();
 return createRouteHandlerClient({ cookies: () => cookieStore as any });
}

async function ensureAuthorized() {
  const supabase = await createSupabaseRouteClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const user = session?.user ?? null;
  if (!user) {
    const error: HttpError = new Error('Not authenticated.');
    error.status = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile || profile.is_active === false || !ALLOWED_ROLES.has(String(profile.role))) {
    const error: HttpError = new Error('Forbidden.');
    error.status = 403;
    throw error;
  }

  return { supabase, userId: user.id };
}

export async function GET() {
  try {
    await ensureAuthorized();
    return NextResponse.json({ accounts: listDoctorSenderAccounts() });
  } catch (error) {
    const status = (error as HttpError)?.status ?? 500;
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}

