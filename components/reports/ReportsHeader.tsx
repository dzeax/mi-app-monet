'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import Link from 'next/link';
import Chip from '@/components/ui/Chip';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import type { GroupBy, Metric, ReportFilters } from '@/types/reports';

type TrendMetric = 'ecpm' | 'turnover' | 'margin' | 'marginPct' | 'vSent';
type TrendGroupBy = 'none' | 'database' | 'partner' | 'geo';

type Props = {
  groupBy: GroupBy;
  metric: Metric;
  topN: number;

  filters: ReportFilters;
  onChangeFilters: (next: ReportFilters) => void;

  onChangeGroupBy: (g: GroupBy) => void;
  onChangeMetric: (m: Metric) => void;
  onChangeTopN: (n: number) => void;

  onQuickLast30?: () => void;
  onExportCsv?: () => void;

  summary?: { filteredCount?: number; groupCount?: number };

  trendMetric: TrendMetric;
  onChangeTrendMetric: (m: TrendMetric) => void;
  trendBy: TrendGroupBy;
  onChangeTrendBy: (b: TrendGroupBy) => void;
  trendTopN: number;
  onChangeTrendTopN: (n: number) => void;
  trendIncludeOthers: boolean;
  onToggleTrendIncludeOthers: (v: boolean) => void;
  trendFocusKey?: string | null;
  trendFocusOptions?: string[];
  onChangeTrendFocus?: (key: string | null) => void;
};

const groupByOptions: { value: GroupBy; label: string }[] = [
  { value: 'database',     label: 'Database' },
  { value: 'partner',      label: 'Partner' },
  { value: 'campaign',     label: 'Campaign' },
  { value: 'advertiser',   label: 'Advertiser' },
  { value: 'theme',        label: 'Theme' },
  { value: 'geo',          label: 'GEO' },
  { value: 'type',         label: 'Type' },
  { value: 'databaseType', label: 'DB Type' },
];

const metrics: Metric[] = ['turnover', 'margin', 'ecpm', 'vSent'];

type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'custom';

type NonCustomPreset = Exclude<DatePreset, 'custom'>;

const DATE_PRESET_OPTIONS: Array<[DatePreset, string]> = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last7', 'Last 7'],
  ['last30', 'Last 30'],
  ['thisWeek', 'This week'],
  ['lastWeek', 'Last week'],
  ['thisMonth', 'This month'],
  ['lastMonth', 'Last month'],
  ['thisQuarter', 'This quarter'],
  ['lastQuarter', 'Last quarter'],
  ['custom', 'Custom'],
];

function fmtLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function startOfWeek(d: Date) {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = (n.getDay() || 7) - 1;
  n.setDate(n.getDate() - w);
  return n;
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d: Date) {
  const start = startOfQuarter(d);
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}
function shiftQuarter(d: Date, delta: number) {
  const start = startOfQuarter(d);
  return new Date(start.getFullYear(), start.getMonth() + delta * 3, 1);
}

function rangeForPreset(p: NonCustomPreset): [string, string] {
  const now = new Date();
  if (p === 'today') {
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const s = fmtLocal(a);
    return [s, s];
  }
  if (p === 'yesterday') {
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const s = fmtLocal(a);
    return [s, s];
  }
  if (p === 'thisWeek') {
    return [fmtLocal(startOfWeek(now)), fmtLocal(endOfWeek(now))];
  }
  if (p === 'lastWeek') {
    const k = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return [fmtLocal(startOfWeek(k)), fmtLocal(endOfWeek(k))];
  }
  if (p === 'thisMonth') {
    return [fmtLocal(startOfMonth(now)), fmtLocal(endOfMonth(now))];
  }
  if (p === 'lastMonth') {
    const k = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return [fmtLocal(startOfMonth(k)), fmtLocal(endOfMonth(k))];
  }
  if (p === 'thisQuarter') {
    return [fmtLocal(startOfQuarter(now)), fmtLocal(endOfQuarter(now))];
  }
  if (p === 'lastQuarter') {
    const ref = shiftQuarter(now, -1);
    return [fmtLocal(startOfQuarter(ref)), fmtLocal(endOfQuarter(ref))];
  }
  if (p === 'last7') {
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return [fmtLocal(a), fmtLocal(b)];
  }
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [fmtLocal(a), fmtLocal(b)];
}

