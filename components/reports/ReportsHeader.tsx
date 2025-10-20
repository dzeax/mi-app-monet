'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Chip from '@/components/ui/Chip';
import type { GroupBy, Metric, ReportFilters } from '@/types/reports';

type Props = {
  groupBy: GroupBy;
  metric: Metric;
  topN: number;

  focusKey: string | null;
  focusOptions: string[];

  filters: ReportFilters;
  onChangeFilters: (next: ReportFilters) => void;

  onChangeGroupBy: (g: GroupBy) => void;
  onChangeMetric: (m: Metric) => void;
  onChangeTopN: (n: number) => void;
  onChangeFocus: (key: string | null) => void;

  onQuickLast30?: () => void;
  onExportCsv?: () => void;

  summary?: { filteredCount?: number; groupCount?: number };
};

const groupByOptions: { value: GroupBy; label: string }[] = [
  { value: 'database', label: 'Database' },
  { value: 'partner', label: 'Partner' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'advertiser', label: 'Advertiser' },
  { value: 'theme', label: 'Theme' },
  { value: 'geo', label: 'GEO' },
  { value: 'type', label: 'Type' },
  { value: 'databaseType', label: 'DB Type' },
];

const metricOptions: { value: Metric; label: string }[] = [
  { value: 'turnover', label: 'Turnover' },
  { value: 'margin', label: 'Margin' },
  { value: 'ecpm', label: 'eCPM' },
  { value: 'vSent', label: 'V Sent' },
];

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
  | 'thisYear'
  | 'lastYear'
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
  ['thisYear', 'This year'],
  ['lastYear', 'Last year'],
  ['custom', 'Custom'],
];

function fmtLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() || 7) - 1;
  copy.setDate(copy.getDate() - offset);
  return copy;
}
function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}
function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function startOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}
function endOfQuarter(date: Date) {
  const start = startOfQuarter(date);
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}
function shiftQuarter(date: Date, delta: number) {
  const start = startOfQuarter(date);
  return new Date(start.getFullYear(), start.getMonth() + delta * 3, 1);
}
function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}
function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function rangeForPreset(preset: NonCustomPreset): [string, string] {
  const now = new Date();
  if (preset === 'today') {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const iso = fmtLocal(base);
    return [iso, iso];
  }
  if (preset === 'yesterday') {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const iso = fmtLocal(base);
    return [iso, iso];
  }
  if (preset === 'thisWeek') return [fmtLocal(startOfWeek(now)), fmtLocal(endOfWeek(now))];
  if (preset === 'lastWeek') {
    const reference = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return [fmtLocal(startOfWeek(reference)), fmtLocal(endOfWeek(reference))];
  }
  if (preset === 'thisMonth') return [fmtLocal(startOfMonth(now)), fmtLocal(endOfMonth(now))];
  if (preset === 'lastMonth') {
    const reference = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return [fmtLocal(startOfMonth(reference)), fmtLocal(endOfMonth(reference))];
  }
  if (preset === 'thisQuarter') return [fmtLocal(startOfQuarter(now)), fmtLocal(endOfQuarter(now))];
  if (preset === 'lastQuarter') {
    const reference = shiftQuarter(now, -1);
    return [fmtLocal(startOfQuarter(reference)), fmtLocal(endOfQuarter(reference))];
  }
  if (preset === 'thisYear') return [fmtLocal(startOfYear(now)), fmtLocal(endOfYear(now))];
  if (preset === 'lastYear') {
    const reference = new Date(now.getFullYear() - 1, 6, 1);
    return [fmtLocal(startOfYear(reference)), fmtLocal(endOfYear(reference))];
  }
  if (preset === 'last7') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return [fmtLocal(start), fmtLocal(end)];
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [fmtLocal(start), fmtLocal(end)];
}

