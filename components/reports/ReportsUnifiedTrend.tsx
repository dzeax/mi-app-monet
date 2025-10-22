'use client';

import {
  ResponsiveContainer,
  LineChart, Line,
  CartesianGrid,
  XAxis, YAxis,
  Tooltip, Legend,
} from 'recharts';
import { fmtEUR2, fmtINT } from '@/utils/format';

type TrendMetric = 'ecpm' | 'turnover' | 'margin' | 'marginPct' | 'routingCosts' | 'vSent';
type GroupBy = 'none' | 'database' | 'partner' | 'geo' | 'type' | 'databaseType';

type Props = {
  data: Array<Record<string, number | string>>;
  keys: string[];

  metric: TrendMetric;
  by: GroupBy;
  topN: number;

  includeOthers: boolean;
  focusKey?: string | null;
  focusOptions?: string[];

  showControls?: boolean;
};

const chartTheme = {
  tick: { fill: 'var(--chart-axis)', fontSize: 12 },
  axisLine: { stroke: 'var(--chart-grid)' },
  tickLine: { stroke: 'var(--chart-grid)' },
  grid: 'var(--chart-grid)',
  gridStrong: 'var(--chart-grid-strong)',
  palette: [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
    'var(--chart-6)',
    'var(--chart-7)',
    'var(--chart-8)',
  ],
};

function colorAt(index: number) {
  const palette = chartTheme.palette;
  return palette[index % palette.length];
}

function formatByMetric(metric: TrendMetric, value: number): string {
  const numberValue = Number(value || 0);
  if (metric === 'ecpm' || metric === 'turnover' || metric === 'margin' || metric === 'routingCosts') {
    return fmtEUR2.format(numberValue);
  }
  if (metric === 'marginPct') {
    return `${(numberValue * 100).toFixed(1)}%`;
  }
  return fmtINT.format(numberValue);
}

function yTickFormatter(metric: TrendMetric) {
  return (value: number) => {
    if (metric === 'marginPct') {
      return `${(Number(value || 0) * 100).toFixed(0)}%`;
    }
    if (metric === 'ecpm' || metric === 'turnover' || metric === 'margin' || metric === 'routingCosts') {
      return fmtEUR2.format(Number(value || 0));
    }
    return fmtINT.format(Number(value || 0));
  };
}

export default function ReportsUnifiedTrend({
  data,
  keys,
  metric,
  by,
  topN,
  includeOthers,
  focusKey = null,
  focusOptions = [],
  showControls = false,
}: Props) {
  const hasData = Array.isArray(data) && data.length > 0 && keys.length > 0;
  const hasFocus = by !== 'none' && !!focusKey;

  const controls = showControls ? (
    <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text)]/65">
      <span>Metric: {metricLabel(metric)}</span>
      <span>Grouping: {by === 'none' ? 'Total' : capitalise(by)}</span>
      <span>Top {topN}{includeOthers ? ' + Others' : ''}</span>
      {focusKey ? <span>Focus: {focusKey}</span> : null}
    </div>
  ) : null;

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div className={['flex items-center gap-3', controls ? 'justify-between mb-2' : 'justify-start mb-3'].join(' ')}>
        <div className="text-sm font-medium">Time series</div>
        {controls}
      </div>

      <div className="h-[320px]">
        {!hasData ? (
          <div className="h-full flex items-center justify-center text-sm opacity-70">
            No data for current filters
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tick={chartTheme.tick}
                axisLine={chartTheme.axisLine}
                tickLine={chartTheme.tickLine}
              />
              <YAxis
                tick={chartTheme.tick}
                axisLine={chartTheme.axisLine}
                tickLine={chartTheme.tickLine}
                tickFormatter={yTickFormatter(metric)}
              />
              <Tooltip
                cursor={{ stroke: chartTheme.gridStrong }}
                contentStyle={{
                  background: 'var(--chart-tooltip-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                }}
                itemStyle={{ color: 'var(--color-text)' }}
                labelStyle={{ color: 'var(--color-text)' }}
                formatter={(value, name) => [
                  formatByMetric(metric, Number(value || 0)),
                  String(name ?? ''),
                ]}
              />
              <Legend />
              {keys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  dot={false}
                  stroke={colorAt(index)}
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                  opacity={hasFocus && focusKey !== key ? 0.35 : 1}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {showControls ? (
        <div className="text-xs opacity-60 mt-2 text-right">
          Focus options: {focusOptions.length || '0'} - Include &quot;Others&quot;: {includeOthers ? 'yes' : 'no'}
        </div>
      ) : null}
    </div>
  );
}

function metricLabel(metric: TrendMetric) {
  switch (metric) {
    case 'turnover': return 'Turnover';
    case 'margin': return 'Margin';
    case 'marginPct': return 'Margin %';
    case 'routingCosts': return 'Routing costs';
    case 'ecpm': return 'eCPM';
    case 'vSent': return 'V Sent';
  }
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
