import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { mapPlanningFromDb, type PlanningDbRow } from '@/lib/planning/db';
import { sendDoctorSenderPreview } from '@/lib/doctorsender/sendPreview';

type HttpError = Error & { status?: number };

const ALLOWED_ROLES = new Set(['admin', 'editor']);

export const runtime = 'nodejs';

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

  return { userId: user.id, admin: supabaseAdmin() };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { admin } = await ensureAuthorized();
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    overrides?: { listName?: string | null };
  };

  const nowIso = new Date().toISOString();

  try {
    const { data, error } = await admin.from('campaign_planning').select('*').eq('id', id).single();

    if (error) {
      console.error('send-preview fetch error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const planning = mapPlanningFromDb(data as PlanningDbRow);
    const previewResult = await sendDoctorSenderPreview({
      campaign: planning,
      overrides: body?.overrides ?? {},
    });

    const dsCampaignId = previewResult.campaignId;
    const dsStatus = previewResult.status ?? 'preview_sent';

    await admin
      .from('campaign_planning')
      .update({
        ds_campaign_id: String(dsCampaignId),
        ds_status: dsStatus,
        ds_last_sync_at: nowIso,
        ds_error: null,
      })
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      campaignId: dsCampaignId,
      status: previewResult.status,
      sendDate: previewResult.sendDate,
      listUnsubscribe: previewResult.listUnsubscribe,
      preflight: previewResult.preflight,
      templateId: previewResult.templateId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send preview.';
    console.error('send-preview error', error);
    await admin
      .from('campaign_planning')
      .update({
        ds_status: 'error',
        ds_error: message,
        ds_last_sync_at: nowIso,
      })
      .eq('id', id);
    const status = (error as HttpError)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
