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
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
              Campaign Planning
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Manage and schedule your marketing campaigns
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
            <button
              type="button"
              onClick={onToggleReporting}
              className={[
                'btn-ghost h-9 px-3 text-xs',
                reportingOpen
                  ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                  : '',
              ].join(' ')}
            >
              {reportingOpen ? 'Hide reporting' : 'Show reporting'}
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4 text-xs shadow-sm"
              onClick={onCreate}
            >
              + New campaign
            </button>
          </div>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 shadow-sm">
        <div className="flex items-center gap-2 pl-2">
          <button
            type="button"
            className="h-9 flex items-center text-sm font-medium text-[var(--color-text)]/70 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] px-3 rounded-lg border border-transparent hover:border-[var(--color-border)] transition-all"
            onClick={() => onNavigate('today')}
          >
            Today
          </button>

          <div className="h-9 flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 mx-2">
            <button
              type="button"
              className="h-8 w-8 inline-flex items-center justify-center text-[var(--color-text)]/60 hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded-md transition-colors m-0.5"
              onClick={() => onNavigate('prev')}
              aria-label="Previous period"
            >
              <NavChevron direction="left" />
            </button>

            <div className="min-h-[36px] px-3 flex items-center text-sm font-semibold text-[var(--color-text)] min-w-[140px] text-center uppercase tracking-wide text-[11px]">
              {periodLabel}
            </div>

            <button
              type="button"
              className="h-8 w-8 inline-flex items-center justify-center text-[var(--color-text)]/60 hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded-md transition-colors m-0.5"
              onClick={() => onNavigate('next')}
              aria-label="Next period"
            >
              <NavChevron direction="right" />
            </button>
          </div>

          <div className="h-6 w-px bg-[var(--color-border)] mx-2" />

          <div className="h-9 flex items-center rounded-lg bg-[var(--color-surface-2)] p-1">
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                className={[
                  'h-7 px-3 inline-flex items-center text-xs font-semibold rounded-md transition-all',
                  viewMode === mode
                    ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text)]/60 hover:text-[var(--color-text)]',
                ].join(' ')}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex justify-end min-w-[200px]">
          {filtersSlot}
        </div>
      </div>
    </div>
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
