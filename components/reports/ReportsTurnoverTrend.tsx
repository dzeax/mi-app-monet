'use client';

import { fmtEUR2 } from '@/utils/format';
import {
  ResponsiveContainer,
  LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';

type By = 'none' | 'database' | 'partner' | 'geo';

export default function ReportsTurnoverTrend(props: {
  data: Array<Record<string, any>>;
  keys: string[];
  by: By;
  onChangeBy: (v: By) => void;
  topN: number;
  onChangeTopN: (n: number) => void;
  includeOthers: boolean;
  onToggleOthers: (v: boolean) => void;

  // NUEVO: focus
  focusKey?: string | null;
  focusOptions?: string[];
  onChangeFocus?: (k: string | null) => void;
}) {
  const {
    data, keys, by, onChangeBy,
    topN, onChangeTopN,
    includeOthers, onToggleOthers,
    focusKey, focusOptions, onChangeFocus,
  } = props;

  const disabledByFocus = !!focusKey;

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div className="flex flex-wrap gap-3 items-end mb-2">
        <div className="text-sm font-medium mr-auto">Turnover trend</div>

        <label className="text-sm grid gap-1">
          <span className="muted">Group lines by</span>
          <select
            className="input"
            value={by}
            onChange={e => onChangeBy(e.target.value as By)}
          >
            <option value="none">Total</option>
            <option value="database">Database</option>
            <option value="partner">Partner</option>
            <option value="geo">GEO</option>
          </select>
        </label>

        {by !== 'none' && (
          <>
            <label className="text-sm grid gap-1">
              <span className="muted">Focus</span>
              <select
                className="input"
                value={focusKey ?? ''}
                onChange={e => onChangeFocus?.(e.target.value || null)}
              >
                <option value="">All</option>
                {(focusOptions ?? []).map(k => (
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
                disabled={disabledByFocus}
              />
            </label>

            <label className="text-sm inline-flex items-center gap-2 mt-6 ml-1">
              <input
                type="checkbox"
                checked={includeOthers}
                onChange={e => onToggleOthers(e.target.checked)}
                disabled={disabledByFocus}
              />
              <span className={disabledByFocus ? 'opacity-50' : ''}>Include “Others”</span>
            </label>
          </>
        )}
      </div>

      <div className="h-[300px]">
        {(!data || data.length === 0) ? (
          <div className="h-full flex items-center justify-center text-sm opacity-70">
            No data for current filters
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                tickLine={{ stroke: 'var(--chart-grid)' }}
              />
              <YAxis
                tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                tickLine={{ stroke: 'var(--chart-grid)' }}
                tickFormatter={(v: number) => fmtEUR2.format(Number(v || 0))}
              />
              <Tooltip
                cursor={{ stroke: 'var(--chart-grid-strong)' }}
                contentStyle={{
                  background: 'var(--chart-tooltip-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                }}
                itemStyle={{ color: 'var(--color-text)' }}
                labelStyle={{ color: 'var(--color-text)' }}
                formatter={(value: any, name: any) => [fmtEUR2.format(Number(value || 0)), String(name)]}
              />
              <Legend />
              {keys.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  dot={false}
                  activeDot={{ r: 3 }}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
