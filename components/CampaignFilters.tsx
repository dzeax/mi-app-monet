'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import type { CSSProperties } from 'react';
import Chip from '@/components/ui/Chip';
import type { Filters } from '@/hooks/useCampaignFilterEngine';
import { canonicalGeo, geoEmoji, geoLabel, geoFlagClass } from '@/lib/geoFlags';

type DatePreset =
  | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek'
  | 'thisMonth' | 'lastMonth' | 'last7' | 'last30'
  | 'thisQuarter' | 'lastQuarter'
  | 'custom';

const DATE_PRESETS: [DatePreset, string][] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last7', 'Last 7'],
  ['last30', 'Last 30'],
  ['thisQuarter', 'This quarter'],
  ['lastQuarter', 'Last quarter'],
  ['thisWeek', 'This week'],
  ['lastWeek', 'Last week'],
  ['thisMonth', 'This month'],
  ['lastMonth', 'Last month'],
  ['custom', 'Custom'],
];

const ALL = 'ALL';

function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = (n.getDay() || 7) - 1;
  n.setDate(n.getDate() - w);
  return n;
}

function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function rangeForPreset(p: Exclude<DatePreset, 'custom'>): [string, string] {
  const now = new Date();
  if (p === 'thisQuarter' || p === 'lastQuarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const targetQuarter = p === 'thisQuarter' ? currentQuarter : (currentQuarter === 1 ? 4 : currentQuarter - 1);
    const targetYear = p === 'thisQuarter' ? now.getFullYear() : (currentQuarter === 1 ? now.getFullYear() - 1 : now.getFullYear());
    const startMonth = (targetQuarter - 1) * 3;
    const start = new Date(targetYear, startMonth, 1);
    const end = new Date(targetYear, startMonth + 3, 0);
    return [fmtLocal(start), fmtLocal(end)];
  }
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
}

