import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabase/admin';

const DEFAULT_CLIENT = 'emg';
export const runtime = 'nodejs';

const isMissingSyncStateTableError = (error: unknown) => {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.toLowerCase().includes('crm_jira_sync_state');
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const admin = supabaseAdmin();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client') || DEFAULT_CLIENT;

  try {
    const { data, error } = await admin
      .from('crm_jira_sync_state')
      .select(
        'client_slug,is_running,locked_until,last_cursor_at,last_started_at,last_finished_at,last_success_at,last_error,last_imported,last_pages,updated_at',
      )
      .eq('client_slug', client)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      status: {
        available: true,
        client,
        isRunning: Boolean(data?.is_running),
        lockedUntil: data?.locked_until ?? null,
        lastCursorAt: data?.last_cursor_at ?? null,
        lastStartedAt: data?.last_started_at ?? null,
        lastFinishedAt: data?.last_finished_at ?? null,
        lastSuccessAt: data?.last_success_at ?? null,
        lastError: data?.last_error ?? null,
        lastImported: Number(data?.last_imported ?? 0),
        lastPages: Number(data?.last_pages ?? 0),
        updatedAt: data?.updated_at ?? null,
      },
    });
  } catch (err) {
    if (isMissingSyncStateTableError(err)) {
      return NextResponse.json({
        status: {
          available: false,
          client,
          isRunning: false,
          lockedUntil: null,
          lastCursorAt: null,
          lastStartedAt: null,
          lastFinishedAt: null,
          lastSuccessAt: null,
          lastError: null,
          lastImported: 0,
          lastPages: 0,
          updatedAt: null,
        },
      });
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