function cloneFilters(input?: ReportFilters | null): ReportFilters {
  if (!input) return {};
  return JSON.parse(JSON.stringify(input)) as ReportFilters;
}

function normalizeFilters(input?: ReportFilters | null): ReportFilters {
  if (!input) return {};
  const next: ReportFilters = {};
  (Object.entries(input) as [keyof ReportFilters, ReportFilters[keyof ReportFilters]][]).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      if (value.length > 0) {
        next[key] = [...value] as ReportFilters[keyof ReportFilters];
      }
      return;
    }
    if (typeof value === 'string') {
      if (value !== '') {
        next[key] = value as ReportFilters[keyof ReportFilters];
      }
      return;
    }
    if (typeof value === 'boolean') {
      if (value) {
        next[key] = value as ReportFilters[keyof ReportFilters];
      }
      return;
    }
    next[key] = value as ReportFilters[keyof ReportFilters];
  });
  return next;
}

function filtersEqual(a?: ReportFilters | null, b?: ReportFilters | null) {
  return JSON.stringify(normalizeFilters(a)) === JSON.stringify(normalizeFilters(b));
}

function mergeDraft(prev: ReportFilters, patch: Partial<ReportFilters>): ReportFilters {
  const next: ReportFilters = { ...prev, ...patch };
  (Object.keys(next) as (keyof ReportFilters)[]).forEach((key) => {
    const value = next[key];
    if (value === undefined || value === null) {
      delete next[key];
      return;
    }
    if (Array.isArray(value) && value.length === 0) {
      delete next[key];
      return;
    }
    if (typeof value === 'string' && value === '') {
      delete next[key];
    }
  });
  return next;
}

