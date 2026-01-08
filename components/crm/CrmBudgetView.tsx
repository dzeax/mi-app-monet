/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Activity, CreditCard, PiggyBank, Wallet } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ENTITY_OPTIONS } from "@/lib/crm/entities";
import CrmBudgetModal from "@/components/crm/CrmBudgetModal";

type BudgetRole = {
  id: string;
  roleName: string;
  poolAmount: number;
  currency: string;
  sortOrder: number;
  year: number;
  isActive: boolean;
};

type BudgetAssignment = {
  id: string;
  roleId: string;
  personId: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

type Person = {
  personId: string;
  displayName: string;
  email?: string | null;
  isActive: boolean;
};

type BudgetResponse = {
  year: number;
  roles: BudgetRole[];
  assignments: BudgetAssignment[];
  people: Person[];
  spendByPerson: Record<string, number>;
  unmappedSpend?: number;
  spendCurrency?: string | null;
  entityByPerson?: Record<string, string>;
};

const UNASSIGNED_ENTITY = "Unassigned";

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDate = (value: string) => new Date(`${value}T00:00:00Z`);

const clampDate = (value: Date, min: Date, max: Date) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const diffDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;

const formatCurrency = (amount: number, currency: string) => {
  if (!Number.isFinite(amount)) return "0";
  try {
    return amount.toLocaleString("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(1)}%`;
};

const utilizationTone = (value: number) => {
  if (value > 1) return "danger";
  if (value >= 0.9) return "warn";
  return "ok";
};

const utilizationClass = (value: number) => {
  if (value > 1) return "text-red-600 font-bold";
  if (value >= 0.9) return "text-amber-600";
  return "text-emerald-600";
};

const utilizationBarClass = (value: number) => {
  if (value > 1) return "bg-red-500";
  if (value >= 0.9) return "bg-amber-500";
  return "bg-emerald-500";
};

const utilizationBarWidth = (value: number) =>
  `${Math.min(Math.max(value, 0), 1) * 100}%`;

const remainingClass = (value: number) =>
  value < 0 ? "text-red-600" : "text-[color:var(--color-text)]";

const kpiBorderClass = (tone: "danger" | "warn" | "ok") => {
  if (tone === "danger") return "border-red-200";
  if (tone === "warn") return "border-amber-200";
  return "border-[color:var(--color-border)]";
};

const kpiValueClass = (tone: "danger" | "warn" | "ok") => {
  if (tone === "danger") return "text-red-600 font-bold";
  if (tone === "warn") return "text-amber-600 font-semibold";
  return "text-[color:var(--color-text)]";
};

export default function CrmBudgetView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const { isEditor, isAdmin } = useAuth();

  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openManage, setOpenManage] = useState(false);
  const [entityFilter, setEntityFilter] = useState("");

  const fetchBudget = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/budget?client=${clientSlug}&year=${year}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed to load budget (${res.status})`);
      setData(body as BudgetResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load budget");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBudget();
  }, [clientSlug, year]);

  const roles = data?.roles ?? [];
  const assignments = data?.assignments ?? [];
  const people = data?.people ?? [];
  const spendByPerson = data?.spendByPerson ?? {};
  const unmappedSpend = Number(data?.unmappedSpend ?? 0);
  const entityByPerson = data?.entityByPerson ?? {};

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    people.forEach((p) => {
      if (p.personId) map.set(p.personId, p);
    });
    return map;
  }, [people]);

  const budgetCurrency = useMemo(() => {
    const set = new Set(roles.map((r) => r.currency).filter(Boolean));
    if (set.size === 1) return Array.from(set)[0] as string;
    return "EUR";
  }, [roles]);

  const entityOptions = useMemo(() => {
    const set = new Set<string>(ENTITY_OPTIONS);
    Object.values(entityByPerson).forEach((entity) => {
      if (entity) set.add(entity);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entityByPerson]);

  useEffect(() => {
    if (entityFilter && !entityOptions.includes(entityFilter)) {
      setEntityFilter("");
    }
  }, [entityFilter, entityOptions]);

  const { roleSummaries, personSummaries, totals, missingEntityPeople } = useMemo(() => {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const hasEntityFilter = Boolean(entityFilter);
    const entityForPerson = (personId: string) =>
      entityByPerson[personId] ?? UNASSIGNED_ENTITY;
    const isEntityMatch = (personId: string) =>
      !hasEntityFilter || entityForPerson(personId) === entityFilter;

    const activeRoles = roles.filter((r) => r.isActive !== false);
    const activeAssignments = assignments.filter((a) => a.isActive !== false);

    const roleSummaries = activeRoles
      .map((role) => {
      const roleAssignments = activeAssignments.filter((a) => a.roleId === role.id);
      const memberMap = new Map<string, { personId: string; activeDays: number; budget: number }>();
      let totalActiveDays = 0;

      roleAssignments.forEach((assignment) => {
        const rawStart = assignment.startDate ? toUtcDate(assignment.startDate) : yearStart;
        const rawEnd = assignment.endDate ? toUtcDate(assignment.endDate) : yearEnd;
        const start = clampDate(rawStart, yearStart, yearEnd);
        const end = clampDate(rawEnd, yearStart, yearEnd);
        if (start > end) return;
        const activeDays = diffDays(start, end);
        totalActiveDays += activeDays;
        const existing = memberMap.get(assignment.personId);
        if (existing) {
          existing.activeDays += activeDays;
        } else {
          memberMap.set(assignment.personId, {
            personId: assignment.personId,
            activeDays,
            budget: 0,
          });
        }
      });

      memberMap.forEach((entry) => {
        if (totalActiveDays <= 0) {
          entry.budget = 0;
        } else {
          entry.budget = role.poolAmount * (entry.activeDays / totalActiveDays);
        }
      });

      const members = Array.from(memberMap.values()).map((member) => {
        const person = peopleById.get(member.personId);
        return {
          ...member,
          displayName: person?.displayName || "Unknown",
          entity: entityForPerson(member.personId),
        };
      });

      const visibleMembers = hasEntityFilter
        ? members.filter((member) => isEntityMatch(member.personId))
        : members;

      const spent = visibleMembers.reduce((acc, member) => {
        const value = spendByPerson[member.personId] ?? 0;
        return acc + value;
      }, 0);

      const allocated = visibleMembers.reduce((acc, member) => acc + member.budget, 0);
      if (hasEntityFilter && allocated === 0 && spent === 0) {
        return null;
      }
      const poolAmount = hasEntityFilter ? allocated : role.poolAmount;
      const remaining = poolAmount - spent;
      const utilization = poolAmount > 0 ? spent / poolAmount : 0;

      return {
        roleId: role.id,
        roleName: role.roleName,
        poolAmount,
        currency: role.currency,
        members: visibleMembers,
        allocated,
        spent,
        remaining,
        utilization,
      };
    })
    .filter(Boolean) as Array<{
      roleId: string;
      roleName: string;
      poolAmount: number;
      currency: string;
      members: Array<{ personId: string; activeDays: number; budget: number; displayName: string; entity: string }>;
      allocated: number;
      spent: number;
      remaining: number;
      utilization: number;
    }>;

    const budgetByPerson: Record<string, number> = {};
    const rolesByPerson: Record<string, string[]> = {};
    roleSummaries.forEach((role) => {
      role.members.forEach((member) => {
        budgetByPerson[member.personId] = (budgetByPerson[member.personId] ?? 0) + member.budget;
        if (!rolesByPerson[member.personId]) rolesByPerson[member.personId] = [];
        rolesByPerson[member.personId].push(role.roleName);
      });
    });

    const personIds = new Set([
      ...Object.keys(budgetByPerson),
      ...Object.keys(spendByPerson),
    ]);

    const missingEntityPeople = Array.from(personIds).filter((personId) => {
      const entity = entityByPerson[personId];
      return !entity;
    });

    const personSummaries = Array.from(personIds)
      .filter((personId) => isEntityMatch(personId))
      .map((personId) => {
      const person = peopleById.get(personId);
      const budget = budgetByPerson[personId] ?? 0;
      const spent = spendByPerson[personId] ?? 0;
      const remaining = budget - spent;
      const utilization = budget > 0 ? spent / budget : 0;
      return {
        personId,
        displayName: person?.displayName || "Unknown",
        roles: rolesByPerson[personId] ?? [],
        entity: entityForPerson(personId),
        budget,
        spent,
        remaining,
        utilization,
      };
    })
      .sort((a, b) => b.budget - a.budget);

    const budgetTotal = hasEntityFilter
      ? Object.entries(budgetByPerson).reduce((acc, [personId, value]) => {
          if (!isEntityMatch(personId)) return acc;
          return acc + value;
        }, 0)
      : activeRoles.reduce((acc, role) => acc + role.poolAmount, 0);
    const spentTotal = Object.entries(spendByPerson).reduce((acc, [personId, value]) => {
      if (!isEntityMatch(personId)) return acc;
      return acc + value;
    }, 0);
    const remainingTotal = budgetTotal - spentTotal;
    const utilizationTotal = budgetTotal > 0 ? spentTotal / budgetTotal : 0;

    return {
      roleSummaries,
      personSummaries,
      missingEntityPeople,
      totals: {
        budgetTotal,
        spentTotal,
        remainingTotal,
        utilizationTotal,
      },
    };
  }, [roles, assignments, peopleById, spendByPerson, year, entityByPerson, entityFilter]);

  const missingEntityLabels = useMemo(() => {
    return missingEntityPeople
      .map((personId) => peopleById.get(personId)?.displayName || "Unknown")
      .sort((a, b) => a.localeCompare(b));
  }, [missingEntityPeople, peopleById]);

  const groupedPersonRows = useMemo(
    () =>
      roleSummaries.map((role) => {
        const members = role.members
          .map((member) => {
            const spent = spendByPerson[member.personId] ?? 0;
            const remaining = member.budget - spent;
            const utilization = member.budget > 0 ? spent / member.budget : 0;
            return { ...member, spent, remaining, utilization };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        return { roleName: role.roleName, members };
      }),
    [roleSummaries, spendByPerson],
  );

  const yearOptions = useMemo(() => {
    const options = new Set<number>();
    options.add(nowYear - 1);
    options.add(nowYear);
    options.add(nowYear + 1);
    roles.forEach((role) => options.add(role.year));
    return Array.from(options).sort((a, b) => b - a);
  }, [roles, nowYear]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">Budget</h1>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
              Annual budget tracking for {clientSlug.toUpperCase()}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input h-10"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {(isEditor || isAdmin) && (
              <button className="btn-primary h-10 px-4" onClick={() => setOpenManage(true)}>
                Manage budgets
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-indigo-600">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Budget</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(totals.budgetTotal, budgetCurrency)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-indigo-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Spent</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(totals.spentTotal, budgetCurrency)}
              </div>
            </div>
          </div>
          <div
            className={[
              "flex items-center gap-4 rounded-2xl border bg-[color:var(--color-surface-2)]/60 p-4 shadow-sm",
              kpiBorderClass(totals.remainingTotal < 0 ? "danger" : "ok"),
            ].join(" ")}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-indigo-600">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Remaining</div>
              <div
                className={[
                  "text-2xl font-bold",
                  totals.remainingTotal < 0 ? "text-red-600" : "text-emerald-700",
                ].join(" ")}
              >
                {formatCurrency(totals.remainingTotal, budgetCurrency)}
              </div>
            </div>
          </div>
          <div
            className={[
              "flex items-center gap-4 rounded-2xl border bg-[color:var(--color-surface-2)]/60 p-4 shadow-sm",
              kpiBorderClass(utilizationTone(totals.utilizationTotal)),
            ].join(" ")}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-indigo-600">
              <Activity className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Utilization</div>
              <div className={["text-2xl font-bold", utilizationClass(totals.utilizationTotal)].join(" ")}>
                {formatPercent(totals.utilizationTotal)}
              </div>
              <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-gray-200/80">
                <div
                  className={`h-full ${utilizationBarClass(totals.utilizationTotal)}`}
                  style={{ width: utilizationBarWidth(totals.utilizationTotal) }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Entity</label>
            <select
              className="input h-10 min-w-[220px]"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            >
              <option value="">All entities</option>
              {entityOptions.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-[color:var(--color-text)]/60">
            Filters update KPIs and tables.
          </span>
        </div>

        {unmappedSpend > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Unmapped spend: {formatCurrency(unmappedSpend, budgetCurrency)} (missing person mapping).
          </div>
        ) : null}
        {missingEntityLabels.length > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Missing entity for {missingEntityLabels.length} people:{" "}
            {missingEntityLabels.slice(0, 6).join(", ")}
            {missingEntityLabels.length > 6 ? ` +${missingEntityLabels.length - 6} more` : ""}
          </div>
        ) : null}
      </header>

      <section className="rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Budget by role</h3>
          <span className="text-sm text-[color:var(--color-text)]/70">{roleSummaries.length} roles</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)]/50 text-[color:var(--color-text)]/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-right font-semibold">Pool</th>
                <th className="px-4 py-3 text-right font-semibold">Allocated</th>
                <th className="px-4 py-3 text-right font-semibold">Spent</th>
                <th className="px-4 py-3 text-right font-semibold">Remaining</th>
                <th className="px-4 py-3 text-right font-semibold">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]">
              {roleSummaries.length === 0 && !loading && !error ? (
                <tr>
                  <td className="px-4 py-6 text-center text-[color:var(--color-text)]/60" colSpan={6}>
                    No roles configured.
                  </td>
                </tr>
              ) : (
                roleSummaries.map((role) => (
                  <tr key={role.roleId}>
                    <td className="px-4 py-3 font-semibold">{role.roleName}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(role.poolAmount, role.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(role.allocated, role.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(role.spent, role.currency)}
                    </td>
                    <td className={`px-4 py-3 text-right ${remainingClass(role.remaining)}`}>
                      {formatCurrency(role.remaining, role.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <span className={utilizationClass(role.utilization)}>
                            {formatPercent(role.utilization)}
                          </span>
                          {role.utilization > 1 ? (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
                              !
                            </span>
                          ) : null}
                        </div>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]/80">
                          <div
                            className={`h-full ${utilizationBarClass(role.utilization)}`}
                            style={{ width: utilizationBarWidth(role.utilization) }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-sm !mt-8">
        <div className="flex items-center justify-between px-6 py-4">
          <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Budget by person</h3>
          <span className="text-sm text-[color:var(--color-text)]/70">{personSummaries.length} people</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)]/50 text-[color:var(--color-text)]/80">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Person</th>
                <th className="px-3 py-2 text-left font-semibold">Entity</th>
                <th className="px-3 py-2 text-right font-semibold">Budget</th>
                <th className="px-3 py-2 text-right font-semibold">Spent</th>
                <th className="px-3 py-2 text-right font-semibold">Remaining</th>
                <th className="px-3 py-2 text-right font-semibold">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]">
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={6}>
                    Loading budget...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={6}>
                    {error}
                  </td>
                </tr>
              ) : groupedPersonRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={6}>
                    No budget entries yet.
                  </td>
                </tr>
              ) : (
                groupedPersonRows.map((group) => (
                  <Fragment key={group.roleName}>
                    <tr className="bg-[color:var(--color-surface-2)]/40">
                      <td
                        className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/70"
                        colSpan={6}
                      >
                        {group.roleName}
                      </td>
                    </tr>
                    {group.members.length ? (
                      group.members.map((member) => (
                        <tr key={`${group.roleName}-${member.personId}`}>
                          <td className="px-3 py-2 font-semibold">{member.displayName}</td>
                          <td className="px-3 py-2 text-[color:var(--color-text)]/70">
                            {member.entity}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(member.budget, budgetCurrency)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(member.spent, budgetCurrency)}
                          </td>
                          <td className={`px-3 py-2 text-right ${remainingClass(member.remaining)}`}>
                            {formatCurrency(member.remaining, budgetCurrency)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2">
                                <span className={utilizationClass(member.utilization)}>
                                  {formatPercent(member.utilization)}
                                </span>
                                {member.utilization > 1 ? (
                                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600">
                                    !
                                  </span>
                                ) : null}
                              </div>
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]/80">
                                <div
                                  className={`h-full ${utilizationBarClass(member.utilization)}`}
                                  style={{ width: utilizationBarWidth(member.utilization) }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-3 text-sm text-[color:var(--color-text)]/60" colSpan={6}>
                          No members assigned.
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {openManage && data ? (
        <CrmBudgetModal
          clientSlug={clientSlug}
          year={year}
          roles={roles}
          assignments={assignments}
          people={people}
          entityByPerson={entityByPerson}
          spendByPerson={spendByPerson}
          canEdit={isEditor || isAdmin}
          canDelete={isAdmin}
          onClose={() => setOpenManage(false)}
          onSaved={() => void fetchBudget()}
        />
      ) : null}
    </div>
  );
}
