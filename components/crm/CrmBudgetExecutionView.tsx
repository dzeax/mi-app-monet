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
import { canonicalGeo, geoEmoji, geoFlagClass, EMOJI_UNKNOWN } from "@/lib/geoFlags";

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

type ProductionMetric = {
  budget: number;
  hours: number;
  days: number;
  units: number;
};

type ProductionBreakdown = Record<string, ProductionMetric>;

type ProductionPersonBreakdown = {
  totals: ProductionMetric;
  byBrand: ProductionBreakdown;
  byMarket: ProductionBreakdown;
  bySegment: ProductionBreakdown;
  byScope: ProductionBreakdown;
};

type TableRow = {
  key: string;
  personId: string | null;
  name: string;
  entity: string;
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
  entityPlan: Record<string, number>;
  entityActual: Record<string, number>;
  monthlyEntity: Record<string, number[]>;
  monthlyEntityScope: Record<string, Record<string, number[]>>;
  monthlyEntityRole: Record<string, Record<string, number[]>>;
  monthlyEntityRoleScope: Record<string, Record<string, Record<string, number[]>>>;
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
  production?: {
    totals: ProductionMetric;
    byPerson: Record<string, ProductionPersonBreakdown>;
  };
  table: {
    rows: TableRow[];
    roles: RoleOption[];
    scopes: string[];
    entities: string[];
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
  | "entity"
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
  Minimal: ["name", "entity", "actual", "utilization", "risk"],
  Finance: ["name", "entity", "roles", "plan", "actual", "remaining", "delta", "risk"],
  Full: ["name", "entity", "roles", "plan", "actual", "remaining", "utilization", "delta", "risk"],
};
const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Resource",
  entity: "Entity",
  roles: "Roles",
  plan: "Plan",
  actual: "Actual",
  remaining: "Remaining",
  utilization: "Utilization",
  delta: "Delta",
  risk: "Risk",
};
const PRODUCTION_SCOPE = "Production";
const EMPTY_SET = new Set<string>();

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

const sumSeries = (series?: number[]) => {
  if (!Array.isArray(series)) return 0;
  return series.reduce((acc, value) => acc + (value || 0), 0);
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

const riskToneClass: Record<"ok" | "warn" | "danger", string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, idx) => value === right[idx]);

function riskLabel(row: TableRow, plan: number, actual: number, utilization: number) {
  if (row.isUnmapped) return { label: "Unmapped", tone: "danger" as const };
  if (plan <= 0 && actual > 0) return { label: "Unplanned", tone: "danger" as const };
  if (utilization >= 1) return { label: ">100%", tone: "danger" as const };
  if (utilization >= 0.9) return { label: "90-99%", tone: "warn" as const };
  return { label: "OK", tone: "ok" as const };
}

type MarketYAxisTickProps = {
  x: number;
  y: number;
  payload: { value: string };
};

type BrandYAxisTickProps = MarketYAxisTickProps;
type BrandSliceLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  name?: string;
};

const BRAND_LOGOS: Record<string, { src: string; alt: string }> = {
  europcar: { src: "/logos/ec_logo.png", alt: "Europcar" },
  goldcar: { src: "/logos/gc_logo.png", alt: "Goldcar" },
};
const BRAND_SLICE_SIZE = 26;

function MarketYAxisTick({ x, y, payload }: MarketYAxisTickProps) {
  const label = String(payload?.value ?? "");
  const trimmed = label.trim();
  const showFlag = /^[A-Za-z]{2,3}$/.test(trimmed) && trimmed.toLowerCase() !== "other";
  const canonical = showFlag ? canonicalGeo(trimmed) : "";
  const flagClass = showFlag ? geoFlagClass(canonical) : undefined;
  const emoji = showFlag ? geoEmoji(canonical) : null;
  const hasEmoji = !!emoji && emoji !== EMOJI_UNKNOWN && !flagClass;

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-160} y={-12} width={150} height={24}>
        <div className="flex items-center justify-end gap-2 text-xs text-[color:var(--chart-axis)]">
          {flagClass ? (
            <span className={`flag-swatch fi ${flagClass}`} aria-hidden="true" />
          ) : hasEmoji ? (
            <span className="flag-emoji" aria-hidden="true">
              {emoji}
            </span>
          ) : null}
          <span className="truncate">{label}</span>
        </div>
      </foreignObject>
    </g>
  );
}

function BrandYAxisTick({ x, y, payload }: BrandYAxisTickProps) {
  const label = String(payload?.value ?? "");
  const key = label.trim().toLowerCase();
  const logo = BRAND_LOGOS[key];

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-220} y={-16} width={210} height={32}>
        <div className="flex items-center justify-end gap-2 text-xs text-[color:var(--chart-axis)]">
          {logo ? (
            <img
              src={logo.src}
              alt={logo.alt}
              className="h-6 w-16 shrink-0 object-contain"
            />
          ) : null}
          <span className="truncate">{label}</span>
        </div>
      </foreignObject>
    </g>
  );
}

function renderBrandSliceLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  name,
}: BrandSliceLabelProps) {
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    typeof innerRadius !== "number" ||
    typeof outerRadius !== "number"
  ) {
    return null;
  }
  const label = String(name ?? "");
  const key = label.trim().toLowerCase();
  const logo = BRAND_LOGOS[key];
  if (!logo) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const angle = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(angle) - BRAND_SLICE_SIZE / 2;
  const y = cy + radius * Math.sin(angle) - BRAND_SLICE_SIZE / 2;
  return (
    <image
      href={logo.src}
      x={x}
      y={y}
      width={BRAND_SLICE_SIZE}
      height={BRAND_SLICE_SIZE}
      aria-label={logo.alt}
    />
  );
}

function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = "All",
  counts,
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  counts?: Record<string, number>;
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
    options.length > 0 &&
    (values.length === options.length ||
      (values.length === 0 && options.length === 0));
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
    if (!open || options.length === 0) return;
    if (activeIdx !== 0) setActiveIdx(0);
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
          {options.length > 0 ? (
            <>
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
                {options.map((opt, idx) => {
                  const count = counts?.[opt.value];
                  return (
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
                      {typeof count === "number" ? (
                        <span className="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[color:var(--color-text)]/60">
                          {count}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="px-3 py-2 text-xs text-[color:var(--color-text)]/60">
              No options available.
            </div>
          )}
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
  const [workstreamFilters, setWorkstreamFilters] = useState<string[]>([]);
  const [entityFilters, setEntityFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskOnly, setRiskOnly] = useState(false);
  const [columnPreset, setColumnPreset] = useState<ColumnPreset>("Finance");
  const [productionMetric, setProductionMetric] = useState<"budget" | "days" | "units">("budget");
  const [productionDimension, setProductionDimension] = useState<
    "brand" | "market" | "segment" | "scope"
  >("brand");

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

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-ES", {
        maximumFractionDigits: 0,
      }),
    [],
  );

  const formatUnits = (value: number) =>
    Number.isFinite(value) ? numberFormatter.format(value) : "--";

  const formatDays = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "--";

  const roleFilterSet = useMemo(() => new Set(roleFilters), [roleFilters]);
  const workstreamFilterSet = useMemo(
    () => new Set(workstreamFilters),
    [workstreamFilters],
  );
  const entityFilterSet = useMemo(() => new Set(entityFilters), [entityFilters]);
  const hasRoleFilter = roleFilters.length > 0;
  const hasWorkstreamFilter = workstreamFilters.length > 0;
  const hasEntityFilter = entityFilters.length > 0;

  const roleShareForRow = useCallback((row: TableRow, roleSet: Set<string>) => {
    if (roleSet.size === 0) return 1;
    if (row.isUnassigned) return roleSet.has("unassigned") ? 1 : 0;
    return row.roleShares.reduce((acc, share) => {
      if (roleSet.has(share.roleId)) return acc + share.share;
      return acc;
    }, 0);
  }, []);

  const buildRow = useCallback(
    (
      row: TableRow,
      roleSet: Set<string>,
      workstreamSet: Set<string>,
      entitySet: Set<string>,
      applyRiskFilter: boolean,
    ) => {
      if (entitySet.size > 0 && !entitySet.has(row.entity)) return null;
      const roleShare = roleShareForRow(row, roleSet);
      const scopeSpend = row.scopeSpend ?? {};
      const scopeActual =
        workstreamSet.size > 0 ? sumRecord(scopeSpend, workstreamSet) : sumRecord(scopeSpend);
      const actual = scopeActual * roleShare;
      const plan = roleSet.size > 0 ? row.plan * roleShare : row.plan;
      if (actual <= 0 && plan <= 0) return null;
      const remaining = plan - actual;
      const utilization = plan > 0 ? actual / plan : 0;
      const delta = actual - plan;
      const risk = riskLabel(row, plan, actual, utilization);
      if (applyRiskFilter && riskOnly && risk.label === "OK") return null;
      return {
        ...row,
        actual,
        plan,
        remaining,
        utilization,
        delta,
        risk,
      };
    },
    [riskOnly, roleShareForRow],
  );

  const { roleCounts, workstreamCounts, entityCounts } = useMemo(() => {
    const roleCounts: Record<string, number> = {};
    const workstreamCounts: Record<string, number> = {};
    const entityCounts: Record<string, number> = {};
    if (!data) return { roleCounts, workstreamCounts, entityCounts };

    data.table.rows.forEach((row) => {
      const entityRow = buildRow(row, roleFilterSet, EMPTY_SET, EMPTY_SET, true);
      if (entityRow) {
        entityCounts[row.entity] = (entityCounts[row.entity] ?? 0) + 1;
      }
    });

    data.table.rows.forEach((row) => {
      const roleRow = buildRow(row, EMPTY_SET, EMPTY_SET, entityFilterSet, true);
      if (!roleRow) return;
      if (row.isUnassigned) {
        roleCounts.unassigned = (roleCounts.unassigned ?? 0) + 1;
        return;
      }
      row.roleIds.forEach((roleId) => {
        roleCounts[roleId] = (roleCounts[roleId] ?? 0) + 1;
      });
    });

    data.table.rows.forEach((row) => {
      const workstreamRow = buildRow(row, roleFilterSet, EMPTY_SET, entityFilterSet, true);
      if (!workstreamRow) return;
      const roleShare = roleShareForRow(row, roleFilterSet);
      if (roleFilterSet.size > 0 && roleShare <= 0) return;
      Object.entries(row.scopeSpend ?? {}).forEach(([scope, amount]) => {
        const scopedActual = Number(amount || 0) * roleShare;
        if (scope === PRODUCTION_SCOPE) return;
        if (scopedActual > 0) {
          workstreamCounts[scope] = (workstreamCounts[scope] ?? 0) + 1;
        }
      });
    });

    return { roleCounts, workstreamCounts, entityCounts };
  }, [data, roleFilterSet, entityFilterSet, buildRow, roleShareForRow]);

  const baseRows = useMemo(() => {
    if (!data) return [];
    return data.table.rows
      .map((row) => buildRow(row, roleFilterSet, EMPTY_SET, entityFilterSet, false))
      .filter((row): row is TableRow & { actual: number; plan: number; remaining: number; utilization: number; delta: number; risk: { label: string; tone: "ok" | "warn" | "danger" } } => Boolean(row));
  }, [data, buildRow, roleFilterSet, entityFilterSet]);

  const planTotalFiltered = useMemo(
    () => baseRows.reduce((acc, row) => acc + row.plan, 0),
    [baseRows],
  );
  const actualTotalFiltered = useMemo(
    () => baseRows.reduce((acc, row) => acc + row.actual, 0),
    [baseRows],
  );
  const remainingFiltered = planTotalFiltered - actualTotalFiltered;
  const utilizationFiltered =
    planTotalFiltered > 0 ? actualTotalFiltered / planTotalFiltered : 0;

  const kpiItems = useMemo<KpiItem[]>(() => {
    const placeholder = loading ? "..." : "--";
    if (!data) {
      return [
        { label: "Annual plan", value: placeholder, helper: "Sum of budget pools", icon: Wallet },
        { label: "Spent YTD", value: placeholder, helper: "Production + Workstreams", icon: CreditCard },
        { label: "Remaining", value: placeholder, helper: "Plan minus actuals", icon: PiggyBank },
        { label: "Utilization", value: placeholder, helper: "Spent / plan", icon: Activity },
      ];
    }
    return [
      {
        label: "Annual plan",
        value: formatCurrency(planTotalFiltered),
        helper: "Sum of budget pools",
        icon: Wallet,
      },
      {
        label: "Spent YTD",
        value: formatCurrency(actualTotalFiltered),
        helper: "Production + Workstreams",
        icon: CreditCard,
      },
      {
        label: "Remaining",
        value: formatCurrency(remainingFiltered),
        helper: "Plan minus actuals",
        icon: PiggyBank,
      },
      {
        label: "Utilization",
        value: formatPercent(utilizationFiltered),
        helper: "Spent / plan",
        icon: Activity,
      },
    ];
  }, [
    data,
    loading,
    currency,
    planTotalFiltered,
    actualTotalFiltered,
    remainingFiltered,
    utilizationFiltered,
  ]);

  const filteredMonthlyActual = useMemo(() => {
    if (!data) return Array(12).fill(0);
    if (!hasRoleFilter && !hasEntityFilter) {
      return data.monthlyActual ?? Array(12).fill(0);
    }
    const monthlyRole = data.monthlyRole ?? {};
    const monthlyEntity = data.monthlyEntity ?? {};
    const monthlyEntityRole = data.monthlyEntityRole ?? {};
    if (hasEntityFilter) {
      if (hasRoleFilter) {
        const seriesList: number[][] = [];
        entityFilters.forEach((entity) => {
          const roleMap = monthlyEntityRole[entity] ?? {};
          roleFilters.forEach((roleId) => {
            const series = roleMap[roleId];
            if (series) seriesList.push(series);
          });
        });
        return sumSeriesList(seriesList);
      }
      const seriesList = entityFilters
        .map((entity) => monthlyEntity[entity])
        .filter((series): series is number[] => Array.isArray(series));
      return sumSeriesList(seriesList);
    }
    if (hasRoleFilter) {
      const seriesList = roleFilters
        .map((roleId) => monthlyRole[roleId])
        .filter((series): series is number[] => Array.isArray(series));
      return sumSeriesList(seriesList);
    }
    return data.monthlyActual ?? Array(12).fill(0);
  }, [
    data,
    hasRoleFilter,
    hasEntityFilter,
    roleFilters,
    entityFilters,
  ]);

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

  const roleOptionsRaw = useMemo<Option[]>(
    () =>
      (data?.breakdowns.roles ?? []).map((role) => ({
        label: role.roleName,
        value: role.roleId,
      })),
    [data],
  );

  const workstreamOptionsRaw = useMemo<Option[]>(
    () =>
      (data?.table.scopes ?? [])
        .filter((scope) => scope !== PRODUCTION_SCOPE)
        .map((scope) => ({ label: scope, value: scope })),
    [data],
  );

  const entityOptionsRaw = useMemo<Option[]>(
    () => (data?.table.entities ?? []).map((entity) => ({ label: entity, value: entity })),
    [data],
  );

  const filterOptionsByCount = useCallback(
    (options: Option[], counts: Record<string, number>) => {
      if (!data) return options;
      return options.filter((opt) => (counts[opt.value] ?? 0) > 0);
    },
    [data],
  );

  const roleOptions = useMemo(
    () => filterOptionsByCount(roleOptionsRaw, roleCounts),
    [filterOptionsByCount, roleOptionsRaw, roleCounts],
  );
  const workstreamOptions = useMemo(
    () => filterOptionsByCount(workstreamOptionsRaw, workstreamCounts),
    [filterOptionsByCount, workstreamOptionsRaw, workstreamCounts],
  );
  const entityOptions = useMemo(
    () => filterOptionsByCount(entityOptionsRaw, entityCounts),
    [filterOptionsByCount, entityOptionsRaw, entityCounts],
  );

  useEffect(() => {
    if (!data) return;
    const roleSet = new Set(roleOptions.map((opt) => opt.value));
    const workstreamSet = new Set(workstreamOptions.map((opt) => opt.value));
    const entitySet = new Set(entityOptions.map((opt) => opt.value));
    setRoleFilters((prev) => {
      const next = prev.filter((value) => roleSet.has(value));
      return arraysEqual(prev, next) ? prev : next;
    });
    setWorkstreamFilters((prev) => {
      const next = prev.filter((value) => workstreamSet.has(value));
      return arraysEqual(prev, next) ? prev : next;
    });
    setEntityFilters((prev) => {
      const next = prev.filter((value) => entitySet.has(value));
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [data, roleOptions, workstreamOptions, entityOptions]);

  const roleChartData = useMemo(() => {
    if (!data) return [];
    const roleScopes = data.roleScopes || {};
    const rolePlanById = new Map<string, number>();
    if (hasEntityFilter) {
      data.table.rows.forEach((row) => {
        if (!entityFilterSet.has(row.entity)) return;
        if (row.roleShares.length > 0) {
          row.roleShares.forEach((share) => {
            rolePlanById.set(
              share.roleId,
              (rolePlanById.get(share.roleId) ?? 0) + row.plan * share.share,
            );
          });
        } else if (row.isUnassigned) {
          rolePlanById.set("unassigned", (rolePlanById.get("unassigned") ?? 0) + row.plan);
        }
      });
    }

    const entityRole = data.monthlyEntityRole ?? {};

    const roleActualForEntity = (roleId: string) => {
      if (!hasEntityFilter) return 0;
      let total = 0;
      entityFilters.forEach((entity) => {
        total += sumSeries(entityRole[entity]?.[roleId]);
      });
      return total;
    };

    return data.breakdowns.roles
      .filter((role) => !hasRoleFilter || roleFilterSet.has(role.roleId))
      .map((role) => {
        const scopeMap = roleScopes[role.roleId] ?? {};
        const actual = hasEntityFilter
          ? roleActualForEntity(role.roleId)
          : sumRecord(scopeMap) || role.actual;
        const plan = hasEntityFilter
          ? rolePlanById.get(role.roleId) ?? 0
          : role.plan;
        return {
          roleName: role.roleName,
          plan,
          actual,
        };
      })
      .filter((entry) => entry.plan > 0 || entry.actual > 0)
      .sort((a, b) => b.actual - a.actual);
  }, [
    data,
    hasRoleFilter,
    roleFilterSet,
    hasEntityFilter,
    entityFilters,
    entityFilterSet,
  ]);

  const scopeTotalsData = useMemo(() => {
    if (!data) return [];
    const roleScopes = data.roleScopes || {};
    const scopeTotals: Record<string, number> = {};
    if (hasEntityFilter) {
      if (hasRoleFilter) {
        const entityRoleScope = data.monthlyEntityRoleScope ?? {};
        entityFilters.forEach((entity) => {
          const roleMap = entityRoleScope[entity] ?? {};
          roleFilters.forEach((roleId) => {
            const scopeMap = roleMap[roleId] ?? {};
            Object.entries(scopeMap).forEach(([scope, series]) => {
              scopeTotals[scope] = (scopeTotals[scope] ?? 0) + sumSeries(series);
            });
          });
        });
      } else {
        const entityScope = data.monthlyEntityScope ?? {};
        entityFilters.forEach((entity) => {
          const scopeMap = entityScope[entity] ?? {};
          Object.entries(scopeMap).forEach(([scope, series]) => {
            scopeTotals[scope] = (scopeTotals[scope] ?? 0) + sumSeries(series);
          });
        });
      }
    } else if (hasRoleFilter) {
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
    return result.sort((a, b) => b.actual - a.actual);
  }, [
    data,
    hasRoleFilter,
    roleFilters,
    hasEntityFilter,
    entityFilters,
  ]);

  const productionActual = useMemo(
    () => scopeTotalsData.find((entry) => entry.scope === PRODUCTION_SCOPE)?.actual ?? 0,
    [scopeTotalsData],
  );

  const workstreamTotals = useMemo(
    () => scopeTotalsData.filter((entry) => entry.scope !== PRODUCTION_SCOPE),
    [scopeTotalsData],
  );

  const workstreamActual = useMemo(
    () => workstreamTotals.reduce((acc, entry) => acc + entry.actual, 0),
    [workstreamTotals],
  );

  const workstreamChartData = useMemo(() => {
    const base = workstreamTotals;
    const filtered = hasWorkstreamFilter
      ? base.filter((entry) => workstreamFilterSet.has(entry.scope))
      : base;
    return filtered.sort((a, b) => b.actual - a.actual);
  }, [workstreamTotals, hasWorkstreamFilter, workstreamFilterSet]);

  const sourceChartData = useMemo(
    () =>
      [
        { source: "Production", actual: productionActual },
        { source: "Workstreams", actual: workstreamActual },
      ].filter((entry) => entry.actual > 0),
    [productionActual, workstreamActual],
  );

  const sumMonthlyForScopes = useCallback(
    (scopes: string[]) => {
      if (!data || scopes.length === 0) return Array(12).fill(0);
      const monthlyRoleScope = data.monthlyRoleScope ?? {};
      const monthlyScope = data.monthlyScope ?? {};
      const monthlyEntityScope = data.monthlyEntityScope ?? {};
      const monthlyEntityRoleScope = data.monthlyEntityRoleScope ?? {};

      if (hasEntityFilter) {
        const seriesList: number[][] = [];
        entityFilters.forEach((entity) => {
          if (hasRoleFilter) {
            const roleMap = monthlyEntityRoleScope[entity] ?? {};
            roleFilters.forEach((roleId) => {
              const scopeMap = roleMap[roleId] ?? {};
              scopes.forEach((scope) => {
                const series = scopeMap[scope];
                if (series) seriesList.push(series);
              });
            });
          } else {
            const scopeMap = monthlyEntityScope[entity] ?? {};
            scopes.forEach((scope) => {
              const series = scopeMap[scope];
              if (series) seriesList.push(series);
            });
          }
        });
        return sumSeriesList(seriesList);
      }

      if (hasRoleFilter) {
        const seriesList: number[][] = [];
        roleFilters.forEach((roleId) => {
          const scopeMap = monthlyRoleScope[roleId] ?? {};
          scopes.forEach((scope) => {
            const series = scopeMap[scope];
            if (series) seriesList.push(series);
          });
        });
        return sumSeriesList(seriesList);
      }

      const seriesList = scopes
        .map((scope) => monthlyScope[scope])
        .filter((series): series is number[] => Array.isArray(series));
      return sumSeriesList(seriesList);
    },
    [data, hasEntityFilter, hasRoleFilter, entityFilters, roleFilters],
  );

  const productionMonthlyActual = useMemo(
    () => sumMonthlyForScopes([PRODUCTION_SCOPE]),
    [sumMonthlyForScopes],
  );

  const selectedWorkstreams = useMemo(
    () =>
      hasWorkstreamFilter
        ? workstreamFilters
        : workstreamTotals.map((entry) => entry.scope),
    [hasWorkstreamFilter, workstreamFilters, workstreamTotals],
  );

  const workstreamMonthlyActual = useMemo(
    () => sumMonthlyForScopes(selectedWorkstreams),
    [sumMonthlyForScopes, selectedWorkstreams],
  );

  const productionTrendData = useMemo(
    () =>
      MONTHS.map((label, idx) => ({
        month: label,
        actual: productionMonthlyActual[idx] ?? 0,
      })),
    [productionMonthlyActual],
  );

  const workstreamTrendData = useMemo(
    () =>
      MONTHS.map((label, idx) => ({
        month: label,
        actual: workstreamMonthlyActual[idx] ?? 0,
      })),
    [workstreamMonthlyActual],
  );

  const productionRoleChartData = useMemo(() => {
    if (!data) return [];
    const roleScopes = data.roleScopes || {};
    const entityRoleScope = data.monthlyEntityRoleScope ?? {};
    return data.breakdowns.roles
      .filter((role) => !hasRoleFilter || roleFilterSet.has(role.roleId))
      .map((role) => {
        let actual = 0;
        if (hasEntityFilter) {
          entityFilters.forEach((entity) => {
            const scopeMap = entityRoleScope[entity]?.[role.roleId] ?? {};
            actual += sumSeries(scopeMap[PRODUCTION_SCOPE]);
          });
        } else {
          const scopeMap = roleScopes[role.roleId] ?? {};
          actual = scopeMap[PRODUCTION_SCOPE] ?? 0;
        }
        return { roleName: role.roleName, actual };
      })
      .filter((entry) => entry.actual > 0)
      .sort((a, b) => b.actual - a.actual);
  }, [data, hasRoleFilter, roleFilterSet, hasEntityFilter, entityFilters]);

  const workstreamShare = actualTotalFiltered > 0 ? workstreamActual / actualTotalFiltered : 0;
  const workstreamFilteredTotal = useMemo(
    () => workstreamChartData.reduce((acc, entry) => acc + entry.actual, 0),
    [workstreamChartData],
  );
  const workstreamSelectedShare =
    actualTotalFiltered > 0 ? workstreamFilteredTotal / actualTotalFiltered : 0;

  const productionAggregate = useMemo(() => {
    const totals = createMetric();
    const byBrand = new Map<string, ProductionMetric>();
    const byMarket = new Map<string, ProductionMetric>();
    const bySegment = new Map<string, ProductionMetric>();
    const byScope = new Map<string, ProductionMetric>();

    if (!data?.production?.byPerson) {
      return {
        totals,
        byBrand: [] as Array<{ key: string } & ProductionMetric>,
        byMarket: [] as Array<{ key: string } & ProductionMetric>,
        bySegment: [] as Array<{ key: string } & ProductionMetric>,
        byScope: [] as Array<{ key: string } & ProductionMetric>,
      };
    }

    const byPerson = data.production.byPerson;
    data.table.rows.forEach((row) => {
      const personKey = row.key;
      const personBreakdown = byPerson[personKey];
      if (!personBreakdown) return;
      if (hasEntityFilter && !entityFilterSet.has(row.entity)) return;
      const share = roleShareForRow(row, roleFilterSet);
      if (share <= 0) return;

      addMetric(totals, personBreakdown.totals, share);

      Object.entries(personBreakdown.byBrand).forEach(([key, metric]) => {
        const entry = byBrand.get(key) ?? createMetric();
        addMetric(entry, metric, share);
        byBrand.set(key, entry);
      });
      Object.entries(personBreakdown.byMarket).forEach(([key, metric]) => {
        const entry = byMarket.get(key) ?? createMetric();
        addMetric(entry, metric, share);
        byMarket.set(key, entry);
      });
      Object.entries(personBreakdown.bySegment).forEach(([key, metric]) => {
        const entry = bySegment.get(key) ?? createMetric();
        addMetric(entry, metric, share);
        bySegment.set(key, entry);
      });
      Object.entries(personBreakdown.byScope).forEach(([key, metric]) => {
        const entry = byScope.get(key) ?? createMetric();
        addMetric(entry, metric, share);
        byScope.set(key, entry);
      });
    });

    const toArray = (map: Map<string, ProductionMetric>) =>
      Array.from(map.entries())
        .map(([key, metric]) => ({ key, ...metric }))
        .filter((entry) => entry.budget > 0 || entry.days > 0 || entry.units > 0)
        .sort((a, b) => b.budget - a.budget);

    return {
      totals,
      byBrand: toArray(byBrand),
      byMarket: toArray(byMarket),
      bySegment: toArray(bySegment),
      byScope: toArray(byScope),
    };
  }, [data, hasEntityFilter, entityFilterSet, roleShareForRow, roleFilterSet]);

  const productionAggregateShare =
    actualTotalFiltered > 0 ? productionAggregate.totals.budget / actualTotalFiltered : 0;

  const productionMetricOptions = [
    { key: "budget", label: `Budget (${currency})` },
    { key: "days", label: "Days" },
    { key: "units", label: "Email units" },
  ] as const;

  const productionDimensionOptions = [
    { key: "brand", label: "Brand" },
    { key: "market", label: "Market" },
    { key: "segment", label: "Segment" },
    { key: "scope", label: "Campaign scope" },
  ] as const;

  const productionMetricKey =
    productionMetric === "budget" ? "budget" : productionMetric === "days" ? "days" : "units";

  const productionMetricLabel =
    productionMetric === "budget"
      ? `Budget (${currency})`
      : productionMetric === "days"
        ? "Days"
        : "Email units";

  const formatProductionMetric = (value: number) => {
    if (productionMetric === "budget") return formatCurrency(value);
    if (productionMetric === "days") return `${formatDays(value)} d`;
    return formatUnits(value);
  };

  const productionDimensionData = useMemo(() => {
    const source =
      productionDimension === "brand"
        ? productionAggregate.byBrand
        : productionDimension === "market"
          ? productionAggregate.byMarket
          : productionDimension === "segment"
            ? productionAggregate.bySegment
            : productionAggregate.byScope;

    const sorted = [...source].sort(
      (a, b) => (b[productionMetricKey] ?? 0) - (a[productionMetricKey] ?? 0),
    );
    const limit = 8;
    if (sorted.length <= limit) return sorted;
    const top = sorted.slice(0, limit);
    const remainder = sorted.slice(limit);
    const other = createMetric();
    remainder.forEach((entry) => {
      addMetric(other, entry);
    });
    if (other.budget > 0 || other.days > 0 || other.units > 0) {
      top.push({ key: "Other", ...other });
    }
    return top;
  }, [productionAggregate, productionDimension, productionMetricKey]);

  const productionMetricTotal = productionAggregate.totals[productionMetricKey] ?? 0;

  const productionChartData = useMemo(
    () =>
      productionDimensionData.map((entry) => ({
        name: entry.key,
        value: entry[productionMetricKey] ?? 0,
        budget: entry.budget,
        days: entry.days,
        units: entry.units,
        hours: entry.hours,
        share: productionMetricTotal > 0 ? (entry[productionMetricKey] ?? 0) / productionMetricTotal : 0,
      })),
    [productionDimensionData, productionMetricKey, productionMetricTotal],
  );

  const productionTopEntry = productionChartData[0];
  const productionTopLabel =
    productionDimensionOptions.find((option) => option.key === productionDimension)?.label ??
    "Group";

  const buildDonutData = useCallback(
    (items: Array<{ key: string } & ProductionMetric>, limit = 6) => {
      const sorted = [...items].sort((a, b) => b.budget - a.budget);
      if (sorted.length <= limit) {
        return sorted.map((entry) => ({
          name: entry.key,
          budget: entry.budget,
          share: productionAggregate.totals.budget > 0 ? entry.budget / productionAggregate.totals.budget : 0,
        }));
      }
      const top = sorted.slice(0, limit);
      const remainder = sorted.slice(limit);
      const other = remainder.reduce((acc, entry) => acc + entry.budget, 0);
      const result = top.map((entry) => ({
        name: entry.key,
        budget: entry.budget,
        share: productionAggregate.totals.budget > 0 ? entry.budget / productionAggregate.totals.budget : 0,
      }));
      if (other > 0) {
        result.push({
          name: "Other",
          budget: other,
          share: productionAggregate.totals.budget > 0 ? other / productionAggregate.totals.budget : 0,
        });
      }
      return result;
    },
    [productionAggregate.totals.budget],
  );

  const productionMarketDonut = useMemo(
    () => buildDonutData(productionAggregate.byMarket),
    [buildDonutData, productionAggregate.byMarket],
  );

  const productionBrandDonut = useMemo(
    () => buildDonutData(productionAggregate.byBrand),
    [buildDonutData, productionAggregate.byBrand],
  );

  const productionSegmentDonut = useMemo(
    () => buildDonutData(productionAggregate.bySegment),
    [buildDonutData, productionAggregate.bySegment],
  );

  const productionScopeDonut = useMemo(
    () => buildDonutData(productionAggregate.byScope),
    [buildDonutData, productionAggregate.byScope],
  );

  const processedRows = useMemo(() => {
    return baseRows
      .filter((row) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const roleText = row.roles.join(" ").toLowerCase();
          const entityText = row.entity.toLowerCase();
          if (
            !row.name.toLowerCase().includes(query) &&
            !roleText.includes(query) &&
            !entityText.includes(query)
          ) {
            return false;
          }
        }
        if (riskOnly && row.risk.label === "OK") return false;
        return true;
      })
      .sort((a, b) => b.actual - a.actual);
  }, [baseRows, searchQuery, riskOnly]);

  const visibleColumns = COLUMN_PRESETS[columnPreset];

  const clearFilters = () => {
    setRoleFilters([]);
    setWorkstreamFilters([]);
    setEntityFilters([]);
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
              Execution tracking by role and entity across Production and Workstreams for{" "}
              {clientSlug.toUpperCase()}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1.1fr_1fr]">
          <MultiSelect
            label="Role"
            options={roleOptions}
            values={roleFilters}
            onChange={setRoleFilters}
            placeholder="All roles"
            counts={roleCounts}
          />
          <MultiSelect
            label="Entity"
            options={entityOptions}
            values={entityFilters}
            onChange={setEntityFilters}
            placeholder="All entities"
            counts={entityCounts}
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
            Global filters update KPIs, burn-up, production, workstreams, and details.
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
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">Source logic</p>
              <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
                KPIs and burn-up blend Production (campaign reporting) and Workstreams (DQ tickets + manual efforts).
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
            <h3 className="text-base font-semibold text-[color:var(--color-text)]">Source mix</h3>
            <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">Breakdown</span>
          </div>
          <div className="mt-4 min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : sourceChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                No source data available.
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
                    data={sourceChartData}
                    dataKey="actual"
                    nameKey="source"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    stroke="transparent"
                  >
                    {sourceChartData.map((entry, index) => (
                      <Cell
                        key={`${entry.source}-${index}`}
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

      <section className="card px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              Production
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
              Campaign production
            </h3>
            <p className="mt-1 text-xs text-[color:var(--color-text)]/60">
              Production spend for ICP newsletters, local activations, and lifecycle builds/revamps.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Spent
              </p>
              <p className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
                {formatCurrency(productionAggregate.totals.budget)}
              </p>
              <p className="text-xs text-[color:var(--color-text)]/60">
                {formatPercent(productionAggregateShare)} of total
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Active roles
              </p>
              <p className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
                {productionRoleChartData.length}
              </p>
              <p className="text-xs text-[color:var(--color-text)]/60">
                Roles with production spend
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={productionTrendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Production actual"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : productionRoleChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                No production role data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart
                  data={productionRoleChartData}
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
                  <Bar
                    dataKey="actual"
                    name="Production actual"
                    fill="var(--chart-1)"
                    radius={[6, 6, 6, 6]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {productionMetricOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={productionMetric === option.key}
                  className={`btn-ghost h-8 px-3 text-xs ${
                    productionMetric === option.key
                      ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)] font-semibold shadow-sm"
                      : "text-[color:var(--color-text)]/70"
                  }`}
                  onClick={() => setProductionMetric(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {productionDimensionOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={productionDimension === option.key}
                  className={`btn-ghost h-8 px-3 text-xs ${
                    productionDimension === option.key
                      ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)] font-semibold shadow-sm"
                      : "text-[color:var(--color-text)]/70"
                  }`}
                  onClick={() => setProductionDimension(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
            <div className="min-h-[260px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                  Loading chart...
                </div>
              ) : productionChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                  No production data available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart
                    data={productionChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 16, bottom: 0 }}
                  >
                    <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={chartTheme.tick}
                      axisLine={chartTheme.axisLine}
                      tickLine={chartTheme.tickLine}
                      tickFormatter={(value) => formatProductionMetric(Number(value))}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={
                        productionDimension === "market"
                          ? 160
                          : productionDimension === "brand"
                            ? 220
                            : 140
                      }
                      tick={
                        productionDimension === "market"
                          ? <MarketYAxisTick />
                          : productionDimension === "brand"
                            ? <BrandYAxisTick />
                            : chartTheme.tick
                      }
                      axisLine={chartTheme.axisLine}
                      tickLine={chartTheme.tickLine}
                    />
                    <Tooltip
                      cursor={false}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const entry = payload[0].payload as {
                          name: string;
                          budget: number;
                          days: number;
                          units: number;
                          hours: number;
                          share: number;
                        };
                        return (
                          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-xs text-[color:var(--color-text)] shadow-lg">
                            <div className="font-semibold">{entry.name}</div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <span>{productionMetricLabel}</span>
                              <span className="font-semibold">
                                {formatProductionMetric(entry[productionMetricKey])}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <span>Budget</span>
                              <span className="font-semibold">{formatCurrency(entry.budget, true)}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <span>Days</span>
                              <span className="font-semibold">{formatDays(entry.days)} d</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <span>Email units</span>
                              <span className="font-semibold">{formatUnits(entry.units)}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <span>Share</span>
                              <span className="font-semibold">{formatPercent(entry.share)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="value"
                      name={productionMetricLabel}
                      fill="var(--chart-1)"
                      fillOpacity={0.85}
                      radius={[6, 6, 6, 6]}
                      activeBar={{
                        fill: "var(--chart-2)",
                        stroke: "var(--color-primary)",
                        strokeWidth: 2,
                        fillOpacity: 1,
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                  Top {productionTopLabel}
                </p>
                {productionTopEntry ? (
                  <>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">
                      {productionTopEntry.name}
                    </p>
                    <div className="mt-3 space-y-2 text-xs text-[color:var(--color-text)]/70">
                      <div className="flex items-center justify-between gap-3">
                        <span>Budget</span>
                        <span className="font-semibold">
                          {formatCurrency(productionTopEntry.budget, true)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Days</span>
                        <span className="font-semibold">{formatDays(productionTopEntry.days)} d</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Email units</span>
                        <span className="font-semibold">{formatUnits(productionTopEntry.units)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Share</span>
                        <span className="font-semibold">{formatPercent(productionTopEntry.share)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-[color:var(--color-text)]/65">
                    No production data available.
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4">
              {[
                { title: "Brand share", data: productionBrandDonut, kind: "brand" },
                { title: "Market share", data: productionMarketDonut, kind: "market" },
                { title: "Segment share", data: productionSegmentDonut, kind: "segment" },
                { title: "Campaign scope share", data: productionScopeDonut, kind: "scope" },
              ].map((block) => (
                <div
                  key={block.title}
                  className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                    {block.title}
                  </div>
                  <div className="mt-2 min-h-[180px]">
                    {loading ? (
                      <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                        Loading chart...
                      </div>
                    ) : block.data.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                        No data available.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Tooltip
                            contentStyle={chartTheme.tooltip.contentStyle}
                            itemStyle={chartTheme.tooltip.itemStyle}
                            labelStyle={chartTheme.tooltip.labelStyle}
                            formatter={(value) => formatCurrency(Number(value), true)}
                          />
                          <Pie
                            data={block.data}
                            dataKey="budget"
                            nameKey="name"
                            innerRadius="55%"
                            outerRadius="80%"
                            paddingAngle={3}
                            stroke="transparent"
                            label={block.kind === "brand" ? renderBrandSliceLabel : undefined}
                            labelLine={block.kind === "brand" ? false : undefined}
                          >
                            {block.data.map((entry, index) => (
                              <Cell
                                key={`${entry.name}-${index}`}
                                fill={chartTheme.palette[index % chartTheme.palette.length]}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              Workstreams
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
              Data Quality + Manual Efforts
            </h3>
            <p className="mt-1 text-xs text-[color:var(--color-text)]/60">
              Effort logged on DQ tickets and manual entries, grouped by workstream.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Spent total
              </p>
              <p className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
                {formatCurrency(workstreamActual)}
              </p>
              <p className="text-xs text-[color:var(--color-text)]/60">
                {formatPercent(workstreamShare)} of total
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Selected
              </p>
              <p className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
                {formatCurrency(workstreamFilteredTotal)}
              </p>
              <p className="text-xs text-[color:var(--color-text)]/60">
                {formatPercent(workstreamSelectedShare)} of total
              </p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Workstreams
              </p>
              <p className="mt-1 text-lg font-semibold text-[color:var(--color-text)]">
                {workstreamChartData.length}
              </p>
              <p className="text-xs text-[color:var(--color-text)]/60">
                {workstreamTotals.length} total available
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_2fr]">
          <MultiSelect
            label="Workstream"
            options={workstreamOptions}
            values={workstreamFilters}
            onChange={setWorkstreamFilters}
            placeholder="All workstreams"
            counts={workstreamCounts}
          />
          <div className="flex items-end">
            <p className="text-xs text-[color:var(--color-text)]/60">
              Workstream filters apply only to workstream charts and totals.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : workstreamChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                No workstream data available.
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
                    data={workstreamChartData}
                    dataKey="actual"
                    nameKey="scope"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    stroke="transparent"
                  >
                    {workstreamChartData.map((entry, index) => (
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
          <div className="min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={workstreamTrendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Workstreams actual"
                    stroke="var(--chart-3)"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
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
                    <th
                      key={key}
                      className={`px-3 py-2 text-left font-semibold ${
                        key !== "name" && key !== "roles" && key !== "entity" ? "text-right" : ""
                      }`}
                    >
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
                        if (key === "entity") {
                          return (
                            <td key={key} className="px-3 py-2 text-[color:var(--color-text)]/70">
                              {row.entity}
                            </td>
                          );
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
