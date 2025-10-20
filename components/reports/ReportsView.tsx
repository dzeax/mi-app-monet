'use client';

import { useEffect, useMemo, useState } from 'react';

import Card from '@/components/ui/Card';
import ReportsHeader from '@/components/reports/ReportsHeader';
import ReportsKpis from '@/components/reports/ReportsKpis';
import ReportsUnifiedTrend from '@/components/reports/ReportsUnifiedTrend';
import ReportsChart from '@/components/reports/ReportsChart';
import ReportsTopTable from '@/components/reports/ReportsTopTable';

import { useReportData } from '@/hooks/useReportData';
import type { Metric } from '@/types/reports';

type TrendGroupBy = 'none' | 'database' | 'partner' | 'geo';

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
  | 'lastQuarter';

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

  const derivedTrendBy: TrendGroupBy = useMemo(() => {
    const allowed = new Set<TrendGroupBy>(['none', 'database', 'partner', 'geo']);
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
    const header = ['group', 'vSent', 'turnover', 'margin', 'ecpm'];
    const lines = [header.join(',')];
    fullRanking.forEach((row) => {
      const label = `"${String(row.label).replaceAll('"', '""')}"`;
      lines.push([label, row.vSent, row.turnover.toFixed(2), row.margin.toFixed(2), row.ecpm.toFixed(2)].join(','));
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
          kpis={summary.totals}
          periodLabel={periodLabel}
          filteredRows={summary.filteredRows}
          groupCount={summary.groups}
        />
      </div>

      <Card>
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
        <ReportsChart
          data={ranking}
          metric={metric}
          title={`Top ${topN} by ${legendName(metric)}`}
          height={360}
          showTable={false}
          groupLabel={groupLabel(groupBy)}
        />
      </Card>

      <Card>
        <ReportsTopTable
          data={ranking}
          groupLabel={groupLabel(groupBy)}
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
          <span className="opacity-70"> · {fmtEUR.format(v.margin)}</span>
        </div>
        <div><span className="opacity-70">V Sent</span><br /><strong>{fmtInt.format(v.vSent)}</strong></div>
        <div><span className="opacity-70">eCPM</span><br /><strong>{fmtEUR.format(v.ecpm)}</strong></div>
      </div>
    </div>
  );
}

function legendName(metric: Metric) {
  return metric === 'turnover' ? 'Turnover' : metric === 'margin' ? 'Margin' : metric === 'ecpm' ? 'eCPM' : 'V Sent';
}

function groupLabel(groupBy: string) {
  switch (groupBy) {
    case 'database': return 'Database';
    case 'partner': return 'Partner';
    case 'campaign': return 'Campaign';
    case 'advertiser': return 'Advertiser';
    case 'theme': return 'Theme';
    case 'geo': return 'GEO';
    case 'type': return 'Type';
    case 'databaseType': return 'DB Type';
    default: return 'Group';
  }
}
