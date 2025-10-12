// utils/format.ts
import type { Metric } from '@/types/reports';

/** Formateadores base */
export const fmtEUR0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export const fmtEUR2 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export const fmtINT = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 0,
});

/** Formatea un valor en función de la métrica seleccionada */
export function formatByMetric(metric: Metric, value: number): string {
  if (metric === 'turnover' || metric === 'margin') return fmtEUR2.format(value || 0);
  if (metric === 'ecpm') return fmtEUR2.format(value || 0);
  return fmtINT.format(value || 0);
}

/** Y-axis tick formatter para Recharts según métrica */
export function makeYAxisTick(metric: Metric) {
  return (v: number) => {
    if (metric === 'turnover' || metric === 'margin') return compactEuro(v);
    if (metric === 'ecpm') return fmtEUR2.format(v || 0);
    return fmtINT.format(v || 0);
  };
}

/** Muestra cantidades en € con sufijo K/M manteniendo contexto de divisa */
export function compactEuro(v: number): string {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${fmtEUR0.format(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${fmtEUR0.format(n / 1_000)}K`;
  return fmtEUR0.format(n);
}

/** Utilidad simple para fechas ISO (yyyy-mm-dd) */
export const toISODate = (s?: string | null) => (s || '').slice(0, 10);

// --- Back-compat: `fmtNum` usable como función y como `.format(...)`
type FmtNum = ((n: number) => string) & { format: (n: number) => string };

export const fmtNum: FmtNum = Object.assign(
  (n: number) => fmtINT.format(n),
  { format: (n: number) => fmtINT.format(n) }
);

