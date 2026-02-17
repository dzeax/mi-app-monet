'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import type { KpiKey, TrendSeries } from '@/hooks/useDbPerformance';
import { formatDeltaPercent, formatKpiValue } from '@/components/dbs-performance/formatters';

type Props = {
  trend: TrendSeries;
  metric: KpiKey;
  onMetricChange: (metric: KpiKey) => void;
  loading?: boolean;
};

type ChartDatum = {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  forecast: number | null;
  forecastHigh: number | null;
  forecastLow: number | null;
  forecastRange: number | null;
};

type TooltipPayloadItem = {
  dataKey: string;
  value: number | null | undefined;
  payload: ChartDatum;
};

const METRIC_LABEL_MAP: Record<KpiKey, string> = {
  turnover: 'Turnover',
  margin: 'Margin',
  routingCosts: 'Routing costs',
  vSent: 'Volume sent',
  ecpm: 'eCPM',
  marginPct: 'Margin %',
};

const METRIC_OPTIONS: KpiKey[] = ['turnover', 'margin', 'marginPct', 'vSent', 'ecpm'];

export default function DbsPerformanceTrends({ trend, metric, onMetricChange, loading = false }: Props) {
  const chartData = useMemo<ChartDatum[]>(() => {
    const base: ChartDatum[] = trend.points.map((point, index): ChartDatum => ({
      key: point.key || `${index}`,
      label: point.label,
      current: toNumber(point.current[metric] as number | null | undefined),
      previous: toNumber(point.previous[metric] as number | null | undefined),
      forecast: null,
      forecastHigh: null,
      forecastLow: null,
      forecastRange: null,
    }));

    if (trend.forecast?.points?.length) {
      const merged = [...base];
      if (trend.forecast.lastActualKey) {
        const lastIndex = merged.findIndex((item) => item.key === trend.forecast!.lastActualKey);
        if (lastIndex >= 0) {
          const lastValue = merged[lastIndex];
          merged[lastIndex] = {
            ...lastValue,
            forecast: toNumber(lastValue.current),
            forecastLow: null,
            forecastHigh: null,
            forecastRange: null,
          };
        }
      }
      trend.forecast.points.forEach((point, index) => {
        const low = toNumber(point.low);
        const high = toNumber(point.high);
        merged.push({
          key: point.key || `forecast-${index}`,
          label: point.label,
          current: null,
          previous: null,
          forecast: toNumber(point.value),
          forecastLow: low,
          forecastHigh: high,
          forecastRange: low != null && high != null ? Math.max(high - low, 0) : null,
        });
      });
      return merged;
    }

    return base;
  }, [trend, metric]);

  const hasData = chartData.length > 0 && chartData.some((entry) => {
    return (
      (entry.current ?? 0) !== 0 ||
      (entry.previous ?? 0) !== 0 ||
      (entry.forecast ?? 0) !== 0 ||
      (entry.forecastRange ?? 0) !== 0
    );
  });

  if (!hasData && !loading) {
    return (
      <Card className="p-6">
        <div className="text-sm text-[color:var(--color-text)]/65">
          No trend data available for the selected filters. Try expanding the date range.
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="p-0 overflow-hidden"
      title={
        <div className="grid gap-1">
          <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
            Trends
          </span>
          <h2 className="text-lg font-semibold text-[color:var(--color-text)]">
            {METRIC_LABEL_MAP[metric]} trend
          </h2>
        </div>
      }
      right={
        <div className="text-xs text-right text-[color:var(--color-text)]/60 leading-relaxed">
          <div>Bucket: {resolutionLabel(trend.resolution)}</div>
          <div>Series: current vs previous period</div>
        </div>
      }
    >
      <div className="px-5 pt-4 pb-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {METRIC_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={option === metric}
              onClick={() => onMetricChange(option)}
            >
              {METRIC_LABEL_MAP[option]}
            </Chip>
          ))}
        </div>

        <div className="h-80">
          {loading ? (
            <div className="h-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.35)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(15, 23, 42, 0.65)', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.45)' }}
                  tickLine={{ stroke: 'rgba(148,163,184,0.45)' }}
                />
                <YAxis
                  tickFormatter={(value: number) => formatKpiValue(metric, value)}
                  tick={{ fill: 'rgba(15, 23, 42, 0.65)', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(148,163,184,0.45)' }}
                  tickLine={{ stroke: 'rgba(148,163,184,0.45)' }}
                />
                <Tooltip content={<TrendTooltip metric={metric} />} />
                {trend.forecast?.points?.length ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="forecastLow"
                      stroke="none"
                      fill="transparent"
                      connectNulls={false}
                      isAnimationActive={false}
                      stackId="forecast"
                    />
                    <Area
                      type="monotone"
                      dataKey="forecastRange"
                      stroke="none"
                      fill="var(--color-primary)"
                      fillOpacity={0.12}
                      connectNulls={false}
                      isAnimationActive={false}
                      stackId="forecast"
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="var(--color-primary)"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      dot={false}
                      name="Forecast"
                      connectNulls
                    />
                  </>
                ) : null}
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={false}
                  name="Current"
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="rgba(15,23,42,0.35)"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  dot={false}
                  name="Previous"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  );
}

function toNumber(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Number(value);
}

function resolutionLabel(resolution: TrendSeries['resolution']): string {
  if (resolution === 'day') return 'Daily';
  if (resolution === 'week') return 'Weekly';
  return 'Monthly';
}

function TrendTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  metric: KpiKey;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ChartDatum | undefined;
  if (!point) return null;

  const title = point.label || label || '';
  const current = point.current;
  const previous = point.previous;
  const forecast = point.forecast;
  const low = point.forecastLow;
  const high = point.forecastHigh;

  const hasCurrent = current != null;
  const hasPrevious = previous != null;
  const hasForecast = forecast != null;
  const diff = hasCurrent && hasPrevious && previous != null ? current! - previous : null;
  const percentDiff =
    diff != null && previous != null && previous !== 0 ? diff / Math.abs(previous) : null;

  return (
    <div className="rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-[color:var(--color-text)] mb-1">{title}</div>
      <div className="space-y-1 text-[color:var(--color-text)]/80 tabular-nums">
        {hasCurrent && current != null ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--color-primary)]" />
            <span>Current: {formatKpiValue(metric, current)}</span>
          </div>
        ) : null}
        {hasPrevious && previous != null ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--color-text)]/45" />
            <span>Previous: {formatKpiValue(metric, previous)}</span>
          </div>
        ) : null}
        {diff != null ? (
          <div className="flex items-center gap-2 pt-1 border-t border-[color:var(--color-border)]">
            <span className="text-[color:var(--color-text)]/65">Delta:</span>
            <span className={diff >= 0 ? 'text-[color:var(--color-primary)]' : 'text-[color:var(--color-accent)]'}>
              {formatKpiValue(metric, diff)}
            </span>
            {percentDiff != null ? (
              <span
                className={diff >= 0 ? 'text-[color:var(--color-primary)]/70' : 'text-[color:var(--color-accent)]/70'}
              >
                {formatDeltaPercent({ absolute: diff, percent: percentDiff })}
              </span>
            ) : null}
          </div>
        ) : null}
        {hasForecast && forecast != null ? (
          <div className="flex items-center gap-2 pt-1 border-t border-[color:var(--color-border)]">
            <span className="inline-flex h-2.5 w-2.5 rounded-full border border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/20" />
            <span>Forecast: {formatKpiValue(metric, forecast)}</span>
          </div>
        ) : null}
        {hasForecast && low != null && high != null ? (
          <div className="flex items-center justify-between text-[color:var(--color-text)]/60">
            <span>Range</span>
            <span>
              {formatKpiValue(metric, low)} - {formatKpiValue(metric, high)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
