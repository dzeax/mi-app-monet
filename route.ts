import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { mapPlanningFromDb, mapPlanningPatch, type PlanningDbPatch, type PlanningDbRow } from '@/lib/planning/db';

const ALLOWED_ROLES = new Set(['admin', 'editor']);

type HttpError = Error & { status?: number };

export const runtime = 'nodejs';

async function createSupabaseRouteClient() {
  const cookieStore = await cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { admin } = await ensureAuthorized();
    const body = (await request.json()) as { data?: PlanningDbPatch };
    const patch = body.data;

    if (!patch) {
      return NextResponse.json({ error: 'Missing patch payload.' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('campaign_planning')
      .update(mapPlanningPatch(patch))
      .eq('id', params.id)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Unable to update planning entry.' }, { status: 500 });
    }

    return NextResponse.json({ item: mapPlanningFromDb(data as PlanningDbRow) });
  } catch (error) {
    const status = (error as HttpError)?.status ?? 500;
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { admin } = await ensureAuthorized();

    const { error } = await admin.from('campaign_planning').delete().eq('id', params.id);

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
