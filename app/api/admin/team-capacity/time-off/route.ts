import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  start: z.string().regex(DATE_RE).optional(),
  end: z.string().regex(DATE_RE).optional(),
});

const baseSchema = z.object({
  userId: z.string().uuid(),
  startDate: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE),
  type: z.enum(['vacation', 'sick', 'other']),
  startDayFraction: z.number().refine((value) => value === 0.5 || value === 1, {
    message: 'Invalid start day fraction.',
  }),
  endDayFraction: z.number().refine((value) => value === 0.5 || value === 1, {
    message: 'Invalid end day fraction.',
  }),
  reason: z.string().trim().optional().nullable(),
});

const createSchema = baseSchema;

const updateSchema = baseSchema.extend({
  id: z.string().uuid(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (currentUserError) {
    return { error: NextResponse.json({ error: currentUserError.message }, { status: 500 }) };
  }

  if (!currentUser || currentUser.is_active === false || currentUser.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session };
};

const ensureRange = (start: string, end: string) => {
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return false;
  return start <= end;
};

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    start: url.searchParams.get('start') || undefined,
    end: url.searchParams.get('end') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query.' }, { status: 400 });
  }

  if ((parsed.data.start && !parsed.data.end) || (!parsed.data.start && parsed.data.end)) {
    return NextResponse.json({ error: 'Both start and end are required.' }, { status: 400 });
  }

  if (parsed.data.start && parsed.data.end && !ensureRange(parsed.data.start, parsed.data.end)) {
    return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  let query = admin
    .from('team_time_off')
    .select('id,user_id,start_date,end_date,type,start_day_fraction,end_day_fraction,reason')
    .order('start_date', { ascending: false });

  if (parsed.data.start && parsed.data.end) {
    query = query
      .lte('start_date', parsed.data.end)
      .gte('end_date', parsed.data.start);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type ?? 'vacation',
    startDayFraction: Number(row.start_day_fraction ?? 1),
    endDayFraction: Number(row.end_day_fraction ?? 1),
    reason: row.reason ?? null,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const session = auth.session;

  let parsed;
  try {
    parsed = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  if (!ensureRange(parsed.startDate, parsed.endDate)) {
    return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from('team_time_off').insert({
    user_id: parsed.userId,
    start_date: parsed.startDate,
    end_date: parsed.endDate,
    type: parsed.type,
    start_day_fraction: parsed.startDayFraction,
    end_day_fraction: parsed.endDayFraction,
    reason: parsed.reason ?? null,
    created_by: session.user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let parsed;
  try {
    parsed = updateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  if (!ensureRange(parsed.startDate, parsed.endDate)) {
    return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from('team_time_off')
    .update({
      user_id: parsed.userId,
      start_date: parsed.startDate,
      end_date: parsed.endDate,
      type: parsed.type,
      start_day_fraction: parsed.startDayFraction,
      end_day_fraction: parsed.endDayFraction,
      reason: parsed.reason ?? null,
    })
    .eq('id', parsed.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let parsed;
  try {
    parsed = deleteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from('team_time_off').delete().eq('id', parsed.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
