import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { mapPlanningFromDb, mapPlanningToInsert, type PlanningDbRow } from '@/lib/planning/db';
import { campaignPlanningSupportsProgrammedAt } from '@/lib/planning/schema';
import type { PlanningDraft, PlanningItem } from '@/components/campaign-planning/types';

const ALLOWED_ROLES = new Set(['admin', 'editor']);

export const runtime = 'nodejs';

async function createSupabaseRouteClient() {
 const cookieStore = await cookies();
 return createRouteHandlerClient({ cookies: () => cookieStore as any });
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
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

    if (!profile || profile.is_active === false) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('campaign_planning')
      .select('*')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data ?? []).map((row) => mapPlanningFromDb(row as PlanningDbRow));
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { data?: PlanningDraft & { id?: string } };
    const payload = body.data;

    if (!payload) {
      return NextResponse.json({ error: 'Missing planning payload.' }, { status: 400 });
    }

    const supabase = await createSupabaseRouteClient();
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
    const id = payload.id ?? crypto.randomUUID();
    const basePayload: Omit<PlanningItem, 'id' | 'createdAt' | 'updatedAt'> & { id: string } = {
      ...payload,
      id,
      previewRecipients: payload.previewRecipients ?? [],
    };
    const insertPayload = mapPlanningToInsert(basePayload, user.id);
    const supportsProgrammedAt = await campaignPlanningSupportsProgrammedAt(admin);
    if (supportsProgrammedAt) {
      insertPayload.programmed_at = payload.status === 'Programmed' ? new Date().toISOString() : null;
    } else {
      delete (insertPayload as { programmed_at?: string | null }).programmed_at;
    }

    const { data: inserted, error: insertError } = await admin
      .from('campaign_planning')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message || 'Unable to create planning entry.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: mapPlanningFromDb(inserted as PlanningDbRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

