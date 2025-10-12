'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Chip from '@/components/ui/Chip';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import type { GroupBy, Metric, ReportFilters } from '@/types/reports';

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

  summary?: { filteredCount?: number; groupCount?: number; };
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

/** Presets iguales a Campañas */
type DatePreset =
  | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek'
  | 'thisMonth' | 'lastMonth' | 'last7' | 'last30' | 'custom';

function fmtLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function startOfWeek(d: Date) {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = (n.getDay() || 7) - 1; // lunes
  n.setDate(n.getDate() - w);
  return n;
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function rangeForPreset(p: Exclude<DatePreset,'custom'>): [string, string] {
  const now = new Date();
  if (p === 'today')     { const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()); const s=fmtLocal(a); return [s,s]; }
  if (p === 'yesterday') { const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1); const s=fmtLocal(a); return [s,s]; }
  if (p === 'thisWeek')  return [fmtLocal(startOfWeek(now)), fmtLocal(endOfWeek(now))];
  if (p === 'lastWeek')  { const k=new Date(now.getFullYear(),now.getMonth(),now.getDate()-7); return [fmtLocal(startOfWeek(k)), fmtLocal(endOfWeek(k))]; }
  if (p === 'thisMonth') return [fmtLocal(startOfMonth(now)), fmtLocal(endOfMonth(now))];
  if (p === 'lastMonth') { const k=new Date(now.getFullYear(),now.getMonth()-1,15); return [fmtLocal(startOfMonth(k)), fmtLocal(endOfMonth(k))]; }
  if (p === 'last7')     { const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6); const b=new Date(now.getFullYear(),now.getMonth(),now.getDate()); return [fmtLocal(a),fmtLocal(b)]; }
  // last30
  const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()-29);
  const b=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return [fmtLocal(a),fmtLocal(b)];
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
}: Props) {
  const { PARTNERS, DATABASES, THEMES, TYPES } = useCatalogOverrides();

  const geoOptions = useMemo(() => {
    const set = new Set<string>();
    DATABASES.forEach(d => d.geo && set.add((d.geo || '').toUpperCase()));
    return Array.from(set).sort();
  }, [DATABASES]);

  const partnerOptions = useMemo(
    () => PARTNERS.map(p => ({ id: p.id, name: p.name, isInternal: !!p.isInternal })),
    [PARTNERS],
  );
  const themeOptions = useMemo(() => THEMES, [THEMES]);
  const typeOptions  = useMemo(() => TYPES, [TYPES]);
  const dbTypeOptions = ['B2C', 'B2B', 'Mixed'] as const;

  const s = summary || {};
  const set = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) =>
    onChangeFilters({ ...filters, [key]: value });

  const toggleOnlyInternal = () =>
    onChangeFilters({ ...filters, onlyInternalPartners: !filters.onlyInternalPartners });

  // --- periodo activo (solo para resaltar chips)
  const startDate = filters.from || '';
  const endDate   = filters.to   || '';
  const hasRange  = !!(startDate && endDate);
  const [activePreset, setActivePreset] = useState<DatePreset>('custom');

  useEffect(() => {
    if (!hasRange) { setActivePreset('custom'); return; }
    const candidates: Exclude<DatePreset,'custom'>[] =
      ['today','yesterday','thisWeek','lastWeek','thisMonth','lastMonth','last7','last30'];
    for (const key of candidates) {
      const [s,e] = rangeForPreset(key);
      if (s === startDate && e === endDate) { setActivePreset(key); return; }
    }
    setActivePreset('custom');
  }, [startDate, endDate, hasRange]);

  function choosePreset(p: Exclude<DatePreset,'custom'> | 'custom') {
    if (p === 'custom') { setActivePreset('custom'); return; }
    const [s, e] = rangeForPreset(p);
    setActivePreset(p);
    onChangeFilters({ ...filters, from: s, to: e });
  }

  // refs para botón del picker (UX igual que Campañas)
  const startRef = useRef<HTMLInputElement | null>(null);
  const endRef   = useRef<HTMLInputElement | null>(null);
  const openPicker = (ref: React.RefObject<HTMLInputElement>) => {
    const el = ref.current;
    if (!el) return;
    // @ts-ignore
    if (el.showPicker) el.showPicker(); else el.focus();
  };

  return (
    <div className="grid gap-4">
      {/* Título + acciones */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="muted">
            {groupByLabel(groupBy)} performance ·{' '}
            <span className="opacity-80">
              {s.filteredCount != null ? `${s.filteredCount} rows` : ''}{s.filteredCount!=null && s.groupCount!=null ? ' · ' : ''}
              {s.groupCount != null ? `${s.groupCount} groups` : ''}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onExportCsv && <button className="btn-ghost" onClick={onExportCsv}>⬇ Export CSV</button>}
          <Link href="/" className="btn-ghost">← Back to campaigns</Link>
        </div>
      </div>

      {/* Stack de filtros */}
      <div className="filters-stack">
        {/* Row A — métrica, groupBy, TopN */}
        <div className="grid gap-3 md:grid-cols-12 items-end">
          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">Group by</span>
              <select className="input" value={groupBy} onChange={(e) => onChangeGroupBy(e.target.value as GroupBy)}>
                {groupByOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="md:col-span-8">
            <span className="muted text-sm mb-1 inline-block">Metric</span>
            <div className="flex gap-1 flex-wrap">
              {metrics.map(m => (
                <Chip key={m} active={metric === m} onClick={() => onChangeMetric(m)} title={`Rank by ${m}`}>
                  {m === 'turnover' ? 'Turnover' : m === 'margin' ? 'Margin' : m === 'ecpm' ? 'eCPM' : 'V Sent'}
                </Chip>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">Top N</span>
              <input
                type="number"
                className="input"
                min={1}
                max={50}
                value={topN}
                onChange={(e) => onChangeTopN(Math.max(1, Math.min(50, Number(e.target.value || 1))))}
              />
            </label>
          </div>
        </div>

        {/* Row B — chips de periodo */}
        <div className="flex flex-wrap items-center gap-3">
          {([
            ['today','Today'],
            ['yesterday','Yesterday'],
            ['last7','Last 7'],
            ['last30','Last 30'],
            ['thisWeek','This week'],
            ['lastWeek','Last week'],
            ['thisMonth','This month'],
            ['lastMonth','Last month'],
            ['custom','Custom'],
          ] as [DatePreset,string][])
            .map(([key,label]) => (
              <Chip
                key={key}
                active={activePreset === key}
                onClick={() => choosePreset(key === 'custom' ? 'custom' : key)}
              >
                {label}
              </Chip>
            ))}
        </div>

        {/* Row C — rango de fechas + toggles */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          {/* Start */}
          <div className="relative">
            <input
              ref={startRef}
              type="date"
              value={startDate}
              onChange={(e) => onChangeFilters({ ...filters, from: e.target.value || undefined })}
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

          {/* End */}
          <div className="relative">
            <input
              ref={endRef}
              type="date"
              value={endDate}
              onChange={(e) => onChangeFilters({ ...filters, to: e.target.value || undefined })}
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
              checked={!!filters.onlyInternalPartners}
              onChange={toggleOnlyInternal}
            />
            <span className="muted">Only internal</span>
          </label>

          <button
            className="btn-ghost"
            onClick={() => onChangeFilters({})}
            title="Clear filters"
          >
            Clear
          </button>
        </div>

        {/* Row D — filtros de entidad */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">GEO</span>
              <select
                className="input"
                value={(filters.geos && filters.geos[0]) || ''}
                onChange={(e) => set('geos', e.target.value ? [e.target.value] : undefined)}
              >
                <option value="">All</option>
                {geoOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>

          <div className="md:col-span-3">
            <label className="text-sm grid gap-1">
              <span className="muted">Partner</span>
              <select
                className="input"
                value={(filters.partners && filters.partners[0]) || ''}
                onChange={(e) => set('partners', e.target.value ? [e.target.value] : undefined)}
              >
                <option value="">All</option>
                {partnerOptions.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.name}{p.isInternal ? ' · INT' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">Theme</span>
              <select
                className="input"
                value={(filters.themes && filters.themes[0]) || ''}
                onChange={(e) => set('themes', e.target.value ? [e.target.value] : undefined)}
              >
                <option value="">All</option>
                {themeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">Type</span>
              <select
                className="input"
                value={(filters.types && filters.types[0]) || ''}
                onChange={(e) => set('types', e.target.value ? [e.target.value as any] : undefined)}
              >
                <option value="">All</option>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm grid gap-1">
              <span className="muted">DB Type</span>
              <select
                className="input"
                value={(filters.databaseTypes && filters.databaseTypes[0]) || ''}
                onChange={(e) => set('databaseTypes', e.target.value ? [e.target.value as any] : undefined)}
              >
                <option value="">All</option>
                {dbTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function groupByLabel(g: GroupBy) {
  return groupByOptions.find(o => o.value === g)?.label ?? 'Group';
}
