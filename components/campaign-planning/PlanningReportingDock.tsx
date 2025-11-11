
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DatabaseFlag from '@/components/campaign-planning/DatabaseFlag';
import type { CampaignRow } from '@/types/campaign';
import { fmtEUR2, fmtINT } from '@/utils/format';

const decimal = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatEuro = (value?: number | null) => fmtEUR2.format(value ?? 0);
const formatInt = (value?: number | null) => fmtINT.format(value ?? 0);

const marginTone = (ratio: number | null) => {
  if (ratio == null) return 'text-[color:var(--color-text)]/70';
  if (ratio >= 0.7) return 'text-[color:var(--color-primary)]';
  if (ratio >= 0.01) return 'text-[color-mix(in_oklab,var(--color-accent)_58%,var(--color-primary)_42%)]';
  return 'text-[color:var(--color-accent)]';
};

type SortKey =
  | 'date'
  | 'campaign'
  | 'partner'
  | 'price'
  | 'type'
  | 'vSent'
  | 'qty'
  | 'turnover'
  | 'marginPct'
  | 'ecpm'
  | 'database';

type SortState = { key: SortKey; direction: 'asc' | 'desc' };

type Props = {
  open: boolean;
  onRequestClose: () => void;
  height: number;
  minHeight?: number;
  maxHeight?: number;
  onHeightChange?: (height: number) => void;
  loading: boolean;
  pending: boolean;
  rows: CampaignRow[];
  totalRows: number;
  totals: {
    vSent: number;
    qty: number;
    turnover: number;
    margin: number;
    ecpm: number;
  };
  marginPct: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onUseRow: (row: CampaignRow) => void;
};

