'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import type { Filters as ReportingFilters } from '@/hooks/useCampaignFilterEngine';
import DatabaseFlag from '@/components/campaign-planning/DatabaseFlag';

export const REPORTING_DATE_PRESETS: Array<{ id: string; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7' },
  { id: 'last30', label: 'Last 30' },
  { id: 'thisWeek', label: 'This week' },
  { id: 'lastWeek', label: 'Last week' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisQuarter', label: 'This quarter' },
  { id: 'lastQuarter', label: 'Last quarter' },
];

type Props = {
  filters: ReportingFilters;
  updateFilters: (patch: Partial<ReportingFilters>) => void;
  resetFilters: () => void;
  partnerOptions: string[];
  databaseOptions: string[];
  geoOptions: string[];
  typeOptions: string[];
  activePreset: string | null;
  onPresetClick: (id: string) => void;
  onClearDate: () => void;
};

type ArrayFilterKey = 'types' | 'partners' | 'databases' | 'geos';

export default function ReportingFiltersPanel({
  filters,
  updateFilters,
  resetFilters,
  partnerOptions,
  databaseOptions,
  geoOptions,
  typeOptions,
  activePreset,
  onPresetClick,
  onClearDate,
}: Props) {
  const activeChips = useMemo(() => {
    const chips: Array<{ label: string; value: string; key: ArrayFilterKey }> = [];
    const push = (key: ArrayFilterKey, title: string, values?: string[]) => {
      (values ?? []).forEach((value) => {
        chips.push({ label: `${title}: ${value}`, value, key });
      });
    };
    push('types', 'Type', filters.types);
    push('partners', 'Partner', filters.partners);
    push('databases', 'DB', filters.databases);
    push('geos', 'Geo', filters.geos);
    return chips;
  }, [filters.types, filters.partners, filters.databases, filters.geos]);

  const handleRemoveChip = (chip: { key: ArrayFilterKey; value: string }) => {
    const current = (filters[chip.key] ?? []) as string[];
    updateFilters({
      [chip.key]: current.filter((item) => item !== chip.value),
    } as Partial<ReportingFilters>);
  };

  return (
    <aside className="w-full max-w-[300px] shrink-0 rounded-3xl border border-[color:var(--color-border)] bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[color:var(--color-border)]/60 pb-3">
        <div>
          <h3 className="text-base font-semibold text-[color:var(--color-text)]">Reporting filters</h3>
          <p className="text-xs text-[color:var(--color-text)]/65">Refine the historical campaigns.</p>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-[color:var(--color-primary)]"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
            Search
          </label>
          <input
            type="search"
            value={filters.q ?? ''}
            onChange={(event) => updateFilters({ q: event.target.value })}
            placeholder="Campaign, partner, database..."
            className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-primary)]"
          />
          {activeChips.length ? (
            <div className="flex flex-wrap gap-1.5">
              {activeChips.map((chip) => (
                <button
                  key={`${chip.key}-${chip.value}`}
                  type="button"
                  onClick={() => handleRemoveChip(chip)}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--color-text)]/80 transition hover:border-[color:var(--color-primary)]"
                >
                  <span>{chip.label}</span>
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
              Date range
            </label>
            {filters.dateRange || activePreset ? (
              <button
                type="button"
                className="text-[color:var(--color-primary)] text-xs font-semibold"
                onClick={() => {
                  onClearDate();
                  onPresetClick('');
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          <DatePresetDropdown activePreset={activePreset} onPresetClick={onPresetClick} />
          <div className="flex gap-2">
            <input
              type="date"
              value={filters.dateRange?.[0] ?? ''}
              onChange={(event) => {
                const next: [string, string] = [
                  event.target.value,
                  filters.dateRange?.[1] ?? event.target.value,
                ];
                updateFilters({ dateRange: next });
              }}
              className="w-1/2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-primary)]"
            />
            <input
              type="date"
              value={filters.dateRange?.[1] ?? ''}
              onChange={(event) => {
                const next: [string, string] = [
                  filters.dateRange?.[0] ?? event.target.value,
                  event.target.value,
                ];
                updateFilters({ dateRange: next });
              }}
              className="w-1/2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-primary)]"
            />
          </div>
        </div>

        <FilterMultiSelect
          label="Partner"
          values={filters.partners ?? []}
          options={partnerOptions}
          onChange={(values) => updateFilters({ partners: values })}
        />
        <FilterMultiSelect
          label="Database"
          values={filters.databases ?? []}
          options={databaseOptions}
          onChange={(values) => updateFilters({ databases: values })}
          withFlags
        />
        <FilterMultiSelect
          label="Geo"
          values={filters.geos ?? []}
          options={geoOptions}
          onChange={(values) => updateFilters({ geos: values })}
        />
        <FilterMultiSelect
          label="Type"
          values={filters.types ?? []}
          options={typeOptions}
          onChange={(values) => updateFilters({ types: values })}
        />
      </div>
    </aside>
  );
}

function FilterMultiSelect({
  label,
  values,
  onChange,
  options,
  withFlags = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
  withFlags?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));
  }, [options, query]);

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
    } else {
      onChange([...values, value]);
    }
  };

  const summary =
    values.length === 0 ? 'All' : values.length === 1 ? values[0] : `${values[0]} +${values.length - 1}`;

  return (
    <div className="space-y-1.5 relative" ref={containerRef}>
      <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition',
          'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 text-[color:var(--color-text)]',
          'focus:border-[color:var(--color-primary)] focus:outline-none',
        ].join(' ')}
      >
        <span className="truncate">{summary}</span>
        <svg className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none">
          <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-[color:var(--color-border)] bg-white shadow-xl">
          <div className="sticky top-0 border-b border-[color:var(--color-border)]/70 bg-white p-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full rounded-lg border border-[color:var(--color-border)]/80 bg-[color:var(--color-surface-2)]/60 px-3 py-1.5 text-sm focus:border-[color:var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-[color:var(--color-text)]/60">No matches</p>
            ) : (
              filtered.map((option) => {
                const selected = values.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleValue(option)}
                    className={[
                      'flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm',
                      selected
                        ? 'bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                        : 'text-[color:var(--color-text)]/85 hover:bg-[color:var(--color-surface-2)]',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {withFlags ? <DatabaseFlag name={option} className="h-4 w-4" /> : null}
                      <span className="truncate text-left">{option}</span>
                    </span>
                    <span
                      className={[
                        'h-4 w-4 rounded-full border',
                        selected ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]' : 'border-[color:var(--color-border)]',
                      ].join(' ')}
                    />
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-[color:var(--color-border)]/70 px-3 py-2 text-xs font-semibold">
            <button
              type="button"
              className="text-[color:var(--color-primary)]"
              onClick={() => {
                onChange([]);
                setQuery('');
              }}
            >
              Clear
            </button>
            <span className="text-[color:var(--color-text)]/60">{values.length} selected</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DatePresetDropdown({
  activePreset,
  onPresetClick,
}: {
  activePreset: string | null;
  onPresetClick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const summary =
    activePreset && REPORTING_DATE_PRESETS.find((preset) => preset.id === activePreset)?.label
      ? REPORTING_DATE_PRESETS.find((preset) => preset.id === activePreset)?.label
      : 'Select preset';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition',
          'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 text-[color:var(--color-text)]',
          'focus:border-[color:var(--color-primary)] focus:outline-none',
        ].join(' ')}
      >
        <span className={`truncate ${activePreset ? 'text-[color:var(--color-text)]' : 'text-[color:var(--color-text)]/60'}`}>
          {summary}
        </span>
        <svg className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none">
          <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-[color:var(--color-border)] bg-white shadow-xl max-h-80 overflow-y-auto">
          {REPORTING_DATE_PRESETS.map((preset) => {
            const selected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onPresetClick(preset.id);
                  setOpen(false);
                }}
                className={[
                  'flex w-full items-center justify-between px-4 py-2 text-sm transition',
                  selected
                    ? 'bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                    : 'text-[color:var(--color-text)]/85 hover:bg-[color:var(--color-surface-2)]',
                ].join(' ')}
              >
                {preset.label}
                {selected ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
                    <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
