'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type {
  BaseDetailData,
  BaseTopMover,
  BaseDailyTrendPoint,
  BaseQuarterComparison,
} from '@/components/dbs-performance/types';
import {
  formatEuro,
  formatMarginPercent,
  formatPreviousValue,
  formatValueDetailed,
  formatVolume,
} from '@/components/dbs-performance/formatters';
import { KPI_KEYS, type QuickTrendPoint } from '@/hooks/useDbPerformance';
import Card from '@/components/ui/Card';
import DeltaBadge from '@/components/dbs-performance/DeltaBadge';

type Props = {
  base: BaseDetailData | null;
  open: boolean;
  onClose: () => void;
};

const DETAIL_METRICS = ['turnover', 'marginPct', 'vSent', 'routingCosts', 'ecpm'] as const;
const DAILY_LIMIT = 14;

export default function BaseDetailDrawer({ base, open, onClose }: Props) {
  const resolvedBase = base ?? null;
  const quickTrend = useMemo(() => resolvedBase?.quickTrend ?? [], [resolvedBase]);
  const dailyTrend = useMemo(() => resolvedBase?.dailyTrend ?? [], [resolvedBase]);
  const recentDaily = useMemo(() => {
    if (!dailyTrend.length) return [];
    return dailyTrend.slice(-DAILY_LIMIT).reverse();
  }, [dailyTrend]);
  const quarterComparison = resolvedBase?.quarterComparison ?? [];
  const topMovers = resolvedBase?.topMovers ?? { gains: [], drops: [] };
  const dataTeamNote = resolvedBase?.dataTeamNote ?? null;
  const yoyDelta = resolvedBase?.yoyDelta ?? null;

  const trendMinMax = useMemo(() => {
    if (!quickTrend.length) {
      return { min: 0, max: 0 };
    }
    const values = quickTrend.map((point) => point.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [quickTrend]);
  const trendMin = trendMinMax.min;
  const trendMax = trendMinMax.max;

  if (!open || !resolvedBase) return null;

  const sectionBadge = resolvedBase.section;
  const currentMetrics = resolvedBase.metrics.current;
  const previousMetrics = resolvedBase.metrics.previous;
  const deltas = resolvedBase.metrics.deltas;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="base-detail-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl h-full bg-[color:var(--color-surface)] shadow-2xl overflow-y-auto">
        <header className="sticky top-0 z-10 bg-[color:var(--color-surface)]/95 backdrop-blur-md border-b border-[color:var(--color-border)] px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">{sectionBadge}</p>
            <h2 id="base-detail-title" className="text-xl font-semibold text-[color:var(--color-text)]">
              {resolvedBase.label}
            </h2>
            <p className="text-sm text-[color:var(--color-text)]/65">
              GEO {resolvedBase.geo} | Current vs previous period
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            aria-label="Close base insights"
          >
            Close
          </button>
        </header>

        <main className="p-6 space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <Card className="bg-white/80">
              <div className="space-y-2">
                <SummaryRow label="Turnover" value={formatEuro(currentMetrics.turnover)} />
                <SummaryRow label="Previous" value={formatEuro(previousMetrics.turnover)} muted />
                <div className="flex justify-between items-center text-xs tabular-nums">
                  <span className="text-[color:var(--color-text)]/50">Delta</span>
                  <DeltaBadge metric="turnover" delta={deltas.turnover} />
                </div>
                {showYoySection(yoyDelta)}
              </div>
            </Card>

            <Card className="bg-white/80">
              <div className="space-y-2">
                <SummaryRow
                  label="Margin %"
                  value={formatMarginPercent(currentMetrics.marginPct)}
                />
                <SummaryRow
                  label="Margin value"
                  value={formatEuro(currentMetrics.margin)}
                  muted
                />
                <SummaryRow
                  label="Routing"
                  value={formatEuro(currentMetrics.routingCosts)}
                  muted
                />
                <SummaryRow
                  label="Volume sent"
                  value={formatVolume(currentMetrics.vSent)}
                  muted
                />
              </div>
            </Card>
          </section>

          {quickTrend.length ? (
            <section className="card p-4 space-y-3">
              <header className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Turnover trend</h3>
                  <p className="text-xs text-[color:var(--color-text)]/55">
                    Last {quickTrend.length} points
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-[color:var(--color-text)]/60 tabular-nums">
                  <span>Max {formatEuro(trendMax)}</span>
                  <span>Min {formatEuro(trendMin)}</span>
                </div>
              </header>
              <Sparkline data={quickTrend} min={trendMin} max={trendMax} />
            </section>
          ) : null}

          {recentDaily.length ? (
            <DailyTable rows={recentDaily} />
          ) : null}

          {quarterComparison.length ? (
            <QuarterComparison entries={quarterComparison} />
          ) : null}

          {(topMovers.gains.length || topMovers.drops.length) ? (
            <TopMoversSection movers={topMovers} />
          ) : null}

          <section className="card p-4 space-y-3">
            <header>
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Metric breakdown</h3>
              <p className="text-xs text-[color:var(--color-text)]/55">Current vs previous period</p>
            </header>
            <div className="grid gap-3 md:grid-cols-2">
              {DETAIL_METRICS.map((metric) => {
                const { value, subValue } = formatValueDetailed(metric, resolvedBase.metrics);
                const delta = resolvedBase.metrics.deltas[metric as typeof KPI_KEYS[number]];
                return (
                  <div
                    key={metric}
                    className="rounded-xl border border-[color:var(--color-border)] bg-white/75 px-4 py-3 shadow-sm"
                  >
                    <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/55">
                      {titleFromMetric(metric)}
                    </span>
                    <div className="mt-2 text-[color:var(--color-text)] tabular-nums text-lg font-semibold">
                      {value}
                    </div>
                    {subValue ? (
                      <div className="text-xs text-[color:var(--color-text)]/60 tabular-nums mt-1">
                        {subValue}
                      </div>
                    ) : null}
                    <div className="text-xs text-[color:var(--color-text)]/60 tabular-nums mt-1">
                      Prev {formatPreviousValue(metric as typeof KPI_KEYS[number], resolvedBase.metrics)}
                    </div>
                    <DeltaBadge metric={metric as typeof KPI_KEYS[number]} delta={delta} className="mt-1" />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-4 space-y-2">
            <header>
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Data team note</h3>
            </header>
            <p className="text-sm text-[color:var(--color-text)]/70 leading-relaxed">
              {dataTeamNote ?? 'No notes from the data team for this base.'}
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm tabular-nums">
      <span className={muted ? 'text-[color:var(--color-text)]/50' : 'text-[color:var(--color-text)]/70'}>
        {label}
      </span>
      <span className={muted ? 'text-[color:var(--color-text)]/60' : 'font-semibold text-[color:var(--color-text)]'}>
        {value}
      </span>
    </div>
  );
}

function showYoySection(yoyDelta: BaseDetailData['yoyDelta']) {
  if (!yoyDelta) return null;
  return (
    <div className="flex justify-between items-center text-xs tabular-nums">
      <span className="text-[color:var(--color-text)]/50">YoY</span>
      <DeltaBadge metric="turnover" delta={yoyDelta} />
    </div>
  );
}

function DailyTable({ rows }: { rows: BaseDailyTrendPoint[] }) {
  return (
    <section className="card p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Daily performance</h3>
        <span className="text-xs text-[color:var(--color-text)]/55">
          Last {rows.length} days
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[color:var(--color-border)] text-sm">
          <thead className="bg-[color:var(--color-surface-2)]/60 text-[color:var(--color-text)]/65 text-xs uppercase tracking-[0.16em]">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Date</th>
              <th className="px-3 py-3 text-right font-semibold">Turnover</th>
              <th className="px-3 py-3 text-right font-semibold">Margin %</th>
              <th className="px-3 py-3 text-right font-semibold">Volume</th>
              <th className="px-3 py-3 text-right font-semibold">Routing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]/60 text-[color:var(--color-text)]/75 tabular-nums">
            {rows.map((row) => {
              const marginPct = row.turnover > 0 ? row.margin / row.turnover : null;
              return (
                <tr key={row.date}>
                  <td className="px-3 py-2">{format(parseISO(row.date), 'dd MMM yyyy')}</td>
                  <td className="px-3 py-2 text-right">{formatEuro(row.turnover)}</td>
                  <td className="px-3 py-2 text-right">{formatMarginPercent(marginPct)}</td>
                  <td className="px-3 py-2 text-right">{formatVolume(row.vSent)}</td>
                  <td className="px-3 py-2 text-right">{formatEuro(row.routingCosts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuarterComparison({ entries }: { entries: BaseQuarterComparison[] }) {
  return (
    <section className="card p-4 space-y-3">
      <header>
        <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Quarterly comparison</h3>
        <p className="text-xs text-[color:var(--color-text)]/55">Historical turnover and margin %</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="rounded-xl border border-[color:var(--color-border)] bg-white/75 px-4 py-3 shadow-sm space-y-1"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[color:var(--color-text)]">{entry.label}</span>
              <span className="tabular-nums text-[color:var(--color-text)]/70">
                {formatEuro(entry.turnover)}
              </span>
            </div>
            <div className="text-xs text-[color:var(--color-text)]/60">
              Margin {formatMarginPercent(entry.marginPct)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopMoversSection({ movers }: { movers: BaseDetailData['topMovers'] }) {
  return (
    <section className="card p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Top movers</h3>
        <p className="text-xs text-[color:var(--color-text)]/55">
          Campaigns with the largest turnover shifts vs previous period
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <MoversColumn title="Gains" items={movers.gains} tone="positive" />
        <MoversColumn title="Drops" items={movers.drops} tone="negative" />
      </div>
    </section>
  );
}

function MoversColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: BaseTopMover[];
  tone: 'positive' | 'negative';
}) {
  const emptyMessage =
    tone === 'positive' ? 'No positive movers in this period.' : 'No negative movers in this period.';

  return (
    <div className="space-y-3">
      <h4 className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-text)]/55">{title}</h4>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.campaign}
              className="rounded-xl border border-[color:var(--color-border)] bg-white/75 px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">{item.label}</p>
                  {item.partner ? (
                    <p className="text-xs text-[color:var(--color-text)]/55">Partner {item.partner}</p>
                  ) : null}
                </div>
                <div className="text-right space-y-1">
                  <p className="text-sm font-semibold text-[color:var(--color-text)] tabular-nums">
                    {formatEuro(item.current)}
                  </p>
                  <DeltaBadge metric="turnover" delta={item.delta} />
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/45 tabular-nums">
                    Prev {formatEuro(item.previous)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[color:var(--color-text)]/60">{emptyMessage}</p>
      )}
    </div>
  );
}

function Sparkline({ data, min, max }: { data: QuickTrendPoint[]; min: number; max: number }) {
  if (!data.length || max - min === 0) return null;
  const width = 320;
  const height = 120;
  const paddingX = 12;
  const paddingY = 16;
  const range = max - min || 1;

  const path = data
    .map((point, index) => {
      const x = paddingX + (index / Math.max(1, data.length - 1)) * (width - paddingX * 2);
      const y = height - paddingY - ((point.value - min) / range) * (height - paddingY * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${width - paddingX},${height - paddingY} L${paddingX},${height - paddingY} Z`}
        fill="url(#sparkline-fill)"
        opacity={0.3}
      />
      <path
        d={path}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function titleFromMetric(metric: string): string {
  switch (metric) {
    case 'turnover':
      return 'Turnover';
    case 'margin':
      return 'Margin';
    case 'marginPct':
      return 'Margin %';
    case 'routingCosts':
      return 'Routing costs';
    case 'vSent':
      return 'Volume sent';
    case 'ecpm':
      return 'eCPM';
    default:
      return metric;
  }
}