export default function CampaignFilters({
  filters,
  updateFilters,
  resetFilters,
  options,
  pending = false,
}: {
  filters: Filters;
  updateFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  options: {
    geos: string[];
    partners: string[];
    themes: string[];
    types: string[];
    databases: string[];
    dbTypes: Array<'B2B' | 'B2C' | 'Mixed'>;
    databaseGeoMap?: Record<string, string | undefined>;
  };
  pending?: boolean;
}) {
  const [qDraft, setQDraft] = useState(filters.q ?? '');
  const [customMode, setCustomMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => { setQDraft(filters.q ?? ''); }, [filters.q]);

  const startDate = filters.dateRange?.[0] ?? '';
  const endDate   = filters.dateRange?.[1] ?? '';
  const hasRange  = !!(startDate || endDate);

  const activePreset: DatePreset | null = useMemo(() => {
    if (!startDate || !endDate) return null;
    for (const [preset] of DATE_PRESETS) {
      if (preset === 'custom') continue;
      const [s, e] = rangeForPreset(preset);
      if (s === startDate && e === endDate) return preset;
    }
    return null;
  }, [startDate, endDate]);

  useEffect(() => {
    if (activePreset) {
      setCustomMode(false);
    } else if (hasRange) {
      setCustomMode(true);
    }
  }, [activePreset, hasRange]);

  useEffect(() => {
    if ((filters.themes?.length ?? 0) > 0 || (filters.dbTypes?.length ?? 0) > 0) {
      setShowAdvanced(true);
    }
  }, [filters.themes, filters.dbTypes]);

  const typeValue = filters.types?.[0] ?? ALL;
  const geoValue = filters.geos?.[0] ?? ALL;
  const partnerValue = filters.partners?.[0] ?? ALL;
  const databaseValue = filters.databases?.[0] ?? ALL;
  const themeValue = filters.themes?.[0] ?? ALL;
  const dbTypeValue = filters.dbTypes?.[0] ?? ALL;
  const databaseGeoMap = options.databaseGeoMap ?? {};

  const geoSelectOptions = useMemo(() => {
    return options.geos.map((geo) => {
      const canonical = canonicalGeo(geo);
      const readable = canonical ? geoLabel(canonical) : undefined;
      const codeNote = canonical && canonical !== geo ? `, ${canonical}` : '';
      const title = readable ? `${geo} (${readable}${codeNote})` : geo;
      return { value: geo, label: geo, geo, title };
    });
  }, [options.geos]);

  const databaseSelectOptions = useMemo(() => {
    return options.databases.map((name) => {
      const geo = databaseGeoMap[name];
      const geoCanonical = canonicalGeo(geo);
      const readable = geoCanonical ? geoLabel(geoCanonical) : undefined;
      const codeNote = geoCanonical && readable ? ` (${geoCanonical})` : '';
      const title = readable ? `${name} — ${readable}${codeNote}` : name;
      return { value: name, label: name, geo, title };
    });
  }, [options.databases, databaseGeoMap]);

  const setTypes = useCallback((value: string) => {
    updateFilters({ types: value === ALL ? [] : [value] });
  }, [updateFilters]);

  const setGeo = useCallback((value: string) => {
    updateFilters({ geos: value === ALL ? [] : [value] });
  }, [updateFilters]);

  const setPartner = useCallback((value: string) => {
    updateFilters({ partners: value === ALL ? [] : [value] });
  }, [updateFilters]);

  const setDatabase = useCallback((value: string) => {
    updateFilters({ databases: value === ALL ? [] : [value] });
  }, [updateFilters]);

  const setTheme = useCallback((value: string) => {
    updateFilters({ themes: value === ALL ? [] : [value] });
  }, [updateFilters]);

  const setDbType = useCallback((value: string) => {
    updateFilters({
      dbTypes: value === ALL ? [] : [value as Filters['dbTypes'][number]],
    });
  }, [updateFilters]);

  const clearSearch = useCallback(() => {
    setQDraft('');
    updateFilters({ q: '' });
  }, [updateFilters]);

  const commitSearch = useCallback(() => {
    const next = qDraft.trim();
    updateFilters({ q: next });
    setQDraft(next);
  }, [qDraft, updateFilters]);

  const clearDateRange = useCallback(() => {
    setCustomMode(false);
    updateFilters({ dateRange: [null, null] });
  }, [updateFilters]);

  const handleReset = useCallback(() => {
    setQDraft('');
    setCustomMode(false);
    setShowAdvanced(false);
    resetFilters();
  }, [resetFilters]);

  const onStartChange = useCallback((value: string) => {
    setCustomMode(true);
    updateFilters({ dateRange: [value || null, endDate || null] });
  }, [endDate, updateFilters]);

  const onEndChange = useCallback((value: string) => {
    setCustomMode(true);
    updateFilters({ dateRange: [startDate || null, value || null] });
  }, [startDate, updateFilters]);

  const applyDisabled = qDraft.trim() === (filters.q ?? '').trim();

  const startRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!applyDisabled) commitSearch();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSearch();
      }
    };
    el.addEventListener('keydown', handle);
    return () => el.removeEventListener('keydown', handle);
  }, [applyDisabled, clearSearch, commitSearch]);

  const openPicker = (ref: React.RefObject<HTMLInputElement>) => {
    const el = ref.current;
    if (!el) return;
    // @ts-expect-error showPicker no est?? tipado en Safari
    if (el.showPicker) el.showPicker(); else el.focus();
  };

  const activeStyle = (active: boolean): CSSProperties | undefined =>
    active
      ? {
          borderColor: 'var(--color-primary)',
          boxShadow: '0 0 0 2px color-mix(in oklab, var(--color-primary) 45%, transparent)',
          transition: 'box-shadow 120ms ease, border-color 120ms ease',
        }
      : undefined;

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    const search = (filters.q ?? '').trim();
    if (search) chips.push({ key: 'q', label: `Search: "${search}"`, onClear: clearSearch });
    if (filters.types?.length) chips.push({ key: 'type', label: `Type: ${filters.types[0]}`, onClear: () => setTypes(ALL) });
    if (filters.geos?.length) chips.push({ key: 'geo', label: `GEO: ${filters.geos[0]}`, onClear: () => setGeo(ALL) });
    if (filters.partners?.length) chips.push({ key: 'partner', label: `Partner: ${filters.partners[0]}`, onClear: () => setPartner(ALL) });
    if (filters.databases?.length) chips.push({ key: 'database', label: `Database: ${filters.databases[0]}`, onClear: () => setDatabase(ALL) });
    if (filters.themes?.length) chips.push({ key: 'theme', label: `Theme: ${filters.themes[0]}`, onClear: () => setTheme(ALL) });
    if (filters.dbTypes?.length) chips.push({ key: 'dbType', label: `DB Type: ${filters.dbTypes[0]}`, onClear: () => setDbType(ALL) });
    const [start, end] = filters.dateRange ?? [];
    if (start || end) {
      const label = activePreset
        ? `Period: ${presetLabel(activePreset)}`
        : `Period: ${(start ?? 'N/A')} to ${(end ?? 'N/A')}`;
      chips.push({ key: 'date', label, onClear: clearDateRange });
    }
    return chips;
  }, [filters, activePreset, clearDateRange, clearSearch, setDatabase, setDbType, setGeo, setPartner, setTheme, setTypes]);

  const advancedApplied = themeValue !== ALL || dbTypeValue !== ALL;
  const showAdvancedBlock = showAdvanced || advancedApplied;

  return (
    <section className="card p-4 md:p-5">
      <div className="filters-stack">
        <div className="flex flex-col gap-2">
          <div className="relative">
            <input
              ref={inputRef}
              placeholder="Search campaign, partner, theme, database..."
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              className="input w-full pr-12"
              style={activeStyle(!!qDraft.trim())}
            />
            {qDraft ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 px-3 text-sm text-[color:var(--color-text)]/60 hover:text-[color:var(--color-text)] focus:outline-none"
                onClick={clearSearch}
              >
                x
              </button>
            ) : null}
          </div>
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-2 rounded-full border border-[--color-border] bg-[color:var(--color-surface-2)] px-3 py-1"
                >
                  {chip.label}
                  <button
                    type="button"
                    aria-label={`Clear ${chip.key}`}
                    className="rounded-full px-2 py-[2px] hover:bg-black/5"
                    onClick={chip.onClear}
                  >
                    x
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="ml-2 text-xs underline decoration-dotted hover:opacity-80"
                onClick={handleReset}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {DATE_PRESETS.map(([preset, label]) => {
            const isActive = preset === 'custom' ? customMode : activePreset === preset;
            return (
              <Chip
                key={preset}
                active={isActive}
                onClick={() => {
                  if (preset === 'custom') {
                    setCustomMode(true);
                    if (!hasRange) updateFilters({ dateRange: [null, null] });
                  } else {
                    const [s, e] = rangeForPreset(preset);
                    setCustomMode(false);
                    updateFilters({ dateRange: [s, e] });
                  }
                }}
              >
                {label}
              </Chip>
            );
          })}
        </div>

        {customMode && (
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <div className="relative">
              <input
                ref={startRef}
                type="date"
                value={startDate}
                onChange={(e) => onStartChange(e.target.value)}
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
            <div className="relative">
              <input
                ref={endRef}
                type="date"
                value={endDate}
                onChange={(e) => onEndChange(e.target.value)}
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
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={clearDateRange}
            >
              Clear range
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3 md:gap-4">
          <div className="flex flex-wrap items-end gap-3 md:gap-4">
            <FilterSelect
              label="Type"
              value={typeValue}
              onChange={setTypes}
              options={options.types}
              allLabel="Type: All"
              style={activeStyle(typeValue !== ALL)}
            />
            <FlagSelect
              label="GEO"
              value={geoValue}
              onChange={setGeo}
              options={geoSelectOptions}
              allLabel="GEO: All"
              style={activeStyle(geoValue !== ALL)}
            />
            <FilterSelect
              label="Partner"
              value={partnerValue}
              onChange={setPartner}
              options={options.partners}
              allLabel="Partner: All"
              style={activeStyle(partnerValue !== ALL)}
              widthClass="min-w-[200px]"
            />
            <FlagSelect
              label="Database"
              value={databaseValue}
              onChange={setDatabase}
              options={databaseSelectOptions}
              allLabel="Database: All"
              style={activeStyle(databaseValue !== ALL)}
              widthClass="min-w-[200px]"
            />
            <button
              type="button"
              className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${showAdvancedBlock ? 'border-[color:var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_12%,transparent)] text-[color:var(--color-text)]' : 'border-[--color-border] text-[color:var(--color-text)]/75 hover:border-[color:var(--color-primary)]/60 hover:bg-[color-mix(in_oklab,var(--color-primary)_8%,transparent)]'}`}
              onClick={() => setShowAdvanced((prev) => !prev)}
              aria-expanded={showAdvancedBlock}
            >
              {showAdvanced ? 'Hide filters' : 'More filters'}
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {pending ? (
              <span className="text-xs opacity-70" role="status" aria-live="polite">
                Updating...
              </span>
            ) : null}
            <button
              type="button"
              className="btn-primary px-4 py-2"
              onClick={commitSearch}
              disabled={applyDisabled}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn-ghost px-3 py-1.5"
              onClick={handleReset}
            >
              Reset
            </button>
            </div>
        </div>

        {showAdvancedBlock && (
          <div className="border-t border-[--color-border] pt-3 mt-1 flex flex-wrap gap-3 md:gap-4">
            <FilterSelect
              label="Theme"
              value={themeValue}
              onChange={setTheme}
              options={options.themes}
              allLabel="Theme: All"
              style={activeStyle(themeValue !== ALL)}
              widthClass="min-w-[200px]"
            />
            <FilterSelect
              label="DB Type"
              value={dbTypeValue}
              onChange={setDbType}
              options={options.dbTypes}
              allLabel="DB Type: All"
              style={activeStyle(dbTypeValue !== ALL)}
              widthClass="min-w-[160px]"
            />
          </div>
        )}
      </div>
    </section>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel: string;
  style?: CSSProperties;
  widthClass?: string;
};

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  style,
  widthClass = 'min-w-[150px]',
}: FilterSelectProps) {
  const htmlId = useId();
  const disabled = options.length === 0;

  return (
    <label className={`flex flex-col gap-1 ${widthClass}`}>
      <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text)]/60">{label}</span>
      <select
        id={htmlId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input h-11 pr-9 ${disabled ? 'opacity-60' : ''}`}
        style={style}
        disabled={disabled}
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

type FlagSelectOption = {
  value: string;
  label: string;
  geo?: string | null;
  title?: string;
};

type FlagSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FlagSelectOption[];
  allLabel: string;
  style?: CSSProperties;
  widthClass?: string;
};

function FlagSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  style,
  widthClass = 'min-w-[150px]',
}: FlagSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  const listId = useId();
  const disabled = options.length === 0;

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => !prev);
  }, [disabled]);

  const handleSelect = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    if (open) {
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }
  }, [open]);

  const selected = value === ALL ? undefined : options.find((opt) => opt.value === value);

  return (
    <label className={`relative flex flex-col gap-1 ${widthClass}`} ref={containerRef}>
      <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text)]/60">{label}</span>
      <button
        type="button"
        className={`input h-11 pr-9 text-left flex items-center gap-3 w-full ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={handleToggle}
        style={style}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        title={selected?.title ?? allLabel}
      >
        {selected ? (
          <FlagOptionContent option={selected} />
        ) : (
          <span className="text-sm">{allLabel}</span>
        )}
        <svg
          className={`ml-auto h-4 w-4 text-[color:var(--color-text)]/60 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="flag-select-menu"
        >
          <li
            role="option"
            aria-selected={value === ALL}
            className={`flag-select-option ${value === ALL ? 'is-active' : ''}`}
            onClick={() => handleSelect(ALL)}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleSelect(ALL);
              }
            }}
            title={allLabel}
          >
            <span className="flag-option__label">{allLabel}</span>
          </li>
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={`flag-select-option ${value === opt.value ? 'is-active' : ''}`}
              onClick={() => handleSelect(opt.value)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelect(opt.value);
                }
              }}
              title={opt.title ?? opt.label}
            >
              <FlagOptionContent option={opt} />
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}

