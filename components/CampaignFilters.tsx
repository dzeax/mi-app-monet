'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Chip from '@/components/ui/Chip';
import type { Filters } from '@/hooks/useCampaignFilterEngine';

type DatePreset =
  | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek'
  | 'thisMonth' | 'lastMonth' | 'last7' | 'last30' | 'custom';

export default function CampaignFilters({
  filters,
  updateFilters,
  resetFilters,
  options,
  pending = false,
  onOpenColumns,
  onOpenExport,           // ← NUEVO
  exportCount,            // ← NUEVO
  onOpenRoutingOverride,
  canOverrideRouting = false,
}: {
  filters: Filters;
  updateFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  options: {
    geos: string[];
    partners: string[];
    themes: string[];
    types: string[];
    dbTypes: Array<'B2B' | 'B2C' | 'Mixed'>;
  };
  pending?: boolean;
  onOpenColumns?: () => void;
  onOpenExport?: () => void;   // ← NUEVO
  exportCount?: number;        // ← NUEVO
  onOpenRoutingOverride?: () => void;
  canOverrideRouting?: boolean;
}) {
  const [qDraft, setQDraft] = useState(filters.q ?? '');
  useEffect(() => { setQDraft(filters.q ?? ''); }, [filters.q]);

  // ---- helpers de fecha
  const fmtLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const startOfWeek = (d: Date) => {
    const n = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const w = (n.getDay() || 7) - 1;
    n.setDate(n.getDate() - w);
    return n;
  };
  const endOfWeek = (d: Date) => {
    const s = startOfWeek(d);
    return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  };
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth   = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

  const rangeForPreset = (p: Exclude<DatePreset,'custom'>): [string, string] => {
    const now = new Date();
    if (p === 'today') {
      const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const s = fmtLocal(a); return [s, s];
    }
    if (p === 'yesterday') {
      const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const s = fmtLocal(a); return [s, s];
    }
    if (p === 'thisWeek') return [fmtLocal(startOfWeek(now)), fmtLocal(endOfWeek(now))];
    if (p === 'lastWeek') {
      const k = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      return [fmtLocal(startOfWeek(k)), fmtLocal(endOfWeek(k))];
    }
    if (p === 'thisMonth') return [fmtLocal(startOfMonth(now)), fmtLocal(endOfMonth(now))];
    if (p === 'lastMonth') {
      const k = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      return [fmtLocal(startOfMonth(k)), fmtLocal(endOfMonth(k))];
    }
    if (p === 'last7') {
      const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return [fmtLocal(a), fmtLocal(b)];
    }
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return [fmtLocal(a), fmtLocal(b)];
  };

  const startDate = filters.dateRange?.[0] ?? '';
  const endDate   = filters.dateRange?.[1] ?? '';
  const hasRange  = !!(startDate || endDate);

  const activePreset: DatePreset | null = useMemo(() => {
    if (!startDate || !endDate) return null;
    const candidates: Exclude<DatePreset,'custom'>[] = [
      'today','yesterday','thisWeek','lastWeek','thisMonth','lastMonth','last7','last30',
    ];
    for (const p of candidates) {
      const [s, e] = rangeForPreset(p);
      if (s === startDate && e === endDate) return p;
    }
    return null;
  }, [startDate, endDate]);

  function choosePreset(p: Exclude<DatePreset,'custom'> | 'custom') {
    if (p === 'custom') return;
    const [s, e] = rangeForPreset(p);
    updateFilters({ dateRange: [s, e] });
  }
  function onStartChange(v: string){ updateFilters({ dateRange: [v || null, endDate || null] }); }
  function onEndChange(v: string){ updateFilters({ dateRange: [startDate || null, v || null] }); }

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Enter') updateFilters({ q: qDraft });
      if (e.key === 'Escape') { setQDraft(''); updateFilters({ q: '' }); }
    };
    el.addEventListener('keydown', handle);
    return () => el.removeEventListener('keydown', handle);
  }, [qDraft, updateFilters]);

  const setTypes   = (v: string) => updateFilters({ types: v === 'ALL' ? [] : [v] });
  const setGeo     = (v: string) => updateFilters({ geos: v === 'ALL' ? [] : [v] });
  const setPartner = (v: string) => updateFilters({ partners: v === 'ALL' ? [] : [v] });
  const setTheme   = (v: string) => updateFilters({ themes: v === 'ALL' ? [] : [v] });
  const setDbType  = (v: string) => updateFilters({ dbTypes: v === 'ALL' ? [] : [v as any] });

  const typeValue  = (filters.types?.[0] ?? 'ALL') as string;
  const geoValue   = (filters.geos?.[0] ?? 'ALL') as string;
  const partnerVal = (filters.partners?.[0] ?? 'ALL') as string;
  const themeVal   = (filters.themes?.[0] ?? 'ALL') as string;
  const dbTypeVal  = (filters.dbTypes?.[0] ?? 'ALL') as string;

  const activeStyle = (on: boolean): React.CSSProperties | undefined =>
    on
      ? {
          borderColor: 'var(--color-primary)',
          boxShadow: '0 0 0 2px color-mix(in oklab, var(--color-primary) 45%, transparent)',
          transition: 'box-shadow 120ms ease, border-color 120ms ease',
        }
      : undefined;

  const spinner = pending ? (
    <span className="ml-2 text-xs opacity-70" role="status" aria-live="polite">recalculando…</span>
  ) : null;

  const startRef = useRef<HTMLInputElement | null>(null);
  const endRef   = useRef<HTMLInputElement | null>(null);
  const openPicker = (ref: React.RefObject<HTMLInputElement>) => {
    const el = ref.current;
    if (!el) return;
    // @ts-ignore
    if (el.showPicker) el.showPicker(); else el.focus();
  };

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (qDraft.trim())      chips.push({ key: 'q',      label: `“${qDraft.trim()}”`, onClear: () => { setQDraft(''); updateFilters({ q: '' }); } });
    if (typeValue !== 'ALL')   chips.push({ key: 'type',   label: `Type: ${typeValue}`,   onClear: () => setTypes('ALL') });
    if (geoValue !== 'ALL')    chips.push({ key: 'geo',    label: `GEO: ${geoValue}`,     onClear: () => setGeo('ALL') });
    if (partnerVal !== 'ALL')  chips.push({ key: 'partner',label: `Partner: ${partnerVal}`, onClear: () => setPartner('ALL') });
    if (themeVal !== 'ALL')    chips.push({ key: 'theme',  label: `Theme: ${themeVal}`,   onClear: () => setTheme('ALL') });
    if (dbTypeVal !== 'ALL')   chips.push({ key: 'db',     label: `DB: ${dbTypeVal}`,     onClear: () => setDbType('ALL') });
    if (hasRange) {
      const label = activePreset ? presetLabel(activePreset) : `${startDate} → ${endDate}`;
      chips.push({ key: 'date', label, onClear: () => updateFilters({ dateRange: [null, null] }) });
    }
    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft, typeValue, geoValue, partnerVal, themeVal, dbTypeVal, startDate, endDate, hasRange, activePreset]);

  return (
    <section className="card p-4 md:p-5">
      {/* Wrapper con gap vertical controlado por --filters-row-gap */}
      <div className="filters-stack">
        {/* Búsqueda libre */}
        <div>
          <input
            ref={inputRef}
            placeholder="Search campaign, partner, theme, db…"
            value={qDraft}
            onChange={(e) => { setQDraft(e.target.value); updateFilters({ q: e.target.value }); }}
            className="input w-full"
            style={activeStyle(!!qDraft.trim())}
          />
          {spinner}
        </div>

        {/* Selectores rápidos */}
        <div className="flex flex-wrap gap-3">
          <select value={typeValue}   onChange={(e) => setTypes(e.target.value)}   className="input" style={activeStyle(typeValue !== 'ALL')}>
            <option value="ALL">Type: All</option>
            {options.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={geoValue}    onChange={(e) => setGeo(e.target.value)}     className="input" style={activeStyle(geoValue !== 'ALL')}>
            <option value="ALL">GEO: All</option>
            {options.geos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <select value={partnerVal}  onChange={(e) => setPartner(e.target.value)} className="input" style={activeStyle(partnerVal !== 'ALL')}>
            <option value="ALL">Partner: All</option>
            {options.partners.map(x => <option key={x} value={x}>{x}</option>)}
          </select>

          <select value={themeVal}    onChange={(e) => setTheme(e.target.value)}   className="input" style={activeStyle(themeVal !== 'ALL')}>
            <option value="ALL">Theme: All</option>
            {options.themes.map(x => <option key={x} value={x}>{x}</option>)}
          </select>

          <select value={dbTypeVal}   onChange={(e) => setDbType(e.target.value)}  className="input" style={activeStyle(dbTypeVal !== 'ALL')}>
            <option value="ALL">DB Type: All</option>
            {options.dbTypes.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>

        {/* Presets de fecha */}
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
            .map(([key,label]) => {
              const isActive =
                (key !== 'custom' && activePreset === key) ||
                (key === 'custom' && hasRange && !activePreset);
              return (
                <Chip key={key} active={isActive} onClick={() => choosePreset(key === 'custom' ? 'custom' : key)}>
                  {label}
                </Chip>
              );
            })}
        </div>

        {/* Rango de fechas + acciones */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          {/* Start */}
          <div className="relative">
            <input
              ref={startRef}
              type="date"
              value={startDate}
              onChange={e => onStartChange(e.target.value)}
              className="input input-date w-40 pr-9"
              style={activeStyle(!!startDate)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-2 rounded-r-lg hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Open start date picker"
              onClick={() => openPicker(startRef)}
            >
              <CalendarIcon />
            </button>
          </div>

          {/* End */}
          <div className="relative">
            <input
              ref={endRef}
              type="date"
              value={endDate}
              onChange={e => onEndChange(e.target.value)}
              className="input input-date w-40 pr-9"
              style={activeStyle(!!endDate)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-2 rounded-r-lg hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Open end date picker"
              onClick={() => openPicker(endRef)}
            >
              <CalendarIcon />
            </button>
          </div>

          <div className="flex-1" />

          {/* === Acciones: Primario | divisor | Secundario === */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Grupo primario */}
            <div className="flex items-center gap-2 md:gap-3">
              <button onClick={() => updateFilters({ q: qDraft })} className="btn-primary">Apply</button>
              <button onClick={() => { setQDraft(''); resetFilters(); }} className="btn-ghost">Reset</button>
            </div>

            {/* Divisor visual */}
            <div className="h-6 w-px bg-[--color-border] mx-1 md:mx-2" aria-hidden />

            {/* Grupo secundario */}
            <div className="flex items-center gap-2 md:gap-2.5">
              <button
                type="button"
                className="btn-ghost text-sm px-3 py-1.5"
                aria-haspopup="dialog"
                title="Show/Hide columns"
                onClick={() => onOpenColumns?.()}
              >
                Columns…
              </button>

              {canOverrideRouting && onOpenRoutingOverride && (
                <button
                  type="button"
                  className="text-sm px-3 py-1.5 rounded-md border border-[--color-border] hover:border-[--color-primary] hover:bg-[color-mix(in_oklab,var(--color-primary)_10%,transparent)] transition-colors inline-flex items-center gap-1.5"
                  aria-haspopup="dialog"
                  title="Override routing rate"
                  onClick={() => onOpenRoutingOverride?.()}
                >
                  <span>Routing rate</span>
                </button>
              )}

              {onOpenExport && (
                <button
                  type="button"
                  className="text-sm px-3 py-1.5 rounded-md border border-[--color-border] hover:border-[--color-primary] hover:bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] transition-colors inline-flex items-center gap-1.5"
                  aria-haspopup="dialog"
                  title="Export current view"
                  onClick={() => onOpenExport?.()}
                >
                  <DownloadIcon />
                  <span>Export</span>
                  {typeof exportCount === 'number' && exportCount > 0 && (
                    <span className="ml-0.5 text-[10px] opacity-70">({exportCount})</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chips activos */}
        {activeChips.length > 0 && (
          <div className="pt-2 md:pt-3 border-t border-[--color-border] flex flex-wrap items-center gap-2">
            {activeChips.map(c => (
              <span
                key={c.key}
                className="inline-flex items-center gap-2 rounded-full border border-[--color-border] bg-[color:var(--color-surface-2)] px-3 py-1 text-xs"
              >
                {c.label}
                <button
                  type="button"
                  aria-label={`Clear ${c.key}`}
                  className="rounded-full px-2 py-[2px] hover:bg-black/5"
                  onClick={c.onClear}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              className="ml-2 text-xs underline decoration-dotted hover:opacity-80"
              onClick={() => { setQDraft(''); resetFilters(); }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <path d="M7 10l5 5 5-5"/>
      <path d="M12 15V3"/>
    </svg>
  );
}

function presetLabel(p: Exclude<DatePreset,'custom'>) {
  switch (p) {
    case 'today': return 'Today';
    case 'yesterday': return 'Yesterday';
    case 'last7': return 'Last 7';
    case 'last30': return 'Last 30';
    case 'thisWeek': return 'This week';
    case 'lastWeek': return 'Last week';
    case 'thisMonth': return 'This month';
    case 'lastMonth': return 'Last month';
  }
}
