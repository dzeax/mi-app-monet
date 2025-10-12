// components/reports/ReportsTimeSeries.tsx
'use client';

import { useMemo, useState } from 'react';
import type { UseReportDataResult } from '@/hooks/useReportData';
import { fmtEUR2, fmtINT } from '@/utils/format';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';

type MetricOpt = 'ecpm' | 'turnover' | 'margin' | 'marginPct' | 'vSent';
type GroupOpt = 'none' | 'database' | 'partner' | 'geo';

const fmtPCT1 = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 });

export default function ReportsTimeSeries({
  makeSeries,
  title = 'Time series',
  height = 300,
}: {
  makeSeries: UseReportDataResult['makeTimeSeries'];
  title?: string;
  height?: number;
}) {
  const [metric, setMetric] = useState<MetricOpt>('ecpm');
  const [by, setBy] = useState<GroupOpt>('none');
  const [topN, setTopN] = useState(5);
  const [includeOthers, setIncludeOthers] = useState(true);
  const [focus, setFocus] = useState<string>(''); // '' = All

  const { data, keys } = useMemo(
    () => makeSeries({ metric, by, topN, includeOthers }),
    [makeSeries, metric, by, topN, includeOthers],
  );

  const visibleKeys = focus ? keys.filter(k => k === focus) : keys;

  const tickFormatter = (v: any) =>
    metric === 'marginPct'
      ? fmtPCT1.format(Number(v || 0))
      : metric === 'vSent'
      ? fmtINT.format(Number(v || 0))
      : fmtEUR2.format(Number(v || 0));

  const tooltipFormatter = (value: any) => [
    metric === 'marginPct'
      ? fmtPCT1.format(Number(value || 0))
      : metric === 'vSent'
      ? fmtINT.format(Number(value || 0))
      : fmtEUR2.format(Number(value || 0)),
    labelOf(metric),
  ];

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{title}</div>

        <div className="flex gap-2 items-center">
          <label className="text-sm">
            <span className="muted mr-2">Group lines by</span>
            <select className="input" value={by} onChange={e => { setBy(e.target.value as GroupOpt); setFocus(''); }}>
              <option value="none">Total</option>
              <option value="database">Database</option>
              <option value="partner">Partner</option>
              <option value="geo">GEO</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="muted mr-2">Metric</span>
            <select className="input" value={metric} onChange={e => setMetric(e.target.value as MetricOpt)}>
              <option value="ecpm">eCPM</option>
              <option value="turnover">Turnover</option>
              <option value="margin">Margin</option>
              <option value="marginPct">Margin %</option>
              <option value="vSent">V Sent</option>
            </select>
          </label>

          {by !== 'none' && (
            <>
              <label className="text-sm">
                <span className="muted mr-2">Top N</span>
                <input
                  className="input w-[88px]"
                  type="number"
                  min={1}
                  max={10}
                  value={topN}
                  onChange={e => setTopN(Math.max(1, Math.min(10, Number(e.target.value || 1))))}
                />
              </label>
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-[--color-primary]"
                  checked={includeOthers}
                  onChange={e => setIncludeOthers(e.target.checked)}
                />
                <span className="muted">Include “Others”</span>
              </label>
              <label className="text-sm">
                <span className="muted mr-2">Focus</span>
                <select className="input min-w-[160px]" value={focus} onChange={e => setFocus(e.target.value)}>
                  <option value="">All</option>
                  {keys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="h-[--h]" style={{ ['--h' as any]: `${height}px` }}>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm opacity-70">No data for current filters</div>
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
                tickFormatter={tickFormatter}
              />
              <Tooltip
                cursor={{ stroke: 'var(--chart-grid-strong)' }}
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                itemStyle={{ color: 'var(--color-text)' }}
                labelStyle={{ color: 'var(--color-text)' }}
                formatter={tooltipFormatter}
              />
              <Legend />
              {visibleKeys.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  dot={false}
                  name={k}
                  strokeWidth={focus && k !== focus ? 1 : 2}
                  strokeOpacity={focus && k !== focus ? 0.25 : 1}
                  stroke={colorFor(k)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* Color estable por clave */
function colorFor(key: string) {
  const palette = [
    'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
    '#6B7280', '#10B981', '#F59E0B', '#EF4444', '#3B82F6',
  ];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function labelOf(m: MetricOpt) {
  return m === 'ecpm' ? 'eCPM' : m === 'marginPct' ? 'Margin %' : m === 'vSent' ? 'V Sent' : m[0].toUpperCase() + m.slice(1);
}
