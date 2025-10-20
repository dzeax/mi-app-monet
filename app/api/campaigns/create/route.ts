import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { mapFromDb, type CampaignDbInsert, type CampaignDbRow } from '@/lib/campaigns/db';

const ALLOWED_ROLES = new Set(['admin', 'editor']);

export const runtime = 'nodejs';

type CreateCampaignRequest = {
  data?: CampaignDbInsert;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateCampaignRequest;
    const payload = body.data;

    if (!payload) {
      return NextResponse.json({ error: 'Missing campaign payload.' }, { status: 400 });
    }

    if (!payload.id) {
      return NextResponse.json({ error: 'Campaign id is required.' }, { status: 400 });
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

    const admin = supabaseAdmin();
    const insertPayload: CampaignDbInsert = {
      ...payload,
      created_by: user.id,
    };

    const { data: inserted, error: insertError } = await admin
      .from('campaigns')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message || 'Unable to create campaign.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign: mapFromDb(inserted as CampaignDbRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
