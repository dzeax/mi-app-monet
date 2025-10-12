'use client';

import { CampaignRow } from '@/types/campaign';

type Props = { data: CampaignRow[] };

const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmtInt = new Intl.NumberFormat('es-ES');

export default function CampaignKpis({ data }: Props) {
  const total = data.length;

  let vSent = 0, turnover = 0, margin = 0;
  for (const r of data) {
    vSent   += r.vSent || 0;
    turnover += r.turnover || 0;
    margin  += r.margin || 0;
  }

  // eCPM ponderado por vSent (más representativo que el promedio simple)
  const weightedEcpm = vSent > 0 ? (turnover / vSent) * 1000 : 0;

  const cards: Array<{ label: string; value: string; tone?: 'pos'|'neg'|null }> = [
    { label: 'Campaigns',     value: fmtInt.format(total) },
    { label: 'Total V Sent',  value: fmtInt.format(vSent) },
    { label: 'Turnover',      value: fmtEUR.format(turnover) },
    { label: 'Margin',        value: fmtEUR.format(margin), tone: margin > 0 ? 'pos' : margin < 0 ? 'neg' : null },
    { label: 'Weighted eCPM', value: fmtEUR.format(weightedEcpm) },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-4 shadow-sm"
        >
          <div className="text-xs uppercase opacity-70">{c.label}</div>
          <div
            className={[
              'text-xl font-semibold mt-1',
              c.tone === 'pos' ? 'text-[--color-primary]' : '',
              c.tone === 'neg' ? 'text-[--color-accent]'  : '',
            ].join(' ')}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
