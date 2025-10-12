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

export default function ReportsView() {
  const {
    filters, setFilters,
    groupBy, setGroupBy,
    metric, setMetric,
    topN, setTopN,
    ranking, fullRanking,
    summary,
    quickLast30,
    makeTrendSeries,          // ⬅️ unificado
    listAvailableKeys,
    computeTotals,            // ⬅️ nuevo helper para FR/INTL
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

  return (
    <div className="grid gap-6">
      {/* Filtros (en tarjeta) */}
      <Card>
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
        />
      </Card>

      {/* KPIs globales */}
      <Card>
        <ReportsKpis kpis={summary.totals} />
      </Card>

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
