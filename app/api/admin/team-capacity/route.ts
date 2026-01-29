import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;

type AppUserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  in_team_capacity: boolean | null;
  is_active: boolean;
};

type ContractRow = {
  user_id: string;
  weekly_hours: number;
  country_code: 'ES' | 'FR';
  contract_country_code: 'ES' | 'FR' | null;
  calendar_code: 'ES' | 'FR' | null;
  annual_vacation_days: number | null;
  start_date: string;
  end_date: string | null;
};

type HolidayRow = {
  country_code: 'ES' | 'FR';
  holiday_date: string;
};

type TimeOffRow = {
  user_id: string;
  start_date: string;
  end_date: string;
  type: 'vacation' | 'sick' | 'other' | null;
  start_day_fraction: number | null;
  end_day_fraction: number | null;
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

type ContributionRow = {
  person_id: string | null;
  owner: string | null;
  work_hours: number | null;
  prep_hours: number | null;
};

type ManualEffortRow = {
  person_id: string | null;
  owner: string | null;
  hours: number | null;
};

type StrategyEffortRow = {
  owner: string | null;
  hours: number | null;
};

type CampaignUnitRow = {
  person_id: string | null;
  owner: string | null;
  hours_total: number | null;
};

const querySchema = z.object({
  start: z.string().regex(DATE_RE),
  end: z.string().regex(DATE_RE),
});

const DEFAULT_VACATION_DAYS: Record<'ES' | 'FR', number> = {
  ES: 22,
  FR: 30,
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

const parseDate = (value: string): Date | null => {
  if (!DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const isWeekday = (date: Date) => {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
};

const maxDate = (a: Date, b: Date) => (a > b ? a : b);
const minDate = (a: Date, b: Date) => (a < b ? a : b);

const computeContributionHours = (work: number | null, prep: number | null) => {
  const safeWork = Number.isFinite(work ?? null) ? Number(work ?? 0) : 0;
  const safePrep = Number.isFinite(prep ?? null)
    ? Number(prep ?? 0)
    : safeWork * 0.35;
  return safeWork + safePrep;
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
  const supabase = await createServerSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (userError || !user) {
    const code = (userError as any)?.code;
    if (code === 'refresh_token_not_found') {
      await supabase.auth.signOut({ scope: 'local' });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (currentUserError) {
    return NextResponse.json({ error: currentUserError.message }, { status: 500 });
  }

  if (!currentUser || currentUser.is_active === false || currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  const startParam = url.searchParams.get('start') || formatDate(monthStart);
  const endParam = url.searchParams.get('end') || formatDate(monthEnd);

  const parsed = querySchema.safeParse({ start: startParam, end: endParam });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  }

  const startDate = parseDate(parsed.data.start);
  const endDate = parseDate(parsed.data.end);

  if (!startDate || !endDate || startDate > endDate) {
    return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  }

  const startStr = parsed.data.start;
  const endStr = parsed.data.end;
  const year = startDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const yearStartStr = formatDate(yearStart);
  const yearEndStr = formatDate(yearEnd);

  const admin = supabaseAdmin();
  const { data: users, error: usersError } = await admin
    .from('app_users')
    .select('user_id,email,display_name,avatar_url,in_team_capacity,is_active')
    .eq('is_active', true);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const members = (users ?? []) as AppUserRow[];
  const userIds = members.map((user) => user.user_id);

  const { data: contracts, error: contractError } = await admin
    .from('team_capacity_contracts')
    .select('user_id,weekly_hours,country_code,contract_country_code,calendar_code,annual_vacation_days,start_date,end_date')
    .in('user_id', userIds);

  if (contractError) {
    return NextResponse.json({ error: contractError.message }, { status: 500 });
  }

  const { data: holidays, error: holidaysError } = await admin
    .from('team_holidays')
    .select('country_code,holiday_date')
    .gte('holiday_date', yearStartStr)
    .lte('holiday_date', yearEndStr);

  if (holidaysError) {
    return NextResponse.json({ error: holidaysError.message }, { status: 500 });
  }

  const { data: timeOffRows, error: timeOffError } = await admin
    .from('team_time_off')
    .select('user_id,start_date,end_date,type,start_day_fraction,end_day_fraction')
    .lte('start_date', yearEndStr)
    .gte('end_date', yearStartStr)
    .in('user_id', userIds);

  if (timeOffError) {
    return NextResponse.json({ error: timeOffError.message }, { status: 500 });
  }

  const { data: peopleRows, error: peopleError } = await admin
    .from('crm_people')
    .select('id,email,display_name');

  if (peopleError) {
    return NextResponse.json({ error: peopleError.message }, { status: 500 });
  }

  const people = (peopleRows ?? []) as PeopleRow[];

  const { data: aliasRows, error: aliasError } = await admin
    .from('crm_people_aliases')
    .select('alias,person_id');

  if (aliasError) {
    return NextResponse.json({ error: aliasError.message }, { status: 500 });
  }

  const aliases = (aliasRows ?? []) as AliasRow[];

  const contributions = await fetchAll<ContributionRow>(
    'crm_data_quality_contributions',
    'person_id,owner,work_hours,prep_hours,effort_date',
    (query) => query.gte('effort_date', startStr).lte('effort_date', endStr),
  );

  const manualEfforts = await fetchAll<ManualEffortRow>(
    'crm_manual_efforts',
    'person_id,owner,hours,effort_date',
    (query) => query.gte('effort_date', startStr).lte('effort_date', endStr),
  );

  const strategyEfforts = await fetchAll<StrategyEffortRow>(
    'crm_strategy_efforts',
    'owner,hours,effort_date',
    (query) => query.gte('effort_date', startStr).lte('effort_date', endStr),
  );

  const campaignUnits = await fetchAll<CampaignUnitRow>(
    'campaign_email_units',
    'person_id,owner,hours_total,send_date',
    (query) => query.gte('send_date', startStr).lte('send_date', endStr),
  );

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

  const aliasToPerson = new Map<string, string>();
  aliases.forEach((alias) => {
    if (!alias.alias || !alias.person_id) return;
    const key = normalize(alias.alias);
    if (!key) return;
    aliasToPerson.set(key, alias.person_id);
  });

  const workloadByUser = new Map<string, number>();
  let unmappedHours = 0;

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

  const addWorkload = (userId: string | null, hours: number) => {
    if (!Number.isFinite(hours) || hours <= 0) return;
    if (!userId) {
      unmappedHours += hours;
      return;
    }
    workloadByUser.set(userId, (workloadByUser.get(userId) ?? 0) + hours);
  };

  contributions.forEach((row) => {
    const userId = resolveUser(row.person_id, row.owner);
    addWorkload(userId, computeContributionHours(row.work_hours, row.prep_hours));
  });

  manualEfforts.forEach((row) => {
    const userId = resolveUser(row.person_id, row.owner);
    const hours = Number.isFinite(row.hours ?? null) ? Number(row.hours ?? 0) : 0;
    addWorkload(userId, hours);
  });

  strategyEfforts.forEach((row) => {
    const userId = resolveUser(null, row.owner);
    const hours = Number.isFinite(row.hours ?? null) ? Number(row.hours ?? 0) : 0;
    addWorkload(userId, hours);
  });

  campaignUnits.forEach((row) => {
    const userId = resolveUser(row.person_id, row.owner);
    const hours = Number.isFinite(row.hours_total ?? null) ? Number(row.hours_total ?? 0) : 0;
    addWorkload(userId, hours);
  });

  const holidayByCalendar = new Map<string, Set<string>>();
  (holidays ?? []).forEach((holiday) => {
    const key = holiday.country_code;
    if (!holidayByCalendar.has(key)) {
      holidayByCalendar.set(key, new Set());
    }
    holidayByCalendar.get(key)?.add(holiday.holiday_date);
  });

  const timeOffByUserDate = new Map<
    string,
    Map<string, { vacation: number; sick: number; other: number }>
  >();

  const clampFraction = (value: number | null) => {
    const num = Number(value ?? 1);
    if (!Number.isFinite(num)) return 1;
    return num === 0.5 ? 0.5 : 1;
  };

  const addTimeOff = (
    userId: string,
    dateKey: string,
    type: 'vacation' | 'sick' | 'other',
    fraction: number,
  ) => {
    if (fraction <= 0) return;
    const userMap = timeOffByUserDate.get(userId) ?? new Map();
    const current = userMap.get(dateKey) ?? { vacation: 0, sick: 0, other: 0 };
    current[type] += fraction;
    userMap.set(dateKey, current);
    timeOffByUserDate.set(userId, userMap);
  };

  (timeOffRows ?? []).forEach((row: TimeOffRow) => {
    const start = parseDate(row.start_date);
    const end = parseDate(row.end_date);
    if (!start || !end) return;
    const rangeStart = maxDate(start, yearStart);
    const rangeEnd = minDate(end, yearEnd);
    if (rangeStart > rangeEnd) return;

    const type = row.type === 'sick' || row.type === 'other' ? row.type : 'vacation';
    const startFraction = clampFraction(row.start_day_fraction);
    const endFraction = clampFraction(row.end_day_fraction);
    const isSingleDay = row.start_date === row.end_date;

    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      if (!isWeekday(cursor)) {
        cursor = addDays(cursor, 1);
        continue;
      }
      const key = formatDate(cursor);
      let fraction = 1;
      if (isSingleDay) {
        fraction = startFraction;
      } else if (key === row.start_date) {
        fraction = startFraction;
      } else if (key === row.end_date) {
        fraction = endFraction;
      }
      fraction = Math.max(0, Math.min(1, fraction));
      addTimeOff(row.user_id, key, type, fraction);
      cursor = addDays(cursor, 1);
    }
  });

  const contractRows = (contracts ?? []) as ContractRow[];

  const rows = members.map((user) => {
    const relevantContracts = contractRows
      .filter((contract) => contract.user_id === user.user_id)
      .filter((contract) => {
        const contractStart = parseDate(contract.start_date);
        const contractEnd = contract.end_date ? parseDate(contract.end_date) : null;
        if (!contractStart) return false;
        if (contractStart > endDate) return false;
        if (contractEnd && contractEnd < startDate) return false;
        return true;
      })
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

    const contract = relevantContracts[0] ?? null;

    const contractCountry =
      contract?.contract_country_code ?? contract?.country_code ?? null;
    const calendarCode =
      contract?.calendar_code ?? contract?.country_code ?? contract?.contract_country_code ?? null;
    const annualVacationRaw = contract?.annual_vacation_days;
    const annualVacationParsed = annualVacationRaw != null ? Number(annualVacationRaw) : null;
    const annualVacationDays =
      annualVacationParsed != null && Number.isFinite(annualVacationParsed)
        ? annualVacationParsed
        : contractCountry
          ? DEFAULT_VACATION_DAYS[contractCountry]
          : null;

    let capacityHours: number | null = null;
    let holidayDays = 0;
    const timeOffTotals = { vacation: 0, sick: 0, other: 0 };

    const holidaySet = calendarCode
      ? holidayByCalendar.get(calendarCode) ?? new Set<string>()
      : new Set<string>();
    const userTimeOffMap = timeOffByUserDate.get(user.user_id) ?? new Map();

    const contractStart = contract ? parseDate(contract.start_date) ?? startDate : startDate;
    const contractEnd = contract && contract.end_date ? parseDate(contract.end_date) ?? endDate : endDate;
    const rangeStart = maxDate(startDate, contractStart);
    const rangeEnd = minDate(endDate, contractEnd);

    let availableDays = 0;
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      if (isWeekday(cursor)) {
        const key = formatDate(cursor);
        const isHoliday = holidaySet.has(key);
        const dayTotals = userTimeOffMap.get(key) ?? { vacation: 0, sick: 0, other: 0 };
        const dayOffTotal = dayTotals.vacation + dayTotals.sick + dayTotals.other;
        if (isHoliday) {
          holidayDays += 1;
        } else {
          const cappedOff = Math.min(1, dayOffTotal);
          availableDays += 1 - cappedOff;
          timeOffTotals.vacation += dayTotals.vacation;
          timeOffTotals.sick += dayTotals.sick;
          timeOffTotals.other += dayTotals.other;
        }
      }
      cursor = addDays(cursor, 1);
    }

    if (contract) {
      const hoursPerDay = contract.weekly_hours / 5;
      capacityHours = availableDays * hoursPerDay;
    }

    const vacationByMonth = Array.from({ length: 12 }, () => 0);
    let vacationUsedDays = 0;
    userTimeOffMap.forEach((dayTotals, dateKey) => {
      const date = parseDate(dateKey);
      if (!date) return;
      if (!isWeekday(date)) return;
      if (holidaySet.has(dateKey)) return;
      const vac = Math.min(dayTotals.vacation ?? 0, 1);
      if (vac <= 0) return;
      vacationUsedDays += vac;
      const monthIdx = date.getUTCMonth();
      if (monthIdx >= 0 && monthIdx < 12) {
        vacationByMonth[monthIdx] += vac;
      }
    });

    const vacationRemainingDays =
      annualVacationDays != null ? Math.max(annualVacationDays - vacationUsedDays, 0) : null;

    const workloadHours = workloadByUser.get(user.user_id) ?? 0;
    const utilization =
      capacityHours && capacityHours > 0 ? workloadHours / capacityHours : null;

    return {
      userId: user.user_id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url ?? null,
      inTeamCapacity: user.in_team_capacity ?? true,
      isActive: user.is_active,
      weeklyHours: contract?.weekly_hours ?? null,
      contractCountryCode: contractCountry,
      calendarCode: calendarCode,
      annualVacationDays,
      vacationUsedDays,
      vacationRemainingDays,
      vacationByMonth,
      contractStart: contract?.start_date ?? null,
      contractEnd: contract?.end_date ?? null,
      capacityHours,
      workloadHours,
      utilization,
      holidayDays,
      timeOffByType: {
        vacation: timeOffTotals.vacation,
        sick: timeOffTotals.sick,
        other: timeOffTotals.other,
        total: timeOffTotals.vacation + timeOffTotals.sick + timeOffTotals.other,
      },
    };
  });

  return NextResponse.json({
    start: startStr,
    end: endStr,
    members: rows,
    unmappedHours,
  });
}
