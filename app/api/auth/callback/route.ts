import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Session } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const {
    event,
    session,
  }: { event: SupabaseAuthEvent; session: Session | null } = await request.json();

  const userId = session?.user?.id ?? null;

  if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
    if (session.access_token && session.refresh_token) {
      const { error } = await supabase.auth.setSession(session);
      if (error) {
        console.warn('[auth-callback] setSession failed', { event, userId, message: error.message });
      }
    } else {
      console.warn('[auth-callback] Skipping setSession (missing tokens)', { event, userId });
    }
  }

  if (['SIGNED_OUT', 'USER_DELETED'].includes(event)) {
    // Local-only cleanup avoids refresh token errors when cookies are already cleared.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      console.warn('[auth-callback] signOut failed', { event, userId, message: error.message });
    }
  }

  return NextResponse.json({ ok: true });
}

