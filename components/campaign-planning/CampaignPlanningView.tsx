'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  CampaignPlanningProvider,
  useCampaignPlanning,
} from '@/components/campaign-planning/CampaignPlanningContext';
import CampaignPlanningHeader from '@/components/campaign-planning/CampaignPlanningHeader';
import CampaignPlanningFiltersBar, { type PlanningFilters } from '@/components/campaign-planning/CampaignPlanningFiltersBar';
import CampaignPlanningCalendar from '@/components/campaign-planning/CampaignPlanningCalendar';
import CampaignPlanningDrawer from '@/components/campaign-planning/CampaignPlanningDrawer';
import PlanningReportingDock from '@/components/campaign-planning/PlanningReportingDock';
import ReportingFiltersPanel, { REPORTING_DATE_PRESETS } from '@/components/campaign-planning/ReportingFiltersPanel';
import type { CampaignStatus, PlanningDraft, PlanningItem } from '@/components/campaign-planning/types';
import { CAMPAIGN_STATUSES } from '@/components/campaign-planning/types';
import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks } from 'date-fns';
import { showError, showSuccess } from '@/utils/toast';
import type { CampaignRow } from '@/types/campaign';
import { useCampaignData } from '@/context/CampaignDataContext';
import {
  useCampaignFilterEngine,
  defaultFilters as REPORTING_DEFAULT_FILTERS,
  type Filters as ReportingFilters,
} from '@/hooks/useCampaignFilterEngine';

const STORAGE_KEY = 'campaign-planning/preferences';
const REPORTING_FILTERS_KEY = 'campaign-planning/reporting-filters';

function clampDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function rangeForPreset(presetId: string): [string, string] | null {
  const now = clampDate(new Date());
  switch (presetId) {
    case 'today': {
      const s = formatISO(now);
      return [s, s];
    }
    case 'yesterday': {
      const y = clampDate(new Date(now));
      y.setDate(y.getDate() - 1);
      const s = formatISO(y);
      return [s, s];
    }
    case 'last7': {
      const from = clampDate(new Date(now));
      from.setDate(from.getDate() - 6);
      return [formatISO(from), formatISO(now)];
    }
    case 'last30': {
      const from = clampDate(new Date(now));
      from.setDate(from.getDate() - 29);
      return [formatISO(from), formatISO(now)];
    }
    case 'thisWeek': {
      const start = clampDate(new Date(now));
      const offset = start.getDay() === 0 ? 6 : start.getDay() - 1;
      start.setDate(start.getDate() - offset);
      const end = clampDate(new Date(start));
      end.setDate(start.getDate() + 6);
      return [formatISO(start), formatISO(end)];
    }
    case 'lastWeek': {
      const ref = clampDate(new Date(now));
      ref.setDate(ref.getDate() - 7);
      const offset = ref.getDay() === 0 ? 6 : ref.getDay() - 1;
      const start = clampDate(new Date(ref));
      start.setDate(start.getDate() - offset);
      const end = clampDate(new Date(start));
      end.setDate(start.getDate() + 6);
      return [formatISO(start), formatISO(end)];
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return [formatISO(start), formatISO(end)];
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return [formatISO(start), formatISO(end)];
    }
    case 'thisQuarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStart, 1);
      const end = new Date(now.getFullYear(), quarterStart + 3, 0);
      return [formatISO(start), formatISO(end)];
    }
    case 'lastQuarter': {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterStart = currentQuarter === 0 ? 9 : (currentQuarter - 1) * 3;
      const year = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(year, quarterStart, 1);
      const end = new Date(year, quarterStart + 3, 0);
      return [formatISO(start), formatISO(end)];
    }
    default:
      return null;
  }
}

