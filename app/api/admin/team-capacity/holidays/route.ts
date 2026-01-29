import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  start: z.string().regex(DATE_RE).optional(),
  end: z.string().regex(DATE_RE).optional(),
});

const createSchema = z.object({
  countryCode: z.enum(['ES', 'FR']),
  date: z.string().regex(DATE_RE),
  label: z.string().trim().optional().nullable(),
});

const bulkSchema = z.object({
  countryCode: z.enum(['ES', 'FR']),
  items: z.array(
    z.object({
      date: z.string().regex(DATE_RE),
      label: z.string().trim().optional().nullable(),
    }),
  ),
  skipDuplicates: z.boolean().optional(),
});

const updateSchema = createSchema.extend({
  id: z.string().uuid(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (userError || !user) {
    const code = (userError as any)?.code;
    if (code === 'refresh_token_not_found') {
      await supabase.auth.signOut({ scope: 'local' });
    }
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (currentUserError) {
    return { error: NextResponse.json({ error: currentUserError.message }, { status: 500 }) };
  }

  if (!currentUser || currentUser.is_active === false || currentUser.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
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

  const admin = supabaseAdmin();
  let query = admin
    .from('team_holidays')
    .select('id,country_code,holiday_date,label')
    .order('holiday_date', { ascending: true });

  if (parsed.data.start && parsed.data.end) {
    if (parsed.data.start > parsed.data.end) {
      return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
    }
    query = query.gte('holiday_date', parsed.data.start).lte('holiday_date', parsed.data.end);
  } else if (parsed.data.start || parsed.data.end) {
    return NextResponse.json({ error: 'Both start and end are required.' }, { status: 400 });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((row) => ({
    id: row.id,
    countryCode: row.country_code,
    date: row.holiday_date,
    label: row.label ?? null,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const user = auth.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const bulkParsed = bulkSchema.safeParse(body);
  if (bulkParsed.success) {
    const items = bulkParsed.data.items;
    if (!items.length) {
      return NextResponse.json({ error: 'No holidays to import.' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const rows = items.map((item) => ({
      country_code: bulkParsed.data.countryCode,
      holiday_date: item.date,
      label: item.label?.trim() ? item.label.trim() : null,
      created_by: user.id,
    }));

    const { error } = await admin.from('team_holidays').upsert(rows, {
      onConflict: 'country_code,holiday_date',
      ignoreDuplicates: bulkParsed.data.skipDuplicates !== false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const singleParsed = createSchema.safeParse(body);
  if (!singleParsed.success) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from('team_holidays').upsert(
    {
      country_code: singleParsed.data.countryCode,
      holiday_date: singleParsed.data.date,
      label: singleParsed.data.label ?? null,
      created_by: user.id,
    },
    {
      onConflict: 'country_code,holiday_date',
    },
  );

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

  const admin = supabaseAdmin();
  const { error } = await admin
    .from('team_holidays')
    .update({
      country_code: parsed.countryCode,
      holiday_date: parsed.date,
      label: parsed.label ?? null,
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
  const { error } = await admin.from('team_holidays').delete().eq('id', parsed.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
