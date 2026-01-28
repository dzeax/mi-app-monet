import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const payloadSchema = z.object({
  userId: z.string().uuid(),
  weeklyHours: z.number().min(0),
  contractCountryCode: z.enum(['ES', 'FR']),
  calendarCode: z.enum(['ES', 'FR']),
  annualVacationDays: z.number().min(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (currentUserError) {
    return NextResponse.json({ error: currentUserError.message }, { status: 500 });
  }

  if (!currentUser || currentUser.is_active === false || currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = payloadSchema.parse(body);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from('team_capacity_contracts').upsert(
    {
      user_id: parsed.userId,
      weekly_hours: parsed.weeklyHours,
      country_code: parsed.calendarCode,
      contract_country_code: parsed.contractCountryCode,
      calendar_code: parsed.calendarCode,
      annual_vacation_days: parsed.annualVacationDays,
      start_date: parsed.startDate,
      end_date: parsed.endDate ?? null,
      created_by: session.user.id,
    },
    {
      onConflict: 'user_id,start_date',
    },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
