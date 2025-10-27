'use client';

import type { KpiKey, MetricDelta } from '@/hooks/useDbPerformance';
import { formatDeltaAbsolute, formatDeltaPercent } from '@/components/dbs-performance/formatters';

type Props = {
  metric: KpiKey;
  delta: MetricDelta;
  showPercent?: boolean;
  className?: string;
};

export default function DeltaBadge({ metric, delta, showPercent = true, className = '' }: Props) {
  const tone =
    delta.absolute === 0
      ? 'text-[color:var(--color-text)]/60'
      : delta.absolute > 0
        ? 'text-[color:var(--color-primary)]'
        : 'text-[color:var(--color-accent)]';

  const icon = delta.absolute > 0 ? <ArrowUp /> : delta.absolute < 0 ? <ArrowDown /> : null;
  const absLabel = formatDeltaAbsolute(metric, delta);
  const pctLabel = showPercent ? formatDeltaPercent(delta) : null;

  return (
    <span className={['inline-flex items-center gap-2 text-xs font-semibold tabular-nums', tone, className].join(' ')}>
      {icon}
      <span>{absLabel}</span>
      {pctLabel ? <span className="text-[color:inherit]/70">{pctLabel}</span> : null}
    </span>
  );
}

function ArrowUp() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 12 12"
      fill="currentColor"
      role="img"
      aria-hidden="true"
    >
      <path d="M6 1.5a.75.75 0 0 1 .53.22l4 4a.75.75 0 1 1-1.06 1.06L6.75 4.37V10a.75.75 0 0 1-1.5 0V4.37L2.53 6.78a.75.75 0 1 1-1.06-1.06l4-4A.75.75 0 0 1 6 1.5Z" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 12 12"
      fill="currentColor"
      role="img"
      aria-hidden="true"
    >
      <path d="M6 10.5a.75.75 0 0 1-.53-.22l-4-4a.75.75 0 1 1 1.06-1.06L5.25 7.63V2a.75.75 0 0 1 1.5 0v5.63l2.72-2.41a.75.75 0 0 1 1.06 1.06l-4 4A.75.75 0 0 1 6 10.5Z" />
    </svg>
  );
}