function FlagOptionContent({ option }: { option: FlagSelectOption }) {
  return (
    <span className="flag-option" title={option.title ?? option.label}>
      <FlagGlyph geo={option.geo} />
      <span className="flag-option__label">{option.label}</span>
    </span>
  );
}

function FlagGlyph({ geo }: { geo?: string | null }) {
  if (!geo) return null;
  const canonical = canonicalGeo(geo);
  if (!canonical) return null;
  const flagClass = geoFlagClass(canonical);
  if (flagClass) {
    return <span className={`flag-option-flag fi fis ${flagClass}`} aria-hidden="true" />;
  }
  return (
    <span className="flag-option-flag flag-option-flag--fallback" aria-hidden="true">
      {geoEmoji(canonical)}
    </span>
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
}function presetLabel(p: Exclude<DatePreset,'custom'>) {
  switch (p) {
    case 'today': return 'Today';
    case 'yesterday': return 'Yesterday';
    case 'last7': return 'Last 7';
    case 'last30': return 'Last 30';
    case 'thisQuarter': return 'This quarter';
    case 'lastQuarter': return 'Last quarter';
    case 'thisWeek': return 'This week';
    case 'lastWeek': return 'Last week';
    case 'thisMonth': return 'This month';
    case 'lastMonth': return 'Last month';
  }
}

