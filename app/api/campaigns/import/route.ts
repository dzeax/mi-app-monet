import { NextResponse } from 'next/server';

import type { CampaignRow } from '@/types/campaign';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { applyBusinessRules, compositeKey } from '@/lib/campaigns/business';
import { mapToDb } from '@/lib/campaigns/db';
import { DEFAULT_ROUTING_RATE } from '@/lib/campaign-calcs';

type MaybeDate = string | null | undefined;

type RoutingSettingsPayload = {
  defaultRate?: number;
  periods?: {
    id?: string;
    from?: MaybeDate;
    to?: MaybeDate;
    rate?: number;
    label?: string;
  }[];
} | null;

type ImportRequest = {
  rows?: Array<Partial<CampaignRow> & { id?: string }>;
  options?: {
    upsertBy?: 'id' | 'composite';
  };
};

function ensureString(value: unknown, fallback = ''): string {
  const str = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return str || fallback;
}

function ensureNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeRoutingSettings(raw: RoutingSettingsPayload | undefined | null) {
  const defaultRate =
    typeof raw?.defaultRate === 'number' && Number.isFinite(raw.defaultRate)
      ? Number(raw.defaultRate)
      : DEFAULT_ROUTING_RATE;

  const periods =
    Array.isArray(raw?.periods)
      ? raw.periods
          .map((period) => {
            if (!period) return null;
            const rate = Number(period.rate);
            if (!Number.isFinite(rate)) return null;
            const from = period.from ? String(period.from) : null;
            const to = period.to ? String(period.to) : null;
            return {
              id: period.id || null,
              from,
              to,
              rate,
              label: period.label,
            };
          })
          .filter(Boolean)
      : [];

  return { defaultRate, periods: periods as { from: MaybeDate; to: MaybeDate; rate: number }[] };
}

function inRange(dateIso: string, period: { from: MaybeDate; to: MaybeDate; rate: number }) {
  if (!dateIso) return false;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;

  const day = date.setHours(0, 0, 0, 0);

  let afterStart = true;
  if (period.from) {
    const start = new Date(period.from);
    if (!Number.isNaN(start.getTime())) {
      afterStart = day >= start.setHours(0, 0, 0, 0);
    }
  }

  let beforeEnd = true;
  if (period.to) {
    const end = new Date(period.to);
    if (!Number.isNaN(end.getTime())) {
      beforeEnd = day <= end.setHours(23, 59, 59, 999);
    }
  }

  return afterStart && beforeEnd;
}

function makeResolveRate(defaultRate: number, periods: { from: MaybeDate; to: MaybeDate; rate: number }[]) {
  return (date: MaybeDate) => {
    if (!date) return defaultRate;
    const ordered = [...periods].sort((a, b) => {
      const aDate = a.from ? new Date(a.from).getTime() : -Infinity;
      const bDate = b.from ? new Date(b.from).getTime() : -Infinity;
      return bDate - aDate;
    });
    const match = ordered.find((period) => period && inRange(date, period));
    return match?.rate ?? defaultRate;
  };
}

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (appUserError || !appUser || appUser.is_active === false || appUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: ImportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawRows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rawRows.length) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  const upsertBy: 'id' | 'composite' =
    body?.options?.upsertBy === 'id' ? 'id' : 'composite';

  const admin = supabaseAdmin();

  const { data: settingsRow } = await admin
    .from('routing_settings')
    .select('data')
    .eq('key', 'global')
    .maybeSingle();

  const routingSettings = normalizeRoutingSettings(settingsRow?.data as RoutingSettingsPayload | undefined);
  const resolveRate = makeResolveRate(routingSettings.defaultRate, routingSettings.periods);

  const deduped = new Map<string, CampaignRow>();
  let duplicates = 0;

  for (const row of rawRows) {
    const id = row?.id && typeof row.id === 'string' && row.id.trim() ? row.id.trim() : randomId();
    const date = ensureString(row?.date);
    const campaign = ensureString(row?.campaign);
    const partner = ensureString(row?.partner);
    const database = ensureString(row?.database);

    if (!date || !campaign || !partner || !database) {
      continue;
    }

    const base: CampaignRow = {
      id,
      date,
      campaign,
      advertiser: ensureString(row?.advertiser),
      invoiceOffice: (row?.invoiceOffice || 'DAT') as CampaignRow['invoiceOffice'],
      partner,
      theme: ensureString(row?.theme),
      price: ensureNumber(row?.price),
      priceCurrency: (row?.priceCurrency || 'EUR') as CampaignRow['priceCurrency'],
      type: (row?.type || 'CPL') as CampaignRow['type'],
      vSent: ensureNumber(row?.vSent),
      routingCosts: ensureNumber(row?.routingCosts),
      routingRateOverride:
        row?.routingRateOverride == null
          ? null
          : Number(row.routingRateOverride),
      qty: ensureNumber(row?.qty),
      turnover: ensureNumber(row?.turnover),
      margin: ensureNumber(row?.margin),
      ecpm: ensureNumber(row?.ecpm),
      database,
      geo: ensureString(row?.geo),
      databaseType: (row?.databaseType || 'B2C') as CampaignRow['databaseType'],
    };

    const computed = applyBusinessRules(base, {
      resolveRate,
      fallbackRate: routingSettings.defaultRate,
    });

    const key = upsertBy === 'id' ? id : compositeKey(computed);
    if (deduped.has(key)) duplicates += 1;
    deduped.set(key, computed);
  }

  const prepared = Array.from(deduped.values());
  if (!prepared.length) {
    return NextResponse.json({ error: 'No valid rows to import' }, { status: 400 });
  }

  const onConflict = upsertBy === 'id' ? 'id' : 'date,campaign,partner,database';

  const { error } = await admin
    .from('campaigns')
    .upsert(prepared.map((row) => mapToDb(row, session.user.id)), {
      onConflict,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    total: prepared.length,
    duplicates,
  });
}
export const runtime = 'nodejs';
