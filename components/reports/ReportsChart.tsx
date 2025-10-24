// components/reports/ReportsChart.tsx
'use client';

import type { CSSProperties } from 'react';
import { useId, useMemo } from 'react';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
} from 'recharts';
import type { AggregateRow, Metric } from '@/types/reports';
import { METRIC_LABELS } from '@/types/reports';
import type { FlagInfo } from '@/utils/flags';

type ChartEntry = AggregateRow & {
  _value: number;
  _percent: number;
  _valueLabel: string;
};

type Props = {
  data: AggregateRow[];
  metric: Metric;
  title?: string;
  height?: number;
  showTable?: boolean;
  groupLabel?: string;
  flagForLabel?: (label: string) => FlagInfo;
  activeKey?: string | null;
  onActiveChange?: (key: string | null) => void;
};

const chartTheme = {
  tick: { fill: 'var(--chart-axis)', fontSize: 12 },
  axisLine: { stroke: 'var(--chart-grid)', strokeOpacity: 0.6 },
  tickLine: { stroke: 'var(--chart-grid)', strokeOpacity: 0.4 },
  grid: 'rgba(15, 23, 42, 0.06)',
  gridStrong: 'rgba(15, 23, 42, 0.16)',
  tooltip: {
    contentStyle: {
      background: 'var(--chart-tooltip-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      boxShadow: '0 8px 18px rgba(15, 23, 42, 0.16)',
      padding: '0.55rem 0.6rem',
    } as CSSProperties,
    itemStyle: { color: 'var(--color-text)' } as CSSProperties,
    labelStyle: { color: 'var(--color-text)' } as CSSProperties,
  },
};

const fmtChartCurrency0 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const fmtChartCurrency2 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const fmtChartInteger = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 0,
});

const fmtChartPercent = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 1,
});

