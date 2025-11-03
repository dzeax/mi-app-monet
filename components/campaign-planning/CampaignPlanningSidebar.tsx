'use client';

import type { CampaignStatus } from '@/components/campaign-planning/types';
import DatabaseFlag from '@/components/campaign-planning/DatabaseFlag';

export type PlanningFilters = {
  statuses: CampaignStatus[];
  databases: string[];
};

type Props = {
  filters: PlanningFilters;
  onChange: (filters: PlanningFilters) => void;
  available: {
    statuses: CampaignStatus[];
    databases: string[];
  };
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function CampaignPlanningSidebar({ filters, onChange, available }: Props) {
  const handleToggle = <K extends keyof PlanningFilters>(key: K, value: PlanningFilters[K][number]) => {
    onChange({
      ...filters,
      [key]: toggle(filters[key], value),
    });
  };

  const resetFilters = () => {
    onChange({
      statuses: [],
      databases: [],
    });
  };

  return (
    <aside className="space-y-4">
      <div className="sidebar-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-base font-semibold">Filters</h2>
            <p className="muted text-xs">Refine the planning board</p>
          </div>
          <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <section className="border-t border-[color:var(--color-border)] pt-3 mt-3 space-y-3">
          <div className="rounded-xl border border-[color:var(--color-primary)]/70 bg-[color:var(--color-primary)]/8 px-3 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--color-primary)]">
                Databases
              </h3>
              <span className="text-[10px] font-semibold text-[color:var(--color-primary)]/80 uppercase tracking-[0.18em]">
                Primary filter
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--color-text)]/65">
              Choose the databases you need to focus on. This drives the board priorities.
            </p>
            <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
              {available.databases.map((db) => {
                const active = filters.databases.includes(db);
                return (
                  <label
                    key={db}
                    className={[
                      'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                      active
                        ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-text)]'
                        : 'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/50 text-[color:var(--color-text)]/75 hover:border-[color:var(--color-primary)]/60',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <DatabaseFlag name={db} className="h-4 w-4" />
                      {db}
                    </span>
                    <input
                      type="checkbox"
                      className="accent-[color:var(--color-primary)]"
                      checked={active}
                      onChange={() => handleToggle('databases', db)}
                    />
                  </label>
                );
              })}
              {available.databases.length === 0 ? (
                <p className="text-xs text-[color:var(--color-text)]/55">No databases available yet.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="border-t border-[color:var(--color-border)] pt-3 mt-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">Status</h3>
          <div className="flex flex-wrap gap-2">
            {available.statuses.map((status) => {
              const active = filters.statuses.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleToggle('statuses', status)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                    active
                      ? 'bg-[color:var(--color-primary)] text-white'
                      : 'bg-[color:var(--color-border)]/40 text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-border)]/60',
                  ].join(' ')}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
