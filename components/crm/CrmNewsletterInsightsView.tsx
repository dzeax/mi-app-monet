"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Link2, List, Map, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";
import ColumnPicker from "@/components/ui/ColumnPicker";

type InsightRow = {
  id: string;
  clientSlug: string;
  campaignName: string;
  sendDate: string | null;
  market: string;
  segment: string | null;
  touchpoint: string | null;
  variant: string;
  owner: string;
  status: string;
  sfmcTracking: string | null;
  hasTracking: boolean;
  kpi: {
    deliveries: number | null;
    openRate: number | null;
    ctr: number | null;
    totalClicks: number | null;
    uniqueClicks: number | null;
    unsubs: number | null;
    revenue: number | null;
    updatedAt: string | null;
  } | null;
  heatmap: {
    status: string;
    requestDate: string | null;
    daysSinceSent: number | null;
    summaryVisualClickRate: number | null;
    summaryCtaClickRate: number | null;
    clickAlerts: string | null;
    updatedAt: string | null;
    sectionCount: number;
  } | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "n/a";
  const parts = value.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
};

const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatRate = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const pct = value * 100;
  return `${pct.toLocaleString("es-ES", { maximumFractionDigits: 2 })}%`;
};

const formatNumber = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("es-ES");
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
};

const formatUnsubRate = (
  unsubs: number | null | undefined,
  deliveries: number | null | undefined,
) => {
  if (unsubs == null || !Number.isFinite(unsubs)) return "n/a";
  if (unsubs <= 1) return formatRate(unsubs);
  if (deliveries != null && Number.isFinite(deliveries) && deliveries > 0) {
    return formatRate(unsubs / deliveries);
  }
  return "n/a";
};

type ColumnId =
  | "date"
  | "campaign"
  | "sfmcTracking"
  | "market"
  | "segment"
  | "touchpoint"
  | "deliveries"
  | "openRate"
  | "ctr"
  | "totalClicks"
  | "uniqueClicks"
  | "unsubRate"
  | "revenue"
  | "heatmap";

const COLUMN_VIS_STORAGE_KEY = "crm_newsletter_insights_colvis_v1";

const COLUMN_OPTIONS: Array<{ id: ColumnId; label: string; minWidth: number }> = [
  { id: "date", label: "Date", minWidth: 112 },
  { id: "campaign", label: "Campaign", minWidth: 240 },
  { id: "sfmcTracking", label: "SFMC tracking", minWidth: 190 },
  { id: "market", label: "Market", minWidth: 76 },
  { id: "segment", label: "Segment", minWidth: 120 },
  { id: "touchpoint", label: "Touchpoint", minWidth: 110 },
  { id: "deliveries", label: "Deliveries", minWidth: 95 },
  { id: "openRate", label: "Open Rate", minWidth: 95 },
  { id: "ctr", label: "CTR", minWidth: 72 },
  { id: "totalClicks", label: "Total Clicks", minWidth: 95 },
  { id: "uniqueClicks", label: "Unique Clicks", minWidth: 105 },
  { id: "unsubRate", label: "Unsub Rate", minWidth: 95 },
  { id: "revenue", label: "Revenue", minWidth: 105 },
  { id: "heatmap", label: "Heatmap", minWidth: 108 },
];

const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = COLUMN_OPTIONS.map((column) => column.id);

