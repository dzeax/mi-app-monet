'use client';

import Card from '@/components/ui/Card';
import type { DateRange, MetricComparison, MetricDelta } from '@/hooks/useDbPerformance';
import { KPI_KEYS } from '@/hooks/useDbPerformance';
import {
  formatComparison,
  formatPreviousValue,
  formatRange,
  formatValueDetailed,
} from '@/components/dbs-performance/formatters';
import DeltaBadge from '@/components/dbs-performance/DeltaBadge';

type Props = {
  metrics: MetricComparison;
  range: DateRange;
  compareRange: DateRange;
  loading?: boolean;
  showYoy: boolean;
  yoyDelta?: MetricDelta | null;
};

const CARD_LAYOUT: Array<{
  key: (typeof KPI_KEYS)[number];
  label: string;
  hint?: string;
}> = [
  { key: 'turnover', label: 'Turnover' },
  { key: 'marginPct', label: 'Margin %' },
  { key: 'vSent', label: 'Volume sent' },
  { key: 'routingCosts', label: 'Routing costs' },
  { key: 'ecpm', label: 'eCPM', hint: 'EUR per 1K sends' },
];

export default function DbsPerformanceKpis({
  metrics,
  range,
  compareRange,
  loading = false,
  showYoy,
  yoyDelta,
}: Props) {
  return (
    <Card
      className="bg-[color:var(--color-surface)]/95 shadow-[0_20px_45px_rgba(15,23,42,0.12)]"
      title={
        <div className="grid gap-1">
          <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
            Summary
          </span>
          <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Performance snapshot</h2>
        </div>
      }
      right={
        <div className="text-xs text-right text-[color:var(--color-text)]/60 leading-relaxed">
          <div>Range {formatRange(range)}</div>
          <div>Comparing vs {formatComparison(compareRange)}</div>
        </div>
      }
    >
      {showYoy && yoyDelta ? (
        <div className="mb-4 flex items-center justify-between text-sm tabular-nums">
          <span className="text-[color:var(--color-text)]/65">YoY vs same period last year</span>
          <DeltaBadge metric="turnover" delta={yoyDelta} />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {CARD_LAYOUT.map(({ key, label, hint }) => (
          <KpiCard
            key={key}
            label={label}
            hint={hint}
            metricKey={key}
            comparison={metrics}
            loading={loading}
          />
        ))}
      </div>
    </Card>
  );
}

function KpiCard({
  label,
  hint,
  metricKey,
  comparison,
  loading,
}: {
  label: string;
  hint?: string;
  metricKey: (typeof KPI_KEYS)[number];
  comparison: MetricComparison;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] animate-pulse h-[118px]" />
    );
  }

  const { value, subValue } = formatValueDetailed(metricKey, comparison);
  const previousLabel = formatPreviousValue(metricKey, comparison);

  return (
    <div className="rounded-xl border border-[color-mix(in_oklab,var(--color-border)_65%,transparent)] bg-white/75 px-4 py-3 shadow-[0_16px_32px_rgba(15,23,42,0.12)]">
      <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
        {label}
      </span>
      <div
        className="mt-2 flex items-baseline gap-2 text-[color:var(--color-text)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <span className="text-xl font-semibold">{value}</span>
        {hint ? <span className="text-xs text-[color:var(--color-text)]/60">{hint}</span> : null}
      </div>
      {subValue ? (
        <div className="text-xs text-[color:var(--color-text)]/60 mt-1 tabular-nums">
          Margin value {subValue}
        </div>
      ) : null}
      <div className="text-xs text-[color:var(--color-text)]/60 mt-1 tabular-nums">
        Prev {previousLabel}
      </div>
      <DeltaBadge metric={metricKey} delta={comparison.deltas[metricKey]} />
    </div>
  );
}
