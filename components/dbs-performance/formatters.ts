import type { DateRange, KpiKey, MetricComparison, MetricDelta } from '@/hooks/useDbPerformance';
import { fmtEUR2, fmtINT } from '@/utils/format';

const fmtPercent = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fmtPercentPoints = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatRange(range: DateRange): string {
  if (range.from === range.to) return range.from;
  return `${range.from} to ${range.to}`;
}

export function formatComparison(range: DateRange): string {
  return `${range.from} to ${range.to}`;
}

export function formatKpiValue(key: KpiKey, value: number | null): string {
  if (key === 'marginPct') {
    if (value == null) return '--';
    return fmtPercent.format(value);
  }
  if (key === 'ecpm') {
    return fmtEUR2.format(value ?? 0);
  }
  if (key === 'vSent') {
    return fmtINT.format(value ?? 0);
  }
  return fmtEUR2.format(value ?? 0);
}

export function formatKpiSubValue(key: KpiKey, comparison: MetricComparison): string | null {
  if (key === 'marginPct') {
    return fmtEUR2.format(comparison.current.margin);
  }
  return null;
}

export function formatDeltaAbsolute(key: KpiKey, delta: MetricDelta): string {
  const prefix = delta.absolute >= 0 ? '+' : '-';
  const magnitude = Math.abs(delta.absolute);

  if (key === 'marginPct') {
    return `${prefix}${fmtPercentPoints.format(magnitude * 100)} pts`;
  }
  if (key === 'ecpm') {
    return `${prefix}${fmtEUR2.format(magnitude)}`;
  }
  if (key === 'vSent') {
    return `${prefix}${fmtINT.format(magnitude)}`;
  }
  return `${prefix}${fmtEUR2.format(magnitude)}`;
}

export function formatDeltaPercent(delta: MetricDelta): string | null {
  if (delta.percent == null) return null;
  const prefix = delta.percent >= 0 ? '+' : '-';
  return `${prefix}${fmtPercent.format(Math.abs(delta.percent))}`;
}

export function isPositiveDelta(delta: MetricDelta): boolean {
  if (delta.absolute === 0 && (delta.percent == null || delta.percent === 0)) {
    return false;
  }
  return delta.absolute > 0 || (delta.percent != null && delta.percent > 0);
}

export function formatValueDetailed(
  key: KpiKey,
  comparison: MetricComparison
): { value: string; subValue: string | null } {
  const value = formatKpiValue(key, comparison.current[key] as number | null);
  const subValue = formatKpiSubValue(key, comparison);
  return { value, subValue };
}

export function formatPreviousValue(key: KpiKey, comparison: MetricComparison): string {
  const previous = comparison.previous[key] as number | null;
  if (key === 'marginPct') {
    if (previous == null) return '--';
    return fmtPercent.format(previous);
  }
  if (key === 'ecpm') {
    return fmtEUR2.format(previous ?? 0);
  }
  if (key === 'vSent') {
    return fmtINT.format(previous ?? 0);
  }
  return fmtEUR2.format(previous ?? 0);
}

export function formatVolume(value: number): string {
  return fmtINT.format(value);
}

export function formatEuro(value: number): string {
  return fmtEUR2.format(value);
}

export function formatMarginPercent(value: number | null): string {
  if (value == null) return '--';
  return fmtPercent.format(value);
}

export function formatMarginPoints(value: number): string {
  const prefix = value >= 0 ? '+' : '-';
  return `${prefix}${fmtPercentPoints.format(Math.abs(value * 100))} pts`;
}
