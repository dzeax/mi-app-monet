// components/charts/theme.ts
export const chartTheme = {
  tick: { fill: 'var(--chart-axis)', fontSize: 12 },
  axisLine: { stroke: 'var(--chart-grid)' },
  tickLine: { stroke: 'var(--chart-grid)' },
  grid: 'var(--chart-grid)',
  tooltip: {
    contentStyle: {
      background: 'var(--chart-tooltip-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
    },
    itemStyle: { color: 'var(--color-text)' },
    labelStyle: { color: 'var(--color-text)' },
  },
  palette: ['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)'],
};
