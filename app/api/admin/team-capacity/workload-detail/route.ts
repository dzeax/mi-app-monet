import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;

const querySchema = z.object({
  userId: z.string().uuid().optional(),
  start: z.string().regex(DATE_RE),
  end: z.string().regex(DATE_RE),
});

type AppUserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
  in_team_capacity: boolean | null;
};

type PeopleRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

type AliasRow = {
  alias: string | null;
  person_id: string | null;
};

type ClientRow = {
  slug: string;
  name: string;
};

type ContributionRow = {
  client_slug: string | null;
  person_id: string | null;
  owner: string | null;
  work_hours: number | string | null;
  prep_hours: number | string | null;
  workstream: string | null;
};

type ManualEffortRow = {
  client_slug: string | null;
  person_id: string | null;
  owner: string | null;
  hours: number | string | null;
  workstream: string | null;
};

type StrategyEffortRow = {
  client_slug: string | null;
  owner: string | null;
  hours: number | string | null;
  ticket_id: string | null;
};

type StrategyTicketRow = {
  id: string;
  category: string | null;
  jira_ticket: string | null;
  title: string | null;
};

type CampaignRow = {
  client_slug: string | null;
  person_id: string | null;
  owner: string | null;
  hours_total: number | string | null;
  campaign_name: string | null;
  brand: string | null;
  market: string | null;
  scope: string | null;
  segment: string | null;
  touchpoint: string | null;
};

type WorklogRow = {
  scope: 'monetization' | 'internal' | null;
  user_id: string | null;
  owner: string | null;
  hours: number | string | null;
  workstream: string | null;
};

type WorkloadDetailSource = 'crm_dq' | 'manual' | 'strategy' | 'campaign' | 'monetization' | 'internal';

type WorkloadDetail = {
  clientSlug: string | null;
  source: WorkloadDetailSource;
  label: string | null;
  hours: number;
};

const requireCapacityReadAccess = async () => {
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

  if (!currentUser || currentUser.is_active === false) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, isAdmin: currentUser.role === 'admin' };
};

const normalize = (value?: string | null) =>
  value
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    : '';

const normalizeEmail = (value?: string | null) => (value ? value.toLowerCase().trim() : '');

const toNumber = (value?: number | string | null) => {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const computeContributionHours = (work: number | string | null, prep: number | string | null) => {
  const safeWork = toNumber(work);
  const safePrep = Number.isFinite(Number(prep ?? NaN)) ? toNumber(prep) : safeWork * 0.35;
  return safeWork + safePrep;
};

const normalizeLabel = (value: string | null | undefined, fallback: string) => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const pickLabel = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
};

