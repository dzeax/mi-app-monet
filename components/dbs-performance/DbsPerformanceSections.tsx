'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  type BasePerformance,
  type CountryPerformance,
  type SectionPerformance,
  type MetricComparison,
  type KpiKey,
  type QuickTrendPoint,
} from '@/hooks/useDbPerformance';
import {
  formatEuro,
  formatMarginPercent,
  formatPreviousValue,
  formatValueDetailed,
  formatVolume,
} from '@/components/dbs-performance/formatters';
import { flagInfoFromGeo, flagInfoForDatabase } from '@/utils/flags';
import BaseDetailDrawer from '@/components/dbs-performance/BaseDetailDrawer';
import type { BaseDetailData } from '@/components/dbs-performance/types';
import DeltaBadge from '@/components/dbs-performance/DeltaBadge';

type Props = {
  sections: SectionPerformance[];
  loading?: boolean;
  showYoy: boolean;
  resolveBaseDetail: (context: { base: BasePerformance; sectionLabel: string }) => BaseDetailData | null;
};

const SECTION_METRICS: KpiKey[] = ['turnover', 'marginPct', 'ecpm'];
const TABLE_METRICS: KpiKey[] = ['turnover', 'marginPct', 'vSent', 'routingCosts', 'ecpm'];
const ROW_HEIGHT = 74;
const VIRTUALIZATION_THRESHOLD = 200;
const VIRTUALIZATION_BUFFER = 6;

type SortKey = 'database' | KpiKey;
type SortDirection = 'asc' | 'desc';

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

export default function DbsPerformanceSections({
  sections,
  loading = false,
  showYoy,
  resolveBaseDetail,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeBase, setActiveBase] = useState<BaseDetailData | null>(null);

  const handleOpenDrawer = useCallback(
    (context: { base: BasePerformance; sectionLabel: string }) => {
      const detail = resolveBaseDetail(context);
      if (detail) {
        setActiveBase(detail);
        setDrawerOpen(true);
      }
    },
    [resolveBaseDetail]
  );

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setActiveBase(null);
  }, []);

  if (loading && !sections.length) {
    return (
      <section className="card p-6">
        <div className="animate-pulse h-5 w-2/5 bg-[color:var(--color-surface-2)] rounded mb-4" />
        <div className="animate-pulse h-32 bg-[color:var(--color-surface-2)] rounded-xl" />
      </section>
    );
  }

  if (!sections.length) {
    return (
      <section className="card p-6 text-sm text-[color:var(--color-text)]/65">
        No performance data for the selected filters. Try expanding the date range or removing filters.
      </section>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {sections.map((section) => (
          <SectionPanel
            key={section.type}
            section={section}
            showYoy={showYoy}
            onOpenDrawer={handleOpenDrawer}
          />
        ))}
      </div>

      <BaseDetailDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        base={activeBase}
      />
    </>
  );
}

