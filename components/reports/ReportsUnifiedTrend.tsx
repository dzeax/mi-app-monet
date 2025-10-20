'use client';

import {
  ResponsiveContainer,
  LineChart, Line,
  CartesianGrid,
  XAxis, YAxis,
  Tooltip, Legend,
} from 'recharts';
import { fmtEUR2, fmtINT } from '@/utils/format';

type TrendMetric = 'ecpm' | 'turnover' | 'margin' | 'marginPct' | 'vSent';
type GroupBy = 'none' | 'database' | 'partner' | 'geo';

type Props = {
  data: Array<Record<string, number | string>>;
  keys: string[];

  metric: TrendMetric;
  onChangeMetric: (m: TrendMetric) => void;

  by: GroupBy;
  onChangeBy: (b: GroupBy) => void;

  topN: number;
  onChangeTopN: (n: number) => void;

  includeOthers: boolean;
  onToggleOthers: (v: boolean) => void;

  focusKey?: string | null;
  focusOptions?: string[];
  onChangeFocus?: (key: string | null) => void;

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
  if (metric === 'ecpm' || metric === 'turnover' || metric === 'margin') {
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
    if (metric === 'ecpm' || metric === 'turnover' || metric === 'margin') {
      return fmtEUR2.format(Number(value || 0));
    }
    return fmtINT.format(Number(value || 0));
  };
}

export default function ReportsUnifiedTrend({
  data,
  keys,
  metric,
  onChangeMetric,
  by,
  onChangeBy,
  topN,
  onChangeTopN,
  includeOthers,
  onToggleOthers,
  focusKey = null,
  focusOptions = [],
  onChangeFocus,
  showControls = true,
}: Props) {
  const hasData = Array.isArray(data) && data.length > 0 && keys.length > 0;

  const focusEnabled = by !== 'none' && !!onChangeFocus;
  const hasFocus = focusEnabled && !!focusKey;

  const controls = showControls ? (
    <div className="flex items-end gap-2">
      <label className="text-sm grid gap-1">
        <span className="muted">Metric</span>
        <select
          className="input"
          value={metric}
          onChange={(event) => onChangeMetric(event.target.value as TrendMetric)}
        >
          <option value="turnover">Turnover</option>
          <option value="margin">Margin</option>
          <option value="marginPct">Margin %</option>
          <option value="ecpm">eCPM</option>
          <option value="vSent">V Sent</option>
        </select>
      </label>

      <label className="text-sm grid gap-1">
        <span className="muted">Group lines by</span>
        <select
          className="input"
          value={by}
          onChange={(event) => onChangeBy(event.target.value as GroupBy)}
        >
          <option value="none">Total</option>
          <option value="database">Database</option>
          <option value="partner">Partner</option>
          <option value="geo">GEO</option>
        </select>
      </label>

      <label className="text-sm grid gap-1">
        <span className="muted">Focus</span>
        <select
          className="input"
          value={focusKey ?? ''}
          onChange={(event) => onChangeFocus?.(event.target.value ? event.target.value : null)}
          disabled={!focusEnabled}
        >
          <option value="">All</option>
          {focusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm grid gap-1">
        <span className="muted">Top N</span>
        <input
          type="number"
          className="input"
          min={1}
          max={20}
          value={topN}
          onChange={(event) =>
            onChangeTopN(Math.max(1, Math.min(20, Number(event.target.value || 1))))
          }
          disabled={by === 'none' || hasFocus}
          title={hasFocus ? 'Disabled when Focus is active' : undefined}
        />
      </label>

      <label
        className={`text-sm inline-flex items-center gap-2 ${
          by === 'none' || hasFocus ? 'opacity-50' : ''
        }`}
        title={hasFocus ? 'Disabled when Focus is active' : undefined}
      >
        <input
          type="checkbox"
          className="accent-[--color-primary]"
          checked={includeOthers}
          onChange={(event) => onToggleOthers(event.target.checked)}
          disabled={by === 'none' || hasFocus}
        />
        <span className="muted">Include &quot;Others&quot;</span>
      </label>
    </div>
  ) : null;

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div
        className={[
          'flex items-center gap-3',
          showControls ? 'justify-between mb-2' : 'justify-start mb-3',
        ].join(' ')}
      >
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
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="text-xs opacity-60 mt-2 text-right">Right click -&gt; &quot;Save image&quot;</div>
    </div>
  );
}
