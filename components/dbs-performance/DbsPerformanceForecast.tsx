'use client';

import Card from '@/components/ui/Card';
import type { ForecastInsight } from '@/hooks/useDbPerformance';
import { formatEuro } from '@/components/dbs-performance/formatters';

type Props = {
  forecast: {
    month: ForecastInsight | null;
    quarter: ForecastInsight | null;
  };
  loading?: boolean;
};

export default function DbsPerformanceForecast({ forecast, loading = false }: Props) {
  const cards: Array<{ title: string; insight: ForecastInsight | null }> = [
    { title: 'Forecast (Month)', insight: forecast.month },
    { title: 'Forecast (Quarter)', insight: forecast.quarter },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map(({ title, insight }) => (
        <Card key={title} className="bg-[color:var(--color-surface)]/92">
          <header className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">{title}</h3>
              <p className="text-xs text-[color:var(--color-text)]/55">
                {insight ? insight.label : 'Not enough data'}
              </p>
            </div>
            {insight ? (
              <span className="text-xs tabular-nums text-[color:var(--color-text)]/55">
                Target {insight.endDate}
              </span>
            ) : null}
          </header>

          {loading ? (
            <div className="mt-4 h-24 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] animate-pulse" />
          ) : insight ? (
            <div className="mt-4 grid gap-3 text-sm tabular-nums text-[color:var(--color-text)]/75">
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
                  Projected
                </span>
                <span className="text-lg font-semibold text-[color:var(--color-text)]">
                  {formatEuro(insight.projected)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Actual to date</span>
                <span>{formatEuro(insight.actual)}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining days</span>
                <span>{insight.remainingDays}</span>
              </div>
              <div className="flex justify-between">
                <span>Run rate</span>
                <span>
                  {formatEuro(insight.runRate)}
                  <span className="text-[color:var(--color-text)]/45"> /day</span>
                </span>
              </div>
              <div className="flex justify-between text-xs text-[color:var(--color-text)]/60">
                <span>Confidence band</span>
                <span>
                  {formatEuro(insight.bandLow)} - {formatEuro(insight.bandHigh)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-[color:var(--color-text)]/60">
              Not enough historical data to project this period.
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
