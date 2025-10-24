// components/reports/ReportsTopTable.tsx
'use client';

import type { AggregateRow } from '@/types/reports';
import { fmtEUR2, fmtINT as fmtNum } from '@/utils/format';
import type { FlagInfo } from '@/utils/flags';

type RowLike = Pick<AggregateRow, 'label' | 'vSent' | 'turnover' | 'margin' | 'ecpm'> & {
  key?: string;
};

type Props = {
  data?: RowLike[];
  rows?: RowLike[];
  groupLabel?: string;
  flagForLabel?: (label: string) => FlagInfo;
  activeKey?: string | null;
  onRowClick?: (key: string | null) => void;
};

export default function ReportsTopTable({
  data,
  rows,
  groupLabel = 'Group',
  flagForLabel,
  activeKey,
  onRowClick,
}: Props) {
  const list: RowLike[] = data ?? rows ?? [];

  const renderFlag = (info?: FlagInfo | null) => {
    if (!info) return null;
    if (info.code) {
      return (
        <span className="inline-flex items-center justify-center">
          <span className={`flag-swatch fi fi-${info.code}`} aria-hidden="true" />
          {info.text ? <span className="sr-only">{info.text}</span> : null}
        </span>
      );
    }
    if (info.emoji) {
      return (
        <span className="flag-emoji inline-flex items-center justify-center" aria-hidden="true">
          {info.emoji}
        </span>
      );
    }
    if (info.text) {
      return (
        <span className="flag-text-badge" aria-hidden="true">
          {info.text}
        </span>
      );
    }
    return null;
  };

  if (!list.length) {
    return (
      <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)] p-3">
        <div className="flex flex-col items-center gap-2 py-6 text-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[--color-border] text-lg opacity-60">
            📊
          </div>
          <div className="text-[color:var(--color-text)]/70">No data for current filters.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto mt-3">
      <table className="min-w-[720px] w-full text-sm">
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
          {list.map((row, index) => {
            const flagInfo = flagForLabel ? flagForLabel(row.label) : null;
            const rowKey = row.key ?? row.label;
            const isActive = activeKey ? rowKey === activeKey : index === 0;
            const rowClasses = [
              onRowClick ? 'cursor-pointer transition-colors' : '',
              isActive ? 'bg-[color:var(--color-surface-2)]/60' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <tr
                key={rowKey}
                className={rowClasses}
                onClick={() => {
                  if (!onRowClick) return;
                  onRowClick(rowKey);
                }}
              >
                <Td className="flex items-center gap-2">
                  {renderFlag(flagInfo)}
                  <span>{row.label}</span>
                </Td>
                <Td className="text-right">{fmtNum.format(row.vSent)}</Td>
                <Td className="text-right">{fmtEUR2.format(row.turnover)}</Td>
                <Td
                  className={[
                    'text-right',
                    row.margin > 0
                      ? 'text-[--color-primary]'
                      : row.margin < 0
                        ? 'text-[--color-accent]'
                        : '',
                  ].join(' ')}
                >
                  {fmtEUR2.format(row.margin)}
                </Td>
                <Td className="text-right">{fmtEUR2.format(row.ecpm)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
