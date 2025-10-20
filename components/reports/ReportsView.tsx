'use client';

import { useMemo, useState } from 'react';

import Card from '@/components/ui/Card';
import ReportsHeader from '@/components/reports/ReportsHeader';
import ReportsKpis from '@/components/reports/ReportsKpis';
import ReportsUnifiedTrend from '@/components/reports/ReportsUnifiedTrend';
import ReportsChart from '@/components/reports/ReportsChart';
import ReportsTopTable from '@/components/reports/ReportsTopTable';

import { useReportData } from '@/hooks/useReportData';
import type { Metric } from '@/types/reports';

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

const fmtLocal = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function startOfWeek(d: Date) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (copy.getDay() || 7) - 1;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function endOfWeek(d: Date) {
  const start = startOfWeek(d);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfQuarter(d: Date) {
  const quarter = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), quarter * 3, 1);
}

function endOfQuarter(d: Date) {
  const start = startOfQuarter(d);
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

function shiftQuarter(d: Date, delta: number) {
  const start = startOfQuarter(d);
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
  if (key === 'thisWeek') {
    return [fmtLocal(startOfWeek(now)), fmtLocal(endOfWeek(now))];
  }
  if (key === 'lastWeek') {
    const ref = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return [fmtLocal(startOfWeek(ref)), fmtLocal(endOfWeek(ref))];
  }
  if (key === 'thisMonth') {
    return [fmtLocal(startOfMonth(now)), fmtLocal(endOfMonth(now))];
  }
  if (key === 'lastMonth') {
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return [fmtLocal(startOfMonth(ref)), fmtLocal(endOfMonth(ref))];
  }
  if (key === 'thisQuarter') {
    return [fmtLocal(startOfQuarter(now)), fmtLocal(endOfQuarter(now))];
  }
  if (key === 'lastQuarter') {
    const ref = shiftQuarter(now, -1);
    return [fmtLocal(startOfQuarter(ref)), fmtLocal(endOfQuarter(ref))];
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

  // Estado del unified trend
  const [trendMetric, setTrendMetric] =
    useState<'ecpm' | 'turnover' | 'margin' | 'marginPct' | 'vSent'>('turnover');
  const [trendBy, setTrendBy] = useState<'none' | 'database' | 'partner' | 'geo'>('database');
  const [trendTopN, setTrendTopN] = useState<number>(5);
  const [trendIncludeOthers, setTrendIncludeOthers] = useState<boolean>(true);
  const [trendFocusKey, setTrendFocusKey] = useState<string | null>(null);

  const focusOptions = useMemo(
    () => (trendBy === 'none' ? [] : listAvailableKeys(trendBy)),
    [trendBy, listAvailableKeys]
  );

  const trendSeries = useMemo(
    () => makeTrendSeries({
      metric: trendMetric,
      by: trendBy,
      topN: trendFocusKey ? 1 : trendTopN,
      includeOthers: trendFocusKey ? false : trendIncludeOthers,
      only: trendFocusKey ? [trendFocusKey] : undefined,
    }),
    [makeTrendSeries, trendMetric, trendBy, trendTopN, trendIncludeOthers, trendFocusKey]
  );

  // Export ranking completo (no solo Top-N)
  const exportCsv = () => {
    const header = ['group', 'vSent', 'turnover', 'margin', 'ecpm'];
    const lines = [header.join(',')];
    fullRanking.forEach(r => {
      const g = `"${String(r.label).replaceAll('"', '""')}"`;
      lines.push([g, r.vSent, r.turnover.toFixed(2), r.margin.toFixed(2), r.ecpm.toFixed(2)].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${groupBy}_ranking.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ====== Geo mix (France B2C, France B2B, INTL) ======
  const frB2C = computeTotals(r => (r.geo || '').toUpperCase() === 'FR' && r.databaseType === 'B2C');
  const frB2B = computeTotals(r => (r.geo || '').toUpperCase() === 'FR' && r.databaseType === 'B2B');
  const intl   = computeTotals(r => (r.geo || '').toUpperCase() !== 'FR' && (r.databaseType === 'B2B' || r.databaseType === 'B2C'));

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
      {/* Filtros + KPIs */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:gap-5">
        <Card className="h-full">
          <ReportsHeader
            groupBy={groupBy}
            metric={metric}
            topN={topN}
            filters={filters}
            onChangeFilters={setFilters}
            onChangeGroupBy={setGroupBy}
            onChangeMetric={(m: Metric) => setMetric(m)}
            onChangeTopN={setTopN}
            onQuickLast30={quickLast30}
            onExportCsv={exportCsv}
            summary={{ filteredCount: summary.filteredRows, groupCount: summary.groups }}
            trendMetric={trendMetric}
            onChangeTrendMetric={setTrendMetric}
            trendBy={trendBy}
            onChangeTrendBy={setTrendBy}
            trendTopN={trendTopN}
            onChangeTrendTopN={setTrendTopN}
            trendIncludeOthers={trendIncludeOthers}
            onToggleTrendIncludeOthers={setTrendIncludeOthers}
            trendFocusKey={trendFocusKey}
            trendFocusOptions={focusOptions}
            onChangeTrendFocus={setTrendFocusKey}
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

      {/* Unified time series — inmediatamente tras KPIs */}
      <Card>
        <ReportsUnifiedTrend
          data={trendSeries.data}
          keys={trendSeries.keys}
          metric={trendMetric}
          onChangeMetric={setTrendMetric}
          by={trendBy}
          onChangeBy={setTrendBy}
          topN={trendTopN}
          onChangeTopN={setTrendTopN}
          includeOthers={trendIncludeOthers}
          onToggleOthers={setTrendIncludeOthers}
          focusKey={trendFocusKey}
          focusOptions={focusOptions}
          onChangeFocus={setTrendFocusKey}
          showControls={false}
        />
      </Card>

      {/* Geo mix: France B2C / France B2B / INTL + subtotal */}
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
            {subtotalMarginPct == null ? '—' : fmtPct.format(subtotalMarginPct)}{' '}
            <span className="opacity-70">({fmtEUR.format(subtotal.margin)})</span>
          </span>
          <span><strong>V Sent:</strong> {fmtInt.format(subtotal.vSent)}</span>
        </div>
      </Card>

      {/* Top-N (gráfico de barras) */}
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

      {/* Top-N (tabla) */}
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
          <strong>{v.marginPct == null ? '—' : fmtPct.format(v.marginPct)}</strong>
          <span className="opacity-70"> · {fmtEUR.format(v.margin)}</span>
        </div>
        <div><span className="opacity-70">V Sent</span><br /><strong>{fmtInt.format(v.vSent)}</strong></div>
        <div><span className="opacity-70">eCPM</span><br /><strong>{fmtEUR.format(v.ecpm)}</strong></div>
      </div>
    </div>
  );
}

function legendName(m: Metric) {
  return m === 'turnover' ? 'Turnover' : m === 'margin' ? 'Margin' : m === 'ecpm' ? 'eCPM' : 'V Sent';
}
function groupLabel(g: string) {
  switch (g) {
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
