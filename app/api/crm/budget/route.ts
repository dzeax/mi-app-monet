import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getTodayIsoInMadrid } from "@/lib/crm/dateBoundaries";
import { isCrmBudgetExecutionEnhancedClient } from "@/lib/crm/clients";

const DEFAULT_CLIENT = "emg";
const PAGE_SIZE = 1000;

const normalizeKey = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const parseYear = (value: string | null) => {
  const year = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(year) && year > 1900) return year;
  return new Date().getFullYear();
};

const fetchPaged = async <T,>(buildQuery: (from: number, to: number) => any) => {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = (await buildQuery(from, from + PAGE_SIZE - 1)) as {
      data?: T[] | null;
      error?: { message: string } | null;
    };
    if (error) throw new Error(error.message);
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
};

export const runtime = "nodejs";

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const includeExtendedSources = isCrmBudgetExecutionEnhancedClient(client);
  const year = parseYear(searchParams.get("year"));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const madridToday = getTodayIsoInMadrid();
  const campaignSpendEnd = yearEnd < madridToday ? yearEnd : madridToday;

  try {
    const { data: rolesData, error: rolesError } = await supabase
      .from("crm_budget_roles")
      .select("*")
      .eq("client_slug", client)
      .eq("year", year)
      .order("sort_order", { ascending: true })
      .order("role_name", { ascending: true });
    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 500 });
    }

    const { data: adjustmentsData, error: adjustmentsError } = await supabase
      .from("crm_budget_adjustments")
      .select("role_id, amount, from_year, type")
      .eq("client_slug", client)
      .eq("to_year", year)
      .eq("type", "carryover");
    if (adjustmentsError) {
      return NextResponse.json({ error: adjustmentsError.message }, { status: 500 });
    }

    const carryoverByRole: Record<string, number> = {};
    const carryoverFromYears = new Set<number>();
    (adjustmentsData ?? []).forEach((row: any) => {
      if (!row?.role_id) return;
      const amount = Number(row.amount ?? 0);
      carryoverByRole[String(row.role_id)] =
        (carryoverByRole[String(row.role_id)] ?? 0) + amount;
      if (Number.isFinite(Number(row.from_year))) {
        carryoverFromYears.add(Number(row.from_year));
      }
    });
    const carryoverTotal = Object.values(carryoverByRole).reduce((acc, value) => acc + value, 0);
    const carryoverFromYear =
      carryoverFromYears.size === 1 ? Array.from(carryoverFromYears)[0] : null;

    const roleIds = (rolesData ?? []).map((r: any) => r.id);
    const { data: assignmentsData, error: assignmentsError } = roleIds.length
      ? await supabase
          .from("crm_budget_assignments")
          .select("*")
          .eq("client_slug", client)
          .in("role_id", roleIds)
      : { data: [], error: null };
    if (assignmentsError) {
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    const { data: peopleData, error: peopleError } = await supabase
      .from("crm_people")
      .select("id, display_name, email, is_active")
      .eq("client_slug", client);
    if (peopleError) {
      return NextResponse.json({ error: peopleError.message }, { status: 500 });
    }

    const { data: ratesData, error: ratesError } = await supabase
      .from("crm_owner_rates")
      .select("owner, person_id, daily_rate, currency")
      .eq("client_slug", client)
      .eq("year", year);
    if (ratesError) {
      return NextResponse.json({ error: ratesError.message }, { status: 500 });
    }

    const { data: aliasData, error: aliasError } = await supabase
      .from("crm_people_aliases")
      .select("alias, person_id")
      .eq("client_slug", client);
    if (aliasError) {
      return NextResponse.json({ error: aliasError.message }, { status: 500 });
    }

    const { data: entityRows, error: entityError } = await supabase
      .from("crm_people_entities")
      .select("person_id, entity")
      .eq("client_slug", client)
      .eq("year", year);
    if (entityError) {
      return NextResponse.json({ error: entityError.message }, { status: 500 });
    }

    const aliasMap = new Map<string, string>();
    (aliasData ?? []).forEach((row: any) => {
      if (!row?.alias || !row?.person_id) return;
      aliasMap.set(normalizeKey(row.alias), row.person_id);
    });

    const entityByPerson: Record<string, string> = {};
    (entityRows ?? []).forEach((row: any) => {
      if (!row?.person_id || !row?.entity) return;
      entityByPerson[String(row.person_id)] = String(row.entity);
    });

    const rateByPerson = new Map<string, { dailyRate: number; currency: string }>();
    const rateByOwner = new Map<string, { dailyRate: number; currency: string }>();
    const currencySet = new Set<string>();
    (ratesData ?? []).forEach((row: any) => {
      const dailyRate = Number(row.daily_rate ?? 0);
      const currency = String(row.currency || "EUR");
      if (row.person_id) {
        rateByPerson.set(String(row.person_id), { dailyRate, currency });
      }
      if (row.owner) {
        rateByOwner.set(normalizeKey(row.owner), { dailyRate, currency });
      }
      if (currency) currencySet.add(currency);
    });
    const dailyRatesByPersonId: Record<string, number> = {};
    rateByPerson.forEach((entry, personId) => {
      dailyRatesByPersonId[personId] = entry.dailyRate;
    });

    const contribRows = includeExtendedSources
      ? await fetchPaged<any>((from, to) =>
          supabase
            .from("crm_data_quality_contributions")
            .select("person_id, owner, work_hours, prep_hours, effort_date")
            .eq("client_slug", client)
            .gte("effort_date", yearStart)
            .lte("effort_date", yearEnd)
            .order("effort_date", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        )
      : [];

    const campaignRows = includeExtendedSources
      ? await fetchPaged<any>((from, to) =>
          supabase
            .from("campaign_email_units")
            .select("person_id, owner, hours_total, send_date")
            .eq("client_slug", client)
            .gte("send_date", yearStart)
            .lte("send_date", campaignSpendEnd)
            .order("send_date", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        )
      : [];

    const manualRows = await fetchPaged<any>((from, to) =>
      supabase
        .from("crm_manual_efforts")
        .select("person_id, owner, hours, effort_date")
        .eq("client_slug", client)
        .gte("effort_date", yearStart)
        .lte("effort_date", yearEnd)
        .order("effort_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );

    const spendByPerson: Record<string, number> = {};
    let unmappedSpend = 0;

    const addSpend = (personId: string | null, owner: string | null, hours: number) => {
      if (!Number.isFinite(hours) || hours <= 0) return;
      const ownerKey = normalizeKey(owner);
      const resolvedPersonId =
        personId || (ownerKey ? aliasMap.get(ownerKey) ?? null : null);
      const rate =
        (resolvedPersonId ? rateByPerson.get(resolvedPersonId) : null) ||
        (ownerKey ? rateByOwner.get(ownerKey) : null);
      if (!rate || rate.dailyRate <= 0) return;
      const days = hours / 7;
      const amount = days * rate.dailyRate;
      if (resolvedPersonId) {
        spendByPerson[resolvedPersonId] = (spendByPerson[resolvedPersonId] ?? 0) + amount;
      } else {
        unmappedSpend += amount;
      }
    };

    contribRows.forEach((row: any) => {
      const work = Number(row.work_hours ?? 0);
      const prepRaw = row.prep_hours;
      const prep =
        prepRaw == null || prepRaw === ""
          ? work * 0.35
          : Number(prepRaw);
      const hours = work + (Number.isFinite(prep) ? prep : 0);
      addSpend(row.person_id ? String(row.person_id) : null, row.owner ?? null, hours);
    });

    campaignRows.forEach((row: any) => {
      const hours = Number(row.hours_total ?? 0);
      addSpend(row.person_id ? String(row.person_id) : null, row.owner ?? null, hours);
    });

    manualRows.forEach((row: any) => {
      const hours = Number(row.hours ?? 0);
      addSpend(row.person_id ? String(row.person_id) : null, row.owner ?? null, hours);
    });

    const roles =
      rolesData?.map((row: any) => {
        const basePool = Number(row.pool_amount ?? 0);
        const carryoverAmount = carryoverByRole[String(row.id)] ?? 0;
        return {
          id: String(row.id),
          clientSlug: row.client_slug,
          year: Number(row.year),
          roleName: String(row.role_name ?? ""),
          poolAmount: basePool,
          basePoolAmount: basePool,
          carryoverAmount,
          adjustedPoolAmount: basePool + carryoverAmount,
          currency: String(row.currency ?? "EUR"),
          sortOrder: Number(row.sort_order ?? 0),
          isActive: row.is_active ?? true,
        };
      }) ?? [];

    const assignments =
      assignmentsData?.map((row: any) => ({
        id: String(row.id),
        clientSlug: row.client_slug,
        roleId: String(row.role_id),
        personId: String(row.person_id),
        allocationAmount:
          row.allocation_amount != null ? Number(row.allocation_amount) : null,
        allocationPct:
          row.allocation_pct != null ? Number(row.allocation_pct) : null,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        isActive: row.is_active ?? true,
      })) ?? [];

    const people =
      peopleData?.map((row: any) => ({
        personId: String(row.id),
        displayName: String(row.display_name ?? ""),
        email: row.email ?? null,
        isActive: row.is_active ?? true,
      })) ?? [];

    const spendCurrency = currencySet.size === 1 ? Array.from(currencySet)[0] : null;

    return NextResponse.json({
      year,
      roles,
      assignments,
      people,
      spendByPerson,
      unmappedSpend,
      spendCurrency,
      entityByPerson,
      dailyRatesByPersonId,
      carryoverByRole,
      carryoverTotal,
      carryoverFromYear,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

