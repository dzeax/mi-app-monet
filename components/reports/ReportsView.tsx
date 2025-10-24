'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Card from '@/components/ui/Card';
import ReportsHeader from '@/components/reports/ReportsHeader';
import ReportsKpis from '@/components/reports/ReportsKpis';
import ReportsUnifiedTrend from '@/components/reports/ReportsUnifiedTrend';
import ReportsChart from '@/components/reports/ReportsChart';
import ReportsTopTable from '@/components/reports/ReportsTopTable';

import { useReportData } from '@/hooks/useReportData';
import { GROUP_LABELS, METRIC_LABELS, type GroupBy, type Metric } from '@/types/reports';
import { flagInfoForDatabase, flagInfoFromGeo, type FlagInfo } from '@/utils/flags';

type TrendGroupBy = 'none' | 'database' | 'partner' | 'geo' | 'type' | 'databaseType';

type FocusableRow = {
  database?: string | null;
  partner?: string | null;
  geo?: string | null;
  type?: string | null;
  databaseType?: string | null;
};

const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmtInt = new Intl.NumberFormat('es-ES');
const fmtPct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 });

type DatePresetKey =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'last7'
  | 'last30'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear';

const PERIOD_PRESETS: Array<{ key: DatePresetKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7' },
  { key: 'last30', label: 'Last 30' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'lastQuarter', label: 'Last quarter' },
  { key: 'thisYear', label: 'This year' },
  { key: 'lastYear', label: 'Last year' },
];

const fmtLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() || 7) - 1;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}