function PlanningViewInner() {
  const planning = useCampaignPlanning();
  const { rows, loading: reportingLoading } = useCampaignData();
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [activeDate, setActiveDate] = useState(new Date());
  const [filters, setFilters] = useState<PlanningFilters>({ statuses: [], databases: [] });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState<string | null>(null);
  const [reportingOpen, setReportingOpen] = useState(false);
  const [drawerSeed, setDrawerSeed] = useState<Partial<PlanningDraft> | null>(null);
  const [reportingHeight, setReportingHeight] = useState(360);
  const [reportingInitialFilters] = useState<Partial<ReportingFilters>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(REPORTING_FILTERS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { filters?: ReportingFilters } | null;
      if (parsed?.filters) return parsed.filters;
      return {};
    } catch {
      return {};
    }
  });
  const {
    filters: reportingFilters,
    updateFilters: updateReportingFilters,
    resetFilters: resetReportingFilters,
    filteredRows,
    totals: reportingTotals,
    pending: reportingPending,
  } = useCampaignFilterEngine(rows, {
    debounceMs: 200,
    initial: { ...REPORTING_DEFAULT_FILTERS, ...reportingInitialFilters },
  });
  const [reportingVisibleCount, setReportingVisibleCount] = useState(40);

  const activeDateIso = useMemo(() => format(activeDate, 'yyyy-MM-dd'), [activeDate]);

  useEffect(() => {
    setReportingVisibleCount(40);
  }, [filteredRows.length, setReportingVisibleCount]);

  const availableFilters = useMemo(() => {
    const statuses: CampaignStatus[] = CAMPAIGN_STATUSES;
    const databases = Array.from(new Set(planning.items.map((item) => item.database))).sort();
    return { statuses, databases };
  }, [planning.items]);

  const reportingRows = useMemo(
    () => filteredRows.slice(0, reportingVisibleCount),
    [filteredRows, reportingVisibleCount],
  );
  const reportingHasMore = filteredRows.length > reportingRows.length;
  const reportingMarginPct =
    reportingTotals.turnover > 0 ? (reportingTotals.margin / reportingTotals.turnover) * 100 : 0;

  const partnerOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.partner) set.add(row.partner);
    });
    return Array.from(set).sort();
  }, [rows]);

  const databaseOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.database) set.add(row.database);
    });
    return Array.from(set).sort();
  }, [rows]);

  const geoOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.geo) set.add(row.geo);
    });
    return Array.from(set).sort();
  }, [rows]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.type) set.add(row.type);
    });
    return Array.from(set).sort();
  }, [rows]);

  const filteredItems = useMemo(() => {
    return planning.items.filter((item) => {
      if (filters.statuses.length && !filters.statuses.includes(item.status)) return false;
      if (filters.databases.length && !filters.databases.includes(item.database)) return false;
      return true;
    });
  }, [planning.items, filters]);

  const selectedItem: PlanningItem | null = useMemo(() => {
    if (!selectedId) return null;
    return planning.items.find((item) => item.id === selectedId) ?? null;
  }, [planning.items, selectedId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        viewMode?: string;
        activeDate?: string;
        filters?: PlanningFilters;
        reportingOpen?: boolean;
        reportingHeight?: number;
      } | null;
      if (parsed?.viewMode && ['day', 'week', 'month'].includes(parsed.viewMode)) {
        setViewMode(parsed.viewMode as 'day' | 'week' | 'month');
      }
      if (parsed?.activeDate) {
        const nextDate = new Date(parsed.activeDate);
        if (!Number.isNaN(nextDate.getTime())) {
          setActiveDate(nextDate);
        }
      }
      if (parsed?.filters) {
        setFilters({
          statuses: Array.isArray(parsed.filters.statuses) ? parsed.filters.statuses : [],
          databases: Array.isArray(parsed.filters.databases) ? parsed.filters.databases : [],
        });
      }
      if (typeof parsed?.reportingOpen === 'boolean') {
        setReportingOpen(parsed.reportingOpen);
      }
      if (typeof parsed?.reportingHeight === 'number' && Number.isFinite(parsed.reportingHeight)) {
        setReportingHeight(parsed.reportingHeight);
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      viewMode,
      activeDate: format(activeDate, 'yyyy-MM-dd'),
      filters,
      reportingOpen,
      reportingHeight,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [viewMode, activeDate, filters, reportingOpen, reportingHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(REPORTING_FILTERS_KEY, JSON.stringify({ filters: reportingFilters }));
    } catch {
      // ignore
    }
  }, [reportingFilters]);

  useEffect(() => {
    if (!filters.databases.length) return;
    if (reportingFilters.databases && reportingFilters.databases.length > 0) return;
    updateReportingFilters({ databases: filters.databases });
  }, [filters.databases, reportingFilters.databases, updateReportingFilters]);

  const handleCreate = () => {
    setSelectedId(null);
    setDrawerMode('create');
    setPlannedDate(activeDateIso);
    setDrawerSeed(null);
    setDrawerOpen(true);
  };

  const handleSelect = (item: PlanningItem) => {
    setSelectedId(item.id);
    setDrawerMode('edit');
    setPlannedDate(null);
    setDrawerSeed(null);
    setDrawerOpen(true);
  };

  const handleDuplicate = async (item: PlanningItem) => {
    try {
      await planning.duplicateItem(item.id);
      showSuccess('Campaign duplicated');
    } catch (err) {
      console.error('Duplicate campaign failed', err);
      showError('Unable to duplicate campaign.');
    }
  };

  const handleDelete = async (item: PlanningItem) => {
    try {
      await planning.removeItem(item.id);
      if (selectedId === item.id) {
        handleCloseDrawer();
      }
      showSuccess('Campaign deleted');
    } catch (err) {
      console.error('Delete campaign failed', err);
      showError('Unable to delete campaign.');
    }
  };

  const handleMove = async (id: string, date: string, duplicate: boolean) => {
    try {
      if (duplicate) {
        await planning.duplicateItem(id, date);
        showSuccess('Campaign duplicated to new day');
      } else {
        await planning.updateItem(id, { date });
        showSuccess('Campaign moved');
      }
    } catch (err) {
      console.error('Move campaign failed', err);
      showError('Unable to update campaign. Please try again.');
    }
  };

  const navigate = (action: 'prev' | 'next' | 'today') => {
    if (action === 'today') {
      setActiveDate(new Date());
      return;
    }
    setActiveDate((prev) => {
      if (viewMode === 'day') return action === 'prev' ? subDays(prev, 1) : addDays(prev, 1);
      if (viewMode === 'week') return action === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1);
      return action === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1);
    });
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedId(null);
    setPlannedDate(null);
    setDrawerSeed(null);
  };

  const handleQuickCreateAtDate = (date: Date) => {
    setSelectedId(null);
    setDrawerMode('create');
    setPlannedDate(format(date, 'yyyy-MM-dd'));
    setDrawerSeed(null);
    setDrawerOpen(true);
  };

  const handleUseReportingRow = (row: CampaignRow) => {
    setSelectedId(null);
    setDrawerMode('create');
    setDrawerSeed({
      name: row.campaign ?? '',
      partner: row.partner ?? '',
      database: row.database ?? '',
      price: row.price ?? 0,
      type: row.type ?? 'CPL',
    });
    const candidate = row.date ? new Date(row.date) : null;
    const nextDate = candidate && !Number.isNaN(candidate.getTime()) ? format(candidate, 'yyyy-MM-dd') : activeDateIso;
    setPlannedDate(nextDate);
    setDrawerOpen(true);
  };

  const handleToggleReporting = () => {
    setReportingOpen((prev) => !prev);
  };

  const reportingActivePreset = useMemo(() => {
    const [start, end] = reportingFilters.dateRange ?? [null, null];
    if (!start || !end) return null;
    const preset = REPORTING_DATE_PRESETS.find((entry) => {
      const range = rangeForPreset(entry.id);
      return range && range[0] === start && range[1] === end;
    });
    return preset?.id ?? null;
  }, [reportingFilters.dateRange]);

  const handleReportingPreset = (presetId: string) => {
    const range = rangeForPreset(presetId);
    if (!range) return;
    updateReportingFilters({ dateRange: range });
  };

  const handleReportingClearDate = () => {
    updateReportingFilters({ dateRange: undefined });
  };

  const handleReportingReset = () => {
    resetReportingFilters();
    if (filters.databases.length) {
      updateReportingFilters({ databases: filters.databases });
    }
  };

  const handleReportingLoadMore = () => {
    setReportingVisibleCount((prev) => prev + 40);
  };

  const bottomInset = reportingOpen ? reportingHeight + 32 : 24;

  return (
    <div className="space-y-6" style={{ paddingBottom: bottomInset }}>
      <CampaignPlanningHeader
        activeDate={activeDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onNavigate={navigate}
        onCreate={handleCreate}
        reportingOpen={reportingOpen}
        onToggleReporting={handleToggleReporting}
        filtersSlot={
          <CampaignPlanningFiltersBar
            filters={filters}
            onChange={setFilters}
            available={availableFilters}
            className="w-full max-w-6xl"
          />
        }
      />

      {planning.error ? (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 px-4 py-3 text-sm text-[color:var(--color-text)]/75">
          {planning.error}
        </div>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {reportingOpen ? (
          <ReportingFiltersPanel
            filters={reportingFilters}
            updateFilters={updateReportingFilters}
            resetFilters={handleReportingReset}
            partnerOptions={partnerOptions}
            databaseOptions={databaseOptions}
            geoOptions={geoOptions}
            typeOptions={typeOptions}
            activePreset={reportingActivePreset}
            onPresetClick={handleReportingPreset}
            onClearDate={handleReportingClearDate}
          />
        ) : null}

        <div className="relative flex-1">
          {planning.loading ? (
            <div className="absolute inset-0 z-10 rounded-2xl border border-dashed border-[color:var(--color-border)]/70 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-sm text-[color:var(--color-text)]/65">
              <Image
                src="/animations/loadplanning1.gif"
                alt="Loading planning animation"
                width={120}
                height={120}
                className="h-20 w-20 md:h-24 md:w-24"
                priority
              />
              <div className="text-base font-medium tracking-wide text-[color:var(--color-text)]/70">
                Loading planning...
              </div>
            </div>
          ) : null}
          <CampaignPlanningCalendar
            currentDate={activeDate}
            viewMode={viewMode}
            items={filteredItems}
            onSelectItem={handleSelect}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onMove={handleMove}
            onCreateAtDate={handleQuickCreateAtDate}
          />
        </div>
      </div>

      <PlanningReportingDock
        open={reportingOpen}
        onRequestClose={() => setReportingOpen(false)}
        height={reportingHeight}
        minHeight={260}
        maxHeight={720}
        onHeightChange={setReportingHeight}
        loading={reportingLoading}
        pending={reportingPending}
        rows={reportingRows as CampaignRow[]}
        totalRows={filteredRows.length}
        totals={{
          vSent: reportingTotals.vSent,
          qty: reportingTotals.qty,
          turnover: reportingTotals.turnover,
          margin: reportingTotals.margin,
          ecpm: reportingTotals.ecpm,
        }}
        marginPct={reportingMarginPct}
        hasMore={reportingHasMore}
        onLoadMore={handleReportingLoadMore}
        onUseRow={handleUseReportingRow}
      />

      <CampaignPlanningDrawer
        open={drawerOpen}
        mode={drawerMode}
        item={selectedItem}
        context={planning}
        defaultDate={drawerMode === 'create' ? (plannedDate ?? activeDateIso) : undefined}
        seedDraft={drawerSeed ?? undefined}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}

export default function CampaignPlanningView() {
  return (
    <CampaignPlanningProvider>
      <section className="px-3 md:px-4 lg:px-6 py-8">
        <PlanningViewInner />
      </section>
    </CampaignPlanningProvider>
  );
}

