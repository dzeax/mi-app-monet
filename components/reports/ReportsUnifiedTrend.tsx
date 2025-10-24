// components/reports/ReportsUnifiedTrend.tsx
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { TooltipProps } from 'recharts';
import type { LabelProps } from 'recharts';
import type { AxisDomain } from 'recharts/types/util/types';

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

const palette = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

const normalizeValue = (value: ValueType | number | undefined | null): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrencyCompact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)} B\u20AC`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} M\u20AC`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} k\u20AC`;
  return fmtCurrency0.format(value);
};

const formatMetricValue = (metric: TrendMetric, value: ValueType | number | undefined | null) => {
  const numeric = normalizeValue(value);
  if (metric === 'marginPct') return fmtPercent.format(numeric);
  if (metric === 'vSent') return fmtInteger.format(numeric);
  return fmtCurrencyFull.format(numeric);
};

const formatAxisTick = (metric: TrendMetric, value: number) => {
  if (metric === 'marginPct') return fmtPercent.format(value);
  if (metric === 'vSent') return fmtInteger.format(value);
  return formatCurrencyCompact(value);
};

type CompactTooltipProps = TooltipProps<ValueType, NameType> & { metric: TrendMetric };

function CompactTooltip({ active, payload, label, metric }: CompactTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const sortedItems = payload
    .filter((entry) => entry != null && entry.value != null && normalizeValue(entry.value) !== 0)
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
          <div
            key={entry.dataKey?.toString() ?? entry.name?.toString() ?? ''}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? 'var(--chart-1)' }}
                aria-hidden
              />
              <span className="font-medium text-[color:var(--color-text)]/80">
                {typeof entry.name === 'string' && entry.name ? entry.name : ''}
              </span>
            </div>
            <span className="tabular-nums text-[color:var(--color-text)]">
              {formatMetricValue(metric, entry.value)}
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
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(focusKey ?? null);
  const legendHoveringRef = useRef(false);

  useEffect(() => {
    setHiddenKeys((prev) => prev.filter((key) => keys.includes(key)));
  }, [keys]);

  useEffect(() => {
    if (!legendHoveringRef.current) {
      setHoveredKey((prev) => (focusKey ? focusKey : prev && keys.includes(prev) ? prev : null));
    }
  }, [focusKey, keys]);

  const hiddenSet = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  const visibleKeys = useMemo(
    () => keys.filter((key) => !hiddenSet.has(key)),
    [keys, hiddenSet],
  );

  const legendItems = useMemo(
    () => keys.map((key) => ({
      key,
      color: colorFor(key),
      isOthers: key.trim().toLowerCase() === OTHERS_KEY,
      hidden: hiddenSet.has(key),
    })),
    [keys, hiddenSet],
  );

  const toggleSeries = useCallback((key: string) => {
    setHiddenKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }, []);

  const handleLegendHover = useCallback((key: string | null) => {
    legendHoveringRef.current = key !== null;
    setHoveredKey(key ?? (focusKey ?? null));
  }, [focusKey]);

  const handleChartMouseMove = useCallback(
    (state: { activePayload?: Array<{ dataKey?: string | number; value?: ValueType }> } | undefined) => {
      if (legendHoveringRef.current) return;
      const payload = state?.activePayload;
      if (!payload || payload.length === 0) {
        setHoveredKey(focusKey ?? null);
        return;
      }
      const topPayload = [...payload]
        .filter((entry) => {
          const key = entry?.dataKey;
          if (key == null) return false;
          const keyStr = String(key);
          if (hiddenSet.has(keyStr)) return false;
          return normalizeValue(entry.value) !== 0;
        })
        .sort((a, b) => normalizeValue(b.value) - normalizeValue(a.value))[0];
      setHoveredKey(topPayload?.dataKey != null ? String(topPayload.dataKey) : focusKey ?? null);
    },
    [hiddenSet, focusKey],
  );

  const handleChartMouseLeave = useCallback(() => {
    if (!legendHoveringRef.current) {
      setHoveredKey(focusKey ?? null);
    }
  }, [focusKey]);

  const yStats = useMemo(() => {
    if (!data.length || visibleKeys.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of data) {
      for (const key of visibleKeys) {
        const value = normalizeValue((row as Record<string, ValueType | number | undefined>)[key]);
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
      span,
      domain: [lower, upper] as [number, number],
    };
  }, [data, visibleKeys]);

  const yAxisDomain = useMemo<[AxisDomain, AxisDomain]>(() => (
    yStats ? yStats.domain : ['auto', 'auto']
  ), [yStats]);

  const endLabelMeta = useMemo(() => {
    const map = new Map<string, { text: string; offset: number }>();
    if (!data.length || visibleKeys.length === 0) return { map, lastIndex: -1 };
    const lastIndex = data.length - 1;
    const entries: Array<{ key: string; value: number }> = [];
    for (const key of visibleKeys) {
      for (let i = lastIndex; i >= 0; i--) {
        const value = normalizeValue((data[i] as Record<string, ValueType | number | undefined>)[key]);
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
          text: formatMetricValue(metric, entry.value),
          offset,
        });
      });
    }
    return { map, lastIndex };
  }, [visibleKeys, data, metric, yStats]);

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
        <div className="text-sm font-medium">Performance Trend</div>
        {controls}
      </div>

      {legendItems.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {legendItems.map(({ key, color, isOthers, hidden }) => {
            const isFocused = focusKey && focusKey === key;
            const isDimmed = focusKey && focusKey !== key;
            return (
              <button
                type="button"
                key={key}
                className="flex items-center gap-2 rounded-md px-2 py-1 transition"
                style={{
                  opacity: hidden ? 0.35 : isDimmed && !hoveredKey ? 0.55 : hoveredKey && hoveredKey !== key ? 0.6 : 1,
                  background: hoveredKey === key ? 'var(--chart-legend-hover, rgba(148,163,184,0.14))' : 'transparent',
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
                    style={{ borderTop: `2px dashed ${color}`, opacity: hidden ? 0.6 : 1 }}
                    aria-hidden
                  />
                ) : (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color, opacity: hidden ? 0.6 : 1 }}
                    aria-hidden
                  />
                )}
                <span className="font-medium text-[color:var(--color-text)]/80">
                  {key}{isFocused ? ' (focus)' : ''}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="h-[320px]">
        {!Array.isArray(data) || data.length === 0 || keys.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm opacity-70">
            No data for current filters
          </div>
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
              {keys.map((key) => {
                const hidden = hiddenSet.has(key);
                const color = colorFor(key);
                const isHovered = hoveredKey === key;
                const isFocus = focusKey && focusKey === key;
                const dimByHover = hoveredKey && hoveredKey !== key;
                const dimByFocus = !hoveredKey && focusKey && focusKey !== key;
                const strokeOpacity = hidden ? 0 : dimByHover ? 0.3 : dimByFocus ? 0.35 : 1;
                const emphasised = (!hidden && (isHovered || (!hoveredKey && isFocus)));
                const strokeWidth = emphasised ? 3 : 2;

                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key}
                    dot={false}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeOpacity={strokeOpacity}
                    hide={hidden}
                    strokeDasharray={key.trim().toLowerCase() === OTHERS_KEY ? '6 4' : undefined}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: color, fill: 'var(--color-surface)' }}
                    onMouseEnter={() => handleLegendHover(key)}
                    onMouseLeave={() => handleLegendHover(null)}
                  >
                    {endLabelMeta.lastIndex >= 0 && (
                      <LabelList
                        dataKey={key}
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

      {showControls ? (
        <div className="mt-3 text-right text-xs opacity-60">
          Focus options: {focusOptions.length || '0'} - Include &quot;Others&quot;: {includeOthers ? 'yes' : 'no'}
        </div>
      ) : null}
    </div>
  );
}

function renderEndLabel(props: LabelProps, meta: { map: Map<string, { text: string; offset: number }>; lastIndex: number }) {
  const { map, lastIndex } = meta;
  if (props.index !== lastIndex) return null;
  const key = props.dataKey != null ? String(props.dataKey) : '';
  if (!key) return null;
  const entry = map.get(key);
  if (!entry) return null;
  const x = (props.x ?? 0) + 8;
  const y = (props.y ?? 0) + entry.offset;
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
      <tspan fill={color} fontSize={12} fontWeight="bold">\u2022</tspan>
      <tspan> {key} </tspan>
      <tspan>{entry.text}</tspan>
    </text>
  );
}

function colorFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

function metricLabel(metric: TrendMetric) {
  switch (metric) {
    case 'turnover': return 'Turnover';
    case 'margin': return 'Margin';
    case 'marginPct': return 'Margin %';
    case 'routingCosts': return 'Routing costs';
    case 'ecpm': return 'eCPM';
    case 'vSent': return 'V Sent';
    default: return metric;
  }
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