export default function CrmNewsletterInsightsView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const today = new Date();
  const startOfThisMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const endOfThisMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [coverageFilter, setCoverageFilter] = useState<"all" | "missing_tracking" | "missing_kpi" | "missing_heatmap" | "ready">("all");
  const [dateFrom, setDateFrom] = useState(startOfThisMonth);
  const [dateTo, setDateTo] = useState(endOfThisMonth);
  const [datePreset, setDatePreset] = useState<
    "this-week" | "last-week" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "last-year" | "all-time" | ""
  >("this-month");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_COLUMNS));
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollInnerRef = useRef<HTMLDivElement | null>(null);
  const syncLockRef = useRef(false);

  const applyDatePreset = useCallback((preset: typeof datePreset) => {
    const now = new Date();
    const startOfWeek = (offsetWeeks: number) => {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offsetWeeks * 7;
      d.setDate(diff);
      return d;
    };
    const startOfMonth = (offsetMonths: number) =>
      new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
    const endOfMonth = (offsetMonths: number) =>
      new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
    const startOfQuarter = (offsetQuarters: number) => {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const qStartMonth = (currentQuarter + offsetQuarters) * 3;
      const year = now.getFullYear() + Math.floor(qStartMonth / 12);
      const month = ((qStartMonth % 12) + 12) % 12;
      return new Date(year, month, 1);
    };
    const endOfQuarter = (offsetQuarters: number) => {
      const start = startOfQuarter(offsetQuarters);
      return new Date(start.getFullYear(), start.getMonth() + 3, 0);
    };
    const startOfYear = (offsetYears: number) => new Date(now.getFullYear() + offsetYears, 0, 1);
    const endOfYear = (offsetYears: number) => new Date(now.getFullYear() + offsetYears, 11, 31);

    let from = "";
    let to = "";

    switch (preset) {
      case "this-week": {
        const start = startOfWeek(0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        from = formatLocalDate(start);
        to = formatLocalDate(end);
        break;
      }
      case "last-week": {
        const start = startOfWeek(-1);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        from = formatLocalDate(start);
        to = formatLocalDate(end);
        break;
      }
      case "this-month":
        from = formatLocalDate(startOfMonth(0));
        to = formatLocalDate(endOfMonth(0));
        break;
      case "last-month":
        from = formatLocalDate(startOfMonth(-1));
        to = formatLocalDate(endOfMonth(-1));
        break;
      case "this-quarter":
        from = formatLocalDate(startOfQuarter(0));
        to = formatLocalDate(endOfQuarter(0));
        break;
      case "last-quarter":
        from = formatLocalDate(startOfQuarter(-1));
        to = formatLocalDate(endOfQuarter(-1));
        break;
      case "this-year":
        from = formatLocalDate(startOfYear(0));
        to = formatLocalDate(endOfYear(0));
        break;
      case "last-year":
        from = formatLocalDate(startOfYear(-1));
        to = formatLocalDate(endOfYear(-1));
        break;
      case "all-time":
        from = "";
        to = "";
        break;
      default:
        setDatePreset(preset);
        return;
    }

    setDateFrom(from);
    setDateTo(to);
    setDatePreset(preset);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ client: clientSlug });
        if (dateFrom) params.append("from", dateFrom);
        if (dateTo) params.append("to", dateTo);
        const res = await fetch(`/api/crm/newsletter-insights?${params.toString()}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Failed to load (${res.status})`);
        const list = Array.isArray(body?.rows) ? (body.rows as InsightRow[]) : [];
        if (active) setRows(list);
      } catch (err) {
        console.error("[newsletter-insights] load failed", {
          clientSlug,
          dateFrom,
          dateTo,
          error: err,
        });
        if (active) {
          const message = err instanceof Error ? err.message : "Unable to load newsletter insights";
          setError(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [clientSlug, dateFrom, dateTo, refreshTick]);

  const markets = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.market).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (marketFilter && row.market !== marketFilter) return false;
      if (coverageFilter === "missing_tracking" && row.hasTracking) return false;
      if (coverageFilter === "missing_kpi" && row.kpi) return false;
      if (coverageFilter === "missing_heatmap" && row.heatmap) return false;
      if (coverageFilter === "ready" && !(row.hasTracking && row.kpi && row.heatmap)) return false;
      if (!term) return true;
      const haystack = [
        row.campaignName,
        row.sfmcTracking ?? "",
        row.market,
        row.segment ?? "",
        row.touchpoint ?? "",
        row.variant,
        row.owner,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, marketFilter, coverageFilter]);

  const totals = useMemo(() => {
    const total = rows.length;
    const withTracking = rows.filter((row) => row.hasTracking).length;
    const withKpi = rows.filter((row) => Boolean(row.kpi)).length;
    const withHeatmap = rows.filter((row) => Boolean(row.heatmap)).length;
    return { total, withTracking, withKpi, withHeatmap };
  }, [rows]);

  const defaultVisibleSet = useMemo(() => new Set(DEFAULT_VISIBLE_COLUMNS), []);
  const visibleColumns = useMemo(
    () => COLUMN_OPTIONS.filter((column) => visibleCols.has(column.id)),
    [visibleCols],
  );
  const columnCount = Math.max(visibleColumns.length, 1);
  const tableMinWidth = useMemo(
    () => visibleColumns.reduce((sum, column) => sum + column.minWidth, 0),
    [visibleColumns],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(COLUMN_VIS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed.filter(
        (id): id is string => typeof id === "string" && defaultVisibleSet.has(id as ColumnId),
      );
      if (normalized.length > 0) {
        setVisibleCols(new Set(normalized));
      }
    } catch {
      // Keep defaults when localStorage payload is invalid.
    }
  }, [defaultVisibleSet]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLUMN_VIS_STORAGE_KEY, JSON.stringify(Array.from(visibleCols)));
  }, [visibleCols]);

  const syncHorizontalMetrics = useCallback(() => {
    const tableScroll = tableScrollRef.current;
    if (!tableScroll) return;
    const tableEl = tableScroll.querySelector("table");
    if (!tableEl) return;
    const scrollWidth = tableEl.scrollWidth;
    const hasOverflow = scrollWidth > tableScroll.clientWidth + 2;
    setShowTopScrollbar(hasOverflow);
    const topInner = topScrollInnerRef.current;
    if (topInner) {
      topInner.style.width = `${scrollWidth}px`;
    }
  }, []);

  useEffect(() => {
    syncHorizontalMetrics();
  }, [syncHorizontalMetrics, visibleColumns, filtered.length, loading, showTopScrollbar]);

  useEffect(() => {
    window.addEventListener("resize", syncHorizontalMetrics);
    return () => window.removeEventListener("resize", syncHorizontalMetrics);
  }, [syncHorizontalMetrics]);

  useEffect(() => {
    const topScroll = topScrollRef.current;
    const tableScroll = tableScrollRef.current;
    if (!topScroll || !tableScroll) return;

    const syncFromTop = () => {
      if (syncLockRef.current) return;
      syncLockRef.current = true;
      tableScroll.scrollLeft = topScroll.scrollLeft;
      requestAnimationFrame(() => {
        syncLockRef.current = false;
      });
    };

    const syncFromTable = () => {
      if (syncLockRef.current) return;
      syncLockRef.current = true;
      topScroll.scrollLeft = tableScroll.scrollLeft;
      requestAnimationFrame(() => {
        syncLockRef.current = false;
      });
    };

    topScroll.addEventListener("scroll", syncFromTop, { passive: true });
    tableScroll.addEventListener("scroll", syncFromTable, { passive: true });

    return () => {
      topScroll.removeEventListener("scroll", syncFromTop);
      tableScroll.removeEventListener("scroll", syncFromTable);
    };
  }, [showTopScrollbar]);

  useEffect(() => {
    setPage(0);
  }, [search, marketFilter, coverageFilter, dateFrom, dateTo]);

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(filtered.length / pageSize) - 1, 0);
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page, pageSize]);

  const pagedRows = useMemo(() => {
    if (filtered.length <= pageSize) return filtered;
    const start = Math.min(page * pageSize, Math.max(filtered.length - 1, 0));
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const startIdx = filtered.length === 0 ? 0 : page * pageSize + 1;
  const endIdx = Math.min(filtered.length, (page + 1) * pageSize);
  const headerKpis = useMemo(
    () => [
      {
        label: "Total Units",
        primary: totals.total.toLocaleString("es-ES"),
        icon: List,
        valueClassName: "tabular-nums",
      },
      {
        label: "With Tracking",
        primary: totals.withTracking.toLocaleString("es-ES"),
        icon: Link2,
        valueClassName: "tabular-nums",
      },
      {
        label: "With KPIs",
        primary: totals.withKpi.toLocaleString("es-ES"),
        icon: BarChart3,
        valueClassName: "tabular-nums",
      },
      {
        label: "With Heatmap",
        primary: totals.withHeatmap.toLocaleString("es-ES"),
        icon: Map,
        valueClassName: "tabular-nums",
      },
    ],
    [totals],
  );

  const renderCell = useCallback((columnId: ColumnId, row: InsightRow) => {
    const heatmapStatus = row.heatmap?.status || "not_requested";
    switch (columnId) {
      case "date":
        return <span className="whitespace-nowrap">{formatDate(row.sendDate)}</span>;
      case "campaign":
        return (
          <span className="block truncate" title={row.campaignName || undefined}>
            {row.campaignName || "n/a"}
          </span>
        );
      case "sfmcTracking":
        return row.sfmcTracking ? (
          <span className="block truncate" title={row.sfmcTracking}>
            {row.sfmcTracking}
          </span>
        ) : (
          <span className="text-[color:var(--color-text)]/55">missing</span>
        );
      case "market":
        return row.market || "n/a";
      case "segment":
        return (
          <span className="block truncate" title={row.segment || undefined}>
            {row.segment || "n/a"}
          </span>
        );
      case "touchpoint":
        return (
          <span className="block truncate" title={row.touchpoint || undefined}>
            {row.touchpoint || "n/a"}
          </span>
        );
      case "deliveries":
        return formatNumber(row.kpi?.deliveries);
      case "openRate":
        return formatRate(row.kpi?.openRate);
      case "ctr":
        return formatRate(row.kpi?.ctr);
      case "totalClicks":
        return formatNumber(row.kpi?.totalClicks);
      case "uniqueClicks":
        return formatNumber(row.kpi?.uniqueClicks);
      case "unsubRate":
        return formatUnsubRate(row.kpi?.unsubs, row.kpi?.deliveries);
      case "revenue":
        return formatCurrency(row.kpi?.revenue);
      case "heatmap":
        return (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
              heatmapStatus === "completed"
                ? "bg-emerald-100 text-emerald-800"
                : heatmapStatus === "request_submitted"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
            }`}
          >
            {heatmapStatus}
          </span>
        );
      default:
        return "n/a";
    }
  }, []);

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
                Newsletter Insights · {clientSlug.toUpperCase()}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Campaign units from CRM Campaign Reporting with optional SFMC KPI and heatmap layers.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
              <button
                className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                type="button"
                onClick={() => setShowColumnPicker(true)}
              >
                <SlidersHorizontal size={14} />
                Columns
              </button>
              <button
                className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                type="button"
                onClick={() => setRefreshTick((prev) => prev + 1)}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {headerKpis.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="kpi-frame p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)]">
                      <Icon size={24} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
                        {item.label}
                      </p>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <span className={`text-2xl font-bold tracking-tight text-[var(--color-text)] ${item.valueClassName}`}>
                          {item.primary}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text)]/55" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-xl border-none bg-[var(--color-surface-2)]/50 pl-9 pr-3 text-sm text-[var(--color-text)] focus:ring-0"
              placeholder="Search campaign, tracking, market..."
            />
          </div>
          <select
            className="h-9 w-full rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm text-[var(--color-text)]"
            value={marketFilter}
            onChange={(event) => setMarketFilter(event.target.value)}
          >
            <option value="">All markets</option>
            {markets.map((market) => (
              <option key={market} value={market}>
                {market}
              </option>
            ))}
          </select>
          <select
            className="h-9 w-full rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm text-[var(--color-text)]"
            value={coverageFilter}
            onChange={(event) => setCoverageFilter(event.target.value as typeof coverageFilter)}
          >
            <option value="all">All coverage</option>
            <option value="missing_tracking">Missing tracking</option>
            <option value="missing_kpi">Missing KPI</option>
            <option value="missing_heatmap">Missing heatmap</option>
            <option value="ready">Ready (tracking + KPI + heatmap)</option>
          </select>
          <select
            className="h-9 w-full rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm text-[var(--color-text)]"
            value={datePreset}
            onChange={(event) => applyDatePreset(event.target.value as typeof datePreset)}
            aria-label="Date range preset"
          >
            <option value="all-time">All time</option>
            <option value="this-week">This week</option>
            <option value="last-week">Last week</option>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="this-quarter">This quarter</option>
            <option value="last-quarter">Last quarter</option>
            <option value="this-year">This year</option>
            <option value="last-year">Last year</option>
            <option value="">Custom range</option>
          </select>
          <DatePicker
            value={dateFrom}
            onChange={(value) => {
              setDatePreset("");
              setDateFrom(value);
            }}
            placeholder="From date"
            ariaLabel="From date"
            displayFormat="dd/MM/yyyy"
            buttonClassName="h-9 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm text-[var(--color-text)]"
          />
          <DatePicker
            value={dateTo}
            onChange={(value) => {
              setDatePreset("");
              setDateTo(value);
            }}
            placeholder="To date"
            ariaLabel="To date"
            displayFormat="dd/MM/yyyy"
            buttonClassName="h-9 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm text-[var(--color-text)]"
          />
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        {error ? (
          <div className="px-4 py-3 text-sm text-[color:var(--color-accent)]">{error}</div>
        ) : null}
        {showTopScrollbar ? (
          <div className="border-b border-[color:var(--color-border)]/70 bg-[color:var(--color-surface-2)]/40 px-3 py-1.5">
            <div
              ref={topScrollRef}
              className="overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-2"
              aria-label="Horizontal table scrollbar"
            >
              <div ref={topScrollInnerRef} className="h-2" />
            </div>
          </div>
        ) : null}
        <div ref={tableScrollRef} className="overflow-auto">
          <table className="min-w-full w-max text-xs md:text-sm" style={{ minWidth: `${tableMinWidth}px` }}>
            <thead className="bg-[color:var(--color-surface-2)]/60 text-left text-[color:var(--color-text)]/80">
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.id}
                    className="border-l border-[color:var(--color-border)]/45 px-3 py-3 font-semibold first:border-l-0"
                    style={{ minWidth: `${column.minWidth}px` }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]/70">
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/65" colSpan={columnCount}>
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/65" colSpan={columnCount}>
                    No units match the current filters.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-[color:var(--color-surface-2)]/40">
                    {visibleColumns.map((column) => (
                      <td
                        key={`${row.id}-${column.id}`}
                        className="border-l border-[color:var(--color-border)]/30 px-3 py-3 align-top first:border-l-0"
                        style={{ minWidth: `${column.minWidth}px` }}
                      >
                        {renderCell(column.id, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)]/70 px-3 py-3 text-xs text-[color:var(--color-text)]/75">
          <div>
            {filtered.length > 0 ? (
              <span>
                Showing {startIdx.toLocaleString("es-ES")}-{endIdx.toLocaleString("es-ES")} of{" "}
                {filtered.length.toLocaleString("es-ES")} rows
              </span>
            ) : (
              <span>0 rows</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[color:var(--color-text)]/60">Rows per page</label>
            <select
              className="input h-9 w-20"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost h-9 px-2"
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={page === 0}
            >
              Prev
            </button>
            <span className="text-[color:var(--color-text)]/60">
              Page {page + 1} / {totalPages.toLocaleString("es-ES")}
            </span>
            <button
              className="btn-ghost h-9 px-2"
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
              disabled={page + 1 >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showColumnPicker ? (
        <ColumnPicker
          columns={COLUMN_OPTIONS.map((column) => ({ id: column.id, label: column.label }))}
          visible={visibleCols}
          defaults={DEFAULT_VISIBLE_COLUMNS}
          onChange={(next) =>
            setVisibleCols(next.size > 0 ? new Set(next) : new Set([DEFAULT_VISIBLE_COLUMNS[0]]))
          }
          onClose={() => setShowColumnPicker(false)}
        />
      ) : null}

    </div>
  );
}