function SectionPanel({
  section,
  showYoy,
  onOpenDrawer,
}: {
  section: SectionPerformance;
  showYoy: boolean;
  onOpenDrawer: (context: { base: BasePerformance; sectionLabel: string }) => void;
}) {
  const baseCount = section.countries.reduce((total, country) => total + country.bases.length, 0);

  return (
    <section className="card p-5 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--color-text)]">{section.label}</h2>
          <p className="text-sm text-[color:var(--color-text)]/60">
            {section.countries.length} countries | {baseCount} databases
          </p>
          {showYoy && section.yoyDelta ? (
            <p className="mt-1 text-xs tabular-nums text-[color:var(--color-text)]/65 flex items-center gap-2">
              <span>YoY</span>
              <DeltaBadge metric="turnover" delta={section.yoyDelta} />
            </p>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {SECTION_METRICS.map((metric) => (
            <SectionStat key={metric} metric={metric} comparison={section.metrics} />
          ))}
        </div>
      </header>

      <div className="grid gap-3">
        {section.countries.length ? (
          section.countries.map((country) => (
            <CountryPanel
              key={country.geo}
              country={country}
              showYoy={showYoy}
              onOpenDrawer={onOpenDrawer}
              sectionLabel={section.label}
            />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-5 text-sm text-[color:var(--color-text)]/65">
            No country-level data available for this DB type.
          </div>
        )}
      </div>
    </section>
  );
}

function SectionStat({ metric, comparison }: { metric: KpiKey; comparison: MetricComparison }) {
  const { value } = formatValueDetailed(metric, comparison);

  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-3 shadow-sm">
      <span className="block text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
        {titleFromMetric(metric)}
      </span>
      <div className="mt-1 text-lg font-semibold text-[color:var(--color-text)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <DeltaBadge metric={metric} delta={comparison.deltas[metric]} />
    </div>
  );
}

function CountryPanel({
  country,
  showYoy,
  onOpenDrawer,
  sectionLabel,
}: {
  country: CountryPerformance;
  showYoy: boolean;
  onOpenDrawer: (context: { base: BasePerformance; sectionLabel: string }) => void;
  sectionLabel: string;
}) {
  const turnoverDelta = country.metrics.deltas.turnover;
  const tone =
    turnoverDelta.absolute === 0
      ? 'text-[color:var(--color-text)]/55'
      : turnoverDelta.absolute > 0
        ? 'text-[color:var(--color-primary)]'
        : 'text-[color:var(--color-accent)]';

  const [sortState, setSortState] = useState<SortState>({ key: 'turnover', direction: 'desc' });
  const sortedBases = useMemo(() => {
    const bases = [...country.bases];
    bases.sort((a, b) => compareBases(a, b, sortState));
    return bases;
  }, [country.bases, sortState]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const shouldVirtualize = sortedBases.length > VIRTUALIZATION_THRESHOLD;
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (!shouldVirtualize) return;
    setScrollTop(event.currentTarget.scrollTop);
  }, [shouldVirtualize]);

  useEffect(() => {
    if (!shouldVirtualize) return;
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldVirtualize, sortedBases.length]);

  useEffect(() => {
    if (!shouldVirtualize) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [sortState, shouldVirtualize]);

  const virtualization = useMemo(() => {
    if (!shouldVirtualize || viewportHeight === 0) {
      return {
        visibleBases: sortedBases,
        topSpacer: 0,
        bottomSpacer: 0,
      };
    }
    const total = sortedBases.length;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRTUALIZATION_BUFFER);
    const itemsInView = Math.ceil(viewportHeight / ROW_HEIGHT) + VIRTUALIZATION_BUFFER * 2;
    const endIndex = Math.min(total, startIndex + itemsInView);
    const visibleBases = sortedBases.slice(startIndex, endIndex);
    const topSpacer = startIndex * ROW_HEIGHT;
    const bottomSpacer = Math.max(0, (total - endIndex) * ROW_HEIGHT);
    return { visibleBases, topSpacer, bottomSpacer, startIndex, endIndex };
  }, [shouldVirtualize, viewportHeight, sortedBases, scrollTop]);

  const displayBases = shouldVirtualize ? virtualization.visibleBases : sortedBases;

  const toggleSort = useCallback((key: SortKey) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key,
        direction: key === 'database' ? 'asc' : 'desc',
      };
    });
  }, []);

  return (
    <details className="group border border-[color-mix(in_oklab,var(--color-border)_70%,transparent)] rounded-2xl bg-white/80 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-4">
          <CountryFlag geo={country.geo} />
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-[color:var(--color-text)]">
              {country.label}
              <span className="text-xs text-[color:var(--color-text)]/55 uppercase tracking-[0.16em]">
                {country.bases.length} databases
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-text)]/70 tabular-nums">
              <span>
                Turnover{' '}
                <strong className="text-[color:var(--color-text)]">
                  {formatEuro(country.metrics.current.turnover)}
                </strong>
              </span>
              <span>
                Margin{' '}
                <strong className="text-[color:var(--color-text)]">
                  {formatMarginPercent(country.metrics.current.marginPct)}
                </strong>
              </span>
              <span>
                eCPM{' '}
                <strong className="text-[color:var(--color-text)]">
                  {formatEuro(country.metrics.current.ecpm)}
                </strong>
              </span>
              <span>
                Volume{' '}
                <strong className="text-[color:var(--color-text)]">
                  {formatVolume(country.metrics.current.vSent)}
                </strong>
              </span>
            </div>
            {country.quickTrend.length > 1 ? (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/45">Turnover trend</span>
                <QuickTrend data={country.quickTrend} />
              </div>
            ) : null}
          </div>
        </div>
        <div className={['flex flex-col items-end text-xs font-semibold tabular-nums', tone].join(' ')}>
          <DeltaBadge metric="turnover" delta={country.metrics.deltas.turnover} />
          {showYoy && country.yoyDelta ? (
            <DeltaBadge metric="turnover" delta={country.yoyDelta} className="mt-2" />
          ) : null}
        </div>
      </summary>

      <div className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/35 px-5 py-4">
        {sortedBases.length ? (
          <div className="overflow-x-auto">
            <div
              className="max-h-[520px] overflow-y-auto"
              ref={scrollRef}
              onScroll={handleScroll}
            >
              <table className="min-w-full divide-y divide-[color:var(--color-border)] text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.16em] text-[color:var(--color-text)]/60 sticky top-0 bg-white">
                  <tr>
                    <th className="py-3 pr-4 font-semibold">
                      <HeaderButton
                        label="Database"
                        active={sortState.key === 'database'}
                        direction={sortState.direction}
                        onClick={() => toggleSort('database')}
                      />
                    </th>
                    {TABLE_METRICS.map((metric) => (
                      <th key={metric} className="py-3 px-3 font-semibold">
                        <HeaderButton
                          label={titleFromMetric(metric)}
                          active={sortState.key === metric}
                          direction={sortState.direction}
                          onClick={() => toggleSort(metric)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color-mix(in_oklab,var(--color-border)_75%,transparent)]">
                  {shouldVirtualize && virtualization.topSpacer > 0 ? (
                    <SpacerRow height={virtualization.topSpacer} />
                  ) : null}
                  {displayBases.map((base) => (
                    <BaseRow
                      key={base.id}
                      base={base}
                      style={shouldVirtualize ? { height: ROW_HEIGHT } : undefined}
                      isSortedColumn={sortState.key}
                      onClick={() => onOpenDrawer({ base, sectionLabel })}
                    />
                  ))}
                  {shouldVirtualize && virtualization.bottomSpacer > 0 ? (
                    <SpacerRow height={virtualization.bottomSpacer} />
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[color:var(--color-border)] bg-white/80 p-4 text-sm text-[color:var(--color-text)]/65">
            No databases in this country for the selected filters.
          </div>
        )}
      </div>
    </details>
  );
}

function BaseRow({
  base,
  style,
  isSortedColumn,
  onClick,
}: {
  base: BasePerformance;
  style?: CSSProperties;
  isSortedColumn: SortKey;
  onClick: () => void;
}) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  return (
    <tr
      className="bg-white/60 hover:bg-white transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--color-primary)]"
      style={style}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <td className="py-4 pr-4 align-top">
        <div className="flex items-start gap-3">
          <DatabaseFlag dbName={base.label} />
          <div className="space-y-1">
            <div className="text-sm font-semibold text-[color:var(--color-text)]">{base.label}</div>
            <div className="text-xs text-[color:var(--color-text)]/55">
              Prev turnover {formatEuro(base.metrics.previous.turnover)}
            </div>
          </div>
        </div>
      </td>
      {TABLE_METRICS.map((metric) => (
        <MetricCell
          key={metric}
          metric={metric}
          comparison={base.metrics}
          isSorted={isSortedColumn === metric}
        />
      ))}
    </tr>
  );
}

function MetricCell({ metric, comparison, isSorted }: { metric: KpiKey; comparison: MetricComparison; isSorted: boolean }) {
  const { value, subValue } = formatValueDetailed(metric, comparison);

  return (
    <td className="py-4 px-3 align-top">
      <div className={['text-sm font-medium tabular-nums', isSorted ? 'text-[color:var(--color-text)]' : 'text-[color:var(--color-text)]/80'].join(' ')}>
        {value}
      </div>
      {subValue ? (
        <div className="text-xs text-[color:var(--color-text)]/60 tabular-nums mt-0.5">{subValue}</div>
      ) : null}
      <div className="text-xs text-[color:var(--color-text)]/55 tabular-nums mt-0.5">
        Prev {formatPreviousValue(metric, comparison)}
      </div>
      <DeltaBadge metric={metric} delta={comparison.deltas[metric]} className="mt-1" />
    </td>
  );
}

function titleFromMetric(metric: KpiKey): string {
  switch (metric) {
    case 'turnover':
      return 'Turnover';
    case 'margin':
      return 'Margin';
    case 'marginPct':
      return 'Margin %';
    case 'routingCosts':
      return 'Routing costs';
    case 'vSent':
      return 'Volume';
    case 'ecpm':
      return 'eCPM';
    default:
      return metric;
  }
}

function compareBases(a: BasePerformance, b: BasePerformance, sortState: SortState): number {
  const direction = sortState.direction === 'asc' ? 1 : -1;
  if (sortState.key === 'database') {
    return direction * a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  }
  const aValue = metricValue(a, sortState.key);
  const bValue = metricValue(b, sortState.key);
  if (aValue === bValue) {
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  }
  return direction * (aValue - bValue);
}

function metricValue(base: BasePerformance, key: KpiKey): number {
  const value = base.metrics.current[key];
  if (value == null || Number.isNaN(value as number)) {
    return -Infinity;
  }
  return Number(value);
}

function HeaderButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        'flex items-center gap-1 text-xs uppercase tracking-[0.16em]',
        active ? 'text-[color:var(--color-text)]' : 'text-[color:var(--color-text)]/70 hover:text-[color:var(--color-text)]',
      ].join(' ')}
      onClick={onClick}
    >
      {label}
      <SortIndicator active={active} direction={direction} />
    </button>
  );
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  const resolvedDirection: SortDirection | 'none' = active ? direction : 'none';
  return (
    <span aria-hidden="true">
      <SortGlyph direction={resolvedDirection} />
    </span>
  );
}