async function fetchAll<T>(
  table: string,
  select: string,
  applyFilters: (query: any) => any,
): Promise<T[]> {
  const admin = supabaseAdmin();
  const rows: T[] = [];
  let from = 0;
  while (true) {
    let query = admin.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    query = applyFilters(query);
    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function GET(req: Request) {
  const auth = await requireCapacityReadAccess();
  if (auth.error) return auth.error;
  const { user, isAdmin } = auth;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    userId: url.searchParams.get('userId') || undefined,
    start: url.searchParams.get('start') || undefined,
    end: url.searchParams.get('end') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query.' }, { status: 400 });
  }

  if (parsed.data.start > parsed.data.end) {
    return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  }

  if (!isAdmin && parsed.data.userId && parsed.data.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = supabaseAdmin();
  let usersQuery = admin
    .from('app_users')
    .select('user_id,email,display_name,is_active,in_team_capacity')
    .eq('is_active', true);
  if (!isAdmin) {
    usersQuery = usersQuery.eq('user_id', user.id);
  }
  const { data: users, error: usersError } = await usersQuery;

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const members = (users ?? []) as AppUserRow[];
  const emailToUser = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  members.forEach((user) => {
    if (user.email) {
      emailToUser.set(normalizeEmail(user.email), user.user_id);
    }
    const nameKey = normalize(user.display_name);
    if (nameKey) {
      nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1);
    }
  });

  const nameToUser = new Map<string, string>();
  members.forEach((user) => {
    const nameKey = normalize(user.display_name);
    if (nameKey && nameCounts.get(nameKey) === 1) {
      nameToUser.set(nameKey, user.user_id);
    }
  });

  const { data: peopleRows, error: peopleError } = await admin
    .from('crm_people')
    .select('id,email,display_name');

  if (peopleError) {
    return NextResponse.json({ error: peopleError.message }, { status: 500 });
  }

  const people = (peopleRows ?? []) as PeopleRow[];
  const personToUser = new Map<string, string>();
  people.forEach((person) => {
    const emailKey = normalizeEmail(person.email);
    if (emailKey && emailToUser.has(emailKey)) {
      personToUser.set(person.id, emailToUser.get(emailKey) as string);
      return;
    }
    const nameKey = normalize(person.display_name);
    if (nameKey && nameToUser.has(nameKey)) {
      personToUser.set(person.id, nameToUser.get(nameKey) as string);
    }
  });

  const { data: aliasRows, error: aliasError } = await admin
    .from('crm_people_aliases')
    .select('alias,person_id');

  if (aliasError) {
    return NextResponse.json({ error: aliasError.message }, { status: 500 });
  }

  const aliasToPerson = new Map<string, string>();
  (aliasRows ?? []).forEach((alias: AliasRow) => {
    if (!alias.alias || !alias.person_id) return;
    const key = normalize(alias.alias);
    if (!key) return;
    aliasToPerson.set(key, alias.person_id);
  });

  const resolveUser = (personId?: string | null, owner?: string | null) => {
    if (personId && personToUser.has(personId)) return personToUser.get(personId) ?? null;
    if (owner) {
      const aliasKey = normalize(owner);
      const aliasPersonId = aliasKey ? aliasToPerson.get(aliasKey) : null;
      if (aliasPersonId && personToUser.has(aliasPersonId)) {
        return personToUser.get(aliasPersonId) ?? null;
      }
    }
    if (!owner) return null;
    const ownerEmail = owner.includes('@') ? normalizeEmail(owner) : '';
    if (ownerEmail && emailToUser.has(ownerEmail)) {
      return emailToUser.get(ownerEmail) ?? null;
    }
    const nameKey = normalize(owner);
    if (nameKey && nameToUser.has(nameKey)) {
      return nameToUser.get(nameKey) ?? null;
    }
    return null;
  };

  const { data: clientRows, error: clientError } = await admin
    .from('crm_clients')
    .select('slug,name');

  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  const clientNames = new Map<string, string>();
  (clientRows ?? []).forEach((row: ClientRow) => {
    if (row.slug) clientNames.set(row.slug, row.name);
  });
  clientNames.set('monetization', 'Monetization');
  clientNames.set('internal', 'Internal');

  const { start, end, userId } = parsed.data;
  const effectiveUserId = isAdmin ? userId ?? null : user.id;
  const targetUserIds = effectiveUserId
    ? new Set([effectiveUserId])
    : new Set(
        members
          .filter((member) => member.in_team_capacity ?? true)
          .map((member) => member.user_id),
      );
  let strategyTickets = new Map<string, StrategyTicketRow>();

  try {
    const contributions = await fetchAll<ContributionRow>(
      'crm_data_quality_contributions',
      'client_slug,person_id,owner,work_hours,prep_hours,workstream,effort_date',
      (query) => query.gte('effort_date', start).lte('effort_date', end),
    );

    const manualEfforts = await fetchAll<ManualEffortRow>(
      'crm_manual_efforts',
      'client_slug,person_id,owner,hours,workstream,effort_date',
      (query) => query.gte('effort_date', start).lte('effort_date', end),
    );

    const strategyEfforts = await fetchAll<StrategyEffortRow>(
      'crm_strategy_efforts',
      'client_slug,owner,hours,ticket_id,effort_date',
      (query) => query.gte('effort_date', start).lte('effort_date', end),
    );

    const strategyTicketIds = Array.from(
      new Set(strategyEfforts.map((row) => row.ticket_id).filter(Boolean) as string[]),
    );

    if (strategyTicketIds.length) {
      const { data: tickets, error: ticketError } = await admin
        .from('crm_strategy_tickets')
        .select('id,category,jira_ticket,title')
        .in('id', strategyTicketIds);

      if (ticketError) {
        return NextResponse.json({ error: ticketError.message }, { status: 500 });
      }

      strategyTickets = new Map(
        (tickets ?? []).map((ticket: StrategyTicketRow) => [ticket.id, ticket]),
      );
    }

    const campaignUnits = await fetchAll<CampaignRow>(
      'campaign_email_units',
      'client_slug,person_id,owner,hours_total,campaign_name,brand,market,scope,segment,touchpoint,send_date',
      (query) => query.gte('send_date', start).lte('send_date', end),
    );

    const worklogs = await fetchAll<WorklogRow>(
      'work_manual_efforts',
      'scope,user_id,owner,hours,workstream,effort_date',
      (query) => query.gte('effort_date', start).lte('effort_date', end),
    );

    const detailMap = new Map<string, WorkloadDetail>();
    const addDetail = (resolvedUserId: string | null, detail: WorkloadDetail) => {
      if (!resolvedUserId || !targetUserIds.has(resolvedUserId)) return;
      if (!Number.isFinite(detail.hours) || detail.hours <= 0) return;
      const key = `${detail.source}|${detail.clientSlug ?? 'unassigned'}|${detail.label ?? 'general'}`;
      const current = detailMap.get(key) ?? { ...detail, hours: 0 };
      current.hours += detail.hours;
      detailMap.set(key, current);
    };

    contributions.forEach((row) => {
      const resolvedUserId = resolveUser(row.person_id, row.owner);
      const hours = computeContributionHours(row.work_hours, row.prep_hours);
      const label = normalizeLabel(row.workstream, 'Data Quality');
      addDetail(resolvedUserId, {
        clientSlug: row.client_slug ?? null,
        source: 'crm_dq',
        label,
        hours,
      });
    });

    manualEfforts.forEach((row) => {
      const resolvedUserId = resolveUser(row.person_id, row.owner);
      const hours = toNumber(row.hours);
      const label = normalizeLabel(row.workstream, 'Manual effort');
      addDetail(resolvedUserId, {
        clientSlug: row.client_slug ?? null,
        source: 'manual',
        label,
        hours,
      });
    });

    strategyEfforts.forEach((row) => {
      const resolvedUserId = resolveUser(null, row.owner);
      const hours = toNumber(row.hours);
      const ticket = row.ticket_id ? strategyTickets.get(row.ticket_id) : null;
      const label =
        pickLabel(ticket?.category, ticket?.jira_ticket, ticket?.title) ?? 'Strategy';
      addDetail(resolvedUserId, {
        clientSlug: row.client_slug ?? null,
        source: 'strategy',
        label,
        hours,
      });
    });

    campaignUnits.forEach((row) => {
      const resolvedUserId = resolveUser(row.person_id, row.owner);
      const hours = toNumber(row.hours_total);
      const label =
        pickLabel(
          row.campaign_name,
          row.touchpoint,
          row.brand,
          row.market,
          row.segment,
          row.scope,
        ) ?? 'Campaign';
      addDetail(resolvedUserId, {
        clientSlug: row.client_slug ?? null,
        source: 'campaign',
        label,
        hours,
      });
    });

    worklogs.forEach((row) => {
      const resolvedUserId = resolveUser(row.user_id, row.owner);
      const hours = toNumber(row.hours);
      const scope = row.scope === 'internal' ? 'internal' : 'monetization';
      const label = normalizeLabel(
        row.workstream,
        scope === 'internal' ? 'Internal work' : 'Monetization work',
      );
      addDetail(resolvedUserId, {
        clientSlug: scope,
        source: scope,
        label,
        hours,
      });
    });

    const items = Array.from(detailMap.values())
      .map((entry) => ({
        id: `${entry.source}-${entry.clientSlug ?? 'unassigned'}-${entry.label ?? 'general'}`,
        clientSlug: entry.clientSlug,
        clientName: entry.clientSlug ? clientNames.get(entry.clientSlug) ?? null : null,
        source: entry.source,
        label: entry.label,
        hours: entry.hours,
      }))
      .sort((a, b) => b.hours - a.hours);

    return NextResponse.json({ items });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load workload details.' },
      { status: 500 },
    );
  }
}
