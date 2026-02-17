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

/* --- Componentes UI Auxiliares --- */
const FilterDropdown = ({ 
  label, 
  valueLabel, 
  isOpen, 
  onToggle, 
  onClose, 
  children 
}: { 
  label: string; 
  valueLabel: React.ReactNode; 
  isOpen: boolean; 
  onToggle: () => void; 
  onClose: () => void;
  children: React.ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  return (
    <div className="relative" ref={ref}>
        <button
            type="button"
            onClick={onToggle}
            className={`h-9 flex items-center gap-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                isOpen 
                ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)] ring-1 ring-[color:var(--color-primary)]/25'
                : 'border-[var(--color-border)] bg-[var(--color-surface-2)]/50 text-[var(--color-text)]/75 hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
            }`}
        >
            <span className="text-xs uppercase tracking-wider text-[var(--color-text)]/45 font-bold">{label}</span>
            <span className="w-px h-3 bg-[var(--color-border)] mx-1"></span>
            <span className="truncate max-w-[140px]">{valueLabel}</span>
            <svg className={`w-4 h-4 text-[var(--color-text)]/45 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        </button>
        {isOpen && (
            <div className="absolute top-full mt-1 left-0 z-50 w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                {children}
            </div>
        )}
    </div>
  );
};

const ToggleSwitch = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <label className="h-9 flex items-center gap-2 cursor-pointer group">
        <div className="relative">
            <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
            <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-[color:var(--color-primary)]' : 'bg-[var(--color-border)] group-hover:bg-[var(--color-text)]/25'}`}></div>
            <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
        </div>
        <span className={`text-xs font-medium ${checked ? 'text-[color:var(--color-primary)]' : 'text-[var(--color-text)]/60 group-hover:text-[var(--color-text)]/80'}`}>
            {label}
        </span>
    </label>
);

export default function CampaignPlanningFiltersBar({ filters, onChange, available, className }: Props) {
  const [openMenu, setOpenMenu] = useState<'db' | 'status' | null>(null);

  // --- Handlers ---
  const handleToggleStatus = (status: CampaignStatus) => onChange({ ...filters, statuses: toggle(filters.statuses, status) });
  const handleToggleDatabase = (database: string) => onChange({ ...filters, databases: toggle(filters.databases, database) });
  
  // --- Summaries ---
  const dbSummary = useMemo(() => {
    if (!filters.databases.length) return 'All';
    if (filters.databases.length === 1) return filters.databases[0];
    return `${filters.databases.length} Selected`;
  }, [filters.databases]);

  const statusSummary = useMemo(() => {
    if (!filters.statuses.length) return 'All';
    if (filters.statuses.length === 1) return filters.statuses[0];
    return `${filters.statuses.length} Selected`;
  }, [filters.statuses]);

  const hasActiveFilters = filters.databases.length > 0 || filters.statuses.length > 0;

  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      
      {/* 1. Database Dropdown */}
      <FilterDropdown 
        label="DB" 
        valueLabel={
            <div className="flex items-center gap-1.5">
               {filters.databases.length === 1 && <DatabaseFlag name={filters.databases[0]} className="w-3.5 h-3.5 rounded-[1px]" />}
               <span>{dbSummary}</span>
            </div>
        }
        isOpen={openMenu === 'db'} 
        onToggle={() => setOpenMenu(openMenu === 'db' ? null : 'db')}
        onClose={() => setOpenMenu(null)}
      >
         <div className="max-h-60 overflow-y-auto space-y-0.5">
            {available.databases.map(db => (
                <label key={db} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm text-[var(--color-text)]/80 hover:bg-[var(--color-surface-2)]">
                    <input 
                        type="checkbox" 
                        checked={filters.databases.includes(db)} 
                        onChange={() => handleToggleDatabase(db)}
                        className="rounded border-[var(--color-border)] accent-[color:var(--color-primary)]"
                    />
                    <DatabaseFlag name={db} className="w-4 h-4" />
                    <span>{db}</span>
                </label>
            ))}
         </div>
      </FilterDropdown>

      {/* 2. Status Dropdown */}
      <FilterDropdown 
        label="Status" 
        valueLabel={statusSummary}
        isOpen={openMenu === 'status'} 
        onToggle={() => setOpenMenu(openMenu === 'status' ? null : 'status')}
        onClose={() => setOpenMenu(null)}
      >
         <div className="max-h-60 overflow-y-auto space-y-0.5">
            {available.statuses.map(status => (
                <label key={status} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm text-[var(--color-text)]/80 hover:bg-[var(--color-surface-2)]">
                    <input 
                        type="checkbox" 
                        checked={filters.statuses.includes(status)} 
                        onChange={() => handleToggleStatus(status)}
                        className="rounded border-[var(--color-border)] accent-[color:var(--color-primary)]"
                    />
                    <span>{status}</span>
                </label>
            ))}
         </div>
      </FilterDropdown>

      <div className="w-px h-5 bg-[var(--color-border)] mx-1"></div>

      {/* 3. Pending Toggle */}
      <ToggleSwitch 
        label="Pending perf." 
        checked={filters.onlyPendingPerformance} 
        onChange={() => onChange({ ...filters, onlyPendingPerformance: !filters.onlyPendingPerformance })} 
      />

      {/* 4. Clear Button (Solo si hay filtros activos) */}
      {(hasActiveFilters || filters.onlyPendingPerformance) && (
          <button 
            onClick={() => onChange({ statuses: [], databases: [], onlyPendingPerformance: false })}
            className="ml-auto btn-ghost h-9 px-3 text-xs"
          >
            Clear
          </button>
      )}
    </div>
  );
}
