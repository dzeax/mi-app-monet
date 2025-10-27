'use client';

import { useMemo, type ChangeEvent } from 'react';
import Chip from '@/components/ui/Chip';
import type { DBType } from '@/data/reference';
import {
  createDefaultDbPerformanceFilters,
  type DateRange,
  type DbPerformanceFilters,
  type UseDbPerformanceResult,
} from '@/hooks/useDbPerformance';
import { formatComparison, formatRange } from '@/components/dbs-performance/formatters';

type Props = {
  filters: DbPerformanceFilters;
  onChange: UseDbPerformanceResult['setFilters'];
  range: DateRange;
  compareRange: DateRange;
  availableCountries: string[];
  availableDbTypes: DBType[];
  onRefresh?: () => void;
  refreshing?: boolean;
  onExport?: () => void;
  exportDisabled?: boolean;
};

type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'custom';

type PresetConfig = {
  key: DatePreset;
  label: string;
  compute: () => { from: string; to: string };
};

const PRESETS: PresetConfig[] = [
  {
    key: 'today',
    label: 'Today',
    compute: () => {
      const now = new Date();
      const iso = toISO(now);
      return { from: iso, to: iso };
    },
  },
  {
    key: 'yesterday',
    label: 'Yesterday',
    compute: () => {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      const iso = toISO(now);
      return { from: iso, to: iso };
    },
  },
  {
    key: 'last7',
    label: 'Last 7',
    compute: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      return { from: toISO(start), to: toISO(end) };
    },
  },
  {
    key: 'last30',
    label: 'Last 30',
    compute: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      return { from: toISO(start), to: toISO(end) };
    },
  },
  {
    key: 'thisMonth',
    label: 'This month',
    compute: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: toISO(start), to: toISO(end) };
    },
  },
  {
    key: 'thisQuarter',
    label: 'This quarter',
    compute: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      return { from: toISO(start), to: toISO(end) };
    },
  },
  {
    key: 'thisYear',
    label: 'This year',
    compute: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { from: toISO(start), to: toISO(end) };
    },
  },
];

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function detectActivePreset(filters: DbPerformanceFilters): DatePreset {
  for (const preset of PRESETS) {
    const { from, to } = preset.compute();
    if (filters.from === from && filters.to === to) {
      return preset.key;
    }
  }
  return 'custom';
}

export default function DbsPerformanceFilters({
  filters,
  onChange,
  range,
  compareRange,
  availableCountries,
  availableDbTypes,
  onRefresh,
  refreshing = false,
  onExport,
  exportDisabled = false,
}: Props) {
  const activePreset = useMemo(() => detectActivePreset(filters), [filters]);

  const toggleDbType = (type: DBType) => {
    onChange((prev) => {
      const next = new Set(prev.dbTypes);
      if (next.has(type)) {
        if (next.size === 1) return {};
        next.delete(type);
      } else {
        next.add(type);
      }
      return { dbTypes: Array.from(next) as DBType[] };
    });
  };

  const handleCountriesChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    onChange({ countries: selected });
  };

  const handlePreset = (key: DatePreset) => {
    const preset = PRESETS.find((entry) => entry.key === key);
    if (!preset) return;
    const { from, to } = preset.compute();
    onChange({ from, to });
  };

  const handleReset = () => {
    onChange(() => createDefaultDbPerformanceFilters());
  };

  const handleFromChange = (value: string) => {
    if (!value) return;
    onChange({ from: value });
  };

  const handleToChange = (value: string) => {
    if (!value) return;
    onChange({ to: value });
  };

  return (
    <section className="card p-5 md:p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">
            DBs Performance
          </h1>
          <p className="text-sm text-[color:var(--color-text)]/65">
            Range {formatRange(range)} | Comparing vs {formatComparison(compareRange)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-sm disabled:opacity-40 disabled:pointer-events-none"
            onClick={onExport}
            disabled={!onExport || exportDisabled}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            onClick={onRefresh}
            disabled={!onRefresh || refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
          <div className="text-xs text-[color:var(--color-text)]/55 uppercase tracking-[0.14em]">
            Filters
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <Chip
            key={preset.key}
            active={preset.key === activePreset}
            onClick={() => handlePreset(preset.key)}
          >
            {preset.label}
          </Chip>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <label className="grid gap-1 text-sm">
          <span className="muted text-xs uppercase tracking-[0.18em]">From</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => handleFromChange(event.target.value)}
            className="input"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="muted text-xs uppercase tracking-[0.18em]">To</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => handleToChange(event.target.value)}
            className="input"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="muted text-xs uppercase tracking-[0.18em]">Granularity</span>
          <select
            value={filters.granularity}
            onChange={(event) => onChange({ granularity: event.target.value as DbPerformanceFilters['granularity'] })}
            className="input"
          >
            <option value="auto">Auto</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <span className="muted text-xs uppercase tracking-[0.18em]">DB types</span>
          <div className="flex flex-wrap items-center gap-2">
            {availableDbTypes.map((type) => (
              <Chip
                key={type}
                active={filters.dbTypes.includes(type)}
                onClick={() => toggleDbType(type)}
              >
                {type}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="muted text-xs uppercase tracking-[0.18em]">Countries</span>
          <select
            multiple
            value={filters.countries}
            onChange={handleCountriesChange}
            className="input min-h-[120px]"
          >
            {availableCountries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between text-xs text-[color:var(--color-text)]/60">
            <span>{filters.countries.length || 'All'} selected</span>
            {filters.countries.length ? (
              <button
                type="button"
                className="btn-ghost text-xs px-2 py-1"
                onClick={() => onChange({ countries: [] })}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          className="btn-ghost px-3 py-1.5"
          onClick={handleReset}
        >
          Reset filters
        </button>
      </footer>
    </section>
  );
}
