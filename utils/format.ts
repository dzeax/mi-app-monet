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

const fmtPCT = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  maximumFractionDigits: 2,
});

/** Formatea un valor en función de la métrica seleccionada */
export function formatByMetric(metric: Metric, value: number): string {
  const n = Number(value || 0);
  if (metric === 'turnover' || metric === 'margin' || metric === 'routingCosts') {
    return fmtEUR2.format(n);
  }
  if (metric === 'ecpm') {
    return fmtEUR2.format(n);
  }
  if (metric === 'marginPct') {
    return fmtPCT.format(n);
  }
  return fmtINT.format(n);
}

/** Y-axis tick formatter para Recharts según métrica */
export function makeYAxisTick(metric: Metric) {
  return (v: number) => {
    const n = Number(v || 0);
    if (metric === 'marginPct') {
      return `${(n * 100).toFixed(0)}%`;
    }
    if (metric === 'turnover' || metric === 'margin' || metric === 'routingCosts') {
      return compactEuro(n);
    }
    if (metric === 'ecpm') {
      return fmtEUR2.format(n);
    }
    return fmtINT.format(n);
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
  { format: (n: number) => fmtINT.format(n) },
);


