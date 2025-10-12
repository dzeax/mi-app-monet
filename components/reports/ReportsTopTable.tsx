// components/reports/ReportsTopTable.tsx
'use client';

import type { AggregateRow } from '@/types/reports';
import { fmtEUR2, fmtINT as fmtNum } from '@/utils/format';

type RowLike = Pick<AggregateRow, 'label' | 'vSent' | 'turnover' | 'margin' | 'ecpm'> & {
  key?: string;
};

export default function ReportsTopTable({
  data,
  rows,
  groupLabel = 'Group',
}: {
  /** Nueva prop opcional para retro-compat: */
  rows?: RowLike[];
  /** Prop “canónica”: */
  data?: RowLike[];
  groupLabel?: string;
}) {
  const list: RowLike[] = (data ?? rows ?? []);

  if (!list.length) {
    return (
      <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
        <div className="text-sm opacity-70">No data for current filters.</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="border-b border-[--color-border]/60">
            <Th>{groupLabel}</Th>
            <Th className="text-right">V Sent</Th>
            <Th className="text-right">Turnover</Th>
            <Th className="text-right">Margin</Th>
            <Th className="text-right">eCPM</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[--color-border]/60">
          {list.map((r) => (
            <tr key={r.key ?? r.label}>
              <Td>{r.label}</Td>
              <Td className="text-right">{fmtNum.format(r.vSent)}</Td>
              <Td className="text-right">{fmtEUR2.format(r.turnover)}</Td>
              <Td
                className={[
                  'text-right',
                  r.margin > 0 ? 'text-[--color-primary]' : r.margin < 0 ? 'text-[--color-accent]' : '',
                ].join(' ')}
              >
                {fmtEUR2.format(r.margin)}
              </Td>
              <Td className="text-right">{fmtEUR2.format(r.ecpm)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
