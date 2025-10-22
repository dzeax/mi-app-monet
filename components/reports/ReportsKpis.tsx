'use client';

import { fmtEUR2, fmtINT } from '@/utils/format';

type Kpis = {
  vSent: number;
  turnover: number;
  margin: number;
  routingCosts: number;
  ecpm: number;
  marginPct: number | null;
};

type Props = {
  kpis: Kpis;
  periodLabel: string;
  filteredRows?: number;
  groupCount?: number;
  className?: string;
  scope: 'all' | 'focus';
  onScopeChange: (scope: 'all' | 'focus') => void;
  focusAvailable?: boolean;
  focusLabel?: string | null;
  focusDimensionLabel?: string | null;
};

type MarginTier = 'green' | 'amber' | 'red' | null;

const fmtPct = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  maximumFractionDigits: 2,
});

export default function ReportsKpis({
  kpis,
  periodLabel,
  filteredRows,
  groupCount,
  className = '',
  scope,
  onScopeChange,
  focusAvailable = false,
  focusLabel = null,
  focusDimensionLabel = null,
}: Props) {
  const marginTier = getMarginTier(kpis.marginPct);

  const turnover = fmtEUR2.format(kpis.turnover);
  const marginPct = kpis.marginPct == null ? '--' : fmtPct.format(kpis.marginPct);
  const marginValue = fmtEUR2.format(kpis.margin);
  const vSent = fmtINT.format(kpis.vSent);
  const ecpm = fmtEUR2.format(kpis.ecpm);

  const rowsLabel = filteredRows == null ? '--' : fmtINT.format(filteredRows);
  const groupsLabel = groupCount == null ? '--' : fmtINT.format(groupCount);
  const containerClass = ['relative h-full', className].filter(Boolean).join(' ');
  const focusDisabled = !focusAvailable;
  const focusSummary = focusLabel
    ? `${focusDimensionLabel ? `${focusDimensionLabel}: ` : ''}${focusLabel}`
    : 'Select a focus in the filters';
  const scopeSummary =
    scope === 'focus'
      ? focusSummary
      : 'All filtered data';

  return (
    <aside className={containerClass}>
      <div
        className="absolute inset-0 rounded-2xl border border-[color-mix(in_oklab,var(--color-border)_55%,white)] shadow-[0_20px_45px_rgba(15,23,42,0.12)]"
        style={{
          background: 'linear-gradient(160deg, rgba(226,232,240,0.85), rgba(226,232,240,0.55))',
        }}
        aria-hidden="true"
      />
      <div className="relative z-[1] flex h-full flex-col rounded-2xl px-4 py-4 md:px-5 md:py-5 gap-4 overflow-hidden">
        <header className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--color-text)]/60">
              Performance Summary
            </span>
            <h3 className="text-lg md:text-xl font-semibold text-[color:var(--color-text)]/92 mt-1">
              Live KPIs
            </h3>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-medium tabular-nums text-[color:var(--color-text)]/75 border shadow-inner"
            style={{
              background: 'rgba(79,209,197,0.18)',
              borderColor: 'rgba(79,209,197,0.32)',
            }}
          >
            {periodLabel}
          </span>
        </header>

        <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-[color:var(--color-text)]/70">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/55">
            Scope
          </span>
          <div className="inline-flex overflow-hidden rounded-full border border-[color-mix(in_oklab,var(--color-border)_65%,transparent)] bg-white/60 shadow-[0_4px_12px_rgba(15,23,42,0.08)]">
            <ScopeButton
              label="All data"
              active={scope === 'all'}
              onClick={() => onScopeChange('all')}
            />
            <ScopeButton
              label="Focus"
              active={scope === 'focus'}
              onClick={() => onScopeChange('focus')}
              disabled={focusDisabled}
            />
          </div>
          <span className="text-[color:var(--color-text)]/60">
            {focusDisabled && scope !== 'focus' ? 'Select a focus option to enable' : scopeSummary}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <KpiHighlight label="Turnover" value={turnover} />
          <KpiHighlight label="Margin (%)" value={marginPct} subValue={marginValue} tier={marginTier} />
          <KpiHighlight label="V Sent" value={vSent} />
          <KpiHighlight label="eCPM" value={ecpm} hint="EUR/k" />
        </div>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 text-xs md:text-sm text-[color:var(--color-text)]/70 tabular-nums">
          <span>
            Rows <strong className="ml-1 text-[color:var(--color-text)]/85">{rowsLabel}</strong>
          </span>
          <span>
            Groups <strong className="ml-1 text-[color:var(--color-text)]/85">{groupsLabel}</strong>
          </span>
        </footer>
      </div>
    </aside>
  );
}

function getMarginTier(value: number | null | undefined): MarginTier {
  if (value == null) return null;
  if (value >= 0.7) return 'green';
  if (value >= 0.01) return 'amber';
  return 'red';
}

function toneClassFromTier(tier: MarginTier | null) {
  switch (tier) {
    case 'green':
      return 'text-[color:var(--color-primary)]';
    case 'amber':
      return 'text-[color-mix(in_oklab,var(--color-accent)_58%,var(--color-primary)_42%)]';
    case 'red':
      return 'text-[color:var(--color-accent)]';
    default:
      return 'text-[color:var(--color-text)]/90';
  }
}

function KpiHighlight({
  label,
  value,
  tier = null,
  subValue,
  hint,
}: {
  label: string;
  value: string;
  tier?: MarginTier | null;
  subValue?: string;
  hint?: string;
}) {
  const toneClass = toneClassFromTier(tier ?? null);

  return (
    <div className="rounded-xl border border-[color-mix(in_oklab,var(--color-border)_65%,transparent)] bg-[color-mix(in_oklab,var(--color-surface)_92%,var(--color-surface-2))]/92 px-4 py-3 sm:px-5 sm:py-4 shadow-[0_16px_32px_rgba(15,23,42,0.12)]">
      <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/55">{label}</span>
      <div
        className={['mt-2 flex items-baseline gap-2', toneClass].join(' ')}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <span className="text-xl sm:text-2xl font-semibold">{value}</span>
        {hint ? <span className="text-xs opacity-70">{hint}</span> : null}
      </div>
      {subValue ? (
        <div className={['mt-1 text-xs sm:text-sm tabular-nums', tier ? toneClass : 'text-[color:var(--color-text)]/65'].join(' ')}>
          {subValue}
        </div>
      ) : null}
    </div>
  );
}

function ScopeButton({
  label,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    'px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[color:var(--color-primary)]';
  const activeClass =
    'bg-[color:var(--color-primary)] text-white shadow-[0_8px_16px_rgba(15,23,42,0.18)]';
  const inactiveClass =
    'text-[color:var(--color-text)]/70 hover:bg-white/70';
  const disabledClass = 'opacity-50 cursor-not-allowed hover:bg-transparent';

  return (
    <button
      type="button"
      className={[base, active ? activeClass : inactiveClass, disabled ? disabledClass : ''].join(' ')}
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
