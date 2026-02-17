'use client';

import { format } from 'date-fns';

type ViewMode = 'day' | 'week' | 'month';

type Props = {
  activeDate: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigate: (action: 'prev' | 'next' | 'today') => void;
  onCreate: () => void;
  reportingOpen: boolean;
  onToggleReporting: () => void;
  filtersSlot?: React.ReactNode;
};

export default function CampaignPlanningHeader({
  activeDate,
  viewMode,
  onViewModeChange,
  onNavigate,
  onCreate,
  reportingOpen,
  onToggleReporting,
  filtersSlot,
}: Props) {
  const periodLabel =
    viewMode === 'day'
      ? format(activeDate, 'EEEE, MMM dd yyyy')
      : viewMode === 'week'
        ? format(activeDate, "'Week of' MMM dd yyyy")
        : format(activeDate, 'MMMM yyyy');

  return (
    <header className="flex flex-col gap-5 mb-6">
      
      {/* --- FILA SUPERIOR: Título + Acciones Globales --- */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Campaign Planning</h1>
            <p className="text-sm text-gray-500">Manage and schedule your marketing campaigns</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleReporting}
            className={[
              'inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              reportingOpen
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900',
            ].join(' ')}
          >
            {reportingOpen ? 'Hide reporting' : 'Show reporting'}
          </button>
          
          <button 
            type="button" 
            className="btn-primary px-4 py-2 text-sm shadow-md shadow-emerald-500/20" 
            onClick={onCreate}
          >
            + New campaign
          </button>
        </div>
      </div>

      {/* --- FILA INFERIOR: Toolbar (Navegación + Filtros) --- */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        
        {/* IZQUIERDA: Navegación Temporal */}
        <div className="flex items-center gap-2 pl-2">
            <button 
                type="button" 
                className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-transparent hover:border-gray-200 transition-all" 
                onClick={() => onNavigate('today')}
            >
                Today
            </button>
            
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/50 mx-2">
              <button
                type="button"
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white rounded-md transition-colors m-0.5"
                onClick={() => onNavigate('prev')}
                aria-label="Previous period"
              >
                <NavChevron direction="left" />
              </button>
              
              <div className="px-3 py-1 text-sm font-semibold text-gray-800 min-w-[140px] text-center uppercase tracking-wide text-[11px]">
                {periodLabel}
              </div>
              
              <button
                type="button"
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white rounded-md transition-colors m-0.5"
                onClick={() => onNavigate('next')}
                aria-label="Next period"
              >
                <NavChevron direction="right" />
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-2" />

            {/* Selector de Vista (Segmented Control) */}
            <div className="flex items-center rounded-lg bg-gray-100 p-1">
                {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onViewModeChange(mode)}
                    className={[
                      'px-3 py-1 text-xs font-semibold rounded-md transition-all',
                      viewMode === mode
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    ].join(' ')}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
            </div>
        </div>

        {/* DERECHA: Slot de Filtros */}
        <div className="flex-1 flex justify-end min-w-[200px]">
            {filtersSlot}
        </div>
      </div>
    </header>
  );
}

function NavChevron({ direction }: { direction: 'left' | 'right' }) {
  const rotation = direction === 'left' ? 'rotate-180' : '';
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 ${rotation}`}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 5l5 5-5 5" />
    </svg>
  );
}