function SortGlyph({ direction }: { direction: SortDirection | 'none' }) {
  const inactive = 'rgba(15,23,42,0.35)';
  const activeColor = 'var(--color-primary)';
  const upFill = direction === 'asc' ? activeColor : inactive;
  const downFill = direction === 'desc' ? activeColor : inactive;
  return (
    <svg
      className="h-3 w-3 shrink-0"
      viewBox="0 0 12 12"
      fill="none"
      role="img"
      aria-hidden="true"
    >
      <path d="M6 2L9.5 5.5H2.5L6 2Z" fill={upFill} />
      <path d="M6 10L2.5 6.5H9.5L6 10Z" fill={downFill} />
    </svg>
  );
}

function SpacerRow({ height }: { height: number }) {
  return (
    <tr>
      <td colSpan={TABLE_METRICS.length + 1} style={{ height }} />
    </tr>
  );
}

function CountryFlag({ geo }: { geo: string }) {
  const info = flagInfoFromGeo(geo);
  if (info?.code) {
    return (
      <span className="inline-flex items-center justify-center">
        <span className={`flag-swatch fi fi-${info.code}`} aria-hidden="true" />
        <span className="sr-only">{info.text ?? geo}</span>
      </span>
    );
  }
  if (info?.emoji) {
    return (
      <span className="flag-emoji" aria-hidden="true">
        {info.emoji}
      </span>
    );
  }
  return (
    <span className="flag-text-badge" aria-hidden="true">
      {geo || 'WW'}
    </span>
  );
}

function DatabaseFlag({ dbName }: { dbName: string }) {
  const info = flagInfoForDatabase(dbName);
  if (info?.code) {
    return (
      <span className="inline-flex items-center justify-center">
        <span className={`flag-swatch fi fi-${info.code}`} aria-hidden="true" />
        <span className="sr-only">{info.text ?? dbName}</span>
      </span>
    );
  }
  if (info?.emoji) {
    return (
      <span className="flag-emoji" aria-hidden="true">
        {info.emoji}
      </span>
    );
  }
  return (
    <span className="flag-text-badge" aria-hidden="true">
      {info?.text ?? dbName.slice(0, 2).toUpperCase()}
    </span>
  );
}

function QuickTrend({ data }: { data: QuickTrendPoint[] }) {
  if (!data.length) return null;
  if (data.length < 2) {
    return (
      <span className="text-xs text-[color:var(--color-text)]/45 tabular-nums">
        {formatEuro(data[0].value)}
      </span>
    );
  }
  const width = 120;
  const height = 34;
  const padding = 3;
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((point.value - min) / range) * (height - padding * 2);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Turnover trend"
      className="overflow-visible"
    >
      <path
        d={points.join(' ')}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
