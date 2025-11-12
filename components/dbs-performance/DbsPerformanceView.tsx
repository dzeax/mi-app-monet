'use client';

import { useState } from 'react';
import DbsPerformanceFilters from '@/components/dbs-performance/DbsPerformanceFilters';
import DbsPerformanceKpis from '@/components/dbs-performance/DbsPerformanceKpis';
import DbsPerformanceSections from '@/components/dbs-performance/DbsPerformanceSections';
import DbsPerformanceTrends from '@/components/dbs-performance/DbsPerformanceTrends';
import DbsPerformanceForecast from '@/components/dbs-performance/DbsPerformanceForecast';
import {
  useDbPerformance,
  type DbPerformanceExport,
  type KpiKey,
} from '@/hooks/useDbPerformance';
import {
  formatDeltaAbsolute,
  formatDeltaPercent,
  formatEuro,
  formatMarginPercent,
  formatVolume,
} from '@/components/dbs-performance/formatters';

export default function DbsPerformanceView() {
  const {
    filters,
    setFilters,
    range,
    compareRange,
    summary,
    sections,
    availableCountries,
    availableDbTypes,
    loading,
    refresh,
    trend,
    showYoy,
    forecast,
    exportData,
    resolveBaseDetail,
  } = useDbPerformance();

  const [refreshing, setRefreshing] = useState(false);
  const [trendMetric, setTrendMetric] = useState<KpiKey>('turnover');

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = () => {
    if (!exportData.rows.length) return;
    const csv = buildExportCsv(exportData);
    const filename = `dbs-performance_${exportData.range.from}_${exportData.range.to}.csv`;
    downloadCsv(csv, filename);
  };

  const exportDisabled = loading || !exportData.rows.length;

  const dbTypeOptions = availableDbTypes.length ? availableDbTypes : filters.dbTypes;

  const hasSummaryData =
    summary.metrics.current.count > 0 ||
    summary.metrics.previous.count > 0;
  const hasForecastData = Boolean(forecast.month || forecast.quarter);
  const hasTrendData = trend.points.length > 0;
  const hasSectionsData = sections.some(
    (section) =>
      section.countries.length > 0 ||
      section.metrics.current.count > 0 ||
      section.metrics.previous.count > 0
  );
  const hydrated = hasSummaryData || hasTrendData || hasSectionsData;

  const filtersRefreshing = refreshing || (!hydrated && loading);

  return (
    <div className="space-y-5" data-component="dbs-performance-view">
      <DbsPerformanceFilters
        filters={filters}
        onChange={setFilters}
        range={range}
        compareRange={compareRange}
        availableCountries={availableCountries}
        availableDbTypes={dbTypeOptions}
        onRefresh={handleRefresh}
        refreshing={filtersRefreshing}
        onExport={handleExport}
        exportDisabled={exportDisabled}
      />

      <DbsPerformanceKpis
        metrics={summary.metrics}
        range={range}
        compareRange={compareRange}
        loading={loading && !hasSummaryData}
        showYoy={showYoy}
        yoyDelta={summary.yoyDelta}
      />

      <DbsPerformanceForecast
        forecast={forecast}
        loading={loading && !hasForecastData}
      />

      <DbsPerformanceTrends
        trend={trend}
        metric={trendMetric}
        onMetricChange={setTrendMetric}
        loading={loading && !hasTrendData}
      />

      <DbsPerformanceSections
        sections={sections}
        loading={loading && !hasSectionsData}
        showYoy={showYoy}
        resolveBaseDetail={resolveBaseDetail}
      />
    </div>
  );
}

function buildExportCsv(data: DbPerformanceExport): string {
  const headers = [
    'Section',
    'DB Type',
    'Country',
    'Database',
    'Turnover (current)',
    'Turnover (previous)',
    'Turnover Δ',
    'Turnover Δ %',
    'Margin (current)',
    'Margin (previous)',
    'Margin Δ',
    'Margin % (current)',
    'Margin % (previous)',
    'Margin % Δ',
    'Volume sent (current)',
    'Volume sent (previous)',
    'Volume Δ',
    'Routing costs (current)',
    'Routing costs (previous)',
    'Routing costs Δ',
    'eCPM (current)',
    'eCPM (previous)',
    'eCPM Δ',
  ];

  const rows = data.rows.map((row) => {
    const { current, previous, deltas } = row.metrics;
    const values = [
      row.section,
      row.dbType,
      row.country,
      row.database,
      formatEuro(current.turnover),
      formatEuro(previous.turnover),
      formatDeltaAbsolute('turnover', deltas.turnover),
      formatDeltaPercent(deltas.turnover) ?? '',
      formatEuro(current.margin),
      formatEuro(previous.margin),
      formatDeltaAbsolute('margin', deltas.margin),
      formatMarginPercent(current.marginPct),
      formatMarginPercent(previous.marginPct),
      formatDeltaAbsolute('marginPct', deltas.marginPct),
      formatVolume(current.vSent),
      formatVolume(previous.vSent),
      formatDeltaAbsolute('vSent', deltas.vSent),
      formatEuro(current.routingCosts),
      formatEuro(previous.routingCosts),
      formatDeltaAbsolute('routingCosts', deltas.routingCosts),
      formatEuro(current.ecpm),
      formatEuro(previous.ecpm),
      formatDeltaAbsolute('ecpm', deltas.ecpm),
    ];
    return values.map(csvEscape).join(';');
  });

  return `\ufeff${[headers.map(csvEscape).join(';'), ...rows].join('\n')}`;
}

function downloadCsv(content: string, filename: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  const normalized = value != null ? String(value).replace(/\u202f/g, ' ') : '';
  if (/[\";\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