function compactEuroEn(value: number): string {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${fmtChartCurrency0.format(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${fmtChartCurrency0.format(n / 1_000)}K`;
  return fmtChartCurrency0.format(n);
}

function formatChartValue(metric: Metric, value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '--';
  const n = Number(value);
  switch (metric) {
    case 'turnover':
    case 'margin':
    case 'routingCosts':
    case 'ecpm':
      return fmtChartCurrency2.format(n);
    case 'marginPct':
      return fmtChartPercent.format(n);
    default:
      return fmtChartInteger.format(n);
  }
}

function makeChartAxisTick(metric: Metric) {
  return (value: number) => {
    if (!Number.isFinite(value)) return '';
    if (metric === 'marginPct') {
      return `${(value * 100).toFixed(0)}%`;
    }
    if (metric === 'turnover' || metric === 'margin' || metric === 'routingCosts') {
      return compactEuroEn(value);
    }
    if (metric === 'ecpm') {
      return fmtChartCurrency2.format(value);
    }
    return fmtChartInteger.format(value);
  };
}

function formatShare(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '<0.1%';
  if (percent < 0.1) return '<0.1%';
  const digits = percent >= 10 ? 1 : 2;
  return `${percent.toFixed(digits)}%`;
}

function valueOf(metric: Metric, row: AggregateRow): number {
  return Number(((row as unknown as Record<string, number | null | undefined>)[metric] ?? 0) || 0);
}

export default function ReportsChart({
  data,
  metric,
  title = 'Top ranking',
  height = 360,
  showTable = true,
  groupLabel = 'Group',
  flagForLabel,
  activeKey,
  onActiveChange: _onActiveChange,
}: Props) {
  const chartId = useId();
  const yTick = makeChartAxisTick(metric);
  const chartStyle = { height: `${height}px` };
  const headerHint = 'Hover bars for details';

  const chartData = useMemo<ChartEntry[]>(() => {
    const total = data.reduce((acc, row) => acc + valueOf(metric, row), 0);
    return data.map((row) => {
      const val = valueOf(metric, row);
      const percent = total > 0 ? (val / total) * 100 : 0;
      return {
        ...row,
        _value: val,
        _percent: percent,
        _valueLabel: formatChartValue(metric, val),
      };
    }) as ChartEntry[];
  }, [data, metric]);

  const effectiveActiveKey = activeKey ?? null;

  const baseGradientId = `${chartId}-bar-base`;
  const accentGradientId = `${chartId}-bar-accent`;
  const mutedGradientId = `${chartId}-bar-muted`;

  const getFillForEntry = (entry: ChartEntry) => {
    if (effectiveActiveKey === entry.key) {
      return `url(#${accentGradientId})`;
    }
    if (effectiveActiveKey) {
      return `url(#${mutedGradientId})`;
    }
    return `url(#${baseGradientId})`;
  };

  const tooltipRenderer = ({ active, payload }: { active?: boolean; payload?: Array<{ payload?: unknown }> }) => {
    if (!active || !payload || payload.length === 0) return null;
    const entry = payload[0]?.payload as ChartEntry | undefined;
    if (!entry) return null;
    const flagInfo = flagForLabel ? flagForLabel(entry.label) : null;
    const percentText = formatShare(entry._percent);
    const isActive = effectiveActiveKey === entry.key;

    return (
      <div className="min-w-[14rem] space-y-2">
        <div className="flex items-center gap-2 font-semibold leading-tight">
          {renderFlagBadge(flagInfo)}
          <span className="truncate" title={entry.label}>{entry.label}</span>
        </div>
        <div className="rounded-md bg-white/3 px-2 py-1 text-sm text-[color:var(--color-text)]/85 dark:bg-white/5">
          <div className="text-xs uppercase tracking-wide opacity-60">Share of total</div>
          <div className="font-semibold tabular-nums">{percentText}</div>
        </div>
      </div>
    );
  };

  const skeletonHeights = [92, 78, 66, 52, 40];

  const renderInlineFlag = (label: string) => {
    const info = flagForLabel ? flagForLabel(label) : null;
    if (!info) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[color:var(--color-text)]/75">
        {renderFlagBadge(info)}
      </span>
    );
  };

  return (
    <div className="rounded-2xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="text-sm font-medium text-[color:var(--color-text)]/85">{title}</div>
        <div className="text-xs opacity-60">{headerHint}</div>
      </div>

      <div style={chartStyle}>
        {chartData.length === 0 ? (
          <div className="relative h-full">
            <div className="chart-skeleton absolute inset-0" aria-hidden="true">
              {skeletonHeights.map((h, index) => (
                <div
                  key={index}
                  className="chart-skeleton-bar"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="relative z-10 flex h-full items-center justify-center">
              <div className="rounded-lg border border-[--color-border]/60 bg-[color:var(--color-surface)]/85 px-3 py-2 text-sm text-[color:var(--color-text)]/70 backdrop-blur">
                No data for current filters.
              </div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 16, left: 16, bottom: flagForLabel ? 22 : 14 }}
            >
              <defs>
                <linearGradient id={baseGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.65} />
                </linearGradient>
                <linearGradient id={accentGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.65} />
                </linearGradient>
                <linearGradient id={mutedGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis
                dataKey="label"
                interval={0}
                height={flagForLabel ? 54 : 40}
                axisLine={chartTheme.axisLine}
                tickLine={chartTheme.tickLine}
                tickMargin={flagForLabel ? 8 : 6}
                tick={flagForLabel
                  ? (props) => <FlagXAxisTick {...props} flagForLabel={flagForLabel} />
                  : chartTheme.tick}
              />
              <YAxis
                tickFormatter={yTick}
                tick={chartTheme.tick}
                axisLine={chartTheme.axisLine}
                tickLine={chartTheme.tickLine}
              />
              <Tooltip
                cursor={false}
                contentStyle={chartTheme.tooltip.contentStyle}
                itemStyle={chartTheme.tooltip.itemStyle}
                labelStyle={chartTheme.tooltip.labelStyle}
                content={tooltipRenderer}
                allowEscapeViewBox={{ x: true, y: true }}
              />
              <Bar
                dataKey="_value"
                name={legendName(metric)}
                radius={[10, 10, 4, 4]}
                maxBarSize={48}
              >
                {chartData.map((entry) => {
                  const isActive = effectiveActiveKey === entry.key;
                  const isMuted = effectiveActiveKey && effectiveActiveKey !== entry.key;
                  return (
                    <Cell
                      key={entry.key}
                      fill={getFillForEntry(entry)}
                      fillOpacity={isActive ? 1 : isMuted ? 0.45 : 0.95}
                      stroke={isActive ? 'var(--color-primary)' : 'transparent'}
                      strokeWidth={isActive ? 2 : 0}
                    />
                  );
                })}
                <LabelList
                  dataKey="_valueLabel"
                  position="top"
                  offset={6}
                  style={{ fontSize: 11, fontWeight: 500, fill: 'var(--color-text)' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {showTable && chartData.length > 0 && (
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
              {chartData.map((entry) => {
                const isActive = effectiveActiveKey === entry.key;
                return (
                  <tr
                    key={entry.key}
                    className={[
                      'transition-colors',
                      onActiveChange ? 'cursor-pointer' : '',
                      isActive ? 'bg-[color:var(--color-surface-2)]/65' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleBarClick(entry)}
                  >
                    <td className="px-3 py-2 flex items-center gap-2">
                      {renderInlineFlag(entry.label)}
                      <span>{entry.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatChartValue('turnover', entry.turnover)}</td>
                    <td
                      className={`px-3 py-2 text-right ${entry.margin > 0 ? 'text-[--color-primary]' : entry.margin < 0 ? 'text-[--color-accent]' : ''}`}
                    >
                      {formatChartValue('margin', entry.margin)}
                    </td>
                    <td className="px-3 py-2 text-right">{formatChartValue('ecpm', entry.ecpm)}</td>
                    <td className="px-3 py-2 text-right">{formatChartValue('vSent', entry.vSent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function legendName(metric: Metric) {
  return METRIC_LABELS[metric] ?? metric;
}

type FlagXAxisTickProps = {
  x: number;
  y: number;
  payload: { value: string };
  flagForLabel?: (label: string) => FlagInfo;
};

function FlagXAxisTick({ x, y, payload, flagForLabel }: FlagXAxisTickProps) {
  const label = String(payload?.value ?? '');
  const info = flagForLabel ? flagForLabel(label) : null;

  const hasCode = !!info?.code;
  const hasEmoji = !!info?.emoji;
  const hasBadge = !hasCode && !hasEmoji && !!info?.text;
  const labelOffset = hasCode || hasEmoji || hasBadge ? 36 : 20;

  return (
    <g transform={`translate(${x},${y})`}>
      {hasCode ? (
        <foreignObject x={-16} y={6} width={32} height={22}>
          <div className="flag-tick-box">
            <span className={`flag-swatch fi fi-${info?.code ?? ''}`} aria-hidden="true" />
          </div>
        </foreignObject>
      ) : hasEmoji ? (
        <text
          x={0}
          y={20}
          textAnchor="middle"
          fontSize={14}
          fill="var(--chart-axis)"
          aria-hidden="true"
        >
          {info?.emoji}
        </text>
      ) : hasBadge ? (
        <foreignObject x={-18} y={6} width={36} height={20}>
          <div className="flag-tick-box">
            <span className="flag-text-badge" aria-hidden="true">
              {info?.text}
            </span>
          </div>
        </foreignObject>
      ) : null}
      <text
        x={0}
        y={labelOffset}
        textAnchor="middle"
        fontSize={12}
        fill="var(--chart-axis)"
      >
        {label}
      </text>
    </g>
  );
}

function renderFlagBadge(info?: FlagInfo | null) {
  if (!info) return null;
  if (info.code) {
    return (
      <span className="inline-flex items-center justify-center">
        <span className={`flag-swatch fi fi-${info.code}`} aria-hidden="true" />
        {info.text ? <span className="sr-only">{info.text}</span> : null}
      </span>
    );
  }
  if (info.emoji) {
    return (
      <span className="flag-emoji" aria-hidden="true">
        {info.emoji}
      </span>
    );
  }
  if (info.text) {
    return (
      <span className="flag-text-badge" aria-hidden="true">
        {info.text}
      </span>
    );
  }
  return null;
}
