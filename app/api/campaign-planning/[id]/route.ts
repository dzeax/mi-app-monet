import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { mapPlanningFromDb, mapPlanningPatch, type PlanningDbPatch, type PlanningDbRow } from '@/lib/planning/db';
import { campaignPlanningSupportsProgrammedAt } from '@/lib/planning/schema';
import type { PlanningDraft } from '@/components/campaign-planning/types';

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

function buildDbPatch(patch: Partial<PlanningDraft>): PlanningDbPatch {
  const raw: PlanningDbPatch = {};
  if (patch.date !== undefined) raw.date = patch.date ?? null;
  if (patch.name !== undefined) raw.name = patch.name ?? null;
  if (patch.partner !== undefined) raw.partner = patch.partner ?? null;
  if (patch.database !== undefined) raw.database = patch.database ?? null;
  if (patch.geo !== undefined) raw.geo = patch.geo ?? null;
  if (patch.price !== undefined) raw.price = patch.price ?? null;
  if (patch.type !== undefined) raw.type = patch.type ?? null;
  if (patch.status !== undefined) raw.status = patch.status ?? null;
  if (patch.notes !== undefined) raw.notes = patch.notes ?? null;
  if (patch.subject !== undefined) raw.subject = patch.subject ?? null;
  if (patch.html !== undefined) raw.html = patch.html ?? null;
  if (patch.fromName !== undefined) raw.from_name = patch.fromName ?? null;
  if (patch.fromEmail !== undefined) raw.from_email = patch.fromEmail ?? null;
  if (patch.replyTo !== undefined) raw.reply_to = patch.replyTo ?? null;
  if (patch.unsubscribeUrl !== undefined) raw.unsubscribe_url = patch.unsubscribeUrl ?? null;
  if (patch.categoryId !== undefined) raw.category_id = patch.categoryId ?? null;
  if (patch.languageId !== undefined) raw.language_id = patch.languageId ?? null;
  if (patch.trackingDomain !== undefined) raw.tracking_domain = patch.trackingDomain ?? null;
  if (patch.previewRecipients !== undefined) {
    raw.preview_recipients = Array.isArray(patch.previewRecipients)
      ? patch.previewRecipients.join(',')
      : (patch.previewRecipients as unknown as string) ?? null;
  }
  if (patch.dsCampaignId !== undefined) raw.ds_campaign_id = patch.dsCampaignId ?? null;
  if (patch.dsStatus !== undefined) raw.ds_status = patch.dsStatus ?? null;
  if (patch.dsLastSyncAt !== undefined) raw.ds_last_sync_at = patch.dsLastSyncAt ?? null;
  if (patch.dsError !== undefined) raw.ds_error = patch.dsError ?? null;
  if (patch.reportingCampaignId !== undefined) raw.reporting_campaign_id = patch.reportingCampaignId ?? null;
  return mapPlanningPatch(raw);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthorized();
    const admin = supabaseAdmin();
    const { id } = await context.params;

    const body = (await request.json()) as { data?: Partial<PlanningDraft> };
    const patchInput = body.data;

    if (!patchInput) {
      return NextResponse.json({ error: 'Missing patch payload.' }, { status: 400 });
    }

    const dbPatch = buildDbPatch(patchInput);
    const supportsProgrammedAt = await campaignPlanningSupportsProgrammedAt(admin);
    if (patchInput.status !== undefined && supportsProgrammedAt) {
      const { data: current, error: currentError } = await admin
        .from('campaign_planning')
        .select('status, programmed_at')
        .eq('id', id)
        .maybeSingle();
      if (currentError) {
        return NextResponse.json({ error: currentError.message }, { status: 500 });
      }
      const currentStatus = String(current?.status ?? '');
      const currentProgrammedAt = current?.programmed_at ?? null;
      if (patchInput.status === 'Programmed') {
        if (currentStatus !== 'Programmed' || !currentProgrammedAt) {
          dbPatch.programmed_at = new Date().toISOString();
        }
      } else if (currentStatus === 'Programmed' || currentProgrammedAt) {
        dbPatch.programmed_at = null;
      }
    }

    const { data, error } = await admin
      .from('campaign_planning')
      .update(dbPatch)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('campaign_planning update error', { id, patch: dbPatch, error });
      return NextResponse.json({ error: error?.message || 'Unable to update planning entry.' }, { status: 500 });
    }

    return NextResponse.json({ item: mapPlanningFromDb(data as PlanningDbRow) });
  } catch (error) {
    console.error('campaign_planning PATCH unexpected error', error);
    const status = (error as HttpError)?.status ?? 500;
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureAuthorized();
    const admin = supabaseAdmin();
    const { id } = await context.params;
    const { error } = await admin.from('campaign_planning').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as HttpError)?.status ?? 500;
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}
