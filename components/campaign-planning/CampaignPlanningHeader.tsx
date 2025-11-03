'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type ViewMode = 'day' | 'week' | 'month';

type Props = {
  activeDate: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNavigate: (action: 'prev' | 'next' | 'today') => void;
  onCreate: () => void;
};

export default function CampaignPlanningHeader({ activeDate, viewMode, onViewModeChange, onNavigate, onCreate }: Props) {
  const formattedDate =
    viewMode === 'day'
      ? format(activeDate, "EEEE, dd 'de' MMMM yyyy", { locale: es })
      : viewMode === 'week'
        ? format(activeDate, "'Week of' dd MMM yyyy", { locale: es })
        : format(activeDate, "MMMM yyyy", { locale: es });

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => onNavigate('today')}>
            Today
          </button>
          <div className="flex items-center rounded-xl border border-[color:var(--color-border)] bg-white shadow-sm">
            <button
              type="button"
              className="px-3 py-2 text-lg font-semibold text-[color:var(--color-text)]/80 hover:bg-black/5 rounded-l-xl"
              onClick={() => onNavigate('prev')}
              aria-label="Previous period"
            >
              ←
            </button>
            <div className="px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/65">
              {formattedDate}
            </div>
            <button
              type="button"
              className="px-3 py-2 text-lg font-semibold text-[color:var(--color-text)]/80 hover:bg-black/5 rounded-r-xl"
              onClick={() => onNavigate('next')}
              aria-label="Next period"
            >
              →
            </button>
          </div>
        </div>
        <h1 className="text-3xl font-semibold text-[color:var(--color-text)]">Campaign Planning</h1>
        <p className="text-sm text-[color:var(--color-text)]/60">
          Organise upcoming activations across partners and databases. Drag and drop and automation will arrive in the next sprint.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex shrink-0 rounded-xl border border-[color:var(--color-border)] bg-white p-1 shadow-inner">
          {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewModeChange(mode)}
              className={[
                'px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors',
                viewMode === mode
                  ? 'bg-[color:var(--color-primary)] text-white shadow-sm'
                  : 'text-[color:var(--color-text)]/70 hover:bg-black/5',
              ].join(' ')}
              aria-pressed={viewMode === mode}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <button type="button" className="btn-primary px-4 py-2" onClick={onCreate}>
          + New campaign
        </button>
      </div>
    </header>
  );
}