function mergeFilters(base: ReportFilters, patch: Partial<ReportFilters>) {
  const next: ReportFilters = { ...base, ...patch };
  (Object.keys(next) as (keyof ReportFilters)[]).forEach((key) => {
    const value = next[key];
    if (value == null) {
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
  focusKey,
  focusOptions,
  filters,
  onChangeFilters,
  onChangeGroupBy,
  onChangeMetric,
  onChangeTopN,
  onChangeFocus,
  onQuickLast30,
  onExportCsv,
  summary,
}: Props) {
  const [draft, setDraft] = useState<ReportFilters>(() => ({ ...filters }));
  const [draftGroupBy, setDraftGroupBy] = useState<GroupBy>(groupBy);
  const [draftMetric, setDraftMetric] = useState<Metric>(metric);
  const [draftTopN, setDraftTopN] = useState<number>(topN);
  const [draftFocus, setDraftFocus] = useState<string | null>(focusKey);

  useEffect(() => setDraft({ ...filters }), [filters]);
  useEffect(() => setDraftGroupBy(groupBy), [groupBy]);
  useEffect(() => setDraftMetric(metric), [metric]);
  useEffect(() => setDraftTopN(topN), [topN]);
  useEffect(() => setDraftFocus(focusKey), [focusKey]);

  const startDate = draft.from ?? '';
  const endDate = draft.to ?? '';
  const hasRange = !!(startDate && endDate);
  const [activePreset, setActivePreset] = useState<DatePreset>('custom');

  useEffect(() => {
    if (!hasRange) {
      setActivePreset('custom');
      return;
    }
    for (const [key] of DATE_PRESET_OPTIONS) {
      if (key === 'custom') continue;
      const [s, e] = rangeForPreset(key as NonCustomPreset);
      if (s === startDate && e === endDate) {
        setActivePreset(key);
        return;
      }
    }
    setActivePreset('custom');
  }, [startDate, endDate, hasRange]);

  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const openPicker = (ref: typeof startRef) => {
    const el = ref.current;
    if (!el) return;
    const picker = (el as unknown as { showPicker?: () => void }).showPicker;
    if (picker) picker.call(el);
    else el.focus();
  };

  const choosePreset = (preset: DatePreset) => {
    if (preset === 'custom') {
      setActivePreset('custom');
      return;
    }
    const [from, to] = rangeForPreset(preset as NonCustomPreset);
    setDraft((prev) => mergeFilters(prev, { from, to }));
    setActivePreset(preset);
    if (preset === 'last30') onQuickLast30?.();
  };

  const handleApply = () => {
    onChangeFilters(mergeFilters(filters, draft));
    onChangeGroupBy(draftGroupBy);
    onChangeMetric(draftMetric);
    onChangeTopN(draftTopN);
    onChangeFocus(draftFocus);
  };

  const handleReset = () => {
    setDraft({ ...filters });
    setDraftGroupBy(groupBy);
    setDraftMetric(metric);
    setDraftTopN(topN);
    setDraftFocus(focusKey);
  };

  useEffect(() => {
    if (focusOptions.length === 0) {
      setDraftFocus(null);
    }
  }, [focusOptions]);

  const focusDisabled = focusOptions.length === 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="muted">
            {groupByLabel(groupBy)} performance ·{' '}
            <span className="opacity-80">
              {summary?.filteredCount != null ? `${summary.filteredCount} rows` : ''}
              {summary?.filteredCount != null && summary?.groupCount != null ? ' · ' : ''}
              {summary?.groupCount != null ? `${summary.groupCount} groups` : ''}
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
          <div className="md:col-span-3">
            <label className="text-sm grid gap-1">
              <span className="muted">Group by</span>
              <select
                className="input"
                value={draftGroupBy}
                onChange={(event) => setDraftGroupBy(event.target.value as GroupBy)}
              >
                {groupByOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="md:col-span-3">
            <label className="text-sm grid gap-1">
              <span className="muted">Metric</span>
              <select
                className="input"
                value={draftMetric}
                onChange={(event) => setDraftMetric(event.target.value as Metric)}
              >
                {metricOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="md:col-span-3">
            <label className="text-sm grid gap-1">
              <span className="muted">Focus</span>
              <select
                className="input"
                value={draftFocus ?? ''}
                onChange={(event) => setDraftFocus(event.target.value ? event.target.value : null)}
                disabled={focusDisabled}
              >
                <option value="">All</option>
                {focusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="md:col-span-3">
            <label className="text-sm grid gap-1">
              <span className="muted">Top N</span>
              <input
                type="number"
                className="input"
                min={1}
                max={50}
                value={draftTopN}
                onChange={(event) => setDraftTopN(Math.max(1, Math.min(50, Number(event.target.value || 1))))}
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
              onChange={(event) => setDraft((prev) => mergeFilters(prev, { from: event.target.value || undefined }))}
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
              onChange={(event) => setDraft((prev) => mergeFilters(prev, { to: event.target.value || undefined }))}
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

          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
          >
            Apply
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function groupByLabel(groupBy: GroupBy) {
  return groupByOptions.find((option) => option.value === groupBy)?.label ?? 'Group';
}
