"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Calendar, FileDown, RefreshCw, Search, Upload } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";
import MiniModal from "@/components/ui/MiniModal";
import { useAuth } from "@/context/AuthContext";
import { showError, showSuccess } from "@/utils/toast";

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

type HeatmapSection = {
  id: string;
  unit_id: string;
  section_key: string;
  section_type: string | null;
  section_position: string | null;
  visual_click_rate: number | null;
  cta_click_rate: number | null;
  click_alerts: string | null;
  updated_at: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "n/a";
  const parts = value.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
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

const datasetLabel = {
  "global-kpis": "Global KPIs",
  "heatmap-requests": "Heatmap Requests",
  "section-kpis": "Section KPIs",
} as const;

type ImportDataset = keyof typeof datasetLabel;

export default function CrmNewsletterInsightsView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const { isAdmin } = useAuth();

  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [coverageFilter, setCoverageFilter] = useState<"all" | "missing_tracking" | "missing_kpi" | "missing_heatmap" | "ready">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [importingDataset, setImportingDataset] = useState<ImportDataset | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<InsightRow | null>(null);
  const [sections, setSections] = useState<HeatmapSection[]>([]);

  const fileInputs: Record<ImportDataset, React.RefObject<HTMLInputElement | null>> = {
    "global-kpis": useRef<HTMLInputElement | null>(null),
    "heatmap-requests": useRef<HTMLInputElement | null>(null),
    "section-kpis": useRef<HTMLInputElement | null>(null),
  };

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
        if (active) setError(err instanceof Error ? err.message : "Unable to load newsletter insights");
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

  const openSections = async (row: InsightRow) => {
    setSelectedRow(row);
    setSectionsOpen(true);
    setSectionsLoading(true);
    setSectionsError(null);
    setSections([]);
    try {
      const params = new URLSearchParams({ client: clientSlug, unitId: row.id });
      const res = await fetch(`/api/crm/newsletter-insights?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed to load sections (${res.status})`);
      setSections(Array.isArray(body?.sections) ? (body.sections as HeatmapSection[]) : []);
    } catch (err) {
      setSectionsError(err instanceof Error ? err.message : "Unable to load section data");
    } finally {
      setSectionsLoading(false);
    }
  };

  const handleDatasetImport = async (dataset: ImportDataset, file: File) => {
    setImportingDataset(dataset);
    try {
      const text = await file.text();
      const res = await fetch(
        `/api/crm/newsletter-insights?client=${encodeURIComponent(clientSlug)}&dataset=${encodeURIComponent(dataset)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "text/csv" },
          body: text,
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Import failed (${res.status})`);
      const imported = Number(body?.imported ?? 0);
      const skipped = Number(body?.skipped ?? 0);
      const warnings = Array.isArray(body?.warnings) ? body.warnings : [];
      showSuccess(
        `${datasetLabel[dataset]} imported: ${imported.toLocaleString("es-ES")} row(s). Skipped: ${skipped.toLocaleString("es-ES")}.`,
      );
      if (warnings.length > 0) {
        console.warn("[newsletter-insights] import warnings", warnings.slice(0, 20));
      }
      setRefreshTick((prev) => prev + 1);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to import CSV");
    } finally {
      setImportingDataset(null);
      const ref = fileInputs[dataset];
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(16,185,129,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(14,165,233,0.14),transparent_55%)]" />
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
                Newsletter Insights - {clientSlug.toUpperCase()}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Campaign units from CRM Campaign Reporting with optional SFMC KPI and heatmap layers.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
              <button
                className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                type="button"
                onClick={() => setRefreshTick((prev) => prev + 1)}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
                Refresh
              </button>
              {isAdmin ? (
                <>
                  {(Object.keys(datasetLabel) as ImportDataset[]).map((dataset) => (
                    <span key={dataset}>
                      <input
                        ref={fileInputs[dataset]}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void handleDatasetImport(dataset, file);
                        }}
                      />
                      <button
                        className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                        type="button"
                        onClick={() => fileInputs[dataset].current?.click()}
                        disabled={importingDataset != null}
                      >
                        <Upload size={14} />
                        {importingDataset === dataset ? "Importing..." : `Import ${datasetLabel[dataset]}`}
                      </button>
                    </span>
                  ))}
                </>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="kpi-frame p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Units</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{totals.total.toLocaleString("es-ES")}</p>
            </div>
            <div className="kpi-frame p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">With Tracking</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{totals.withTracking.toLocaleString("es-ES")}</p>
            </div>
            <div className="kpi-frame p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">With KPIs</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{totals.withKpi.toLocaleString("es-ES")}</p>
            </div>
            <div className="kpi-frame p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">With Heatmap</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{totals.withHeatmap.toLocaleString("es-ES")}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
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
          <DatePicker
            value={dateFrom}
            onChange={(value) => setDateFrom(value)}
            placeholder="From date"
            ariaLabel="From date"
            displayFormat="dd/MM/yyyy"
            buttonClassName="h-9 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm text-[var(--color-text)]"
          />
          <DatePicker
            value={dateTo}
            onChange={(value) => setDateTo(value)}
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
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)]/60 text-left text-[color:var(--color-text)]/80">
              <tr>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 font-semibold min-w-[280px]">Campaign</th>
                <th className="px-3 py-3 font-semibold min-w-[260px]">SFMC tracking</th>
                <th className="px-3 py-3 font-semibold">Market</th>
                <th className="px-3 py-3 font-semibold">Segment</th>
                <th className="px-3 py-3 font-semibold">Touchpoint</th>
                <th className="px-3 py-3 font-semibold">KPI (OR/CTR)</th>
                <th className="px-3 py-3 font-semibold">Heatmap</th>
                <th className="px-3 py-3 font-semibold">Sections</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]/70">
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/65" colSpan={9}>
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/65" colSpan={9}>
                    No units match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const heatmapStatus = row.heatmap?.status || "not_requested";
                  return (
                    <tr key={row.id} className="hover:bg-[color:var(--color-surface-2)]/40">
                      <td className="px-3 py-3">{formatDate(row.sendDate)}</td>
                      <td className="px-3 py-3 max-w-[320px] truncate" title={row.campaignName}>
                        {row.campaignName || "n/a"}
                      </td>
                      <td className="px-3 py-3 max-w-[280px] truncate" title={row.sfmcTracking || undefined}>
                        {row.sfmcTracking || <span className="text-[color:var(--color-text)]/55">missing</span>}
                      </td>
                      <td className="px-3 py-3">{row.market || "n/a"}</td>
                      <td className="px-3 py-3">{row.segment || "n/a"}</td>
                      <td className="px-3 py-3">{row.touchpoint || "n/a"}</td>
                      <td className="px-3 py-3">
                        {row.kpi ? `${formatRate(row.kpi.openRate)} / ${formatRate(row.kpi.ctr)}` : "n/a"}
                      </td>
                      <td className="px-3 py-3">
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
                      </td>
                      <td className="px-3 py-3">
                        {row.heatmap?.sectionCount && row.heatmap.sectionCount > 0 ? (
                          <button
                            className="btn-ghost h-8 px-2 text-xs"
                            type="button"
                            onClick={() => void openSections(row)}
                          >
                            <FileDown size={12} />
                            {formatNumber(row.heatmap.sectionCount)}
                          </button>
                        ) : (
                          <span className="text-[color:var(--color-text)]/55">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-text)]/70">
          <p className="font-semibold text-[var(--color-text)]">CSV import notes</p>
          <p className="mt-1">
            `newsletter-insights` import links rows by `tracking` to `campaign_email_units.sfmc_tracking`.
          </p>
          <p className="mt-1">
            If a tracking is not found on units, the row is skipped and reported in warnings.
          </p>
        </section>
      ) : null}

      {sectionsOpen ? (
        <MiniModal
          title={`Heatmap sections - ${selectedRow?.campaignName || ""}`}
          widthClass="max-w-3xl"
          onClose={() => {
            setSectionsOpen(false);
            setSelectedRow(null);
            setSections([]);
            setSectionsError(null);
          }}
          footer={
            <button className="btn-primary" type="button" onClick={() => setSectionsOpen(false)}>
              Close
            </button>
          }
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs text-[color:var(--color-text)]/75">
              <div className="flex items-center gap-2">
                <Calendar size={14} />
                <span>{formatDate(selectedRow?.sendDate)}</span>
              </div>
              <div className="mt-1 truncate">
                Tracking: {selectedRow?.sfmcTracking || "n/a"}
              </div>
            </div>
            {sectionsError ? (
              <div className="text-sm text-[color:var(--color-accent)]">{sectionsError}</div>
            ) : null}
            {sectionsLoading ? (
              <div className="text-sm text-[color:var(--color-text)]/70">Loading sections...</div>
            ) : sections.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text)]/70">No section rows for this unit.</div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[color:var(--color-surface-2)]/70 text-left text-[color:var(--color-text)]/75">
                    <tr>
                      <th className="px-3 py-2">Section</th>
                      <th className="px-3 py-2">Position</th>
                      <th className="px-3 py-2">Visual rate</th>
                      <th className="px-3 py-2">CTA rate</th>
                      <th className="px-3 py-2">Alerts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-border)]/60">
                    {sections.map((section) => (
                      <tr key={section.id}>
                        <td className="px-3 py-2">{section.section_type || section.section_key || "n/a"}</td>
                        <td className="px-3 py-2">{section.section_position || "n/a"}</td>
                        <td className="px-3 py-2">{formatRate(section.visual_click_rate)}</td>
                        <td className="px-3 py-2">{formatRate(section.cta_click_rate)}</td>
                        <td className="px-3 py-2">{section.click_alerts || "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </MiniModal>
      ) : null}
    </div>
  );
}
