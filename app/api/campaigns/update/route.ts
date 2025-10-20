import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { mapFromDb, type CampaignDbInsert, type CampaignDbRow } from '@/lib/campaigns/db';

type UpdateCampaignRequest = {
  id?: string;
  data?: CampaignDbInsert;
};

const ALLOWED_ROLES = new Set(['admin', 'editor']);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as UpdateCampaignRequest;
    const id = body.id?.trim();
    const data = body.data;

    if (!id || !data) {
      return NextResponse.json({ error: 'Missing campaign id or payload.' }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    const user = session?.user ?? null;
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('app_users')
      .select('role, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile || profile.is_active === false || !ALLOWED_ROLES.has(String(profile.role))) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const { id: payloadId, ...rest } = data;
    if (payloadId && payloadId !== id) {
      return NextResponse.json({ error: 'Payload id mismatch.' }, { status: 400 });
    }

    const updatePayload = { ...rest } as Omit<CampaignDbInsert, 'id'> & Record<string, unknown>;
    if ('created_by' in updatePayload) {
      delete updatePayload.created_by;
    }

    const admin = supabaseAdmin();
    const { data: updated, error: updateError } = await admin
      .from('campaigns')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || 'Unable to update campaign.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign: mapFromDb(updated as CampaignDbRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
