// components/reports/ReportsChart.tsx
'use client';

import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';
import type { AggregateRow, Metric } from '@/types/reports';
import { fmtEUR2, fmtINT, formatByMetric, makeYAxisTick } from '@/utils/format';

type Props = {
  data: AggregateRow[];
  metric: Metric;
  title?: string;
  height?: number;
  showTable?: boolean;
  groupLabel?: string;
};

const chartTheme = {
  tick: { fill: 'var(--chart-axis)', fontSize: 12 },
  axisLine: { stroke: 'var(--chart-grid)' },
  tickLine: { stroke: 'var(--chart-grid)' },
  grid: 'var(--chart-grid)',
  gridStrong: 'var(--chart-grid-strong)',
  tooltip: {
    contentStyle: {
      background: 'var(--chart-tooltip-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
    } as React.CSSProperties,
    itemStyle: { color: 'var(--color-text)' } as React.CSSProperties,
    labelStyle: { color: 'var(--color-text)' } as React.CSSProperties,
  },
};

export default function ReportsChart({
  data,
  metric,
  title = 'Top ranking',
  height = 360,
  showTable = true,
  groupLabel = 'Group',
}: Props) {
  const yTick = makeYAxisTick(metric);
  const hStyle = { height: `${height}px` }; // ⬅️ altura explícita para el contenedor

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="text-sm opacity-80">{title}</div>
        <div className="text-xs opacity-60">Right click → “Save image”</div>
      </div>

      {/* ⬇️ altura fija en inline-style (nada de variables CSS) */}
      <div style={hStyle}>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm opacity-70">
            No data for current filters
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 40 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis
                dataKey="label"
                interval={0}
                angle={-25}
                textAnchor="end"
                height={55}
                tick={chartTheme.tick}
                axisLine={chartTheme.axisLine}
                tickLine={chartTheme.tickLine}
              />
              <YAxis
                tickFormatter={yTick}
                tick={chartTheme.tick}
                axisLine={chartTheme.axisLine}
                tickLine={chartTheme.tickLine}
              />
              <Tooltip
                cursor={{ stroke: chartTheme.gridStrong }}
                contentStyle={chartTheme.tooltip.contentStyle}
                itemStyle={chartTheme.tooltip.itemStyle}
                labelStyle={chartTheme.tooltip.labelStyle}
                formatter={(v: any, name: any) => {
                  const val = Number(v || 0);
                  if (metric === 'ecpm') return [fmtEUR2.format(val), 'eCPM'];
                  if (metric === 'turnover' || metric === 'margin') return [fmtEUR2.format(val), name];
                  return [fmtINT.format(val), name];
                }}
                labelFormatter={(label: any) => String(label)}
              />
              <Bar dataKey={metric} name={legendName(metric)} radius={[6, 6, 0, 0]} fill="var(--chart-1)">
                <LabelList
                  dataKey={metric}
                  position="top"
                  formatter={(v: number) => formatByMetric(metric, v)}
                  style={{ fontSize: 11, opacity: 0.9 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {showTable && data.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left px-3 py-2">{groupLabel}</th>
                <th className="text-right px-3 py-2">Turnover</th>
                <th className="text-right px-3 py-2">Margin</th>
                <th className="text-right px-3 py-2">eCPM</th>
                <th className="text-right px-3 py-2">V Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-border]/60">
              {data.map((d) => (
                <tr key={d.key}>
                  <td className="px-3 py-2">{d.label}</td>
                  <td className="px-3 py-2 text-right">{fmtEUR2.format(d.turnover)}</td>
                  <td className={`px-3 py-2 text-right ${d.margin>0?'text-[--color-primary]':d.margin<0?'text-[--color-accent]':''}`}>
                    {fmtEUR2.format(d.margin)}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtEUR2.format(d.ecpm)}</td>
                  <td className="px-3 py-2 text-right">{fmtINT.format(d.vSent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function legendName(m: Metric) {
  return m === 'turnover' ? 'Turnover' : m === 'margin' ? 'Margin' : m === 'ecpm' ? 'eCPM' : 'V Sent';
}