export default function ReportsHeader({
  groupBy,
  metric,
  topN,
  filters,
  onChangeFilters,
  onChangeGroupBy,
  onChangeMetric,
  onChangeTopN,
  onQuickLast30,
  onExportCsv,
  summary,
  trendMetric,
  onChangeTrendMetric,
  trendBy,
  onChangeTrendBy,
  trendTopN,
  onChangeTrendTopN,
  trendIncludeOthers,
  onToggleTrendIncludeOthers,
  trendFocusKey,
  trendFocusOptions,
  onChangeTrendFocus,
}: Props) {
  const { PARTNERS, DATABASES, THEMES, TYPES } = useCatalogOverrides();

  const geoOptions = useMemo(() => {
    const set = new Set<string>();
    DATABASES.forEach((d) => d.geo && set.add((d.geo || '').toUpperCase()));
    return Array.from(set).sort();
  }, [DATABASES]);

  const databaseOptions = useMemo(() => {
    const set = new Set<string>();
    DATABASES.forEach((d) => {
      const name = (d.name || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [DATABASES]);

  const partnerOptions = useMemo(
    () => PARTNERS.map((p) => ({ id: p.id, name: p.name, isInternal: !!p.isInternal })),
    [PARTNERS],
  );
  const themeOptions = useMemo(() => THEMES, [THEMES]);
  const typeOptions = useMemo(() => TYPES, [TYPES]);
  const dbTypeOptions = ['B2C', 'B2B', 'Mixed'] as const;

  const s = summary || {};

  const [draft, setDraft] = useState<ReportFilters>(() => cloneFilters(filters));

  useEffect(() => {
    setDraft(cloneFilters(filters));
  }, [filters]);

  const updateDraft = (patch: Partial<ReportFilters>) => {
    setDraft((prev) => mergeDraft(prev, patch));
  };

  const startDate = draft.from || '';
  const endDate = draft.to || '';
  const hasRange = !!(startDate && endDate);

  const [activePreset, setActivePreset] = useState<DatePreset>('custom');

  useEffect(() => {
    if (!hasRange) {
      setActivePreset('custom');
      return;
    }
    for (const [key] of DATE_PRESET_OPTIONS) {
      if (key === 'custom') continue;
      const [sRange, eRange] = rangeForPreset(key as NonCustomPreset);
      if (sRange === startDate && eRange === endDate) {
        setActivePreset(key);
        return;
      }
    }
    setActivePreset('custom');
  }, [startDate, endDate, hasRange]);

  const startRef: RefObject<HTMLInputElement> = useRef(null);
  const endRef: RefObject<HTMLInputElement> = useRef(null);

  const openPicker = (ref: RefObject<HTMLInputElement>) => {
    const el = ref.current;
    if (!el) return;
    if (typeof (el as unknown as { showPicker?: () => void }).showPicker === 'function') {
      (el as unknown as { showPicker: () => void }).showPicker();
    } else {
      el.focus();
    }
  };

  const choosePreset = (preset: DatePreset) => {
    if (preset === 'custom') {
      setActivePreset('custom');
      return;
    }
    const [from, to] = rangeForPreset(preset as NonCustomPreset);
    setActivePreset(preset);
    updateDraft({ from, to });
    if (preset === 'last30') {
      onQuickLast30?.();
    }
  };

  const toggleOnlyInternal = () => {
    const next = !draft.onlyInternalPartners;
    updateDraft({ onlyInternalPartners: next ? true : undefined });
  };

  const handleApply = () => {
    onChangeFilters(normalizeFilters(draft));
  };

  const handleClear = () => {
    setActivePreset('custom');
    setDraft({});
    onChangeFilters({});
  };

  const handleResetDraft = () => {
    setDraft(cloneFilters(filters));
  };

  const isDirty = useMemo(() => !filtersEqual(filters, draft), [filters, draft]);

  const focusOptions = trendFocusOptions ?? [];
  const focusEnabled = trendBy !== 'none' && !!onChangeTrendFocus;
  const hasFocus = focusEnabled && !!trendFocusKey;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="muted">
            {groupByLabel(groupBy)} performance -{' '}
            <span className="opacity-80">
              {s.filteredCount != null ? `${s.filteredCount} rows` : ''}
              {s.filteredCount != null && s.groupCount != null ? ' · ' : ''}
              {s.groupCount != null ? `${s.groupCount} groups` : ''}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onExportCsv && (
            <button className="btn-ghost" onClick={onExportCsv} type="button">
              Export CSV
            </button>
          )}
          <Link href="/" className="btn-ghost">
            ← Back to campaigns
          </Link>
        </div>
      </div>

      <div className="filters-stack">
        <div className="grid gap-3 md:grid-cols-12 items-end">
          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">Group by</span>
              <select
                className="input"
                value={groupBy}
                onChange={(e) => onChangeGroupBy(e.target.value as GroupBy)}
              >
                {groupByOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="md:col-span-8">
            <span className="muted text-sm mb-1 inline-block">Ranking metric</span>
            <div className="flex gap-1 flex-wrap">
              {metrics.map((m) => (
                <Chip key={m} active={metric === m} onClick={() => onChangeMetric(m)} title={`Rank by ${m}`}>
                  {m === 'turnover' ? 'Turnover' : m === 'margin' ? 'Margin' : m === 'ecpm' ? 'eCPM' : 'V Sent'}
                </Chip>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">Top N (ranking)</span>
              <input
                type="number"
                className="input"
                min={1}
                max={50}
                value={topN}
                onChange={(e) =>
                  onChangeTopN(Math.max(1, Math.min(50, Number(e.target.value || 1))))
                }
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {DATE_PRESET_OPTIONS.map(([key, label]) => (
            <Chip
              key={key}
              active={activePreset === key}
              onClick={() => choosePreset(key)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <div className="relative">
            <input
              ref={startRef}
              type="date"
              value={startDate}
              onChange={(e) => updateDraft({ from: e.target.value || undefined })}
              className="input input-date w-40 pr-9"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-2 rounded-r-lg hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Open start date picker"
              onClick={() => openPicker(startRef)}
            >
              📅
            </button>
          </div>

          <div className="relative">
            <input
              ref={endRef}
              type="date"
              value={endDate}
              onChange={(e) => updateDraft({ to: e.target.value || undefined })}
              className="input input-date w-40 pr-9"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-2 rounded-r-lg hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Open end date picker"
              onClick={() => openPicker(endRef)}
            >
              📅
            </button>
          </div>

          <div className="flex-1" />

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[--color-primary]"
              checked={!!draft.onlyInternalPartners}
              onChange={toggleOnlyInternal}
            />
            <span className="muted">Only internal</span>
          </label>

          <button
            className="btn-primary"
            type="button"
            onClick={handleApply}
            disabled={!isDirty}
            title={isDirty ? 'Apply filters' : 'No pending changes'}
          >
            Apply
          </button>

          <button
            className="btn-ghost"
            type="button"
            onClick={handleResetDraft}
            disabled={!isDirty}
          >
            Reset
          </button>

          <button className="btn-ghost" type="button" onClick={handleClear}>
            Clear
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm grid gap-1">
            <span className="muted">GEO</span>
            <select
              className="input"
              value={draft.geos?.[0] ?? ''}
              onChange={(e) => updateDraft({ geos: e.target.value ? [e.target.value] : undefined })}
            >
              <option value="">All</option>
              {geoOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm grid gap-1">
            <span className="muted">Partner</span>
            <select
              className="input"
              value={draft.partners?.[0] ?? ''}
              onChange={(e) => updateDraft({ partners: e.target.value ? [e.target.value] : undefined })}
            >
              <option value="">All</option>
              {partnerOptions.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                  {p.isInternal ? ' · INT' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm grid gap-1">
            <span className="muted">Database</span>
            <select
              className="input"
              value={draft.databases?.[0] ?? ''}
              onChange={(e) => updateDraft({ databases: e.target.value ? [e.target.value] : undefined })}
            >
              <option value="">All</option>
              {databaseOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm grid gap-1">
            <span className="muted">Theme</span>
            <select
              className="input"
              value={draft.themes?.[0] ?? ''}
              onChange={(e) => updateDraft({ themes: e.target.value ? [e.target.value] : undefined })}
            >
              <option value="">All</option>
              {themeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm grid gap-1">
            <span className="muted">Type</span>
            <select
              className="input"
              value={draft.types?.[0] ?? ''}
              onChange={(e) =>
                updateDraft({ types: e.target.value ? [e.target.value as (typeof typeOptions)[number]] : undefined })
              }
            >
              <option value="">All</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm grid gap-1">
            <span className="muted">DB Type</span>
            <select
              className="input"
              value={draft.databaseTypes?.[0] ?? ''}
              onChange={(e) =>
                updateDraft({
                  databaseTypes: e.target.value
                    ? [e.target.value as (typeof dbTypeOptions)[number]]
                    : undefined,
                })
              }
            >
              <option value="">All</option>
              {dbTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pt-4 mt-2 border-t border-[color-mix(in_oklab,var(--color-border)_80%,transparent)]">
          <div className="text-sm font-medium mb-3">Time series controls</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm grid gap-1">
              <span className="muted">Metric</span>
              <select
                className="input"
                value={trendMetric}
                onChange={(e) => onChangeTrendMetric(e.target.value as TrendMetric)}
              >
                <option value="turnover">Turnover</option>
                <option value="margin">Margin</option>
                <option value="marginPct">Margin %</option>
                <option value="ecpm">eCPM</option>
                <option value="vSent">V Sent</option>
              </select>
            </label>

            <label className="text-sm grid gap-1">
              <span className="muted">Group lines by</span>
              <select
                className="input"
                value={trendBy}
                onChange={(e) => onChangeTrendBy(e.target.value as TrendGroupBy)}
              >
                <option value="none">Total</option>
                <option value="database">Database</option>
                <option value="partner">Partner</option>
                <option value="geo">GEO</option>
              </select>
            </label>

            <label className="text-sm grid gap-1">
              <span className="muted">Focus</span>
              <select
                className="input"
                value={trendFocusKey ?? ''}
                onChange={(e) => onChangeTrendFocus?.(e.target.value ? e.target.value : null)}
                disabled={!focusEnabled}
              >
                <option value="">All</option>
                {focusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm grid gap-1">
              <span className="muted">Top N</span>
              <input
                type="number"
                className="input"
                min={1}
                max={20}
                value={trendTopN}
                onChange={(e) =>
                  onChangeTrendTopN(Math.max(1, Math.min(20, Number(e.target.value || 1))))
                }
                disabled={trendBy === 'none' || hasFocus}
                title={hasFocus ? 'Disabled when Focus is active' : undefined}
              />
            </label>

            <label
              className={`text-sm inline-flex items-center gap-2 ${
                trendBy === 'none' || hasFocus ? 'opacity-50' : ''
              }`}
              title={hasFocus ? 'Disabled when Focus is active' : undefined}
            >
              <input
                type="checkbox"
                className="accent-[--color-primary]"
                checked={trendIncludeOthers}
                onChange={(e) => onToggleTrendIncludeOthers(e.target.checked)}
                disabled={trendBy === 'none' || hasFocus}
              />
              <span className="muted">Include &quot;Others&quot;</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function groupByLabel(g: GroupBy) {
  return groupByOptions.find((o) => o.value === g)?.label ?? 'Group';
}
