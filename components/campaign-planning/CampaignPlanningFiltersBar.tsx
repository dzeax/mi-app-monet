'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DatabaseFlag from '@/components/campaign-planning/DatabaseFlag';
import type { CampaignStatus } from '@/components/campaign-planning/types';

export type PlanningFilters = {
  statuses: CampaignStatus[];
  databases: string[];
  onlyPendingPerformance: boolean;
};

type Props = {
  filters: PlanningFilters;
  onChange: (filters: PlanningFilters) => void;
  available: {
    statuses: CampaignStatus[];
    databases: string[];
  };
  className?: string;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function CampaignPlanningFiltersBar({ filters, onChange, available, className }: Props) {
  const [dbMenuOpen, setDbMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const hasActive =
    filters.databases.length + filters.statuses.length > 0 || filters.onlyPendingPerformance;

  const handleToggleStatus = (status: CampaignStatus) => {
    onChange({
      ...filters,
      statuses: toggle(filters.statuses, status),
    });
  };

  const handleToggleDatabase = (database: string) => {
    onChange({
      ...filters,
      databases: toggle(filters.databases, database),
    });
  };

  useEffect(() => {
    if (!dbMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setDbMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDbMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [dbMenuOpen]);

  const databaseSummary = useMemo(() => {
    if (!filters.databases.length) return 'All databases';
    if (filters.databases.length === 1) return filters.databases[0];
    return `${filters.databases[0]} +${filters.databases.length - 1}`;
  }, [filters.databases]);

  return (
    <section
      className={[
        'rounded-[26px] border border-[color:var(--color-border)]/80 bg-gradient-to-b from-white via-white to-[color:var(--color-surface-2)]/40',
        'px-4 py-3 md:px-5 md:py-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)]',
        'flex flex-col gap-4 w-full',
        className ?? '',
      ].join(' ')}
    >
      <div className="w-full">
        <div className="flex w-full flex-col gap-4 md:flex-row md:items-start md:gap-8">
          <div className="flex flex-col gap-2 md:max-w-xs flex-shrink-0">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-[color:var(--color-primary)]">
              Databases
            </span>
            <div className="relative min-w-[230px]" ref={menuRef}>
              <button
                type="button"
                onClick={() => setDbMenuOpen((prev) => !prev)}
                className={[
                  'inline-flex min-w-[230px] items-center justify-between rounded-2xl border px-3 py-2 text-sm font-semibold transition',
                  'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 text-[color:var(--color-text)]/80 hover:border-[color:var(--color-primary)]/60',
                ].join(' ')}
                aria-expanded={dbMenuOpen}
              >
                <span className="flex items-center gap-2 truncate">
                  {filters.databases[0] ? <DatabaseFlag name={filters.databases[0]} className="h-4 w-4" /> : null}
                  <span className="truncate">{databaseSummary}</span>
                </span>
                <svg
                  className={`h-4 w-4 transition-transform ${dbMenuOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {dbMenuOpen ? (
                <div className="absolute z-20 mt-2 w-[280px] rounded-2xl border border-[color:var(--color-border)] bg-white p-3 shadow-xl">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[color:var(--color-text)]/60 mb-2">
                    Select databases
                  </p>
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {available.databases.length === 0 ? (
                      <p className="text-xs text-[color:var(--color-text)]/50">No databases yet.</p>
                    ) : null}
                    {available.databases.map((db) => {
                      const active = filters.databases.includes(db);
                      return (
                        <label
                          key={db}
                          className={[
                            'flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm',
                            active
                              ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                              : 'border-[color:var(--color-border)] text-[color:var(--color-text)]/80 hover:border-[color:var(--color-primary)]/50',
                          ].join(' ')}
                        >
                          <span className="flex items-center gap-2">
                            <DatabaseFlag name={db} className="h-4 w-4" />
                            <span>{db}</span>
                          </span>
                          <input
                            type="checkbox"
                            className="accent-[color:var(--color-primary)]"
                            checked={active}
                            onChange={() => handleToggleDatabase(db)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 min-w-0">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-[color:var(--color-text)]/60">
              Status
            </span>
            <div className="flex flex-wrap gap-1.5 planning-status-scroll">
              <style>{`
                .planning-status-scroll::-webkit-scrollbar { display: none; }
              `}</style>
              {available.statuses.map((status) => {
                const active = filters.statuses.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => handleToggleStatus(status)}
                    className={[
                      'px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap',
                      active
                        ? 'bg-[color:var(--color-primary)] text-white shadow-sm'
                        : 'bg-[color:var(--color-border)]/50 text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-border)]/70',
                    ].join(' ')}
                  >
                    {status}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    onlyPendingPerformance: !filters.onlyPendingPerformance,
                  })
                }
                className={[
                  'px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap',
                  filters.onlyPendingPerformance
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                ].join(' ')}
              >
                Only pending performance
              </button>
            </div>
          </div>
        </div>
      </div>
      {hasActive ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-border)]/90 bg-[color:var(--color-surface-2)]/60 px-3 py-2">
          {filters.databases.map((db) => (
            <button
              key={`db-chip-${db}`}
              type="button"
              onClick={() =>
                onChange({
                  ...filters,
                  databases: filters.databases.filter((item) => item !== db),
                })
              }
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[color:var(--color-text)] shadow-sm"
            >
              <span>DB:</span>
              <span className="max-w-[120px] truncate">{db}</span>
              <span aria-hidden>×</span>
            </button>
          ))}
          {filters.statuses.map((status) => (
            <button
              key={`status-chip-${status}`}
              type="button"
              onClick={() =>
                onChange({
                  ...filters,
                  statuses: filters.statuses.filter((item) => item !== status),
                })
              }
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[color:var(--color-text)] shadow-sm"
            >
              <span>Status:</span>
              {status}
              <span aria-hidden>×</span>
            </button>
          ))}
          {filters.onlyPendingPerformance ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...filters,
                  onlyPendingPerformance: false,
                })
              }
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[color:var(--color-text)] shadow-sm"
            >
              <span>Pending:</span>
              Only pending performance
              <span aria-hidden>x</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
