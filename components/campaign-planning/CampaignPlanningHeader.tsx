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

  const monthLabel = format(activeDate, 'MMMM yyyy');
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-start gap-4 xl:flex-nowrap">
        <div className="flex flex-col gap-3 min-w-[240px] flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => onNavigate('today')}>
              Today
            </button>
            <div className="flex items-center rounded-xl border border-[color:var(--color-border)] bg-white shadow-sm">
              <button
                type="button"
                className="px-3 py-2 text-[color:var(--color-text)]/70 hover:bg-black/5 rounded-l-xl"
                onClick={() => onNavigate('prev')}
                aria-label="Previous period"
              >
                <NavChevron direction="left" />
              </button>
              <div className="px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/70">
                {periodLabel}
              </div>
              <button
                type="button"
                className="px-3 py-2 text-[color:var(--color-text)]/70 hover:bg-black/5 rounded-r-xl"
                onClick={() => onNavigate('next')}
                aria-label="Next period"
              >
                <NavChevron direction="right" />
              </button>
            </div>
          </div>
        </div>

        {filtersSlot ? <div className="flex-1 min-w-[320px] max-w-5xl">{filtersSlot}</div> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-shrink-0 min-w-[260px]">
          <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/60 shadow-sm">
            {capitalizedMonth}
          </span>
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
          <button
            type="button"
            onClick={onToggleReporting}
            className={[
              'inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
              reportingOpen
                ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                : 'border-[color:var(--color-border)] bg-white text-[color:var(--color-text)]/80 hover:border-[color:var(--color-primary)]/60',
            ].join(' ')}
          >
            {reportingOpen ? 'Hide reporting' : 'Show reporting'}
          </button>
          <button type="button" className="btn-primary px-4 py-2" onClick={onCreate}>
            + New campaign
          </button>
        </div>
      </div>

      <h1 className="text-3xl font-semibold text-[color:var(--color-text)]">Campaign Planning</h1>
    </header>
  );
}

function NavChevron({ direction }: { direction: 'left' | 'right' }) {
  const rotation = direction === 'left' ? 'rotate-180' : '';

  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`h-4 w-4 ${rotation}`}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 5l5 5-5 5" />
    </svg>
  );
}
