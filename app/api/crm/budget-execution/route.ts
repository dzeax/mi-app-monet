import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const DEFAULT_CLIENT = "emg";
const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeKey = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const parseYear = (value: string | null) => {
  const year = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(year) && year > 1900) return year;
  return new Date().getFullYear();
};

const toUtcDate = (value: string) => new Date(`${value}T00:00:00Z`);

const clampDate = (value: Date, min: Date, max: Date) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const diffDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;

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
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const year = parseYear(searchParams.get("year"));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const UNMAPPED_KEY = "unmapped";

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

    const roles = (rolesData ?? []).map((row: any) => ({
      id: String(row.id),
      roleName: String(row.role_name ?? ""),
      poolAmount: Number(row.pool_amount ?? 0),
      currency: String(row.currency ?? "EUR"),
      isActive: row.is_active ?? true,
    }));
    const activeRoles = roles.filter((role) => role.isActive !== false);
    const roleIds = activeRoles.map((role) => role.id);

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
      .select("id, display_name, is_active")
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

    const aliasMap = new Map<string, string>();
    (aliasData ?? []).forEach((row: any) => {
      if (!row?.alias || !row?.person_id) return;
      aliasMap.set(normalizeKey(row.alias), row.person_id);
    });

    const rateByPerson = new Map<string, { dailyRate: number; currency: string }>();
    const rateByOwner = new Map<string, { dailyRate: number; currency: string }>();
    const rateCurrencySet = new Set<string>();
    (ratesData ?? []).forEach((row: any) => {
      const dailyRate = Number(row.daily_rate ?? 0);
      const currency = String(row.currency || "EUR");
      if (row.person_id) {
        rateByPerson.set(String(row.person_id), { dailyRate, currency });
      }
      if (row.owner) {
        rateByOwner.set(normalizeKey(row.owner), { dailyRate, currency });
      }
      if (currency) rateCurrencySet.add(currency);
    });

    const assignments = (assignmentsData ?? []).map((row: any) => ({
      id: String(row.id),
      roleId: String(row.role_id),
      personId: String(row.person_id),
      startDate: row.start_date ?? null,
      endDate: row.end_date ?? null,
      isActive: row.is_active ?? true,
    }));

    const people =
      peopleData?.map((row: any) => ({
        personId: String(row.id),
        displayName: String(row.display_name ?? ""),
        isActive: row.is_active ?? true,
      })) ?? [];
    const peopleById = new Map<string, { displayName: string }>();
    people.forEach((person) => {
      if (person.personId) peopleById.set(person.personId, person);
    });

    const yearStartDate = new Date(Date.UTC(year, 0, 1));
    const yearEndDate = new Date(Date.UTC(year, 11, 31));
    const shouldIncludeAssignment = (assignment: {
      isActive: boolean;
      startDate: string | null;
      endDate: string | null;
    }) => {
      if (assignment.isActive !== false) return true;
      return Boolean(assignment.startDate || assignment.endDate);
    };
    const roleDaysByPerson = new Map<string, Map<string, number>>();
    const roleDaysByRole = new Map<string, Map<string, number>>();

    assignments
      .filter((assignment) => shouldIncludeAssignment(assignment))
      .forEach((assignment) => {
        const rawStart = assignment.startDate ? toUtcDate(assignment.startDate) : yearStartDate;
        const rawEnd = assignment.endDate ? toUtcDate(assignment.endDate) : yearEndDate;
        const start = clampDate(rawStart, yearStartDate, yearEndDate);
        const end = clampDate(rawEnd, yearStartDate, yearEndDate);
        if (start > end) return;
        const activeDays = diffDays(start, end);
        if (!Number.isFinite(activeDays) || activeDays <= 0) return;
        const map = roleDaysByPerson.get(assignment.personId) ?? new Map<string, number>();
        map.set(assignment.roleId, (map.get(assignment.roleId) ?? 0) + activeDays);
        roleDaysByPerson.set(assignment.personId, map);
        const roleMap = roleDaysByRole.get(assignment.roleId) ?? new Map<string, number>();
        roleMap.set(assignment.personId, (roleMap.get(assignment.personId) ?? 0) + activeDays);
        roleDaysByRole.set(assignment.roleId, roleMap);
      });

    const roleSharesByPerson = new Map<string, Array<{ roleId: string; share: number }>>();
    roleDaysByPerson.forEach((roleMap, personId) => {
      const totalDays = Array.from(roleMap.values()).reduce((acc, days) => acc + days, 0);
      if (totalDays <= 0) return;
      const shares = Array.from(roleMap.entries()).map(([roleId, days]) => ({
        roleId,
        share: days / totalDays,
      }));
      roleSharesByPerson.set(personId, shares);
    });

    const budgetByPerson: Record<string, number> = {};
    const rolesByPerson: Record<string, string[]> = {};
    const roleIdsByPerson: Record<string, string[]> = {};

    activeRoles.forEach((role) => {
      const roleMap = roleDaysByRole.get(role.id) ?? new Map<string, number>();
      const totalActiveDays = Array.from(roleMap.values()).reduce((acc, days) => acc + days, 0);
      if (totalActiveDays <= 0) return;
      roleMap.forEach((days, personId) => {
        const budgetShare = role.poolAmount * (days / totalActiveDays);
        budgetByPerson[personId] = (budgetByPerson[personId] ?? 0) + budgetShare;
        rolesByPerson[personId] = rolesByPerson[personId] ?? [];
        roleIdsByPerson[personId] = roleIdsByPerson[personId] ?? [];
        if (!rolesByPerson[personId].includes(role.roleName)) {
          rolesByPerson[personId].push(role.roleName);
        }
        if (!roleIdsByPerson[personId].includes(role.id)) {
          roleIdsByPerson[personId].push(role.id);
        }
      });
    });

    type ContributionRow = {
      person_id?: string | null;
      owner?: string | null;
      work_hours?: number | string | null;
      prep_hours?: number | string | null;
      effort_date?: string | null;
      workstream?: string | null;
    };

    type CampaignRow = {
      person_id?: string | null;
      owner?: string | null;
      hours_total?: number | string | null;
      send_date?: string | null;
    };

    const contribRows = await fetchPaged<ContributionRow>((from, to) =>
      supabase
        .from("crm_data_quality_contributions")
        .select("person_id, owner, work_hours, prep_hours, effort_date, workstream")
        .eq("client_slug", client)
        .gte("effort_date", yearStart)
        .lte("effort_date", yearEnd)
        .order("effort_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );

    const campaignRows = await fetchPaged<CampaignRow>((from, to) =>
      supabase
        .from("campaign_email_units")
        .select("person_id, owner, hours_total, send_date")
        .eq("client_slug", client)
        .gte("send_date", yearStart)
        .lte("send_date", yearEnd)
        .order("send_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );

    const monthlyActual = Array(12).fill(0);
    const scopeTotals = new Map<string, number>();
    const scopeSpendByPerson = new Map<string, Map<string, number>>();
    const roleScopeActual = new Map<string, Map<string, number>>();
    const monthlyScope = new Map<string, number[]>();
    const monthlyRole = new Map<string, number[]>();
    const monthlyRoleScope = new Map<string, Map<string, number[]>>();
    let actualTotal = 0;
    let totalHours = 0;
    let totalDays = 0;
    let lastDate: Date | null = null;
    let unmappedTotal = 0;

    const ensureMonthSeries = (map: Map<string, number[]>, key: string) => {
      const existing = map.get(key);
      if (existing) return existing;
      const created = Array(12).fill(0);
      map.set(key, created);
      return created;
    };

    const ensureRoleScopeSeries = (roleId: string, scopeKey: string) => {
      let scopeMap = monthlyRoleScope.get(roleId);
      if (!scopeMap) {
        scopeMap = new Map<string, number[]>();
        monthlyRoleScope.set(roleId, scopeMap);
      }
      const existing = scopeMap.get(scopeKey);
      if (existing) return existing;
      const created = Array(12).fill(0);
      scopeMap.set(scopeKey, created);
      return created;
    };

    const addSpend = (
      personId: string | null,
      owner: string | null,
      hours: number,
      dateValue: string | null,
      scopeLabel: string,
    ) => {
      if (!Number.isFinite(hours) || hours <= 0) return;
      const ownerKey = normalizeKey(owner);
      const resolvedPersonId = personId || (ownerKey ? aliasMap.get(ownerKey) ?? null : null);
      const rate =
        (resolvedPersonId ? rateByPerson.get(resolvedPersonId) : null) ||
        (ownerKey ? rateByOwner.get(ownerKey) : null);
      if (!rate || rate.dailyRate <= 0) return;
      const days = hours / 7;
      const amount = days * rate.dailyRate;
      actualTotal += amount;
      totalHours += hours;
      totalDays += days;
      const scopeKey = scopeLabel || "Unknown";
      scopeTotals.set(scopeKey, (scopeTotals.get(scopeKey) ?? 0) + amount);
      const personKey = resolvedPersonId ?? UNMAPPED_KEY;
      const scopeMap = scopeSpendByPerson.get(personKey) ?? new Map<string, number>();
      scopeMap.set(scopeKey, (scopeMap.get(scopeKey) ?? 0) + amount);
      scopeSpendByPerson.set(personKey, scopeMap);
      if (!resolvedPersonId) {
        unmappedTotal += amount;
      }
      const roleShares = resolvedPersonId ? roleSharesByPerson.get(resolvedPersonId) : null;
      if (roleShares && roleShares.length > 0) {
        roleShares.forEach((share) => {
          const roleMap = roleScopeActual.get(share.roleId) ?? new Map<string, number>();
          roleMap.set(scopeKey, (roleMap.get(scopeKey) ?? 0) + amount * share.share);
          roleScopeActual.set(share.roleId, roleMap);
        });
      } else {
        const roleMap = roleScopeActual.get("unassigned") ?? new Map<string, number>();
        roleMap.set(scopeKey, (roleMap.get(scopeKey) ?? 0) + amount);
        roleScopeActual.set("unassigned", roleMap);
      }
      if (dateValue) {
        const d = toUtcDate(dateValue);
        const idx = d.getUTCMonth();
        if (idx >= 0 && idx < 12) {
          monthlyActual[idx] += amount;
          ensureMonthSeries(monthlyScope, scopeKey)[idx] += amount;
          if (roleShares && roleShares.length > 0) {
            roleShares.forEach((share) => {
              const roleAmount = amount * share.share;
              ensureMonthSeries(monthlyRole, share.roleId)[idx] += roleAmount;
              ensureRoleScopeSeries(share.roleId, scopeKey)[idx] += roleAmount;
            });
          } else {
            ensureMonthSeries(monthlyRole, "unassigned")[idx] += amount;
            ensureRoleScopeSeries("unassigned", scopeKey)[idx] += amount;
          }
        }
        if (!lastDate || d > lastDate) lastDate = d;
      }
    };

    contribRows.forEach((row) => {
      const work = Number(row.work_hours ?? 0);
      const prepRaw = row.prep_hours;
      const prep =
        prepRaw == null || prepRaw === ""
          ? work * 0.35
          : Number(prepRaw);
      const hours = work + (Number.isFinite(prep) ? prep : 0);
      const scopeLabel = String(row.workstream || "Data Quality");
      addSpend(
        row.person_id ? String(row.person_id) : null,
        row.owner ?? null,
        hours,
        row.effort_date ?? null,
        scopeLabel,
      );
    });

    campaignRows.forEach((row) => {
      const hours = Number(row.hours_total ?? 0);
      addSpend(
        row.person_id ? String(row.person_id) : null,
        row.owner ?? null,
        hours,
        row.send_date ?? null,
        "Production",
      );
    });

    const planTotal = activeRoles.reduce((acc, role) => acc + role.poolAmount, 0);
    const remaining = planTotal - actualTotal;
    const utilization = planTotal > 0 ? actualTotal / planTotal : 0;

    const roleActual = new Map<string, number>();
    roleScopeActual.forEach((scopeMap, roleId) => {
      const total = Array.from(scopeMap.values()).reduce((acc, value) => acc + value, 0);
      roleActual.set(roleId, total);
    });

    const roleBreakdown = activeRoles.map((role) => ({
      roleId: role.id,
      roleName: role.roleName || "Unnamed role",
      plan: role.poolAmount,
      actual: roleActual.get(role.id) ?? 0,
    }));
    const unassignedActual = roleActual.get("unassigned") ?? 0;
    if (unassignedActual > 0) {
      roleBreakdown.push({
        roleId: "unassigned",
        roleName: "Unassigned",
        plan: 0,
        actual: unassignedActual,
      });
    }

    const scopeBreakdown = Array.from(scopeTotals.entries())
      .map(([scope, actual]) => ({ scope, actual }))
      .sort((a, b) => b.actual - a.actual);

    const monthlyScopePayload: Record<string, number[]> = {};
    monthlyScope.forEach((series, scope) => {
      monthlyScopePayload[scope] = series;
    });
    const monthlyRolePayload: Record<string, number[]> = {};
    monthlyRole.forEach((series, roleId) => {
      monthlyRolePayload[roleId] = series;
    });
    const monthlyRoleScopePayload: Record<string, Record<string, number[]>> = {};
    monthlyRoleScope.forEach((scopeMap, roleId) => {
      monthlyRoleScopePayload[roleId] = {};
      scopeMap.forEach((series, scope) => {
        monthlyRoleScopePayload[roleId][scope] = series;
      });
    });

    const roleScopePayload: Record<string, Record<string, number>> = {};
    roleScopeActual.forEach((scopeMap, roleId) => {
      roleScopePayload[roleId] = {};
      scopeMap.forEach((amount, scope) => {
        roleScopePayload[roleId][scope] = amount;
      });
    });

    const tableRows = Array.from(
      new Set([
        ...Object.keys(budgetByPerson),
        ...Array.from(scopeSpendByPerson.keys()),
      ]),
    ).map((personKey) => {
      const isUnmapped = personKey === UNMAPPED_KEY;
      const scopeMap = scopeSpendByPerson.get(personKey) ?? new Map<string, number>();
      const scopeSpend: Record<string, number> = {};
      scopeMap.forEach((amount, scope) => {
        scopeSpend[scope] = amount;
      });
      const actual = Array.from(scopeMap.values()).reduce((acc, value) => acc + value, 0);
      const plan = isUnmapped ? 0 : budgetByPerson[personKey] ?? 0;
      const roleIds = isUnmapped ? [] : roleIdsByPerson[personKey] ?? [];
      const roles = isUnmapped ? [] : rolesByPerson[personKey] ?? [];
      const shares = isUnmapped ? [] : roleSharesByPerson.get(personKey) ?? [];
      const name = isUnmapped
        ? "Unmapped"
        : peopleById.get(personKey)?.displayName || "Unknown";
      return {
        key: personKey,
        personId: isUnmapped ? null : personKey,
        name,
        roleIds,
        roles,
        roleShares: shares,
        plan,
        actual,
        scopeSpend,
        isUnassigned: roleIds.length === 0,
        isUnmapped,
      };
    });

    const roleOptions = roleBreakdown.map((role) => ({
      id: role.roleId,
      name: role.roleName,
      plan: role.plan,
    }));

    const scopeOptions = scopeBreakdown.map((entry) => entry.scope);

    const roleCurrencySet = new Set(activeRoles.map((role) => role.currency).filter(Boolean));
    const currency =
      roleCurrencySet.size === 1
        ? Array.from(roleCurrencySet)[0]
        : rateCurrencySet.size === 1
        ? Array.from(rateCurrencySet)[0]
        : "EUR";

    return NextResponse.json({
      year,
      currency,
      planTotal,
      actualTotal,
      remaining,
      utilization,
      asOfDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
      monthlyActual,
      totals: {
        hours: totalHours,
        days: totalDays,
        unmappedTotal,
      },
      breakdowns: {
        roles: roleBreakdown,
        scopes: scopeBreakdown,
      },
      roleScopes: roleScopePayload,
      monthlyScope: monthlyScopePayload,
      monthlyRole: monthlyRolePayload,
      monthlyRoleScope: monthlyRoleScopePayload,
      table: {
        rows: tableRows,
        roles: roleOptions,
        scopes: scopeOptions,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
