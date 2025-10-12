// components/reports/ReportsKpis.tsx
'use client';

import { fmtEUR2, fmtINT as fmtNum } from '@/utils/format';

type Kpis = {
  vSent: number;
  turnover: number;
  margin: number;
  ecpm: number;
  marginPct: number | null;
};

export default function ReportsKpis({ kpis }: { kpis: Kpis }) {
  const marginText =
    `${fmtEUR2.format(kpis.margin)}${
      kpis.marginPct == null ? '' : ` (${(kpis.marginPct * 100).toFixed(1)}%)`
    }`;

  const highlight: 'pos' | 'neg' | undefined =
    kpis.margin > 0 ? 'pos' : kpis.margin < 0 ? 'neg' : undefined;

  return (
    <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi title="Total V Sent" value={fmtNum.format(kpis.vSent)} />
      <Kpi title="Turnover" value={fmtEUR2.format(kpis.turnover)} />
      <Kpi title="Margin" value={marginText} highlight={highlight} />
      <Kpi title="Weighted eCPM" value={fmtEUR2.format(kpis.ecpm)} />
    </div>
  );
}

function Kpi({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: 'pos' | 'neg';
}) {
  const color =
    highlight === 'pos'
      ? 'text-[--color-primary]'
      : highlight === 'neg'
      ? 'text-[--color-accent]'
      : 'opacity-100';
  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)]/80 p-3">
      <div className="text-xs uppercase opacity-70">{title}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
