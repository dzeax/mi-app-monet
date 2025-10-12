// components/reports/ReportsUnifiedTrend.tsx
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

  // controles
  metric: TrendMetric;
  onChangeMetric: (m: TrendMetric) => void;

  by: GroupBy;
  onChangeBy: (b: GroupBy) => void;

  topN: number;
  onChangeTopN: (n: number) => void;

  includeOthers: boolean;
  onToggleOthers: (v: boolean) => void;

  // 🔎 Focus (opcional)
  focusKey?: string | null;
  focusOptions?: string[];
  onChangeFocus?: (key: string | null) => void;
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

function colorAt(i: number) {
  const p = chartTheme.palette;
  return p[i % p.length];
}

function formatByMetric(m: TrendMetric, v: number): string {
  const n = Number(v || 0);
  if (m === 'ecpm' || m === 'turnover' || m === 'margin') return fmtEUR2.format(n);
  if (m === 'marginPct') return `${(n * 100).toFixed(1)}%`;
  return fmtINT.format(n); // vSent
}

function yTickFormatter(m: TrendMetric) {
  return (v: number) => {
    if (m === 'marginPct') return `${(Number(v || 0) * 100).toFixed(0)}%`;
    if (m === 'ecpm' || m === 'turnover' || m === 'margin') return fmtEUR2.format(Number(v || 0));
    return fmtINT.format(Number(v || 0));
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
  // Focus
  focusKey = null,
  focusOptions = [],
  onChangeFocus,
}: Props) {
  const hasData = Array.isArray(data) && data.length > 0 && keys.length > 0;

  const focusEnabled = by !== 'none' && !!onChangeFocus;
  const hasFocus = focusEnabled && !!focusKey;

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm font-medium">Time series</div>

        {/* Controles */}
        <div className="flex items-end gap-2">
          <label className="text-sm grid gap-1">
            <span className="muted">Metric</span>
            <select
              className="input"
              value={metric}
              onChange={e => onChangeMetric(e.target.value as TrendMetric)}
            >
              <option value="ecpm">eCPM</option>
              <option value="turnover">Turnover</option>
              <option value="margin">Margin</option>
              <option value="marginPct">Margin %</option>
              <option value="vSent">V Sent</option>
            </select>
          </label>

          <label className="text-sm grid gap-1">
            <span className="muted">Group lines by</span>
            <select
              className="input"
              value={by}
              onChange={e => onChangeBy(e.target.value as GroupBy)}
            >
              <option value="none">Total</option>
              <option value="database">Database</option>
              <option value="partner">Partner</option>
              <option value="geo">GEO</option>
            </select>
          </label>

          {/* 🔎 Focus selector */}
          <label className="text-sm grid gap-1">
            <span className="muted">Focus</span>
            <select
              className="input"
              value={focusKey ?? ''}
              onChange={e => onChangeFocus?.(e.target.value ? e.target.value : null)}
              disabled={!focusEnabled}
            >
              <option value="">All</option>
              {focusOptions.map(k => (
                <option key={k} value={k}>{k}</option>
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
              onChange={e => onChangeTopN(Math.max(1, Math.min(20, Number(e.target.value || 1))))}
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
              onChange={e => onToggleOthers(e.target.checked)}
              disabled={by === 'none' || hasFocus}
            />
            <span className="muted">Include “Others”</span>
          </label>
        </div>
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
                formatter={(value: any, name: any) => [formatByMetric(metric, Number(value || 0)), String(name)]}
              />
              <Legend />
              {keys.map((k, idx) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  dot={false}
                  stroke={colorAt(idx)}
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="text-xs opacity-60 mt-2 text-right">Right click → “Save image”</div>
    </div>
  );
}
