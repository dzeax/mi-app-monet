"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  Info,
  Link2,
  PiggyBank,
  Wallet,
} from "lucide-react";
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
  LabelList,
} from "recharts";
import { chartTheme } from "@/components/charts/theme";
import { canonicalGeo, geoEmoji, geoFlagClass, EMOJI_UNKNOWN } from "@/lib/geoFlags";
import IfAdmin from "@/components/guards/IfAdmin";
import CrmBudgetExecutionShareModal from "@/components/crm/CrmBudgetExecutionShareModal";

type Option = { label: string; value: string };

type BudgetExecutionViewProps = {
  clientOverride?: string;
  shareToken?: string;
  shareMode?: boolean;
  initialYear?: number;
};

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
  allowedYears?: number[];
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
  monthlyPerson: Record<string, number[]>;
  monthlyPersonScope: Record<string, Record<string, number[]>>;
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
type SortDirection = "asc" | "desc";

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

const formatPercentInt = (value: number) => {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
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

const normalizeMarketKey = (value: string) => {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (upper === "EN" || upper === "UK") return "UK";
  return trimmed;
};

const mergeMarketBreakdown = (items: Array<{ key: string } & ProductionMetric>) => {
  const merged = new Map<string, ProductionMetric>();
  items.forEach((entry) => {
    const normalized = normalizeMarketKey(entry.key);
    const target = merged.get(normalized) ?? createMetric();
    addMetric(target, entry);
    merged.set(normalized, target);
  });
  return Array.from(merged, ([key, metric]) => ({ key, ...metric }));
};

const riskToneClass: Record<"ok" | "warn" | "danger", string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};
const riskOrder: Record<string, number> = {
  Unmapped: 5,
  Unplanned: 4,
  ">100%": 3,
  "90-99%": 2,
  OK: 1,
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
type DonutShareLabelProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  innerRadius?: number;
  percent?: number;
  payload?: { name?: string; share?: number };
  name?: string;
};
type MarketDonutLabelProps = DonutShareLabelProps;
type DonutLabelLineProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
};

const BRAND_LOGOS: Record<string, { src: string; alt: string }> = {
  europcar: { src: "/logos/ec_logo.png", alt: "Europcar" },
  goldcar: { src: "/logos/gc_logo.png", alt: "Goldcar" },
};
const BRAND_SLICE_SIZE = 26;
const DONUT_LABEL_OFFSET = 14;
const DONUT_LINE_OFFSET = 12;

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

function renderDonutShareLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
  payload,
}: DonutShareLabelProps) {
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    typeof outerRadius !== "number"
  ) {
    return null;
  }
  const shareValue =
    typeof payload?.share === "number" ? payload.share : typeof percent === "number" ? percent : 0;
  if (!Number.isFinite(shareValue) || shareValue <= 0) return null;
  const radius = outerRadius + DONUT_LABEL_OFFSET;
  const angle = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(angle);
  const y = cy + radius * Math.sin(angle);
  return (
    <text
      x={x}
      y={y}
      fill="var(--chart-axis)"
      fontSize={11}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {formatPercentInt(shareValue)}
    </text>
  );
}

function renderMarketDonutLabel(props: MarketDonutLabelProps) {
  if (
    typeof props.cx !== "number" ||
    typeof props.cy !== "number" ||
    typeof props.midAngle !== "number" ||
    typeof props.outerRadius !== "number" ||
    typeof props.innerRadius !== "number"
  ) {
    return null;
  }
  const label = String(props.payload?.name ?? props.name ?? "");
  const trimmed = label.trim();
  const showFlag = /^[A-Za-z]{2,3}$/.test(trimmed) && trimmed.toLowerCase() !== "other";
  const canonical = showFlag ? canonicalGeo(trimmed) : "";
  const flagClass = showFlag ? geoFlagClass(canonical) : undefined;
  const emoji = showFlag ? geoEmoji(canonical) : null;
  const hasEmoji = !!emoji && emoji !== EMOJI_UNKNOWN && !flagClass;
  const shareValue =
    typeof props.payload?.share === "number"
      ? props.payload.share
      : typeof props.percent === "number"
        ? props.percent
        : 0;

  const innerRadius = props.innerRadius;
  const outerRadius = props.outerRadius;
  const angle = (-props.midAngle * Math.PI) / 180;
  const iconRadius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const iconX = props.cx + iconRadius * Math.cos(angle);
  const iconY = props.cy + iconRadius * Math.sin(angle);
  const labelRadius = outerRadius + DONUT_LABEL_OFFSET;
  const labelX = props.cx + labelRadius * Math.cos(angle);
  const labelY = props.cy + labelRadius * Math.sin(angle);

  const percentLabel = Number.isFinite(shareValue) && shareValue > 0 ? formatPercentInt(shareValue) : null;
  if (!percentLabel) return null;
  const width = 76;
  const height = 20;
  const alignRight = labelX > props.cx;
  const baseX = alignRight ? labelX : labelX - width;
  return (
    <foreignObject x={baseX} y={labelY - height / 2} width={width} height={height}>
      <div
        className={`flex items-center gap-1 text-[11px] text-[color:var(--chart-axis)] ${
          alignRight ? "justify-start" : "justify-end"
        }`}
      >
        <span>{percentLabel}</span>
        {flagClass ? (
          <span className={`flag-swatch fi ${flagClass}`} aria-hidden="true" />
        ) : hasEmoji ? (
          <span className="flag-emoji" aria-hidden="true">
            {emoji}
          </span>
        ) : null}
      </div>
    </foreignObject>
  );
}

function renderBrandDonutLabel(props: DonutShareLabelProps) {
  if (
    typeof props.cx !== "number" ||
    typeof props.cy !== "number" ||
    typeof props.midAngle !== "number" ||
    typeof props.innerRadius !== "number" ||
    typeof props.outerRadius !== "number"
  ) {
    return null;
  }
  const label = String(props.name ?? props.payload?.name ?? "");
  const key = label.trim().toLowerCase();
  const logo = BRAND_LOGOS[key];
  const shareValue =
    typeof props.payload?.share === "number"
      ? props.payload.share
      : typeof props.percent === "number"
        ? props.percent
        : 0;
  const innerRadius = props.innerRadius;
  const outerRadius = props.outerRadius;
  const angle = (-props.midAngle * Math.PI) / 180;
  const logoRadius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const logoX = props.cx + logoRadius * Math.cos(angle) - BRAND_SLICE_SIZE / 2;
  const logoY = props.cy + logoRadius * Math.sin(angle) - BRAND_SLICE_SIZE / 2;
  const labelRadius = outerRadius + DONUT_LABEL_OFFSET;
  const labelX = props.cx + labelRadius * Math.cos(angle);
  const labelY = props.cy + labelRadius * Math.sin(angle);
  return (
    <g>
      {logo ? (
        <image
          href={logo.src}
          x={logoX}
          y={logoY}
          width={BRAND_SLICE_SIZE}
          height={BRAND_SLICE_SIZE}
          aria-label={logo.alt}
        />
      ) : null}
      {Number.isFinite(shareValue) && shareValue > 0 ? (
        <text
          x={labelX}
          y={labelY}
          fill="var(--chart-axis)"
          fontSize={11}
          textAnchor={labelX > props.cx ? "start" : "end"}
          dominantBaseline="central"
        >
          {formatPercentInt(shareValue)}
        </text>
      ) : null}
    </g>
  );
}

