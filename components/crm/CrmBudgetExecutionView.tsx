"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, CreditCard, PiggyBank, Wallet } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { chartTheme } from "@/components/charts/theme";

type Option = { label: string; value: string };

type RoleBreakdown = {
  roleId: string;
  roleName: string;
  plan: number;
  actual: number;
};

type ScopeBreakdown = {
  scope: string;
  actual: number;
};

type RoleScopeMap = Record<string, Record<string, number>>;

type RoleOption = { id: string; name: string; plan: number };

type TableRow = {
  key: string;
  personId: string | null;
  name: string;
  roleIds: string[];
  roles: string[];
  roleShares: Array<{ roleId: string; share: number }>;
  plan: number;
  actual: number;
  scopeSpend: Record<string, number>;
  isUnassigned: boolean;
  isUnmapped: boolean;
};

type BudgetExecutionResponse = {
  year: number;
  currency: string;
  planTotal: number;
  actualTotal: number;
  remaining: number;
  utilization: number;
  asOfDate: string | null;
  monthlyActual: number[];
  totals: {
    hours: number;
    days: number;
    unmappedTotal: number;
  };
  breakdowns: {
    roles: RoleBreakdown[];
    scopes: ScopeBreakdown[];
  };
  roleScopes: RoleScopeMap;
  monthlyScope: Record<string, number[]>;
  monthlyRole: Record<string, number[]>;
  monthlyRoleScope: Record<string, Record<string, number[]>>;
  table: {
    rows: TableRow[];
    roles: RoleOption[];
    scopes: string[];
  };
};

type KpiItem = {
  label: string;
  value: string;
  helper: string;
  icon: typeof Wallet;
};

type ColumnKey =
  | "name"
  | "roles"
  | "plan"
  | "actual"
  | "remaining"
  | "utilization"
  | "delta"
  | "risk";

type ColumnPreset = "Minimal" | "Finance" | "Full";

const PRESET_STORAGE_KEY = "crm_budget_exec_preset";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_HEIGHT = 260;
const COLUMN_PRESETS: Record<ColumnPreset, ColumnKey[]> = {
  Minimal: ["name", "actual", "utilization", "risk"],
  Finance: ["name", "roles", "plan", "actual", "remaining", "delta", "risk"],
  Full: ["name", "roles", "plan", "actual", "remaining", "utilization", "delta", "risk"],
};
const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Resource",
  roles: "Roles",
  plan: "Plan",
  actual: "Actual",
  remaining: "Remaining",
  utilization: "Utilization",
  delta: "Delta",
  risk: "Risk",
};

const percentFormatter = new Intl.NumberFormat("es-ES", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "--";
  return percentFormatter.format(value);
};

const formatAsOfDate = (value: string) => {
  const [year, month, day] = value.split("-");
  const idx = Number(month) - 1;
  const label = MONTHS[idx] ?? month;
  if (year && day) return `${label} ${day}, ${year}`;
  return value;
};

const sumRecord = (record: Record<string, number>, filter?: Set<string>) => {
  let total = 0;
  Object.entries(record).forEach(([key, value]) => {
    if (filter && !filter.has(key)) return;
    total += value;
  });
  return total;
};

const sumSeriesList = (seriesList: number[][]) => {
  const totals = Array(12).fill(0);
  seriesList.forEach((series) => {
    if (!Array.isArray(series)) return;
    series.forEach((value, idx) => {
      totals[idx] += value || 0;
    });
  });
  return totals;
};

const riskToneClass: Record<"ok" | "warn" | "danger", string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

function riskLabel(row: TableRow, plan: number, actual: number, utilization: number) {
  if (row.isUnmapped) return { label: "Unmapped", tone: "danger" as const };
  if (plan <= 0 && actual > 0) return { label: "Unplanned", tone: "danger" as const };
  if (utilization >= 1) return { label: ">100%", tone: "danger" as const };
  if (utilization >= 0.9) return { label: "90-99%", tone: "warn" as const };
  return { label: "OK", tone: "ok" as const };
}

