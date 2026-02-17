// components/reports/ReportsTimeSeries.tsx
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseReportDataResult } from '@/hooks/useReportData';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, LabelList,
} from 'recharts';
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { LabelProps } from 'recharts';

type MetricOpt = 'ecpm' | 'turnover' | 'margin' | 'marginPct' | 'routingCosts' | 'vSent';
type GroupOpt = 'none' | 'database' | 'partner' | 'geo';

const OTHERS_KEY = 'others';
const TOOLTIP_MAX_ITEMS = 5;
const END_LABEL_VERTICAL_GAP = 14;

const fmtCurrencyFull = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const fmtCurrency0 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const fmtPercent = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const fmtInteger = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 0,
});

const normalizeValue = (value: ValueType): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrencyCompact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)} B€`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} M€`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} k€`;
  return fmtCurrency0.format(value);
};

const formatMetricLabel = (metric: MetricOpt, value: ValueType) => {
  const numeric = normalizeValue(value);
  if (metric === 'marginPct') return fmtPercent.format(numeric);
  if (metric === 'vSent') return fmtInteger.format(numeric);
  return fmtCurrencyFull.format(numeric);
};

const formatAxisTick = (metric: MetricOpt, value: number) => {
  if (metric === 'marginPct') return fmtPercent.format(value);
  if (metric === 'vSent') return fmtInteger.format(value);
  return formatCurrencyCompact(value);
};

type CompactTooltipProps = {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string | number;
    color?: string;
    value?: ValueType;
  }>;
  label?: string | number;
  metric: MetricOpt;
};

type CompactTooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  color?: string;
  value: ValueType;
};

function CompactTooltip({ active, payload, label, metric }: CompactTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const sortedItems = payload
    .filter((entry): entry is CompactTooltipEntry => entry != null && entry.value != null && normalizeValue(entry.value) !== 0)
    .sort((a, b) => normalizeValue(b.value) - normalizeValue(a.value));

  if (sortedItems.length === 0) return null;

  const visibleItems = sortedItems.slice(0, TOOLTIP_MAX_ITEMS);
  const extraCount = sortedItems.length - visibleItems.length;

  return (
    <div
      className="pointer-events-none min-w-[176px] rounded-lg border border-[var(--color-border)] bg-[color:var(--chart-tooltip-bg)] px-3 py-2 shadow-lg"
      style={{ color: 'var(--color-text)' }}
    >
      <div className="mb-1 text-xs font-medium text-[color:var(--color-text)]/70">{label}</div>
      <div className="flex flex-col gap-1">
        {visibleItems.map((entry) => (
          <div key={entry.dataKey?.toString() ?? entry.name?.toString() ?? ''} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? 'var(--chart-1)' }}
                aria-hidden
              />
              <span className="font-medium text-[color:var(--color-text)]/80">
                {typeof entry.name === 'string' && entry.name ? entry.name : labelOf(metric)}
              </span>
            </div>
            <span className="tabular-nums text-[color:var(--color-text)]">
              {formatMetricLabel(metric, entry.value ?? 0)}
            </span>
          </div>
        ))}
        {extraCount > 0 && (
          <div className="pl-4 text-[10px] font-medium text-[color:var(--color-text)]/60">
            +{extraCount} more
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportsTimeSeries({
  makeTrendSeries,
  title = 'Performance Trend',
  height = 300,
}: {
  makeTrendSeries: UseReportDataResult['makeTrendSeries'];
  title?: string;
  height?: number;
}) {
  const [metric, setMetric] = useState<MetricOpt>('ecpm');
  const [by, setBy] = useState<GroupOpt>('none');
  const [topN, setTopN] = useState(5);
  const [includeOthers, setIncludeOthers] = useState(true);
  const [focus, setFocus] = useState<string>(''); // '' = All
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const legendHoveringRef = useRef(false);

  const { data, keys } = useMemo(
    () => makeTrendSeries({ metric, by, topN, includeOthers }),
    [makeTrendSeries, metric, by, topN, includeOthers],
  );

  const hiddenSet = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  const focusKey = focus;
  const filteredKeys = focusKey ? keys.filter((k) => k === focusKey) : keys;
  const activeKeys = filteredKeys.filter((k) => !hiddenSet.has(k));
  const activeSet = useMemo(() => new Set(activeKeys), [activeKeys]);

  const legendItems = useMemo(
    () => keys.map((key) => ({
      key,
      color: colorFor(key),
      disabled: hiddenSet.has(key) || (focusKey ? key !== focusKey : false),
      isOthers: key.toLowerCase() === OTHERS_KEY,
    })),
    [keys, hiddenSet, focusKey],
  );

  const toggleSeries = useCallback((key: string) => {
    if (focus && focus !== key) {
      setFocus('');
      setHiddenKeys((prev) => prev.filter((item) => item !== key));
      return;
    }
    setHiddenKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }, [focus]);

  const handleLegendHover = useCallback((key: string | null) => {
    legendHoveringRef.current = key !== null;
    setHoveredKey(key);
  }, []);

  const handleChartMouseMove = useCallback(
    (state: any) => {
      if (legendHoveringRef.current) return;
      const payload = state?.activePayload;
      if (!payload || payload.length === 0) {
        setHoveredKey(null);
        return;
      }
      const topPayload = [...payload]
        .filter((entry) => {
          const key = entry?.dataKey;
          if (key == null) return false;
          const keyStr = String(key);
          if (hiddenSet.has(keyStr)) return false;
          return normalizeValue(entry.value ?? 0) !== 0;
        })
        .sort((a, b) => normalizeValue(b.value ?? 0) - normalizeValue(a.value ?? 0))[0];
      setHoveredKey(topPayload?.dataKey != null ? String(topPayload.dataKey) : null);
    },
    [hiddenSet],
  );

  const handleChartMouseLeave = useCallback(() => {
    if (!legendHoveringRef.current) {
      setHoveredKey(null);
    }
  }, []);

  const yStats = useMemo(() => {
    if (!data.length || activeKeys.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of data) {
      for (const key of activeKeys) {
        const raw = (row as Record<string, ValueType | number | undefined>)[key];
        if (raw == null) continue;
        const value = normalizeValue(raw as ValueType);
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const span = max - min;
    const paddingBase = span === 0 ? Math.abs(max || min || 1) * 0.08 : span * 0.08;
    const padding = paddingBase || 1;
    const lower = min >= 0 ? Math.max(0, min - padding) : min - padding;
    const upper = max <= 0 ? Math.min(0, max + padding) : max + padding;
    return {
      min,
      max,
      domain: [lower, upper] as [number, number],
      span,
    };
  }, [data, activeKeys]);

  const yAxisDomain = useMemo<[number, number] | undefined>(
    () => (yStats ? yStats.domain : undefined),
    [yStats],
  );

  const endLabelMeta = useMemo(() => {
    const map = new Map<string, { text: string; offset: number }>();
    if (!data.length || activeKeys.length === 0) return { map, lastIndex: -1 };
    const lastIndex = data.length - 1;
    const entries: Array<{ key: string; value: number }> = [];
    for (const key of activeKeys) {
      for (let i = lastIndex; i >= 0; i--) {
        const raw = (data[i] as Record<string, ValueType | number | undefined>)[key];
        if (raw == null) continue;
        const value = normalizeValue(raw as ValueType);
        if (!Number.isFinite(value)) continue;
        entries.push({ key, value });
        break;
      }
    }
    if (entries.length === 0) return { map, lastIndex };
    const span = yStats?.span ?? 0;
    const min = yStats?.min ?? Math.min(...entries.map((e) => e.value));
    const threshold = Math.max(span * 0.05, Math.abs(min) * 0.01, 1);
    const sorted = entries.sort((a, b) => a.value - b.value);
    let cluster: Array<{ key: string; value: number }> = [];
    const clusters: Array<Array<{ key: string; value: number }>> = [];
    for (const entry of sorted) {
      if (cluster.length === 0) {
        cluster = [entry];
        continue;
      }
      const previous = cluster[cluster.length - 1];
      if (entry.value - previous.value <= threshold) {
        cluster.push(entry);
      } else {
        clusters.push(cluster);
        cluster = [entry];
      }
    }
    if (cluster.length > 0) clusters.push(cluster);

    for (const group of clusters) {
      const mid = (group.length - 1) / 2;
      group.forEach((entry, index) => {
        const offset = (index - mid) * END_LABEL_VERTICAL_GAP;
        map.set(entry.key, {
          text: formatMetricLabel(metric, entry.value),
          offset,
        });
      });
    }
    return { map, lastIndex };
  }, [activeKeys, data, metric, yStats]);

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
              <option value="routingCosts">Routing costs</option>
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
                  {keys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      {legendItems.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {legendItems.map(({ key, color, disabled, isOthers }) => (
            <button
              type="button"
              key={key}
              className="flex items-center gap-2 rounded-md px-2 py-1 transition"
              style={{
                opacity: disabled ? 0.35 : hoveredKey && hoveredKey !== key ? 0.6 : 1,
                background: hoveredKey === key ? 'var(--chart-legend-hover, rgba(148, 163, 184, 0.14))' : 'transparent',
                border: '1px solid transparent',
                cursor: 'pointer',
              }}
              onClick={() => toggleSeries(key)}
              onMouseEnter={() => handleLegendHover(key)}
              onMouseLeave={() => handleLegendHover(null)}
            >
              {isOthers ? (
                <span
                  className="h-2.5 w-5"
                  style={{
                    borderTop: `2px dashed ${color}`,
                    opacity: disabled ? 0.6 : 1,
                  }}
                  aria-hidden
                />
              ) : (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: color,
                    opacity: disabled ? 0.6 : 1,
                  }}
                  aria-hidden
                />
              )}
              <span className="font-medium text-[color:var(--color-text)]/80">{key}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ height: `${height}px` }}>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm opacity-70">No data for current filters</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ left: 12, right: 80, top: 12, bottom: 8 }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <CartesianGrid
                stroke="var(--chart-grid-soft, rgba(148,163,184,0.25))"
                strokeDasharray="3 6"
                vertical={false}
              />
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
                tickFormatter={(value: number) => formatAxisTick(metric, value)}
                domain={yAxisDomain}
              />
              <Tooltip
                cursor={{ stroke: 'var(--chart-grid-strong)', strokeWidth: 1, strokeDasharray: '4 4' }}
                wrapperStyle={{ pointerEvents: 'none' }}
                content={(props) => <CompactTooltip {...props} metric={metric} />}
              />
              {keys.map((k) => {
                const hidden = !activeSet.has(k);
                const isHovered = hoveredKey === k;
                const dimmed = !hidden && hoveredKey !== null && hoveredKey !== k;
                const color = colorFor(k);
                const isOthers = k.toLowerCase() === OTHERS_KEY;
                return (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    dot={false}
                    name={k}
                    stroke={color}
                    strokeWidth={isHovered ? 3 : 2}
                    strokeOpacity={hidden ? 0 : dimmed ? 0.3 : 1}
                    hide={hidden}
                    strokeDasharray={isOthers ? '6 4' : undefined}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: color, fill: 'var(--color-surface)' }}
                    onMouseEnter={() => handleLegendHover(k)}
                    onMouseLeave={() => handleLegendHover(null)}
                  >
                    {endLabelMeta.lastIndex >= 0 && (
                      <LabelList
                        dataKey={k}
                        position="right"
                        content={(props) => renderEndLabel(props, endLabelMeta)}
                      />
                    )}
                  </Line>
                );
              })}
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

function renderEndLabel(props: LabelProps, meta: { map: Map<string, { text: string; offset: number }>; lastIndex: number }) {
  const { map, lastIndex } = meta;
  if (props.index !== lastIndex) return null;
  const key = (props as any).dataKey != null ? String((props as any).dataKey) : '';
  if (!key) return null;
  const entry = map.get(key);
  if (!entry) return null;
  const x = Number(props.x ?? 0) + 8;
  const y = Number(props.y ?? 0) + entry.offset;
  const color = colorFor(key);

  return (
    <text
      x={x}
      y={y}
      fill="var(--color-text)"
      fontSize={11}
      textAnchor="start"
      dominantBaseline="middle"
      style={{ pointerEvents: 'none' }}
    >
      <tspan fill={color}>●</tspan>
      <tspan> {key} </tspan>
      <tspan>{entry.text}</tspan>
    </text>
  );
}

function labelOf(m: MetricOpt) {
  if (m === 'ecpm') return 'eCPM';
  if (m === 'marginPct') return 'Margin %';
  if (m === 'routingCosts') return 'Routing costs';
  if (m === 'vSent') return 'V Sent';
  return m[0].toUpperCase() + m.slice(1);
}
