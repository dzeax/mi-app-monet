import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export const dynamic = 'force-dynamic';

type SupabaseAuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'PASSWORD_RECOVERY'
  | 'MFA_CHALLENGE_VERIFIED'
  | 'MFA_CHALLENGE_FAILED';

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { event, session }: { event: SupabaseAuthEvent; session: any } = await request.json();

  if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
    await supabase.auth.setSession(session);
  }

  if (['SIGNED_OUT', 'USER_DELETED'].includes(event)) {
    await supabase.auth.signOut();
  }

  return NextResponse.json({ ok: true });
}