function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = "All",
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLLabelElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const toggle = useCallback(
    (val: string) => {
      if (values.includes(val)) onChange(values.filter((v) => v !== val));
      else onChange([...values, val]);
    },
    [values, onChange],
  );

  const allSelected =
    values.length === options.length ||
    (values.length === 0 && options.length === 0);
  const display =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label || values[0]
        : `${values.length} selected`;

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((idx) => {
          const next = (idx + 1) % options.length;
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((idx) => {
          const next = (idx - 1 + options.length) % options.length;
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[activeIdx];
        if (opt) toggle(opt.value);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, options, activeIdx, toggle]);

  return (
    <div className="relative" ref={ref}>
      <label className="text-xs font-medium text-[color:var(--color-text)]/70">
        {label}
      </label>
      <button
        type="button"
        className={`input h-10 w-full text-left truncate ${values.length > 0 ? "ring-1 ring-[color:var(--color-accent)]" : ""} focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]`}
        onClick={() => setOpen((v) => !v)}
        title={display}
      >
        {display}
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              if (values.length === 0 || values.length === options.length) {
                onChange([]);
              } else {
                onChange(options.map((o) => o.value));
              }
              setOpen(false);
            }}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <div className="max-h-48 overflow-auto">
            {options.map((opt, idx) => (
              <label
                key={opt.value}
                ref={(el) => (itemRefs.current[idx] = el)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)] ${activeIdx === idx ? "bg-[color:var(--color-surface-2)]" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={values.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span className="flex-1">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CrmBudgetExecutionView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [data, setData] = useState<BudgetExecutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [scopeFilters, setScopeFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const [columnPreset, setColumnPreset] = useState<ColumnPreset>("Finance");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PRESET_STORAGE_KEY) as ColumnPreset | null;
    if (stored && COLUMN_PRESETS[stored]) {
      setColumnPreset(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PRESET_STORAGE_KEY, columnPreset);
  }, [columnPreset]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/crm/budget-execution?client=${clientSlug}&year=${year}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || `Failed to load budget execution (${res.status})`);
        }
        if (active) {
          setData(body as BudgetExecutionResponse);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load budget execution");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [clientSlug, year]);

  useEffect(() => {
    if (!data) return;
    setRoleFilters((prev) =>
      prev.filter((value) => data.breakdowns.roles.some((role) => role.roleId === value)),
    );
    setScopeFilters((prev) => prev.filter((value) => data.table.scopes.includes(value)));
  }, [data]);

  const yearOptions = useMemo(() => {
    const base = new Set<number>([nowYear - 1, nowYear, nowYear + 1]);
    return Array.from(base).sort((a, b) => b - a);
  }, [nowYear]);

  const currency = data?.currency || "EUR";
  const currencyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      return null;
    }
  }, [currency]);
  const currencyFormatterDetail = useMemo(() => {
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      });
    } catch {
      return null;
    }
  }, [currency]);

  const formatCurrency = (value: number, detailed = false) => {
    if (!Number.isFinite(value)) return "--";
    const formatter = detailed ? currencyFormatterDetail : currencyFormatter;
    if (formatter) return formatter.format(value);
    const fallback = value.toLocaleString("es-ES", {
      minimumFractionDigits: detailed ? 2 : 0,
      maximumFractionDigits: detailed ? 2 : 0,
    });
    return `${fallback} ${currency}`;
  };

  const roleFilterSet = useMemo(() => new Set(roleFilters), [roleFilters]);
  const scopeFilterSet = useMemo(() => new Set(scopeFilters), [scopeFilters]);
  const hasRoleFilter = roleFilters.length > 0;
  const hasScopeFilter = scopeFilters.length > 0;

  const kpiItems = useMemo<KpiItem[]>(() => {
    const placeholder = loading ? "..." : "--";
    if (!data) {
      return [
        { label: "Annual plan", value: placeholder, helper: "Sum of budget pools", icon: Wallet },
        { label: "Spent YTD", value: placeholder, helper: "Campaigns + Data Quality", icon: CreditCard },
        { label: "Remaining", value: placeholder, helper: "Plan minus actuals", icon: PiggyBank },
        { label: "Utilization", value: placeholder, helper: "Spent / plan", icon: Activity },
      ];
    }
    return [
      {
        label: "Annual plan",
        value: formatCurrency(data.planTotal),
        helper: "Sum of budget pools",
        icon: Wallet,
      },
      {
        label: "Spent YTD",
        value: formatCurrency(data.actualTotal),
        helper: "Campaigns + Data Quality",
        icon: CreditCard,
      },
      {
        label: "Remaining",
        value: formatCurrency(data.remaining),
        helper: "Plan minus actuals",
        icon: PiggyBank,
      },
      {
        label: "Utilization",
        value: formatPercent(data.utilization),
        helper: "Spent / plan",
        icon: Activity,
      },
    ];
  }, [data, loading, currency]);

  const planTotalFiltered = useMemo(() => {
    if (!data) return 0;
    if (!hasRoleFilter) return data.planTotal;
    return data.breakdowns.roles.reduce((acc, role) => {
      if (roleFilterSet.has(role.roleId)) return acc + role.plan;
      return acc;
    }, 0);
  }, [data, hasRoleFilter, roleFilterSet]);

  const filteredMonthlyActual = useMemo(() => {
    if (!data) return Array(12).fill(0);
    if (!hasRoleFilter && !hasScopeFilter) {
      return data.monthlyActual ?? Array(12).fill(0);
    }
    const monthlyRoleScope = data.monthlyRoleScope ?? {};
    const monthlyRole = data.monthlyRole ?? {};
    const monthlyScope = data.monthlyScope ?? {};
    if (hasRoleFilter && hasScopeFilter) {
      const seriesList: number[][] = [];
      roleFilters.forEach((roleId) => {
        const scopeMap = monthlyRoleScope[roleId] ?? {};
        scopeFilters.forEach((scope) => {
          const series = scopeMap[scope];
          if (series) seriesList.push(series);
        });
      });
      return sumSeriesList(seriesList);
    }
    if (hasRoleFilter) {
      const seriesList = roleFilters
        .map((roleId) => monthlyRole[roleId])
        .filter((series): series is number[] => Array.isArray(series));
      return sumSeriesList(seriesList);
    }
    if (hasScopeFilter) {
      const seriesList = scopeFilters
        .map((scope) => monthlyScope[scope])
        .filter((series): series is number[] => Array.isArray(series));
      return sumSeriesList(seriesList);
    }
    return data.monthlyActual ?? Array(12).fill(0);
  }, [data, hasRoleFilter, hasScopeFilter, roleFilters, scopeFilters]);

  const burnData = useMemo(() => {
    const actual = filteredMonthlyActual;
    const planMonthly = planTotalFiltered / 12;
    let planCum = 0;
    let actualCum = 0;
    return MONTHS.map((label, idx) => {
      planCum += planMonthly;
      actualCum += actual[idx] ?? 0;
      return {
        month: label,
        plan: planCum,
        actual: actualCum,
      };
    });
  }, [filteredMonthlyActual, planTotalFiltered]);

  const asOfLabel = useMemo(() => {
    if (!data?.asOfDate) return "--";
    return formatAsOfDate(data.asOfDate);
  }, [data?.asOfDate]);

  const asOfMonth = useMemo(() => {
    if (!data?.asOfDate) return null;
    const d = new Date(`${data.asOfDate}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return MONTHS[d.getUTCMonth()];
  }, [data?.asOfDate]);

  const roleOptions = useMemo<Option[]>(
    () =>
      (data?.breakdowns.roles ?? []).map((role) => ({
        label: role.roleName,
        value: role.roleId,
      })),
    [data],
  );

  const scopeOptions = useMemo<Option[]>(
    () => (data?.table.scopes ?? []).map((scope) => ({ label: scope, value: scope })),
    [data],
  );

  const roleChartData = useMemo(() => {
    if (!data) return [];
    const roleScopes = data.roleScopes || {};
    return data.breakdowns.roles
      .filter((role) => !hasRoleFilter || roleFilterSet.has(role.roleId))
      .map((role) => {
        const scopeMap = roleScopes[role.roleId] ?? {};
        const actual = hasScopeFilter
          ? sumRecord(scopeMap, scopeFilterSet)
          : sumRecord(scopeMap) || role.actual;
        return {
          roleName: role.roleName,
          plan: role.plan,
          actual,
        };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [data, hasRoleFilter, roleFilterSet, hasScopeFilter, scopeFilterSet]);

  const scopeChartData = useMemo(() => {
    if (!data) return [];
    const roleScopes = data.roleScopes || {};
    const scopeTotals: Record<string, number> = {};
    if (hasRoleFilter) {
      roleFilters.forEach((roleId) => {
        const scopeMap = roleScopes[roleId] ?? {};
        Object.entries(scopeMap).forEach(([scope, value]) => {
          scopeTotals[scope] = (scopeTotals[scope] ?? 0) + value;
        });
      });
    } else {
      data.breakdowns.scopes.forEach((entry) => {
        scopeTotals[entry.scope] = entry.actual;
      });
    }
    const result = Object.entries(scopeTotals).map(([scope, actual]) => ({ scope, actual }));
    const filtered = hasScopeFilter
      ? result.filter((entry) => scopeFilterSet.has(entry.scope))
      : result;
    return filtered.sort((a, b) => b.actual - a.actual);
  }, [data, hasRoleFilter, roleFilters, hasScopeFilter, scopeFilterSet]);

  const processedRows = useMemo(() => {
    if (!data) return [];
    const rows = data.table.rows;
    return rows
      .map((row) => {
        const roleShare = (() => {
          if (!hasRoleFilter) return 1;
          if (row.isUnassigned) return roleFilterSet.has("unassigned") ? 1 : 0;
          return row.roleShares.reduce((acc, share) => {
            if (roleFilterSet.has(share.roleId)) return acc + share.share;
            return acc;
          }, 0);
        })();
        const scopeSpend = row.scopeSpend ?? {};
        const scopeActual = hasScopeFilter
          ? sumRecord(scopeSpend, scopeFilterSet)
          : sumRecord(scopeSpend);
        const actual = scopeActual * roleShare;
        const plan = hasRoleFilter ? row.plan * roleShare : row.plan;
        const remaining = plan - actual;
        const utilization = plan > 0 ? actual / plan : 0;
        const delta = actual - plan;
        const risk = riskLabel(row, plan, actual, utilization);
        return {
          ...row,
          actual,
          plan,
          remaining,
          utilization,
          delta,
          risk,
        };
      })
      .filter((row) => {
        if (hasRoleFilter && row.isUnassigned && !roleFilterSet.has("unassigned")) {
          return false;
        }
        if (hasRoleFilter && row.roleIds.length > 0) {
          const matchesRole = row.roleIds.some((id) => roleFilterSet.has(id));
          if (!matchesRole && row.plan > 0) return false;
        }
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const roleText = row.roles.join(" ").toLowerCase();
          if (!row.name.toLowerCase().includes(query) && !roleText.includes(query)) {
            return false;
          }
        }
        if (riskOnly && row.risk.label === "OK") return false;
        return row.actual > 0 || row.plan > 0;
      })
      .sort((a, b) => b.actual - a.actual);
  }, [
    data,
    hasRoleFilter,
    hasScopeFilter,
    roleFilterSet,
    scopeFilterSet,
    searchQuery,
    riskOnly,
  ]);

  const visibleColumns = COLUMN_PRESETS[columnPreset];

  const clearFilters = () => {
    setRoleFilters([]);
    setScopeFilters([]);
    setSearchQuery("");
    setRiskOnly(false);
  };

  return (
    <div className="space-y-6" data-page="crm-budget-execution">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">Budget Execution</h1>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
              Execution tracking by role and scope for {clientSlug.toUpperCase()}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[color:var(--color-text)]/70">
              Phase 3
            </span>
            <select
              className="input h-10"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Budget year"
            >
              {yearOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <button className="btn-ghost h-10 px-4" type="button" disabled aria-disabled="true">
              Export
            </button>
          </div>
        </div>

        {error ? (
          <div className="relative z-10 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpiItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="kpi-frame flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-[color:var(--color-primary)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                    {item.label}
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">
                    {item.value}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--color-text)]/60">{item.helper}</div>
                </div>
              </div>
            );
          })}
        </div>
      </header>

      <section className="card px-6 py-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1.2fr_1fr]">
          <MultiSelect
            label="Role"
            options={roleOptions}
            values={roleFilters}
            onChange={setRoleFilters}
            placeholder="All roles"
          />
          <MultiSelect
            label="Scope"
            options={scopeOptions}
            values={scopeFilters}
            onChange={setScopeFilters}
            placeholder="All scopes"
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Search</label>
            <input
              type="search"
              className="input h-10 w-full"
              placeholder="Resource or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost h-9 px-3" type="button" onClick={clearFilters}>
              Clear filters
            </button>
            <button
              className={`btn-ghost h-9 px-3 ${riskOnly ? "border-[color:var(--color-primary)] text-[color:var(--color-primary)]" : ""}`}
              type="button"
              aria-pressed={riskOnly}
              onClick={() => setRiskOnly((prev) => !prev)}
            >
              Risks only
            </button>
          </div>
          <span className="text-xs text-[color:var(--color-text)]/60">
            Filters impact burn-up, breakdowns, and details. KPIs stay global.
          </span>
        </div>
      </section>

      <section className="card px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Budget Execution Burn-up</h2>
          <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
            Plan vs actuals
          </span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="min-h-[260px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={burnData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                  />
                  <YAxis
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                    tickFormatter={(value) => formatCurrency(Number(value))}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltip.contentStyle}
                    itemStyle={chartTheme.tooltip.itemStyle}
                    labelStyle={chartTheme.tooltip.labelStyle}
                    formatter={(value) => formatCurrency(Number(value), true)}
                  />
                  <Legend />
                  {asOfMonth ? (
                    <ReferenceLine
                      x={asOfMonth}
                      stroke="var(--chart-2)"
                      strokeDasharray="4 4"
                      label={{ value: "As of", position: "insideTopRight", fill: "var(--chart-2)" }}
                    />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="plan"
                    name="Plan cumulative"
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual cumulative"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">As of</p>
              <p className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">{asOfLabel}</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">Scope logic</p>
              <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
                All scopes contribute to KPIs and burn-up. Campaign spend is grouped as Production while DQ uses workstream labels.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[color:var(--color-text)]">By role</h3>
            <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">Breakdown</span>
          </div>
          <div className="mt-4 min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : roleChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                No role data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart
                  data={roleChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
                >
                  <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                    tickFormatter={(value) => formatCurrency(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="roleName"
                    width={120}
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltip.contentStyle}
                    itemStyle={chartTheme.tooltip.itemStyle}
                    labelStyle={chartTheme.tooltip.labelStyle}
                    formatter={(value) => formatCurrency(Number(value), true)}
                  />
                  <Legend />
                  <Bar dataKey="plan" name="Plan" fill="var(--chart-4)" radius={[6, 6, 6, 6]} />
                  <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={[6, 6, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
        <article className="card px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[color:var(--color-text)]">By scope</h3>
            <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">Breakdown</span>
          </div>
          <div className="mt-4 min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : scopeChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                No scope data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <PieChart>
                  <Tooltip
                    contentStyle={chartTheme.tooltip.contentStyle}
                    itemStyle={chartTheme.tooltip.itemStyle}
                    labelStyle={chartTheme.tooltip.labelStyle}
                    formatter={(value) => formatCurrency(Number(value), true)}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                  <Pie
                    data={scopeChartData}
                    dataKey="actual"
                    nameKey="scope"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    stroke="transparent"
                  >
                    {scopeChartData.map((entry, index) => (
                      <Cell
                        key={`${entry.scope}-${index}`}
                        fill={chartTheme.palette[index % chartTheme.palette.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Execution details</h3>
            <p className="text-xs text-[color:var(--color-text)]/60">
              {processedRows.length} resources shown
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(COLUMN_PRESETS) as ColumnPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                className={`btn-ghost h-8 px-3 text-xs ${preset === columnPreset ? "border-[color:var(--color-primary)] text-[color:var(--color-primary)]" : ""}`}
                aria-pressed={preset === columnPreset}
                onClick={() => setColumnPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-[color:var(--color-border)] px-6 py-4">
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-[color:var(--color-surface-2)]/50 text-[color:var(--color-text)]/80">
                <tr>
                  {visibleColumns.map((key) => (
                    <th key={key} className={`px-3 py-2 text-left font-semibold ${key !== "name" && key !== "roles" ? "text-right" : ""}`}>
                      {COLUMN_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-[color:var(--color-text)]/60" colSpan={visibleColumns.length}>
                      Loading execution details...
                    </td>
                  </tr>
                ) : processedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-[color:var(--color-text)]/60" colSpan={visibleColumns.length}>
                      No rows match the current filters.
                    </td>
                  </tr>
                ) : (
                  processedRows.map((row) => (
                    <tr key={row.key}>
                      {visibleColumns.map((key) => {
                        if (key === "name") {
                          return <td key={key} className="px-3 py-2 font-semibold">{row.name}</td>;
                        }
                        if (key === "roles") {
                          return (
                            <td key={key} className="px-3 py-2 text-[color:var(--color-text)]/70">
                              {row.roles.length ? row.roles.join(", ") : "?"}
                            </td>
                          );
                        }
                        if (key === "plan") {
                          return <td key={key} className="px-3 py-2 text-right">{formatCurrency(row.plan)}</td>;
                        }
                        if (key === "actual") {
                          return <td key={key} className="px-3 py-2 text-right">{formatCurrency(row.actual)}</td>;
                        }
                        if (key === "remaining") {
                          return (
                            <td key={key} className={`px-3 py-2 text-right ${row.remaining < 0 ? "text-red-600" : ""}`}>
                              {formatCurrency(row.remaining)}
                            </td>
                          );
                        }
                        if (key === "utilization") {
                          return (
                            <td key={key} className="px-3 py-2 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span>{formatPercent(row.utilization)}</span>
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]/80">
                                  <div
                                    className="h-full bg-[color:var(--color-primary)]"
                                    style={{ width: `${Math.min(row.utilization, 1) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          );
                        }
                        if (key === "delta") {
                          const sign = row.delta > 0 ? "+" : "";
                          return (
                            <td key={key} className={`px-3 py-2 text-right ${row.delta > 0 ? "text-red-600" : row.delta < 0 ? "text-emerald-600" : ""}`}>
                              {sign}{formatCurrency(row.delta)}
                            </td>
                          );
                        }
                        if (key === "risk") {
                          return (
                            <td key={key} className="px-3 py-2 text-right">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${riskToneClass[row.risk.tone]}`}>
                                {row.risk.label}
                              </span>
                            </td>
                          );
                        }
                        return null;
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