export default function PlanningReportingDock({
  open,
  onRequestClose,
  height,
  minHeight,
  maxHeight,
  onHeightChange,
  loading,
  pending,
  rows,
  totalRows,
  totals,
  marginPct,
  hasMore,
  onLoadMore,
  onUseRow,
}: Props) {
  const clampHeightValue = useCallback(
    (value: number) => {
      const viewport = typeof window !== 'undefined' ? window.innerHeight : 900;
      const min = minHeight ?? 280;
      const candidateMax = maxHeight ?? Math.round(viewport * 0.85);
      const safeMax = Math.max(min + 80, Math.min(candidateMax, viewport - 56));
      return Math.min(Math.max(value, min), safeMax);
    },
    [minHeight, maxHeight],
  );

  const clampedHeight = clampHeightValue(height);

  useEffect(() => {
    if (!onHeightChange) return;
    if (clampedHeight !== height) {
      onHeightChange(clampedHeight);
    }
  }, [clampedHeight, height, onHeightChange]);

  const [sortState, setSortState] = useState<SortState>({ key: 'date', direction: 'desc' });

  const handleSort = (key: SortKey) => {
    setSortState((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'date' ? 'desc' : 'asc' },
    );
  };

  const getSortableValue = (row: CampaignRow, key: SortKey) => {
    switch (key) {
      case 'date':
        return new Date(row.date).getTime();
      case 'campaign':
        return row.campaign ?? '';
      case 'partner':
        return row.partner ?? '';
      case 'price':
        return row.price ?? 0;
      case 'type':
        return row.type ?? '';
      case 'vSent':
        return row.vSent ?? 0;
      case 'qty':
        return row.qty ?? 0;
      case 'turnover':
        return row.turnover ?? 0;
      case 'marginPct':
        return row.turnover ? row.margin / row.turnover : 0;
      case 'ecpm':
        return row.ecpm ?? 0;
      case 'database':
        return row.database ?? '';
      default:
        return 0;
    }
  };

  const sortedRows = useMemo(() => {
    const data = [...rows];
    data.sort((a, b) => {
      const aVal = getSortableValue(a, sortState.key);
      const bVal = getSortableValue(b, sortState.key);

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
        return sortState.direction === 'asc' ? comparison : -comparison;
      }

      const diff = Number(aVal) - Number(bVal);
      return sortState.direction === 'asc' ? diff : -diff;
    });
    return data;
  }, [rows, sortState]);

  const getBounds = useCallback(() => {
    const viewport = typeof window !== 'undefined' ? window.innerHeight : 900;
    const min = minHeight ?? 280;
    const candidateMax = maxHeight ?? Math.round(viewport * 0.85);
    const max = Math.max(min + 80, Math.min(candidateMax, viewport - 56));
    return { min, max };
  }, [minHeight, maxHeight]);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      if (!onHeightChange) return;
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      event.preventDefault();
      const startY = 'touches' in event ? event.touches[0]?.clientY ?? 0 : event.clientY;
      const startHeight = clampedHeight;
      const { min, max } = getBounds();

      const getPoint = (evt: MouseEvent | TouchEvent) =>
        'touches' in evt ? evt.touches[0]?.clientY ?? null : evt.clientY;

      const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
        const point = getPoint(moveEvent);
        if (point == null) return;
        const delta = startY - point;
        const next = Math.min(Math.max(startHeight + delta, min), max);
        onHeightChange(next);
        moveEvent.preventDefault();
      };

      const handleEnd = () => {
        window.removeEventListener('mousemove', handleMove as EventListener);
        window.removeEventListener('touchmove', handleMove as EventListener);
        window.removeEventListener('mouseup', handleEnd as EventListener);
        window.removeEventListener('touchend', handleEnd as EventListener);
        document.body.classList.remove('select-none', 'cursor-row-resize');
      };

      document.body.classList.add('select-none', 'cursor-row-resize');
      window.addEventListener('mousemove', handleMove as EventListener);
      window.addEventListener('touchmove', handleMove as EventListener, { passive: false });
      window.addEventListener('mouseup', handleEnd as EventListener, { once: true });
      window.addEventListener('touchend', handleEnd as EventListener, { once: true });
    },
    [clampedHeight, getBounds, onHeightChange],
  );

  const renderHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
    const active = sortState.key === key;
    const alignClass = align === 'right' ? 'text-right' : 'text-left';
    return (
      <th className={`px-2 py-2 ${alignClass}`}>
        <button
          type="button"
          onClick={() => handleSort(key)}
          className={[
            'inline-flex items-center gap-1 text-[0.65rem] uppercase tracking-[0.2em]',
            active ? 'text-[color:var(--color-primary)]' : 'text-[color:var(--color-text)]/60 hover:text-[color:var(--color-primary)]',
          ].join(' ')}
        >
          <span>{label}</span>
          <span className="text-[0.55rem]" aria-hidden>
            {active ? (sortState.direction === 'asc' ? '^' : 'v') : '-'}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-6 lg:px-10"
      aria-hidden={!open ? 'true' : undefined}
    >
      <div
        className="pointer-events-auto w-full max-w-[1400px] rounded-t-3xl border border-b-0 border-[color:var(--color-border)] bg-white shadow-[0_-24px_55px_rgba(15,23,42,0.18)] transition-transform duration-300 will-change-transform"
        style={{
          height: clampedHeight,
          transform: open ? 'translateY(0)' : `translateY(${clampedHeight + 32}px)`,
        }}
      >
        <div className="relative flex h-full flex-col overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-[color:var(--color-border)]/70 px-5 pt-1.5 pb-2.5 sm:px-6">
            <div
              className="mx-auto mb-1 h-1.5 w-14 rounded-full bg-[color:var(--color-border)]/80"
              onMouseDown={handleResizeStart}
              onTouchStart={handleResizeStart}
              aria-label="Resize reporting panel"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-base font-semibold text-[color:var(--color-text)]">Performance snapshot</span>
              </div>
              <button
                type="button"
                className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-1 text-[0.65rem] font-semibold text-[color:var(--color-text)]/70 transition hover:text-[color:var(--color-primary)]"
                onClick={onRequestClose}
              >
                Collapse
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <SummaryCards totals={totals} marginPct={marginPct} pending={pending || loading} />

            <div className="mt-3 space-y-2">
              <table className="w-full table-auto text-sm">
                <thead>
                  <tr className="text-[color:var(--color-text)] border-b border-[color:var(--color-border)]/80">
                    {renderHeader('Date', 'date')}
                    {renderHeader('Campaign', 'campaign')}
                    {renderHeader('Partner', 'partner')}
                    {renderHeader('Price', 'price', 'right')}
                    {renderHeader('Type', 'type')}
                    {renderHeader('V Sent', 'vSent', 'right')}
                    {renderHeader('Qty', 'qty', 'right')}
                    {renderHeader('Turnover', 'turnover', 'right')}
                    {renderHeader('Margin (%)', 'marginPct', 'right')}
                    {renderHeader('eCPM', 'ecpm', 'right')}
                    {renderHeader('Database', 'database')}
                    <th className="px-2 py-2 text-left" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, index) => {
                    const marginRatio = row.turnover ? row.margin / row.turnover : null;
                    return (
                      <tr
                      key={`${row.id}-${row.date}`}
                      className={[
                        'border-t border-[color:var(--color-border)]/60 transition-colors',
                        index % 2 === 0 ? 'bg-white' : 'bg-[color:var(--color-surface-2)]/30',
                        'hover:bg-[color:var(--color-border)]/45',
                      ].join(' ')}
                    >
                      <td className="px-2 py-1.5 text-xs text-[color:var(--color-text)]/80">
                        {new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-2 py-1.5 text-[color:var(--color-text)]">{row.campaign}</td>
                      <td className="px-2 py-1.5 text-[color:var(--color-text)]/80">{row.partner}</td>
                      <td className="px-2 py-1.5 text-right text-[color:var(--color-text)]">
                        {formatEuro(row.price ?? 0)}
                      </td>
                      <td className="px-2 py-1.5 text-[color:var(--color-text)]/80">{row.type}</td>
                      <td className="px-2 py-1.5 text-right text-[color:var(--color-text)]/80">{formatInt(row.vSent ?? 0)}</td>
                      <td className="px-2 py-1.5 text-right text-[color:var(--color-text)]/80">{formatInt(row.qty ?? 0)}</td>
                      <td className="px-2 py-1.5 text-right text-[color:var(--color-text)]">
                        {formatEuro(row.turnover ?? 0)}
                      </td>
                      <td className="px-2 py-1.5">
                        {marginRatio == null ? (
                          <span className="block text-right text-[color:var(--color-text)]/60">--</span>
                        ) : (
                          <span
                            className={[
                              'inline-flex w-full items-center justify-end gap-1 text-right font-semibold',
                              marginTone(marginRatio),
                            ].join(' ')}
                          >
                            <span className="text-[0.65rem] leading-none">
                              {marginRatio >= 0 ? '▲' : '▼'}
                            </span>
                            <span>{decimal.format(marginRatio * 100)}%</span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[color:var(--color-text)]">
                        {formatEuro(row.ecpm ?? 0)}
                      </td>
                      <td className="px-2 py-1.5 text-[color:var(--color-text)]/80">
                        <span className="flex items-center gap-1.5">
                          {row.database ? <DatabaseFlag name={row.database} className="h-4 w-4" /> : null}
                          <span>{row.database ?? '--'}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right w-[132px]">
                        <button
                          type="button"
                          onClick={() => onUseRow(row)}
                          className="rounded-full border border-[color:var(--color-primary)] px-3.5 py-1 text-xs font-semibold text-[color:var(--color-primary)] transition hover:bg-[color:var(--color-primary)]/10 whitespace-nowrap"
                        >
                          Add to Planning
                        </button>
                      </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={12} className="px-2 py-8 text-center text-sm text-[color:var(--color-text)]/60">
                        {loading ? 'Loading reporting data...' : 'No campaigns match the selected filters.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {hasMore ? (
                <button
                  type="button"
                  className="w-full rounded-full border border-[color:var(--color-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--color-primary)] transition hover:bg-[color:var(--color-primary)]/10"
                  onClick={onLoadMore}
                >
                  Load more results
                </button>
              ) : null}
              <p className="text-center text-xs text-[color:var(--color-text)]/60">
                Showing {rows.length} of {totalRows} filtered entries
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type SummaryCardsProps = {
  totals: Props['totals'];
  marginPct: number;
  pending: boolean;
};

function SummaryCards({ totals, marginPct, pending }: SummaryCardsProps) {
  const cards = [
    { label: 'Turnover', value: formatEuro(totals.turnover || 0) },
    { label: 'Margin (%)', value: `${decimal.format(marginPct || 0)}%` },
    { label: 'eCPM', value: formatEuro(totals.ecpm || 0) },
    { label: 'Qty', value: formatInt(totals.qty || 0) },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:[&>div:not(:first-child)]:border-l md:[&>div:not(:first-child)]:border-[color:var(--color-border)]/50 md:[&>div:not(:first-child)]:pl-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-[color:var(--color-border)]/70 bg-[color:var(--color-surface-2)]/70 px-2.5 py-1.5"
        >
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
            {card.label}
          </p>
          <p className="text-[0.95rem] font-semibold text-[color:var(--color-text)]">{pending ? '--' : card.value}</p>
        </div>
      ))}
    </div>
  );
}
