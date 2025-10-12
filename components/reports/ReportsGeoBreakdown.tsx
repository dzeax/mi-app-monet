'use client';

import Card from '@/components/ui/Card';
import { useReportData } from '@/hooks/useReportData';

const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmtPct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 });

function Block({
  title,
  turnover,
  margin,
  marginPct,
}: {
  title: string;
  turnover: number;
  margin: number;
  marginPct: number | null;
}) {
  const tone =
    marginPct == null ? ''
    : marginPct >= 0.70 ? 'text-[color:var(--color-primary)]'
    : marginPct >= 0.01 ? 'text-[color-mix(in_oklab,var(--color-accent)_58%,var(--color-primary)_42%)]'
    : 'text-[color:var(--color-accent)]';

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface-2)]/60 p-4">
      <div className="text-xs uppercase opacity-70">{title}</div>
      <div className="mt-2 grid gap-1">
        <div className="text-sm">Turnover</div>
        <div className="text-lg font-semibold tabular-nums">{fmtEUR.format(turnover)}</div>
        <div className="mt-1 text-sm">Margin (%)</div>
        <div className={`text-lg font-semibold tabular-nums ${tone}`}>
          {marginPct == null ? '—' : fmtPct.format(marginPct)}
        </div>
        <div className="text-xs opacity-75 tabular-nums">Margin: <strong>{fmtEUR.format(margin)}</strong></div>
      </div>
    </div>
  );
}

export default function ReportsGeoBreakdown() {
  const { computeTotals } = useReportData();

  const isFR    = (g?: string) => (g || '').toUpperCase() === 'FR';
  const isB2C   = (t?: string) => t === 'B2C';
  const isB2B   = (t?: string) => t === 'B2B';

  const frB2C = computeTotals(r => isFR(r.geo) && isB2C(r.databaseType));
  const frB2B = computeTotals(r => isFR(r.geo) && isB2B(r.databaseType));
  const intl  = computeTotals(r => !isFR(r.geo)); // todos los geos ≠ FR, incluye B2B+B2C (y geos vacíos si los hay)
  const total = computeTotals(); // summary sobre el filtro activo

  return (
    <Card title="France vs INTL">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Block title="France · B2C" turnover={frB2C.turnover} margin={frB2C.margin} marginPct={frB2C.marginPct} />
        <Block title="France · B2B" turnover={frB2B.turnover} margin={frB2B.margin} marginPct={frB2B.marginPct} />
        <Block title="INTL (≠FR)"   turnover={intl.turnover} margin={intl.margin}   marginPct={intl.marginPct} />
        <Block title="Summary (Total filtro)" turnover={total.turnover} margin={total.margin} marginPct={total.marginPct} />
      </div>
    </Card>
  );
}