function endOfQuarter(date: Date) {
  const start = startOfQuarter(date);
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

function shiftQuarter(date: Date, delta: number) {
  const start = startOfQuarter(date);
  return new Date(start.getFullYear(), start.getMonth() + delta * 3, 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function rangeForPresetKey(key: DatePresetKey): [string, string] {
  const now = new Date();
  if (key === 'today') {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const iso = fmtLocal(base);
    return [iso, iso];
  }
  if (key === 'yesterday') {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const iso = fmtLocal(base);
    return [iso, iso];
  }
  if (key === 'thisWeek') return [fmtLocal(startOfWeek(now)), fmtLocal(endOfWeek(now))];
  if (key === 'lastWeek') {
    const reference = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return [fmtLocal(startOfWeek(reference)), fmtLocal(endOfWeek(reference))];
  }
  if (key === 'thisMonth') return [fmtLocal(startOfMonth(now)), fmtLocal(endOfMonth(now))];
  if (key === 'lastMonth') {
    const reference = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return [fmtLocal(startOfMonth(reference)), fmtLocal(endOfMonth(reference))];
  }
  if (key === 'thisQuarter') return [fmtLocal(startOfQuarter(now)), fmtLocal(endOfQuarter(now))];
  if (key === 'lastQuarter') {
    const reference = shiftQuarter(now, -1);
    return [fmtLocal(startOfQuarter(reference)), fmtLocal(endOfQuarter(reference))];
  }
  if (key === 'thisYear') return [fmtLocal(startOfYear(now)), fmtLocal(endOfYear(now))];
  if (key === 'lastYear') {
    const reference = new Date(now.getFullYear() - 1, 6, 1);
    return [fmtLocal(startOfYear(reference)), fmtLocal(endOfYear(reference))];
  }
  if (key === 'last7') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return [fmtLocal(start), fmtLocal(end)];
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [fmtLocal(start), fmtLocal(end)];
}

function formatPeriodLabel(from?: string, to?: string): string {
  if (!from && !to) return 'All data';
  if (from && !to) return `Since ${from}`;
  if (!from && to) return `Until ${to}`;
  if (!from || !to) return 'All data';

  for (const preset of PERIOD_PRESETS) {
    const [presetStart, presetEnd] = rangeForPresetKey(preset.key);
    if (presetStart === from && presetEnd === to) {
      return preset.label;
    }
  }

  if (from === to) return from;
  return `${from} to ${to}`;
}

export default function ReportsView() {
  const {
    filters, setFilters,
    groupBy, setGroupBy,
    metric, setMetric,
    topN, setTopN,
    ranking, fullRanking,
    summary,
    quickLast30,
    makeTrendSeries,
    listAvailableKeys,
    computeTotals,
  } = useReportData();

  const [trendFocusKey, setTrendFocusKey] = useState<string | null>(null);
  const [kpiScope, setKpiScope] = useState<'all' | 'focus'>('all');
  const [activeRankingKey, setActiveRankingKey] = useState<string | null>(null);

  const derivedTrendBy: TrendGroupBy = useMemo(() => {
    const allowed = new Set<TrendGroupBy>(['none', 'database', 'partner', 'geo', 'type', 'databaseType']);
    if (allowed.has(groupBy as TrendGroupBy)) {
      return groupBy as TrendGroupBy;
    }
    return 'none';
  }, [groupBy]);

  const focusOptions = useMemo(
    () => (derivedTrendBy === 'none' ? [] : listAvailableKeys(derivedTrendBy)),
    [derivedTrendBy, listAvailableKeys]
  );

  useEffect(() => {
    if (derivedTrendBy === 'none') {
      setTrendFocusKey(null);
    }
  }, [derivedTrendBy]);

  useEffect(() => {
    if (trendFocusKey && !focusOptions.includes(trendFocusKey)) {
      setTrendFocusKey(null);
    }
  }, [trendFocusKey, focusOptions]);

  const focusScopeAvailable = derivedTrendBy !== 'none' && !!trendFocusKey;

  // Resolver de iconos por etiqueta según agrupación actual
  const flagForLabel = useMemo<((label: string) => FlagInfo) | undefined>(() => {
    if (groupBy === 'database') {
      return (label: string) => flagInfoForDatabase(label);
    }
    if (groupBy === 'geo') {
      return (label: string) => flagInfoFromGeo(label);
    }
    return undefined;
  }, [groupBy]);

  useEffect(() => {
    if (!activeRankingKey) return;
    if (!ranking.some((row) => row.key === activeRankingKey)) {
      setActiveRankingKey(null);
    }
  }, [activeRankingKey, ranking]);

  const handleRankingSelect = useCallback((key: string | null) => {
    if (!key) {
      setActiveRankingKey(null);
      return;
    }
    setActiveRankingKey((prev) => (prev === key ? null : key));
  }, []);

  useEffect(() => {
    if (!focusScopeAvailable && kpiScope === 'focus') {
      setKpiScope('all');
    }
  }, [focusScopeAvailable, kpiScope]);

  const trendSeries = useMemo(
    () => makeTrendSeries({
      metric,
      by: derivedTrendBy,
      topN: trendFocusKey ? 1 : topN,
      includeOthers: trendFocusKey ? false : true,
      only: trendFocusKey ? [trendFocusKey] : undefined,
    }),
    [makeTrendSeries, metric, derivedTrendBy, topN, trendFocusKey]
  );

  const exportCsv = () => {
    const header = ['group', 'vSent', 'turnover', 'margin', 'routingCosts', 'ecpm', 'marginPct'];
    const lines = [header.join(',')];
    fullRanking.forEach((row) => {
      const label = `"${String(row.label).replaceAll('"', '""')}"`;
      const marginPct = row.marginPct == null ? '' : row.marginPct.toFixed(4);
      lines.push([
        label,
        row.vSent,
        row.turnover.toFixed(2),
        row.margin.toFixed(2),
        row.routingCosts.toFixed(2),
        row.ecpm.toFixed(2),
        marginPct,
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${groupBy}_ranking.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const frB2C = computeTotals((row) => (row.geo || '').toUpperCase() === 'FR' && row.databaseType === 'B2C');
  const frB2B = computeTotals((row) => (row.geo || '').toUpperCase() === 'FR' && row.databaseType === 'B2B');
  const intl = computeTotals((row) => (row.geo || '').toUpperCase() !== 'FR' && (row.databaseType === 'B2B' || row.databaseType === 'B2C'));

  const subtotal = {
    vSent: frB2C.vSent + frB2B.vSent + intl.vSent,
    turnover: frB2C.turnover + frB2B.turnover + intl.turnover,
    margin: frB2C.margin + frB2B.margin + intl.margin,
  };
  const subtotalMarginPct = subtotal.turnover > 0 ? subtotal.margin / subtotal.turnover : null;

  const periodLabel = useMemo(
    () => formatPeriodLabel(filters.from, filters.to),
    [filters.from, filters.to]
  );

  const kpiTotals = useMemo(() => {
    if (kpiScope !== 'focus' || !focusScopeAvailable || !trendFocusKey) {
      return summary.totals;
    }

    const targetKey =
      derivedTrendBy === 'geo'
        ? trendFocusKey.toUpperCase()
        : trendFocusKey.trim();

    const matchesFocus = (row: unknown) => {
      if (!row || typeof row !== 'object') return false;
      const record = row as FocusableRow;
      switch (derivedTrendBy) {
        case 'database':
          return (record.database || '(unknown)').trim() === targetKey;
        case 'partner':
          return (record.partner || '(unknown)').trim() === targetKey;
        case 'geo':
          return (record.geo || '(unknown)').toUpperCase() === targetKey;
        case 'type':
          return (record.type || '(unknown)').trim() === targetKey;
        case 'databaseType':
          return (record.databaseType || '(unknown)').trim() === targetKey;
        default:
          return false;
      }
    };

    const totals = computeTotals(matchesFocus);
    return {
      vSent: totals.vSent,
      turnover: totals.turnover,
      margin: totals.margin,
      routingCosts: totals.routingCosts,
      ecpm: totals.ecpm,
      marginPct: totals.marginPct,
    };
  }, [
    computeTotals,
    derivedTrendBy,
    focusScopeAvailable,
    kpiScope,
    summary.totals,
    trendFocusKey,
  ]);

  const focusDimensionLabel = trendGroupLabel(derivedTrendBy);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:gap-5">
        <Card className="h-full">
          <ReportsHeader
            groupBy={groupBy}
            metric={metric}
            topN={topN}
            focusKey={trendFocusKey}
            focusOptions={focusOptions}
            filters={filters}
            onChangeFilters={setFilters}
            onChangeGroupBy={setGroupBy}
            onChangeMetric={(value: Metric) => setMetric(value)}
            onChangeTopN={setTopN}
            onChangeFocus={setTrendFocusKey}
            onQuickLast30={quickLast30}
            onExportCsv={exportCsv}
            summary={{ filteredCount: summary.filteredRows, groupCount: summary.groups }}
          />
        </Card>

        <ReportsKpis
          className="h-full"
          kpis={kpiTotals}
          periodLabel={periodLabel}
          filteredRows={summary.filteredRows}
          groupCount={summary.groups}
          scope={kpiScope}
          onScopeChange={setKpiScope}
          focusAvailable={focusScopeAvailable}
          focusLabel={trendFocusKey}
          focusDimensionLabel={focusDimensionLabel}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="h-full">
          <ReportsUnifiedTrend
            data={trendSeries.data}
            keys={trendSeries.keys}
            metric={metric}
            by={derivedTrendBy}
            topN={topN}
            includeOthers={!trendFocusKey}
            focusKey={trendFocusKey}
            focusOptions={focusOptions}
            showControls={false}
          />
        </Card>

        <Card className="h-full">
          <ReportsChart
            data={ranking}
            metric={metric}
            title={`Top ${topN} by ${legendName(metric)}`}
            height={360}
            showTable={false}
            groupLabel={groupLabel(groupBy)}
            flagForLabel={flagForLabel}
            activeKey={activeRankingKey}
            onActiveChange={handleRankingSelect}
          />
        </Card>
      </div>

      <Card>
        <div className="mb-3 text-sm font-medium">Geo mix</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GeoTile title="France B2C" v={frB2C} />
          <GeoTile title="France B2B" v={frB2B} />
          <GeoTile title="INTL (B2B+B2C, no FR)" v={intl} />
        </div>
        <div className="mt-3 pt-3 border-t border-[--color-border] text-sm flex flex-wrap items-center gap-4">
          <span className="opacity-70">Subtotal (B2B+B2C):</span>
          <span><strong>Turnover:</strong> {fmtEUR.format(subtotal.turnover)}</span>
          <span>
            <strong>Margin (%):</strong>{' '}
            {subtotalMarginPct == null ? '--' : fmtPct.format(subtotalMarginPct)}{' '}
            <span className="opacity-70">({fmtEUR.format(subtotal.margin)})</span>
          </span>
          <span><strong>V Sent:</strong> {fmtInt.format(subtotal.vSent)}</span>
        </div>
      </Card>

      <Card>
        <ReportsTopTable
          data={ranking}
          groupLabel={groupLabel(groupBy)}
          flagForLabel={flagForLabel}
          activeKey={activeRankingKey}
          onRowClick={handleRankingSelect}
        />
      </Card>
    </div>
  );
}

function GeoTile({ title, v }: {
  title: string;
  v: { vSent: number; turnover: number; margin: number; ecpm: number; marginPct: number | null };
}) {
  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-4">
      <div className="text-xs uppercase opacity-70">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div><span className="opacity-70">Turnover</span><br /><strong>{fmtEUR.format(v.turnover)}</strong></div>
        <div>
          <span className="opacity-70">Margin (%)</span><br />
          <strong>{v.marginPct == null ? '--' : fmtPct.format(v.marginPct)}</strong>
          <span className="opacity-70"> - {fmtEUR.format(v.margin)}</span>
        </div>
        <div><span className="opacity-70">V Sent</span><br /><strong>{fmtInt.format(v.vSent)}</strong></div>
        <div><span className="opacity-70">eCPM</span><br /><strong>{fmtEUR.format(v.ecpm)}</strong></div>
      </div>
    </div>
  );
}

function legendName(metric: Metric) {
  return METRIC_LABELS[metric] ?? metric;
}

function groupLabel(groupBy: GroupBy) {
  return GROUP_LABELS[groupBy] ?? 'Group';
}

function trendGroupLabel(groupBy: TrendGroupBy) {
  if (groupBy === 'none') return null;
  return GROUP_LABELS[groupBy as GroupBy] ?? null;
}
