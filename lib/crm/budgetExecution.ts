import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeKey = (value?: string | null) => value?.trim().toLowerCase() ?? "";

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

export async function getBudgetExecutionData({
  supabase,
  client,
  year,
}: {
  supabase: SupabaseClient;
  client: string;
  year: number;
}) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const UNMAPPED_KEY = "unmapped";
  const UNASSIGNED_ENTITY = "Unassigned";

  const { data: rolesData, error: rolesError } = await supabase
    .from("crm_budget_roles")
    .select("*")
    .eq("client_slug", client)
    .eq("year", year)
    .order("sort_order", { ascending: true })
    .order("role_name", { ascending: true });
  if (rolesError) {
    throw new Error(rolesError.message);
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
    throw new Error(assignmentsError.message);
  }

  const { data: peopleData, error: peopleError } = await supabase
    .from("crm_people")
    .select("id, display_name, is_active")
    .eq("client_slug", client);
  if (peopleError) {
    throw new Error(peopleError.message);
  }

  const { data: ratesData, error: ratesError } = await supabase
    .from("crm_owner_rates")
    .select("owner, person_id, daily_rate, currency")
    .eq("client_slug", client)
    .eq("year", year);
  if (ratesError) {
    throw new Error(ratesError.message);
  }

  const { data: aliasData, error: aliasError } = await supabase
    .from("crm_people_aliases")
    .select("alias, person_id")
    .eq("client_slug", client);
  if (aliasError) {
    throw new Error(aliasError.message);
  }

  const { data: entityRows, error: entityError } = await supabase
    .from("crm_people_entities")
    .select("person_id, entity")
    .eq("client_slug", client)
    .eq("year", year);
  if (entityError) {
    throw new Error(entityError.message);
  }

  const aliasMap = new Map<string, string>();
  (aliasData ?? []).forEach((row: any) => {
    if (!row?.alias || !row?.person_id) return;
    aliasMap.set(normalizeKey(row.alias), row.person_id);
  });

  const entityByPersonId = new Map<string, string>();
  (entityRows ?? []).forEach((row: any) => {
    if (!row?.person_id || !row?.entity) return;
    entityByPersonId.set(String(row.person_id), String(row.entity));
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
    allocationAmount:
      row.allocation_amount != null ? Number(row.allocation_amount) : null,
    allocationPct:
      row.allocation_pct != null ? Number(row.allocation_pct) : null,
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
  const roleById = new Map(activeRoles.map((role) => [role.id, role]));
  const activeRoleIds = new Set(activeRoles.map((role) => role.id));
  const activeAssignments = assignments.filter(
    (assignment) => assignment.isActive !== false && activeRoleIds.has(assignment.roleId),
  );

  const getOverlapDays = (assignment: {
    startDate: string | null;
    endDate: string | null;
  }) => {
    const rawStart = assignment.startDate ? toUtcDate(assignment.startDate) : yearStartDate;
    const rawEnd = assignment.endDate ? toUtcDate(assignment.endDate) : yearEndDate;
    const start = clampDate(rawStart, yearStartDate, yearEndDate);
    const end = clampDate(rawEnd, yearStartDate, yearEndDate);
    if (start > end) return 0;
    const activeDays = diffDays(start, end);
    if (!Number.isFinite(activeDays) || activeDays <= 0) return 0;
    return activeDays;
  };

  const assignmentsByRole = new Map<string, typeof assignments>();
  activeAssignments.forEach((assignment) => {
    const list = assignmentsByRole.get(assignment.roleId) ?? [];
    list.push(assignment);
    assignmentsByRole.set(assignment.roleId, list);
  });

  const roleBudgetByPerson = new Map<string, Map<string, number>>();
  const personRoleBudget = new Map<string, Map<string, number>>();

  const addRoleBudget = (roleId: string, personId: string, amount: number) => {
    const roleMap = roleBudgetByPerson.get(roleId) ?? new Map<string, number>();
    roleMap.set(personId, (roleMap.get(personId) ?? 0) + amount);
    roleBudgetByPerson.set(roleId, roleMap);
    const personMap = personRoleBudget.get(personId) ?? new Map<string, number>();
    personMap.set(roleId, (personMap.get(roleId) ?? 0) + amount);
    personRoleBudget.set(personId, personMap);
  };

  activeRoles.forEach((role) => {
    const roleAssignments = assignmentsByRole.get(role.id) ?? [];
    if (roleAssignments.length === 0) return;
    const hasManualAllocations = roleAssignments.some(
      (assignment) =>
        assignment.allocationAmount != null || assignment.allocationPct != null,
    );

    if (hasManualAllocations) {
      roleAssignments.forEach((assignment) => {
        const overlapDays = getOverlapDays(assignment);
        if (overlapDays <= 0) return;
        const amount =
          assignment.allocationAmount != null
            ? Number(assignment.allocationAmount)
            : assignment.allocationPct != null
              ? role.poolAmount * (Number(assignment.allocationPct) / 100)
              : 0;
        addRoleBudget(role.id, assignment.personId, amount);
      });
      return;
    }

    let totalActiveDays = 0;
    const daysByPerson = new Map<string, number>();
    roleAssignments.forEach((assignment) => {
      const activeDays = getOverlapDays(assignment);
      if (activeDays <= 0) return;
      totalActiveDays += activeDays;
      daysByPerson.set(
        assignment.personId,
        (daysByPerson.get(assignment.personId) ?? 0) + activeDays,
      );
    });
    if (totalActiveDays <= 0) return;
    daysByPerson.forEach((days, personId) => {
      const amount = role.poolAmount * (days / totalActiveDays);
      addRoleBudget(role.id, personId, amount);
    });
  });

  const roleSharesByPerson = new Map<string, Array<{ roleId: string; share: number }>>();
  personRoleBudget.forEach((roleMap, personId) => {
    const total = Array.from(roleMap.values()).reduce((acc, value) => acc + value, 0);
    if (total <= 0) return;
    const shares = Array.from(roleMap.entries())
      .map(([roleId, value]) => ({ roleId, share: value / total }))
      .filter((entry) => entry.share > 0);
    if (shares.length) roleSharesByPerson.set(personId, shares);
  });

  const budgetByPerson: Record<string, number> = {};
  const rolesByPerson: Record<string, string[]> = {};
  const roleIdsByPerson: Record<string, string[]> = {};

  roleBudgetByPerson.forEach((personMap, roleId) => {
    const role = roleById.get(roleId);
    if (!role) return;
    personMap.forEach((amount, personId) => {
      budgetByPerson[personId] = (budgetByPerson[personId] ?? 0) + amount;
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

  const planByEntity = new Map<string, number>();
  Object.entries(budgetByPerson).forEach(([personId, plan]) => {
    const entity = entityByPersonId.get(personId) ?? UNASSIGNED_ENTITY;
    planByEntity.set(entity, (planByEntity.get(entity) ?? 0) + plan);
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
    days_total?: number | string | null;
    send_date?: string | null;
    brand?: string | null;
    market?: string | null;
    scope?: string | null;
    segment?: string | null;
  };

  type ManualEffortRow = {
    person_id?: string | null;
    owner?: string | null;
    hours?: number | string | null;
    effort_date?: string | null;
    workstream?: string | null;
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
      .select("person_id, owner, hours_total, days_total, send_date, brand, market, scope, segment")
      .eq("client_slug", client)
      .gte("send_date", yearStart)
      .lte("send_date", yearEnd)
      .order("send_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const manualRows = await fetchPaged<ManualEffortRow>((from, to) =>
    supabase
      .from("crm_manual_efforts")
      .select("person_id, owner, hours, effort_date, workstream")
      .eq("client_slug", client)
      .gte("effort_date", yearStart)
      .lte("effort_date", yearEnd)
      .order("effort_date", { ascending: true })
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
  const entityTotals = new Map<string, number>();
  const monthlyEntity = new Map<string, number[]>();
  const monthlyEntityScope = new Map<string, Map<string, number[]>>();
  const monthlyEntityRole = new Map<string, Map<string, number[]>>();
  const monthlyEntityRoleScope = new Map<string, Map<string, Map<string, number[]>>>();
  const monthlyPerson = new Map<string, number[]>();
  const monthlyPersonScope = new Map<string, Map<string, number[]>>();
  let actualTotal = 0;
  let totalHours = 0;
  let totalDays = 0;
  let lastDate: Date | null = null;
  let unmappedTotal = 0;

  type ProductionMetric = { budget: number; hours: number; days: number; units: number };
  type ProductionBreakdown = Record<string, ProductionMetric>;
  type ProductionPerson = {
    totals: ProductionMetric;
    byBrand: ProductionBreakdown;
    byMarket: ProductionBreakdown;
    bySegment: ProductionBreakdown;
    byScope: ProductionBreakdown;
  };

  const createMetric = (): ProductionMetric => ({
    budget: 0,
    hours: 0,
    days: 0,
    units: 0,
  });

  const addMetric = (target: ProductionMetric, metric: ProductionMetric, scale = 1) => {
    target.budget += metric.budget * scale;
    target.hours += metric.hours * scale;
    target.days += metric.days * scale;
    target.units += metric.units * scale;
  };

  const updateBreakdown = (
    breakdown: ProductionBreakdown,
    key: string,
    metric: ProductionMetric,
    scale = 1,
  ) => {
    const entry = breakdown[key] ?? createMetric();
    addMetric(entry, metric, scale);
    breakdown[key] = entry;
  };

  const productionByPerson = new Map<string, ProductionPerson>();
  const productionTotals = createMetric();

  const ensureProductionPerson = (personKey: string) => {
    const existing = productionByPerson.get(personKey);
    if (existing) return existing;
    const created = {
      totals: createMetric(),
      byBrand: {},
      byMarket: {},
      bySegment: {},
      byScope: {},
    };
    productionByPerson.set(personKey, created);
    return created;
  };

  const normalizeDimension = (value: string | null | undefined, fallback: string) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.length > 0 ? trimmed : fallback;
  };

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

  const ensureEntitySeries = (entityKey: string) => ensureMonthSeries(monthlyEntity, entityKey);

  const ensureEntityScopeSeries = (entityKey: string, scopeKey: string) => {
    let scopeMap = monthlyEntityScope.get(entityKey);
    if (!scopeMap) {
      scopeMap = new Map<string, number[]>();
      monthlyEntityScope.set(entityKey, scopeMap);
    }
    const existing = scopeMap.get(scopeKey);
    if (existing) return existing;
    const created = Array(12).fill(0);
    scopeMap.set(scopeKey, created);
    return created;
  };

  const ensureEntityRoleSeries = (entityKey: string, roleId: string) => {
    let roleMap = monthlyEntityRole.get(entityKey);
    if (!roleMap) {
      roleMap = new Map<string, number[]>();
      monthlyEntityRole.set(entityKey, roleMap);
    }
    const existing = roleMap.get(roleId);
    if (existing) return existing;
    const created = Array(12).fill(0);
    roleMap.set(roleId, created);
    return created;
  };

  const ensureEntityRoleScopeSeries = (entityKey: string, roleId: string, scopeKey: string) => {
    let roleMap = monthlyEntityRoleScope.get(entityKey);
    if (!roleMap) {
      roleMap = new Map<string, Map<string, number[]>>();
      monthlyEntityRoleScope.set(entityKey, roleMap);
    }
    let scopeMap = roleMap.get(roleId);
    if (!scopeMap) {
      scopeMap = new Map<string, number[]>();
      roleMap.set(roleId, scopeMap);
    }
    const existing = scopeMap.get(scopeKey);
    if (existing) return existing;
    const created = Array(12).fill(0);
    scopeMap.set(scopeKey, created);
    return created;
  };

  const ensurePersonScopeSeries = (personKey: string, scopeKey: string) => {
    let scopeMap = monthlyPersonScope.get(personKey);
    if (!scopeMap) {
      scopeMap = new Map<string, number[]>();
      monthlyPersonScope.set(personKey, scopeMap);
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
    if (!Number.isFinite(hours) || hours <= 0) return null;
    const ownerKey = normalizeKey(owner);
    const resolvedPersonId = personId || (ownerKey ? aliasMap.get(ownerKey) ?? null : null);
    const rate =
      (resolvedPersonId ? rateByPerson.get(resolvedPersonId) : null) ||
      (ownerKey ? rateByOwner.get(ownerKey) : null);
    if (!rate || rate.dailyRate <= 0) return null;
    const days = hours / 7;
    const amount = days * rate.dailyRate;
    const entityKey = resolvedPersonId
      ? entityByPersonId.get(resolvedPersonId) ?? UNASSIGNED_ENTITY
      : UNASSIGNED_ENTITY;
    actualTotal += amount;
    totalHours += hours;
    totalDays += days;
    const scopeKey = scopeLabel || "Unknown";
    scopeTotals.set(scopeKey, (scopeTotals.get(scopeKey) ?? 0) + amount);
    entityTotals.set(entityKey, (entityTotals.get(entityKey) ?? 0) + amount);
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
        ensureMonthSeries(monthlyPerson, personKey)[idx] += amount;
        ensurePersonScopeSeries(personKey, scopeKey)[idx] += amount;
        ensureEntitySeries(entityKey)[idx] += amount;
        ensureEntityScopeSeries(entityKey, scopeKey)[idx] += amount;
        if (roleShares && roleShares.length > 0) {
          roleShares.forEach((share) => {
            const roleAmount = amount * share.share;
            ensureMonthSeries(monthlyRole, share.roleId)[idx] += roleAmount;
            ensureRoleScopeSeries(share.roleId, scopeKey)[idx] += roleAmount;
            ensureEntityRoleSeries(entityKey, share.roleId)[idx] += roleAmount;
            ensureEntityRoleScopeSeries(entityKey, share.roleId, scopeKey)[idx] += roleAmount;
          });
        } else {
          ensureMonthSeries(monthlyRole, "unassigned")[idx] += amount;
          ensureRoleScopeSeries("unassigned", scopeKey)[idx] += amount;
          ensureEntityRoleSeries(entityKey, "unassigned")[idx] += amount;
          ensureEntityRoleScopeSeries(entityKey, "unassigned", scopeKey)[idx] += amount;
        }
      }
      if (!lastDate || d > lastDate) lastDate = d;
    }
    return {
      personKey: resolvedPersonId ?? UNMAPPED_KEY,
      resolvedPersonId,
      roleShares,
      amount,
      hours,
      days,
      entityKey,
    };
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
    const result = addSpend(
      row.person_id ? String(row.person_id) : null,
      row.owner ?? null,
      hours,
      row.send_date ?? null,
      "Production",
    );
    if (!result) return;
    const metric: ProductionMetric = {
      budget: result.amount,
      hours,
      days: result.days,
      units: 1,
    };
    const personBucket = ensureProductionPerson(result.personKey);
    addMetric(personBucket.totals, metric);
    addMetric(productionTotals, metric);
    const brand = normalizeDimension(row.brand, "Unknown brand");
    const market = normalizeDimension(row.market, "Unknown market");
    const segment = normalizeDimension(row.segment, "Unknown segment");
    const scope = normalizeDimension(row.scope, "Unknown scope");
    updateBreakdown(personBucket.byBrand, brand, metric);
    updateBreakdown(personBucket.byMarket, market, metric);
    updateBreakdown(personBucket.bySegment, segment, metric);
    updateBreakdown(personBucket.byScope, scope, metric);
  });

  manualRows.forEach((row) => {
    const hours = Number(row.hours ?? 0);
    const scopeLabel = String(row.workstream || "Manual");
    addSpend(
      row.person_id ? String(row.person_id) : null,
      row.owner ?? null,
      hours,
      row.effort_date ?? null,
      scopeLabel,
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

  const entityPlanPayload: Record<string, number> = {};
  planByEntity.forEach((value, entity) => {
    entityPlanPayload[entity] = value;
  });

  const entityActualPayload: Record<string, number> = {};
  entityTotals.forEach((value, entity) => {
    entityActualPayload[entity] = value;
  });

  const monthlyEntityPayload: Record<string, number[]> = {};
  monthlyEntity.forEach((series, entity) => {
    monthlyEntityPayload[entity] = series;
  });

  const monthlyEntityScopePayload: Record<string, Record<string, number[]>> = {};
  monthlyEntityScope.forEach((scopeMap, entity) => {
    monthlyEntityScopePayload[entity] = {};
    scopeMap.forEach((series, scope) => {
      monthlyEntityScopePayload[entity][scope] = series;
    });
  });

  const monthlyEntityRolePayload: Record<string, Record<string, number[]>> = {};
  monthlyEntityRole.forEach((roleMap, entity) => {
    monthlyEntityRolePayload[entity] = {};
    roleMap.forEach((series, roleId) => {
      monthlyEntityRolePayload[entity][roleId] = series;
    });
  });

  const monthlyEntityRoleScopePayload: Record<string, Record<string, Record<string, number[]>>> = {};
  monthlyEntityRoleScope.forEach((roleMap, entity) => {
    monthlyEntityRoleScopePayload[entity] = {};
    roleMap.forEach((scopeMap, roleId) => {
      monthlyEntityRoleScopePayload[entity][roleId] = {};
      scopeMap.forEach((series, scope) => {
        monthlyEntityRoleScopePayload[entity][roleId][scope] = series;
      });
    });
  });

  const monthlyPersonPayload: Record<string, number[]> = {};
  monthlyPerson.forEach((series, personKey) => {
    monthlyPersonPayload[personKey] = series;
  });

  const monthlyPersonScopePayload: Record<string, Record<string, number[]>> = {};
  monthlyPersonScope.forEach((scopeMap, personKey) => {
    monthlyPersonScopePayload[personKey] = {};
    scopeMap.forEach((series, scope) => {
      monthlyPersonScopePayload[personKey][scope] = series;
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
    const entity = isUnmapped
      ? UNASSIGNED_ENTITY
      : entityByPersonId.get(personKey) ?? UNASSIGNED_ENTITY;
    return {
      key: personKey,
      personId: isUnmapped ? null : personKey,
      name,
      entity,
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
  const entityOptions = Array.from(
    new Set([
      ...Array.from(entityByPersonId.values()),
      ...entityTotals.keys(),
      ...planByEntity.keys(),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const entityByPerson: Record<string, string> = {};
  entityByPersonId.forEach((entity, personId) => {
    entityByPerson[personId] = entity;
  });

  const productionByPersonPayload: Record<string, ProductionPerson> = {};
  productionByPerson.forEach((value, personKey) => {
    productionByPersonPayload[personKey] = value;
  });

  const roleCurrencySet = new Set(activeRoles.map((role) => role.currency).filter(Boolean));
  const currency =
    roleCurrencySet.size === 1
      ? Array.from(roleCurrencySet)[0]
      : rateCurrencySet.size === 1
      ? Array.from(rateCurrencySet)[0]
      : "EUR";

  return {
    year,
    currency,
    planTotal,
    actualTotal,
    remaining,
    utilization,
    asOfDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
    monthlyActual,
    entityByPerson,
    entityPlan: entityPlanPayload,
    entityActual: entityActualPayload,
    monthlyEntity: monthlyEntityPayload,
    monthlyEntityScope: monthlyEntityScopePayload,
    monthlyEntityRole: monthlyEntityRolePayload,
    monthlyEntityRoleScope: monthlyEntityRoleScopePayload,
    monthlyPerson: monthlyPersonPayload,
    monthlyPersonScope: monthlyPersonScopePayload,
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
    production: {
      totals: productionTotals,
      byPerson: productionByPersonPayload,
    },
    table: {
      rows: tableRows,
      roles: roleOptions,
      scopes: scopeOptions,
      entities: entityOptions,
    },
  };
}