function renderDonutLabelLine({ cx, cy, midAngle, outerRadius }: DonutLabelLineProps) {
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    typeof outerRadius !== "number"
  ) {
    return null;
  }
  const angle = (-midAngle * Math.PI) / 180;
  const startRadius = outerRadius + 2;
  const endRadius = outerRadius + DONUT_LINE_OFFSET;
  const x1 = cx + startRadius * Math.cos(angle);
  const y1 = cy + startRadius * Math.sin(angle);
  const x2 = cx + endRadius * Math.cos(angle);
  const y2 = cy + endRadius * Math.sin(angle);
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="rgba(15, 23, 42, 0.35)"
      strokeWidth={1}
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

export default function CrmBudgetExecutionView({
  clientOverride,
  shareToken,
  shareMode = false,
  initialYear,
}: BudgetExecutionViewProps) {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = clientOverride || segments[1] || "emg";
  const clientLogo = clientSlug === "emg" ? "/logos/emg-logo.png" : null;
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(initialYear ?? nowYear);
  const [data, setData] = useState<BudgetExecutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [workstreamFilters, setWorkstreamFilters] = useState<string[]>([]);
  const [entityFilters, setEntityFilters] = useState<string[]>([]);
  const [resourceFilters, setResourceFilters] = useState<string[]>([]);
  const [riskOnly, setRiskOnly] = useState(false);
  const [columnPreset, setColumnPreset] = useState<ColumnPreset>("Finance");
  const [productionMetric, setProductionMetric] = useState<"budget" | "days" | "units">("budget");
  const [productionDimension, setProductionDimension] = useState<
    "brand" | "market" | "segment" | "scope"
  >("brand");
  const [productionOpen, setProductionOpen] = useState(false);
  const [workstreamsOpen, setWorkstreamsOpen] = useState(false);
  const [detailRiskFilters, setDetailRiskFilters] = useState<string[]>([]);
  const [detailSort, setDetailSort] = useState<{ key: ColumnKey; direction: SortDirection } | null>(
    null,
  );
  const [detailRow, setDetailRow] = useState<
    (TableRow & {
      actual: number;
      plan: number;
      remaining: number;
      utilization: number;
      delta: number;
      risk: { label: string; tone: "ok" | "warn" | "danger" };
    }) | null
  >(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAllowedYears, setShareAllowedYears] = useState<number[] | null>(null);
  const [workstreamDetailOpen, setWorkstreamDetailOpen] = useState(false);
  const [workstreamDetailScope, setWorkstreamDetailScope] = useState<string | null>(null);

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

  const panelStorageKey = useCallback(
    (panel: "production" | "workstreams") =>
      `crm_budget_exec_${panel}_open_${clientSlug}_${year}`,
    [clientSlug, year],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedProduction = window.localStorage.getItem(panelStorageKey("production"));
    const savedWorkstreams = window.localStorage.getItem(panelStorageKey("workstreams"));
    setProductionOpen(savedProduction ? savedProduction === "true" : false);
    setWorkstreamsOpen(savedWorkstreams ? savedWorkstreams === "true" : false);
  }, [panelStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(panelStorageKey("production"), String(productionOpen));
  }, [panelStorageKey, productionOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(panelStorageKey("workstreams"), String(workstreamsOpen));
  }, [panelStorageKey, workstreamsOpen]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (shareMode && !shareToken) {
        setError("Missing share token.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const endpoint = shareMode
          ? `/api/share/budget-execution?client=${clientSlug}&year=${year}&token=${encodeURIComponent(
              shareToken ?? "",
            )}`
          : `/api/crm/budget-execution?client=${clientSlug}&year=${year}`;
        const res = await fetch(endpoint);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || `Failed to load budget execution (${res.status})`);
        }
        if (active) {
          setData(body as BudgetExecutionResponse);
          if (shareMode && Array.isArray(body?.allowedYears)) {
            const allowed = body.allowedYears.map((val: number) => Number(val)).filter((val: number) => Number.isFinite(val));
            if (allowed.length) {
              setShareAllowedYears(allowed);
              if (!allowed.includes(year)) {
                setYear(allowed[0]);
              }
            }
          }
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
  }, [clientSlug, year, shareMode, shareToken]);

  const yearOptions = useMemo(() => {
    if (shareMode && shareAllowedYears && shareAllowedYears.length) {
      return [...shareAllowedYears].sort((a, b) => b - a);
    }
    const base = new Set<number>([nowYear - 1, nowYear, nowYear + 1]);
    if (Number.isFinite(initialYear ?? NaN)) {
      base.add(initialYear as number);
    }
    return Array.from(base).sort((a, b) => b - a);
  }, [shareMode, shareAllowedYears, nowYear, initialYear]);

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
  const resourceFilterSet = useMemo(() => new Set(resourceFilters), [resourceFilters]);
  const detailRiskFilterSet = useMemo(() => new Set(detailRiskFilters), [detailRiskFilters]);
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

  const { roleCounts, workstreamCounts, entityCounts, resourceCounts } = useMemo(() => {
    const roleCounts: Record<string, number> = {};
    const workstreamCounts: Record<string, number> = {};
    const entityCounts: Record<string, number> = {};
    const resourceCounts: Record<string, number> = {};
    if (!data) return { roleCounts, workstreamCounts, entityCounts, resourceCounts };

    data.table.rows.forEach((row) => {
      if (resourceFilterSet.size > 0 && (!row.personId || !resourceFilterSet.has(row.personId)))
        return;
      const entityRow = buildRow(row, roleFilterSet, EMPTY_SET, EMPTY_SET, true);
      if (entityRow) {
        entityCounts[row.entity] = (entityCounts[row.entity] ?? 0) + 1;
      }
    });

    data.table.rows.forEach((row) => {
      if (resourceFilterSet.size > 0 && (!row.personId || !resourceFilterSet.has(row.personId)))
        return;
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
      if (resourceFilterSet.size > 0 && (!row.personId || !resourceFilterSet.has(row.personId)))
        return;
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

    data.table.rows.forEach((row) => {
      if (!row.personId) return;
      const resourceRow = buildRow(row, roleFilterSet, EMPTY_SET, entityFilterSet, true);
      if (!resourceRow) return;
      resourceCounts[row.personId] = (resourceCounts[row.personId] ?? 0) + 1;
    });

    return { roleCounts, workstreamCounts, entityCounts, resourceCounts };
  }, [data, roleFilterSet, entityFilterSet, resourceFilterSet, buildRow, roleShareForRow]);

  const baseRows = useMemo(() => {
    if (!data) return [];
    return data.table.rows
      .map((row) => {
        if (resourceFilterSet.size > 0 && (!row.personId || !resourceFilterSet.has(row.personId)))
          return null;
        return buildRow(row, roleFilterSet, EMPTY_SET, entityFilterSet, false);
      })
      .filter((row): row is TableRow & { actual: number; plan: number; remaining: number; utilization: number; delta: number; risk: { label: string; tone: "ok" | "warn" | "danger" } } => Boolean(row));
  }, [data, buildRow, roleFilterSet, entityFilterSet, resourceFilterSet]);

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

    if (resourceFilterSet.size > 0 && data.monthlyPerson) {
      const seriesList: number[][] = [];
      data.table.rows.forEach((row) => {
        if (!row.personId || !resourceFilterSet.has(row.personId)) return;
        if (hasEntityFilter && !entityFilterSet.has(row.entity)) return;
        const baseSeries = data.monthlyPerson?.[row.personId];
        if (!Array.isArray(baseSeries)) return;
        const scale = hasRoleFilter ? roleShareForRow(row, roleFilterSet) : 1;
        if (scale <= 0) return;
        seriesList.push(baseSeries.map((value) => value * scale));
      });
      return sumSeriesList(seriesList);
    }

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
    resourceFilterSet,
    entityFilterSet,
    roleShareForRow,
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
  const roleNameById = useMemo(
    () =>
      new Map<string, string>(
        (data?.breakdowns.roles ?? []).map((role) => [role.roleId, role.roleName]),
      ),
    [data],
  );
  const resourceOptionsRaw = useMemo<Option[]>(() => {
    const options: Array<{ id: string; name: string }> = [];
    if (!data?.table.rows) return [];
    const seen = new Set<string>();
    data.table.rows.forEach((row) => {
      if (!row.personId) return;
      if (seen.has(row.personId)) return;
      seen.add(row.personId);
      options.push({ id: row.personId, name: row.name });
    });
    return options
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
      .map((entry) => ({ label: entry.name, value: entry.id }));
  }, [data]);

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
  const resourceOptions = useMemo(
    () => filterOptionsByCount(resourceOptionsRaw, resourceCounts),
    [filterOptionsByCount, resourceOptionsRaw, resourceCounts],
  );

  useEffect(() => {
    if (!data) return;
    const roleSet = new Set(roleOptions.map((opt) => opt.value));
    const workstreamSet = new Set(workstreamOptions.map((opt) => opt.value));
    const entitySet = new Set(entityOptions.map((opt) => opt.value));
    const resourceSet = new Set(resourceOptions.map((opt) => opt.value));
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
    setResourceFilters((prev) => {
      const next = prev.filter((value) => resourceSet.has(value));
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [data, roleOptions, workstreamOptions, entityOptions, resourceOptions]);

  const roleChartData = useMemo(() => {
    if (!data) return [];
    if (resourceFilterSet.size > 0) {
      const roleTotals = new Map<string, { plan: number; actual: number }>();
      data.table.rows.forEach((row) => {
        if (!row.personId || !resourceFilterSet.has(row.personId)) return;
        if (hasEntityFilter && !entityFilterSet.has(row.entity)) return;
        const actual = sumRecord(row.scopeSpend ?? {});
        if (row.roleShares.length > 0) {
          row.roleShares.forEach((share) => {
            if (hasRoleFilter && !roleFilterSet.has(share.roleId)) return;
            const entry = roleTotals.get(share.roleId) ?? { plan: 0, actual: 0 };
            entry.plan += row.plan * share.share;
            entry.actual += actual * share.share;
            roleTotals.set(share.roleId, entry);
          });
        } else if (row.isUnassigned) {
          if (hasRoleFilter && !roleFilterSet.has("unassigned")) return;
          const entry = roleTotals.get("unassigned") ?? { plan: 0, actual: 0 };
          entry.plan += row.plan;
          entry.actual += actual;
          roleTotals.set("unassigned", entry);
        }
      });
      const roleNameMap = new Map(data.breakdowns.roles.map((role) => [role.roleId, role.roleName]));
      return Array.from(roleTotals.entries())
        .map(([roleId, totals]) => ({
          roleName: roleNameMap.get(roleId) ?? "Unassigned",
          plan: totals.plan,
          actual: totals.actual,
        }))
        .filter((entry) => entry.plan > 0 || entry.actual > 0)
        .sort((a, b) => b.actual - a.actual);
    }

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
    resourceFilterSet,
    roleShareForRow,
  ]);

  const scopeTotalsData = useMemo(() => {
    if (!data) return [];
    const roleScopes = data.roleScopes || {};
    const scopeTotals: Record<string, number> = {};
    if (resourceFilterSet.size > 0) {
      data.table.rows.forEach((row) => {
        if (!row.personId || !resourceFilterSet.has(row.personId)) return;
        if (hasEntityFilter && !entityFilterSet.has(row.entity)) return;
        const roleShare = hasRoleFilter ? roleShareForRow(row, roleFilterSet) : 1;
        if (roleShare <= 0) return;
        Object.entries(row.scopeSpend ?? {}).forEach(([scope, value]) => {
          scopeTotals[scope] = (scopeTotals[scope] ?? 0) + (Number(value || 0) * roleShare);
        });
      });
    } else if (hasEntityFilter) {
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
    resourceFilterSet,
    entityFilterSet,
    roleShareForRow,
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
      if (resourceFilterSet.size > 0 && data.monthlyPersonScope) {
        const seriesList: number[][] = [];
        data.table.rows.forEach((row) => {
          if (!row.personId || !resourceFilterSet.has(row.personId)) return;
          if (hasEntityFilter && !entityFilterSet.has(row.entity)) return;
          const scopeMap = data.monthlyPersonScope?.[row.personId] ?? {};
          const scale = hasRoleFilter ? roleShareForRow(row, roleFilterSet) : 1;
          if (scale <= 0) return;
          scopes.forEach((scope) => {
            const series = scopeMap[scope];
            if (series) seriesList.push(series.map((value) => value * scale));
          });
        });
        return sumSeriesList(seriesList);
      }
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
    [
      data,
      hasEntityFilter,
      hasRoleFilter,
      entityFilters,
      roleFilters,
      resourceFilterSet,
      entityFilterSet,
      roleShareForRow,
    ],
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
    if (!data?.production?.byPerson) return [];
    const roleNameMap = new Map(data.breakdowns.roles.map((role) => [role.roleId, role.roleName]));
    const totalsByRole = new Map<string, ProductionMetric>();

    data.table.rows.forEach((row) => {
      const personBreakdown = data.production?.byPerson?.[row.key];
      if (!personBreakdown) return;
      if (resourceFilterSet.size > 0 && (!row.personId || !resourceFilterSet.has(row.personId)))
        return;
      if (hasEntityFilter && !entityFilterSet.has(row.entity)) return;
      if (!row.roleShares.length) return;

      row.roleShares.forEach((share) => {
        if (hasRoleFilter && !roleFilterSet.has(share.roleId)) return;
        const entry = totalsByRole.get(share.roleId) ?? createMetric();
        addMetric(entry, personBreakdown.totals, share.share);
        totalsByRole.set(share.roleId, entry);
      });
    });

    const totalBudget = Array.from(totalsByRole.values()).reduce((acc, entry) => acc + entry.budget, 0);

    return Array.from(totalsByRole.entries())
      .map(([roleId, metric]) => ({
        roleId,
        roleName: roleNameMap.get(roleId) ?? roleId,
        actual: metric.budget,
        days: metric.days,
        units: metric.units,
        share: totalBudget > 0 ? metric.budget / totalBudget : 0,
      }))
      .filter((entry) => entry.actual > 0)
      .sort((a, b) => b.actual - a.actual);
  }, [
    data,
    hasRoleFilter,
    roleFilterSet,
    hasEntityFilter,
    entityFilterSet,
    resourceFilterSet,
  ]);

  const workstreamShare = actualTotalFiltered > 0 ? workstreamActual / actualTotalFiltered : 0;
  const workstreamFilteredTotal = useMemo(
    () => workstreamChartData.reduce((acc, entry) => acc + entry.actual, 0),
    [workstreamChartData],
  );
  const workstreamSelectedShare =
    actualTotalFiltered > 0 ? workstreamFilteredTotal / actualTotalFiltered : 0;
  const workstreamDonutData = useMemo(() => {
    const total = workstreamChartData.reduce((acc, entry) => acc + entry.actual, 0);
    if (total <= 0) return [];
    const sorted = [...workstreamChartData].sort((a, b) => b.actual - a.actual);
    const limit = 6;
    if (sorted.length <= limit) {
      return sorted.map((entry) => ({
        name: entry.scope,
        actual: entry.actual,
        share: entry.actual / total,
      }));
    }
    const top = sorted.slice(0, limit);
    const remainder = sorted.slice(limit);
    const otherActual = remainder.reduce((acc, entry) => acc + entry.actual, 0);
    const result = top.map((entry) => ({
      name: entry.scope,
      actual: entry.actual,
      share: entry.actual / total,
    }));
    if (otherActual > 0) {
      result.push({
        name: "Other Streams",
        actual: otherActual,
        share: otherActual / total,
      });
    }
    return result;
  }, [workstreamChartData]);

  const workstreamDetailScopes = useMemo(() => {
    if (!workstreamDetailScope) return [];
    if (workstreamDetailScope !== "Other Streams") return [workstreamDetailScope];
    const topSet = new Set(
      workstreamDonutData
        .filter((entry) => entry.name !== "Other Streams")
        .map((entry) => entry.name),
    );
    return workstreamChartData
      .filter((entry) => !topSet.has(entry.scope))
      .map((entry) => entry.scope);
  }, [workstreamDetailScope, workstreamDonutData, workstreamChartData]);

  const workstreamDetailTotal = useMemo(() => {
    if (workstreamDetailScopes.length === 0) return 0;
    const scopeSet = new Set(workstreamDetailScopes);
    return workstreamChartData.reduce(
      (acc, entry) => (scopeSet.has(entry.scope) ? acc + entry.actual : acc),
      0,
    );
  }, [workstreamDetailScopes, workstreamChartData]);

  const workstreamDetailShare =
    workstreamFilteredTotal > 0 ? workstreamDetailTotal / workstreamFilteredTotal : 0;

  const workstreamDetailContributors = useMemo(() => {
    if (!data || workstreamDetailScopes.length === 0) {
      return { total: 0, rows: [] as Array<{ row: TableRow; actual: number; share: number }> };
    }
    const scopeSet = new Set(workstreamDetailScopes);
    const total = workstreamDetailTotal;
    const full = data.table.rows
      .map((row) => {
        if (resourceFilterSet.size > 0) {
          if (!row.personId || !resourceFilterSet.has(row.personId)) return null;
        }
        if (hasEntityFilter && !entityFilterSet.has(row.entity)) return null;
        const roleShare = roleShareForRow(row, roleFilterSet);
        if (roleShare <= 0) return null;
        const scopedActual = sumRecord(row.scopeSpend ?? {}, scopeSet) * roleShare;
        if (scopedActual <= 0) return null;
        return {
          row,
          actual: scopedActual,
          share: total > 0 ? scopedActual / total : 0,
        };
      })
      .filter((entry): entry is { row: TableRow; actual: number; share: number } => Boolean(entry))
      .sort((a, b) => b.actual - a.actual);

    return { total: full.length, rows: full.slice(0, 10) };
  }, [
    data,
    workstreamDetailScopes,
    workstreamDetailTotal,
    resourceFilterSet,
    hasEntityFilter,
    entityFilterSet,
    roleShareForRow,
    roleFilterSet,
  ]);

  const workstreamDetailChartSeries = useMemo(() => {
    if (!data?.monthlyPersonScope || workstreamDetailScopes.length === 0) return [];
    const scopeSet = new Set(workstreamDetailScopes);
    const base = workstreamDetailContributors.rows
      .map(({ row }) => {
        if (!row.personId) return null;
        const scopeMap = data.monthlyPersonScope[row.personId];
        if (!scopeMap) return null;
        const series = Array(12).fill(0);
        Object.entries(scopeMap).forEach(([scope, values]) => {
          if (!scopeSet.has(scope)) return;
          if (!Array.isArray(values)) return;
          values.forEach((value, idx) => {
            series[idx] += value || 0;
          });
        });
        const scale = hasRoleFilter ? roleShareForRow(row, roleFilterSet) : 1;
        const scaled = series.map((value) => value * scale);
        const total = scaled.reduce((acc, value) => acc + value, 0);
        if (total <= 0) return null;
        return { name: row.name, key: row.key, series: scaled };
      })
      .filter(
        (entry): entry is { name: string; key: string; series: number[] } => Boolean(entry),
      );
    return base.map((entry, idx) => ({
      ...entry,
      dataKey: `s${idx}`,
      color: chartTheme.palette[idx % chartTheme.palette.length],
    }));
  }, [
    data,
    workstreamDetailScopes,
    workstreamDetailContributors.rows,
    hasRoleFilter,
    roleShareForRow,
    roleFilterSet,
  ]);

  const workstreamDetailChartData = useMemo(() => {
    if (workstreamDetailChartSeries.length === 0) return [];
    return MONTHS.map((month, idx) => {
      const entry: Record<string, number | string> = { month };
      workstreamDetailChartSeries.forEach((series) => {
        entry[series.dataKey] = series.series[idx] ?? 0;
      });
      return entry;
    });
  }, [workstreamDetailChartSeries]);

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
      if (resourceFilterSet.size > 0 && (!row.personId || !resourceFilterSet.has(row.personId)))
        return;
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
  }, [data, hasEntityFilter, entityFilterSet, roleShareForRow, roleFilterSet, resourceFilterSet]);

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

  const normalizedMarketData = useMemo(
    () => mergeMarketBreakdown(productionAggregate.byMarket),
    [productionAggregate.byMarket],
  );

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
          ? normalizedMarketData
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
  }, [normalizedMarketData, productionAggregate, productionDimension, productionMetricKey]);

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
  const productionBarMarginRight = productionDimension === "market" ? 56 : 24;
  const loyaltySegmentStats = useMemo(() => {
    const totals = createMetric();
    const loyaltyKeys = new Set(["privilege", "clubber"]);
    productionAggregate.bySegment.forEach((entry) => {
      if (!loyaltyKeys.has(entry.key.trim().toLowerCase())) return;
      addMetric(totals, entry);
    });
    const share = productionAggregate.totals.budget > 0 ? totals.budget / productionAggregate.totals.budget : 0;
    return { ...totals, share };
  }, [productionAggregate.bySegment, productionAggregate.totals.budget]);

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
    () => buildDonutData(normalizedMarketData),
    [buildDonutData, normalizedMarketData],
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
        if (riskOnly && row.risk.label === "OK") return false;
        return true;
      })
      .sort((a, b) => b.actual - a.actual);
  }, [baseRows, riskOnly]);

  const toggleDetailSort = useCallback((key: ColumnKey) => {
    const numericKeys: ColumnKey[] = ["plan", "actual", "remaining", "utilization", "delta", "risk"];
    const defaultDir: SortDirection = numericKeys.includes(key) ? "desc" : "asc";
    setDetailSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: defaultDir };
      if (prev.direction === "desc") return { key, direction: "asc" };
      return null;
    });
  }, []);

  const detailRows = useMemo(() => {
    const rows = detailRiskFilterSet.size
      ? processedRows.filter((row) => detailRiskFilterSet.has(row.risk.label))
      : processedRows;
    if (!detailSort) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const dir = detailSort.direction === "asc" ? 1 : -1;
      const key = detailSort.key;
      const aVal = (() => {
        switch (key) {
          case "name":
            return a.name.toLowerCase();
          case "entity":
            return a.entity.toLowerCase();
          case "roles":
            return a.roles.join(", ").toLowerCase();
          case "plan":
            return a.plan;
          case "actual":
            return a.actual;
          case "remaining":
            return a.remaining;
          case "utilization":
            return a.utilization;
          case "delta":
            return a.delta;
          case "risk":
            return riskOrder[a.risk.label] ?? 0;
          default:
            return 0;
        }
      })();
      const bVal = (() => {
        switch (key) {
          case "name":
            return b.name.toLowerCase();
          case "entity":
            return b.entity.toLowerCase();
          case "roles":
            return b.roles.join(", ").toLowerCase();
          case "plan":
            return b.plan;
          case "actual":
            return b.actual;
          case "remaining":
            return b.remaining;
          case "utilization":
            return b.utilization;
          case "delta":
            return b.delta;
          case "risk":
            return riskOrder[b.risk.label] ?? 0;
          default:
            return 0;
        }
      })();
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * dir;
      }
      return (Number(aVal) - Number(bVal)) * dir;
    });
    return sorted;
  }, [processedRows, detailRiskFilterSet, detailSort]);

  const detailTotals = useMemo(() => {
    const totals = detailRows.reduce(
      (acc, row) => {
        acc.plan += row.plan;
        acc.actual += row.actual;
        return acc;
      },
      { plan: 0, actual: 0 },
    );
    const remaining = totals.plan - totals.actual;
    const delta = totals.actual - totals.plan;
    const utilization = totals.plan > 0 ? totals.actual / totals.plan : 0;
    return { ...totals, remaining, delta, utilization };
  }, [detailRows]);

  const detailRoleAllocations = useMemo(() => {
    if (!detailRow) return [];
    if (detailRow.roleShares.length === 0) {
      return detailRow.isUnassigned
        ? [
            {
              roleName: "Unassigned",
              share: 1,
              plan: detailRow.plan,
              actual: detailRow.actual,
            },
          ]
        : [];
    }
    return detailRow.roleShares.map((share) => ({
      roleName: roleNameById.get(share.roleId) ?? share.roleId,
      share: share.share,
      plan: detailRow.plan * share.share,
      actual: detailRow.actual * share.share,
    }));
  }, [detailRow, roleNameById]);

  const detailProductionSpend = detailRow?.scopeSpend?.[PRODUCTION_SCOPE] ?? 0;
  const detailWorkstreamSpend = detailRow ? detailRow.actual - detailProductionSpend : 0;
  const detailSourceShare = detailRow?.actual ? detailProductionSpend / detailRow.actual : 0;

  const detailWorkstreamList = useMemo(() => {
    if (!detailRow) return [];
    return Object.entries(detailRow.scopeSpend ?? {})
      .filter(([scope]) => scope !== PRODUCTION_SCOPE)
      .map(([scope, amount]) => ({ scope, amount }))
      .filter((entry) => entry.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [detailRow]);

  const detailMonthlyData = useMemo(() => {
    if (!detailRow?.personId || !data?.monthlyPerson) return [];
    const base = data.monthlyPerson[detailRow.personId];
    if (!Array.isArray(base)) return [];
    const scale = hasRoleFilter ? roleShareForRow(detailRow, roleFilterSet) : 1;
    return MONTHS.map((label, idx) => ({
      month: label,
      actual: (base[idx] ?? 0) * scale,
    }));
  }, [detailRow, data, hasRoleFilter, roleShareForRow, roleFilterSet]);

  const visibleColumns = COLUMN_PRESETS[columnPreset];

  const clearFilters = () => {
    setRoleFilters([]);
    setWorkstreamFilters([]);
    setEntityFilters([]);
    setResourceFilters([]);
    setRiskOnly(false);
  };

  const detailRiskOptions = ["Unmapped", "Unplanned", ">100%", "90-99%", "OK"];
  const toggleDetailRiskFilter = useCallback((label: string) => {
    setDetailRiskFilters((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label],
    );
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
  }, []);

  const openWorkstreamDetail = useCallback((scope: string) => {
    setWorkstreamDetailScope(scope);
    setWorkstreamDetailOpen(true);
  }, []);

  const closeWorkstreamDetail = useCallback(() => {
    setWorkstreamDetailOpen(false);
    setWorkstreamDetailScope(null);
  }, []);

  return (
    <div className="space-y-6" data-page="crm-budget-execution">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {clientLogo ? (
                <span className="inline-flex h-8 w-16 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2">
                  <img src={clientLogo} alt="EMG" className="h-5 w-full object-contain" />
                </span>
              ) : null}
              <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Budget Execution</h1>
              <span className="rounded-full border border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 px-2.5 py-1 text-sm font-semibold text-[color:var(--color-primary)]">
                {year}
              </span>
            </div>
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
            {!shareMode ? (
              <IfAdmin>
                <button
                  className="btn-ghost h-10 px-3"
                  type="button"
                  onClick={() => setShareOpen(true)}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Link2 className="h-4 w-4" />
                    Share
                  </span>
                </button>
              </IfAdmin>
            ) : null}
            <button
              className="btn-ghost h-12 w-12 px-0 text-[color:var(--color-text)]/70 opacity-100 pointer-events-none"
              type="button"
              aria-disabled="true"
              aria-label="Export"
              title="Export"
              tabIndex={-1}
            >
              <Download className="h-7 w-7" />
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
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1.1fr_1.1fr]">
          <MultiSelect
            label="Entity"
            options={entityOptions}
            values={entityFilters}
            onChange={setEntityFilters}
            placeholder="All entities"
            counts={entityCounts}
          />
          <MultiSelect
            label="Role"
            options={roleOptions}
            values={roleFilters}
            onChange={setRoleFilters}
            placeholder="All roles"
            counts={roleCounts}
          />
          <MultiSelect
            label="Resource"
            options={resourceOptions}
            values={resourceFilters}
            onChange={setResourceFilters}
            placeholder="All resources"
            counts={resourceCounts}
          />
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
                <LineChart data={burnData} margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
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
                    width={90}
                    tickMargin={8}
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
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[color:var(--color-text)]">
              <img
                src="/animations/conveyor-belt.gif"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] object-contain motion-reduce:hidden"
              />
              Campaign production
            </h3>
            <p className="mt-1 text-xs text-[color:var(--color-text)]/60">
              Production spend for ICP newsletters, local activations, and lifecycle builds/revamps.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[11px] font-medium text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
              aria-expanded={productionOpen}
              aria-label={productionOpen ? "Collapse production details" : "Expand production details"}
              title={productionOpen ? "Collapse section" : "Expand section"}
              onClick={() => setProductionOpen((open) => !open)}
            >
              <span>Details</span>
              {productionOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {productionOpen ? (
          <>
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
                    width={90}
                    tickMargin={8}
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
                  margin={{ top: 8, right: 56, left: 16, bottom: 0 }}
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
                    cursor={false}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const entry = payload[0].payload as {
                        roleName: string;
                        actual: number;
                        days: number;
                        share: number;
                      };
                      return (
                        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-xs text-[color:var(--color-text)] shadow-lg">
                          <div className="font-semibold">{entry.roleName}</div>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <span>Budget</span>
                            <span className="font-semibold">{formatCurrency(entry.actual)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <span>Days</span>
                            <span className="font-semibold">{formatUnits(Math.round(entry.days))} d</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <span>Email units</span>
                            <span className="font-semibold">{formatUnits(Math.round(entry.units))}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="actual"
                    name="Production actual"
                    fill="var(--chart-1)"
                    fillOpacity={0.85}
                    radius={[6, 6, 6, 6]}
                    activeBar={{
                      fill: "var(--chart-2)",
                      stroke: "var(--color-primary)",
                      strokeWidth: 2,
                      fillOpacity: 1,
                    }}
                  >
                    <LabelList
                      dataKey="share"
                      position="right"
                      offset={10}
                      formatter={(value: number) => formatPercentInt(Number(value))}
                      fill={chartTheme.tick.fill}
                      fontSize={11}
                    />
                  </Bar>
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
                    margin={{ top: 8, right: productionBarMarginRight, left: 16, bottom: 0 }}
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
                              <span className="font-semibold">{formatCurrency(entry.budget)}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <span>Days</span>
                              <span className="font-semibold">{formatUnits(Math.round(entry.days))} d</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <span>Email units</span>
                              <span className="font-semibold">{formatUnits(Math.round(entry.units))}</span>
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
                    >
                      {productionDimension === "market" ? (
                        <LabelList
                          dataKey="share"
                          position="right"
                          offset={10}
                          formatter={(value: number) => formatPercentInt(Number(value))}
                          fill={chartTheme.tick.fill}
                          fontSize={11}
                        />
                      ) : null}
                    </Bar>
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
                    {productionDimension === "segment" ? (
                      <div className="mt-4 border-t border-[color:var(--color-border)] pt-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                          Loyalty programs
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--color-text)]/60">
                          Privilege + Clubber
                        </div>
                        {loyaltySegmentStats.budget > 0 || loyaltySegmentStats.days > 0 ? (
                          <div className="mt-2 space-y-2 text-xs text-[color:var(--color-text)]/70">
                            <div className="flex items-center justify-between gap-3">
                              <span>Budget</span>
                              <span className="font-semibold">
                                {formatCurrency(loyaltySegmentStats.budget, true)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Days</span>
                              <span className="font-semibold">
                                {formatDays(loyaltySegmentStats.days)} d
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Share</span>
                              <span className="font-semibold">{formatPercent(loyaltySegmentStats.share)}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-[color:var(--color-text)]/60">
                            No loyalty spend available.
                          </p>
                        )}
                      </div>
                    ) : null}
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
                            label={
                              block.kind === "brand"
                                ? renderBrandDonutLabel
                                : block.kind === "market"
                                  ? renderMarketDonutLabel
                                  : renderDonutShareLabel
                            }
                            labelLine={block.kind === "brand" ? false : renderDonutLabelLine}
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
          </>
        ) : null}
      </section>

      <section className="card px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              Other Workstreams
            </p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[color:var(--color-text)]">
              <img
                src="/animations/analytics.gif"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] object-contain motion-reduce:hidden"
              />
              Consulting, Governance & Data Quality
            </h3>
            <p className="mt-1 text-xs text-[color:var(--color-text)]/60">
              Effort logged across consulting, strategy/governance, and data quality, grouped by workstream.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[11px] font-medium text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
              aria-expanded={workstreamsOpen}
              aria-label={workstreamsOpen ? "Collapse workstreams details" : "Expand workstreams details"}
              title={workstreamsOpen ? "Collapse section" : "Expand section"}
              onClick={() => setWorkstreamsOpen((open) => !open)}
            >
              <span>Details</span>
              {workstreamsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {workstreamsOpen ? (
          <>
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
                ) : workstreamDonutData.length === 0 ? (
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
                        data={workstreamDonutData}
                        dataKey="actual"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={3}
                        stroke="transparent"
                        label={renderDonutShareLabel}
                        labelLine={renderDonutLabelLine}
                      >
                        {workstreamDonutData.map((entry, index) => (
                          <Cell
                            key={`${entry.name}-${index}`}
                            fill={chartTheme.palette[index % chartTheme.palette.length]}
                            className="cursor-pointer"
                            onClick={() => openWorkstreamDetail(entry.name)}
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
                    <LineChart data={workstreamTrendData} margin={{ top: 8, right: 16, left: 2, bottom: 0 }}>
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
                        width={82}
                        tickMargin={3}
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
          </>
        ) : null}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Execution details</h3>
            <p className="text-xs text-[color:var(--color-text)]/60">
              {detailRows.length} resources shown
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                detailRiskFilterSet.size === 0
                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)] shadow-sm"
                  : "border-[color:var(--color-border)] text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
              }`}
              onClick={() => setDetailRiskFilters([])}
            >
              All
            </button>
            {detailRiskOptions.map((label) => (
              <button
                key={label}
                type="button"
                className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                  detailRiskFilterSet.has(label)
                    ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)] shadow-sm"
                    : "border-[color:var(--color-border)] text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
                }`}
                onClick={() => toggleDetailRiskFilter(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-[color:var(--color-text)]/60">
            {detailRiskFilterSet.size ? `${detailRiskFilterSet.size} risk filters active` : "No risk filters"}
          </span>
        </div>
        <div className="border-t border-[color:var(--color-border)] px-6 py-4">
          <div className="max-h-[520px] overflow-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]/80">
                <tr>
                  {visibleColumns.map((key) => (
                    <th
                      key={key}
                      className={`sticky top-0 z-10 px-3 py-2 text-left font-semibold ${
                        key !== "name" && key !== "roles" && key !== "entity" ? "text-right" : ""
                      } ${key === "name" ? "left-0 z-20 bg-[color:var(--color-surface-2)]" : "bg-[color:var(--color-surface-2)]"}`}
                    >
                      <button
                        type="button"
                        className={`flex w-full items-center gap-1 ${
                          key !== "name" && key !== "roles" && key !== "entity" ? "justify-end" : "justify-start"
                        }`}
                        onClick={() => toggleDetailSort(key)}
                      >
                        <span>{COLUMN_LABELS[key]}</span>
                        {key === "delta" ? (
                          <span
                            className="ml-1 inline-flex h-4 w-4 items-center justify-center text-[color:var(--color-text)]/55"
                            title="Delta = Actual - Plan. Positive means overspend; negative means underspend."
                            aria-label="Delta help"
                          >
                            <Info className="h-3 w-3" />
                          </span>
                        ) : null}
                        {detailSort?.key === key ? (
                          detailSort.direction === "asc" ? (
                            <ArrowUp className="h-3 w-3 text-[color:var(--color-text)]/60" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-[color:var(--color-text)]/60" />
                          )
                        ) : null}
                      </button>
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
                ) : detailRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-[color:var(--color-text)]/60" colSpan={visibleColumns.length}>
                      No rows match the current filters.
                    </td>
                  </tr>
                ) : (
                  detailRows.map((row) => (
                    <tr
                      key={row.key}
                      className="cursor-pointer hover:bg-[color:var(--color-surface-2)]/40"
                      onClick={() => {
                        setDetailRow(row);
                        setDetailOpen(true);
                      }}
                    >
                      {visibleColumns.map((key) => {
                        if (key === "name") {
                          return (
                            <td key={key} className="sticky left-0 z-10 bg-[color:var(--color-surface)] px-3 py-2 font-semibold">
                              {row.name}
                            </td>
                          );
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
              {detailRows.length > 0 ? (
                <tfoot className="bg-[color:var(--color-surface-2)]/50 text-[color:var(--color-text)]/80">
                  <tr>
                    {visibleColumns.map((key) => {
                      if (key === "name") {
                        return (
                          <td key={key} className="sticky left-0 bg-[color:var(--color-surface-2)] px-3 py-2 font-semibold">
                            Total
                          </td>
                        );
                      }
                      if (key === "entity" || key === "roles" || key === "risk") {
                        return <td key={key} className="px-3 py-2" />;
                      }
                      if (key === "plan") {
                        return (
                          <td key={key} className="px-3 py-2 text-right font-semibold">
                            {formatCurrency(detailTotals.plan)}
                          </td>
                        );
                      }
                      if (key === "actual") {
                        return (
                          <td key={key} className="px-3 py-2 text-right font-semibold">
                            {formatCurrency(detailTotals.actual)}
                          </td>
                        );
                      }
                      if (key === "remaining") {
                        return (
                          <td key={key} className={`px-3 py-2 text-right font-semibold ${detailTotals.remaining < 0 ? "text-red-600" : ""}`}>
                            {formatCurrency(detailTotals.remaining)}
                          </td>
                        );
                      }
                      if (key === "utilization") {
                        return (
                          <td key={key} className="px-3 py-2 text-right font-semibold">
                            {formatPercent(detailTotals.utilization)}
                          </td>
                        );
                      }
                      if (key === "delta") {
                        const sign = detailTotals.delta > 0 ? "+" : "";
                        return (
                          <td key={key} className={`px-3 py-2 text-right font-semibold ${detailTotals.delta > 0 ? "text-red-600" : detailTotals.delta < 0 ? "text-emerald-600" : ""}`}>
                            {sign}{formatCurrency(detailTotals.delta)}
                          </td>
                        );
                      }
                      return <td key={key} className="px-3 py-2" />;
                    })}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      </section>

      <WorkstreamDetailDrawer
        open={workstreamDetailOpen}
        scope={workstreamDetailScope}
        scopeCount={workstreamDetailScopes.length}
        total={workstreamDetailTotal}
        share={workstreamDetailShare}
        contributors={workstreamDetailContributors.rows}
        contributorCount={workstreamDetailContributors.total}
        chartData={workstreamDetailChartData}
        chartSeries={workstreamDetailChartSeries}
        onClose={closeWorkstreamDetail}
        onSelectRow={(row) => {
          closeWorkstreamDetail();
          setDetailRow(row);
          setDetailOpen(true);
        }}
        formatCurrency={formatCurrency}
        formatPercent={formatPercent}
        formatPercentInt={formatPercentInt}
      />

      {!shareMode ? (
        <CrmBudgetExecutionShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          clientSlug={clientSlug}
          yearOptions={yearOptions}
        />
      ) : null}

      <ExecutionDetailDrawer
        open={detailOpen}
        row={detailRow}
        onClose={closeDetail}
        roleAllocations={detailRoleAllocations}
        productionSpend={detailProductionSpend}
        workstreamSpend={detailWorkstreamSpend}
        sourceShare={detailSourceShare}
        workstreams={detailWorkstreamList}
        monthlyData={detailMonthlyData}
        clientSlug={clientSlug}
        formatCurrency={formatCurrency}
        formatPercent={formatPercent}
        formatPercentInt={formatPercentInt}
      />
    </div>
  );
}

function ExecutionDetailDrawer({
  open,
  row,
  onClose,
  roleAllocations,
  productionSpend,
  workstreamSpend,
  sourceShare,
  workstreams,
  monthlyData,
  clientSlug,
  formatCurrency,
  formatPercent,
  formatPercentInt,
}: {
  open: boolean;
  row: (TableRow & {
    actual: number;
    plan: number;
    remaining: number;
    utilization: number;
    delta: number;
    risk: { label: string; tone: "ok" | "warn" | "danger" };
  }) | null;
  onClose: () => void;
  roleAllocations: Array<{ roleName: string; share: number; plan: number; actual: number }>;
  productionSpend: number;
  workstreamSpend: number;
  sourceShare: number;
  workstreams: Array<{ scope: string; amount: number }>;
  monthlyData: Array<{ month: string; actual: number }>;
  clientSlug: string;
  formatCurrency: (value: number, detailed?: boolean) => string;
  formatPercent: (value: number) => string;
  formatPercentInt: (value: number) => string;
}) {
  if (!open || !row) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="execution-detail-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[color:var(--color-surface)] shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 px-6 py-4 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Execution details
              </p>
              <h2 id="execution-detail-title" className="mt-1 text-xl font-semibold text-[color:var(--color-text)]">
                {row.name}
              </h2>
              <p className="text-sm text-[color:var(--color-text)]/65">
                {row.entity} · {row.roles.length ? row.roles.join(", ") : "No role assigned"}
              </p>
            </div>
            <button type="button" className="btn-ghost h-9 px-3 text-xs" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="space-y-6 p-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">Plan</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">{formatCurrency(row.plan)}</div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">Allocated for {row.roles.length || 1} roles</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">Actual</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">{formatCurrency(row.actual)}</div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">
                Remaining {formatCurrency(row.remaining)} · {formatPercent(row.utilization)} used
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Role allocations</h3>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${riskToneClass[row.risk.tone]}`}>
                  {row.risk.label}
                </span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {roleAllocations.length ? (
                  roleAllocations.map((role) => (
                    <div key={role.roleName} className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-[color:var(--color-text)]">{role.roleName}</div>
                        <div className="text-xs text-[color:var(--color-text)]/60">
                          {formatPercentInt(role.share)} share
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-[color:var(--color-text)]">
                          {formatCurrency(role.actual)}
                        </div>
                        <div className="text-xs text-[color:var(--color-text)]/60">
                          Plan {formatCurrency(role.plan)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[color:var(--color-text)]/60">No role allocation data.</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Source mix</h3>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--color-text)]/70">Production</span>
                  <span className="font-semibold text-[color:var(--color-text)]">{formatCurrency(productionSpend)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--color-text)]/70">Workstreams</span>
                  <span className="font-semibold text-[color:var(--color-text)]">{formatCurrency(workstreamSpend)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
                  <div
                    className="h-full bg-[color:var(--color-primary)]"
                    style={{ width: `${Math.round(sourceShare * 100)}%` }}
                  />
                </div>
                <div className="text-xs text-[color:var(--color-text)]/60">
                  Production share {formatPercent(sourceShare)}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Monthly trend</h3>
              <div className="mt-3 h-[140px]">
                {monthlyData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                      <XAxis dataKey="month" tick={false} axisLine={false} tickLine={false} />
                      <YAxis hide domain={[0, "auto"]} />
                      <Tooltip
                        contentStyle={chartTheme.tooltip.contentStyle}
                        itemStyle={chartTheme.tooltip.itemStyle}
                        labelStyle={chartTheme.tooltip.labelStyle}
                        formatter={(value) => formatCurrency(Number(value), true)}
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="var(--chart-1)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-[color:var(--color-text)]/60">No monthly trend available.</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Top workstreams</h3>
              <div className="mt-3 space-y-2 text-sm">
                {workstreams.length ? (
                  workstreams.map((entry) => (
                    <div key={entry.scope} className="flex items-center justify-between gap-3">
                      <span className="text-[color:var(--color-text)]/70">{entry.scope}</span>
                      <span className="font-semibold text-[color:var(--color-text)]">{formatCurrency(entry.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[color:var(--color-text)]/60">No workstream spend recorded.</p>
                )}
              </div>
            </div>
          </section>

          <section className="flex flex-wrap gap-2">
            <a className="btn-ghost h-9 px-3 text-xs" href={`/crm/${clientSlug}/campaigns`}>
              Open Campaign Reporting
            </a>
            <a className="btn-ghost h-9 px-3 text-xs" href={`/crm/${clientSlug}/ticket-reporting`}>
              Open Ticket Reporting
            </a>
            <a className="btn-ghost h-9 px-3 text-xs" href={`/crm/${clientSlug}/manual-efforts`}>
              Open Manual Efforts
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

function WorkstreamDetailDrawer({
  open,
  scope,
  scopeCount,
  total,
  share,
  contributors,
  contributorCount,
  chartData,
  chartSeries,
  onClose,
  onSelectRow,
  formatCurrency,
  formatPercent,
  formatPercentInt,
}: {
  open: boolean;
  scope: string | null;
  scopeCount: number;
  total: number;
  share: number;
  contributors: Array<{ row: TableRow; actual: number; share: number }>;
  contributorCount: number;
  chartData: Array<Record<string, number | string>>;
  chartSeries: Array<{ name: string; dataKey: string; color: string }>;
  onClose: () => void;
  onSelectRow: (row: TableRow) => void;
  formatCurrency: (value: number, detailed?: boolean) => string;
  formatPercent: (value: number) => string;
  formatPercentInt: (value: number) => string;
}) {
  if (!open || !scope) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workstream-detail-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-[color:var(--color-surface)] shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 px-6 py-4 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Workstream details
              </p>
              <h2 id="workstream-detail-title" className="mt-1 text-xl font-semibold text-[color:var(--color-text)]">
                {scope}
              </h2>
              {scope === "Other Streams" ? (
                <p className="text-xs text-[color:var(--color-text)]/60">
                  Includes {scopeCount} workstreams
                </p>
              ) : null}
            </div>
            <button type="button" className="btn-ghost h-9 px-3 text-xs" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="space-y-6 p-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">Spent</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">
                {formatCurrency(total)}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">Share {formatPercent(share)}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Contributors
              </div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">{contributorCount}</div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">Top 10 shown</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Context
              </div>
              <div className="mt-2 text-xs text-[color:var(--color-text)]/70">
                Click a resource to open execution details.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Top contributors</h3>
              <span className="text-xs text-[color:var(--color-text)]/60">{contributors.length} rows</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[540px] w-full text-sm">
                <thead className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                  <tr>
                    <th className="px-2 py-2 text-left">Resource</th>
                    <th className="px-2 py-2 text-left">Entity</th>
                    <th className="px-2 py-2 text-left">Roles</th>
                    <th className="px-2 py-2 text-right">Budget</th>
                    <th className="px-2 py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {contributors.length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-center text-[color:var(--color-text)]/60" colSpan={5}>
                        No contributors found for this workstream.
                      </td>
                    </tr>
                  ) : (
                    contributors.map(({ row, actual, share: rowShare }) => (
                      <tr
                        key={`${row.key}-ws`}
                        className="cursor-pointer hover:bg-[color:var(--color-surface-2)]/50"
                        onClick={() => onSelectRow(row)}
                      >
                        <td className="px-2 py-2 font-semibold">{row.name}</td>
                        <td className="px-2 py-2 text-[color:var(--color-text)]/70">{row.entity}</td>
                        <td className="px-2 py-2 text-[color:var(--color-text)]/70">
                          {row.roles.length ? row.roles.join(", ") : "Unassigned"}
                        </td>
                        <td className="px-2 py-2 text-right">{formatCurrency(actual)}</td>
                        <td className="px-2 py-2 text-right">{formatPercentInt(rowShare)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Monthly trend by contributor</h3>
              <span className="text-xs text-[color:var(--color-text)]/60">Top 10</span>
            </div>
            <div className="mt-3 h-[200px]">
              {chartSeries.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="month" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={chartTheme.tick}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => formatCurrency(Number(value))}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltip.contentStyle}
                      itemStyle={chartTheme.tooltip.itemStyle}
                      labelStyle={chartTheme.tooltip.labelStyle}
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      wrapperStyle={{ fontSize: "10px", lineHeight: "12px" }}
                    />
                    {chartSeries.map((series) => (
                      <Line
                        key={series.dataKey}
                        type="monotone"
                        dataKey={series.dataKey}
                        name={series.name}
                        stroke={series.color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/60">
                  No monthly data for these contributors.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
