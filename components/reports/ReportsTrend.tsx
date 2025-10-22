// components/reports/ReportsTrend.tsx
'use client';

import type { TrendPoint } from '@/types/reports';
import { fmtEUR2 } from '@/utils/format';
import {
  ResponsiveContainer,
  LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent';

export default function ReportsTrend({ data }: { data: TrendPoint[] }) {
  const hasData = Array.isArray(data) && data.length > 0;

  const formatValue = (value: ValueType) => {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0);
    return fmtEUR2.format(Number.isFinite(numeric) ? numeric : 0);
  };

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div className="text-sm font-medium mb-2">eCPM trend</div>
      <div className="h-[280px]">
        {!hasData ? (
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
                formatter={(value: ValueType) => [formatValue(value), 'eCPM'] as const}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="ecpm"
                dot={false}
                activeDot={{ r: 4 }}
                stroke="var(--chart-2)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
