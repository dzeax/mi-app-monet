'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { CampaignStatus, PlanningItem } from '@/components/campaign-planning/types';
import { CAMPAIGN_STATUSES } from '@/components/campaign-planning/types';
import DatabaseFlag from '@/components/campaign-planning/DatabaseFlag';

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ViewMode = 'day' | 'week' | 'month';

const DragHandleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" {...props}>
    <path d="M4 4h0M8 4h0M4 10h0M8 10h0M4 16h0M8 16h0" />
  </svg>
);

const EllipsisIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" {...props}>
    <path d="M5 10h.01M10 10h.01M15 10h.01" />
  </svg>
);

type Props = {
  currentDate: Date;
  viewMode: ViewMode;
  items: PlanningItem[];
  onSelectItem: (item: PlanningItem) => void;
  onDuplicate: (item: PlanningItem) => void;
  onDelete: (item: PlanningItem) => void;
  onMove: (id: string, date: string, duplicate: boolean) => void;
  onCreateAtDate: (date: Date) => void;
};

const priceFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const statusThemes: Record<
  CampaignStatus,
  { card: string; accent: string; pill: string; hover: string }
> = {
  Planning: {
    card: 'bg-white border-slate-200/80',
    accent: 'bg-slate-400/70',
    pill: 'bg-slate-100 text-slate-700 border-slate-200/80',
    hover: 'hover:border-slate-300 hover:bg-slate-50',
  },
  Refining: {
    card: 'bg-[#ff00ff]/12 border-[#ff00ff]/60',
    accent: 'bg-[#ff00ff]',
    pill: 'bg-[#ff00ff] text-white border-[#ff00ff]',
    hover: 'hover:border-[#ff00ff] hover:bg-[#ff00ff]/18',
  },
  Validation: {
    card: 'bg-[#9900ff]/12 border-[#9900ff]/60',
    accent: 'bg-[#9900ff]',
    pill: 'bg-[#9900ff] text-white border-[#9900ff]',
    hover: 'hover:border-[#9900ff] hover:bg-[#9900ff]/18',
  },
  Approved: {
    card: 'bg-[#ff9900]/10 border-[#ff9900]/60',
    accent: 'bg-[#ff9900]',
    pill: 'bg-[#ff9900] text-white border-[#ff9900]',
    hover: 'hover:border-[#ff9900] hover:bg-[#ff9900]/15',
  },
  Programmed: {
    card: 'bg-[#69fc86]/25 border-[#69fc86]/70',
    accent: 'bg-[#69fc86]',
    pill: 'bg-[#69fc86] text-emerald-950 border-[#69fc86]',
    hover: 'hover:border-[#69fc86] hover:bg-[#69fc86]/35',
  },
  Profit: {
    card: 'bg-[#6aa84f]/20 border-[#6aa84f]/70',
    accent: 'bg-[#6aa84f]',
    pill: 'bg-[#6aa84f] text-white border-[#6aa84f]',
    hover: 'hover:border-[#6aa84f] hover:bg-[#6aa84f]/28',
  },
};

const resolveStatusTheme = (status: string) =>
  statusThemes[status as CampaignStatus] ?? statusThemes.Planning;

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export default function CampaignPlanningCalendar({
  currentDate,
  viewMode,
  items,
  onSelectItem,
  onDuplicate,
  onDelete,
  onMove,
  onCreateAtDate,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);

  const registerDragStart = (id: string) => setDraggingId(id);
  const resetDragState = () => {
    setDraggingId(null);
    setDragOverDate(null);
  };

  const markDragOverDate = (date: Date) => {
    const iso = format(date, 'yyyy-MM-dd');
    if (dragOverDate !== iso) {
      setDragOverDate(iso);
    }
  };

  const clearDragOverDate = (date?: Date) => {
    if (!date) {
      setDragOverDate(null);
      return;
    }
    const iso = format(date, 'yyyy-MM-dd');
    if (dragOverDate === iso) {
      setDragOverDate(null);
    }
  };

  const completeDrop = (id: string, targetDate: string, duplicate: boolean) => {
    onMove(id, targetDate, duplicate);
    resetDragState();
  };

  if (viewMode === 'day') {
    const dayItems = sortedItems.filter((item) => isSameDay(new Date(item.date), currentDate));
    return (
      <DayView
        items={dayItems}
        onSelectItem={onSelectItem}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onMove={completeDrop}
        date={currentDate}
        dragOverDate={dragOverDate}
        onDragOverDate={markDragOverDate}
        onDragLeaveDate={clearDragOverDate}
        onCreateAtDate={onCreateAtDate}
      />
    );
  }

  if (viewMode === 'week') {
    const weekStart = startOfWeek(currentDate, { locale: es });
    const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
    const weekItems = sortedItems.filter((item) =>
      weekDays.some((day) => isSameDay(new Date(item.date), day))
    );
    return (
      <MonthView
        chunks={[weekDays]}
        items={weekItems}
        onSelectItem={onSelectItem}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onMove={completeDrop}
        currentDate={currentDate}
        draggingId={draggingId}
        dragOverDate={dragOverDate}
        onDragStart={registerDragStart}
        onDragEnd={resetDragState}
        onDragOverDate={markDragOverDate}
        onDragLeaveDate={clearDragOverDate}
        onCreateAtDate={onCreateAtDate}
      />
    );
  }

  const monthStart = startOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { locale: es });
  const calendarEnd = endOfWeek(endOfMonth(currentDate), { locale: es });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weeks = chunk(days, 7);

  return (
    <MonthView
      chunks={weeks}
      items={sortedItems}
      onSelectItem={onSelectItem}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onMove={completeDrop}
      currentDate={currentDate}
      draggingId={draggingId}
      dragOverDate={dragOverDate}
      onDragStart={registerDragStart}
      onDragEnd={resetDragState}
      onDragOverDate={markDragOverDate}
      onDragLeaveDate={clearDragOverDate}
      onCreateAtDate={onCreateAtDate}
    />
  );
}

function MonthView({
  chunks,
  items,
  onSelectItem,
  onDuplicate,
  onDelete,
  onMove,
  currentDate,
  draggingId,
  dragOverDate,
  onDragStart,
  onDragEnd,
  onDragOverDate,
  onDragLeaveDate,
  onCreateAtDate,
}: {
  chunks: Date[][];
  items: PlanningItem[];
  onSelectItem: (item: PlanningItem) => void;
  onDuplicate: (item: PlanningItem) => void;
  onDelete: (item: PlanningItem) => void;
  onMove: (id: string, date: string, duplicate: boolean) => void;
  currentDate: Date;
  draggingId: string | null;
  dragOverDate: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverDate: (date: Date) => void;
  onDragLeaveDate: (date?: Date) => void;
  onCreateAtDate: (date: Date) => void;
}) {
  return (
    <div className="card p-0 border border-[color:var(--color-border)] overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
        {dayLabels.map((label) => (
          <div key={label} className="px-3 py-2 text-center">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 divide-y divide-[color:var(--color-border)]">
        {chunks.map((week, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-7">
            {week.map((date) => {
              const dayItems = items.filter((item) => isSameDay(new Date(item.date), date));
              const isCurrent = isSameDay(date, currentDate);
              const isDisabled = !isSameMonth(date, currentDate);
              const iso = format(date, 'yyyy-MM-dd');
              const isDragTarget = dragOverDate === iso;
              const sortedDayItems = dayItems.slice().sort((a, b) => a.name.localeCompare(b.name));

              return (
                <div
                  key={date.toISOString()}
                  className={[
                    'min-h-[120px] border-b border-r border-[color:var(--color-border)] p-3 transition-colors',
                    isDisabled
                      ? 'bg-[color:var(--color-surface-2)]/35 text-[color:var(--color-text)]/45'
                      : 'bg-[color:var(--color-surface)]',
                    isDragTarget
                      ? 'ring-2 ring-[color:var(--color-primary)]/70 ring-offset-2 ring-offset-[color:var(--color-surface)]'
                      : '',
                  ].join(' ')}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
                    onDragOverDate(date);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData('text/planning-id');
                    if (!id) return;
                    onMove(id, iso, event.altKey);
                  }}
                  onDragLeave={() => onDragLeaveDate(date)}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={[
                        'font-semibold tracking-[0.16em] uppercase',
                        isDisabled ? 'text-[color:var(--color-text)]/40' : 'text-[color:var(--color-text)]',
                      ].join(' ')}
                    >
                      {format(date, 'dd')}
                    </span>
                    {isToday(date) ? (
                      <span className="rounded-full bg-[color:var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-primary)]">
                        Today
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className="rounded-full bg-[color:var(--color-text)]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text)]/70">
                        Focus
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-2">
                    {sortedDayItems.length === 0 ? (
                      <button
                        type="button"
                        className="w-full rounded-lg border border-dashed border-[color:var(--color-border)]/60 px-3 py-6 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55 transition hover:border-[color:var(--color-primary)]/50 hover:text-[color:var(--color-primary)]"
                        onClick={() => onCreateAtDate(date)}
                      >
                        Add campaign
                      </button>
                    ) : (
                      sortedDayItems.map((item) => (
                        <CampaignChip
                          key={item.id}
                          item={item}
                          onClick={() => onSelectItem(item)}
                          onDuplicate={() => onDuplicate(item)}
                          onDelete={() => onDelete(item)}
                          onDragStart={onDragStart}
                          onDragEnd={() => {
                            onDragEnd();
                            onDragLeaveDate(date);
                          }}
                          isDragging={draggingId === item.id}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({
  items,
  date,
  onSelectItem,
  onDuplicate,
  onDelete,
  onMove,
  dragOverDate,
  onDragOverDate,
  onDragLeaveDate,
  onCreateAtDate,
}: {
  items: PlanningItem[];
  date: Date;
  onSelectItem: (item: PlanningItem) => void;
  onDuplicate: (item: PlanningItem) => void;
  onDelete: (item: PlanningItem) => void;
  onMove: (id: string, date: string, duplicate: boolean) => void;
  dragOverDate: string | null;
  onDragOverDate: (date: Date) => void;
  onDragLeaveDate: (date?: Date) => void;
  onCreateAtDate: (date: Date) => void;
}) {
  const iso = format(date, 'yyyy-MM-dd');
  const isDragTarget = dragOverDate === iso;
  const sortedItems = useMemo(() => items.slice().sort((a, b) => a.name.localeCompare(b.name)), [items]);

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="card p-4">
        <h2 className="text-base font-semibold text-[color:var(--color-text)]">Summary</h2>
        <p className="text-sm text-[color:var(--color-text)]/60">
          {format(date, "EEEE, dd 'de' MMMM yyyy", { locale: es })}
        </p>
        <div className="mt-4 text-sm text-[color:var(--color-text)]/75 space-y-1">
          <div>
            <span className="font-semibold">{sortedItems.length}</span> campaigns scheduled
          </div>
          <div>
            Status mix:{' '}
            <span className="font-semibold">
              {CAMPAIGN_STATUSES.map((status) => {
                const count = sortedItems.filter((item) => item.status === status).length;
                if (!count) return null;
                return `${status} (${count}) `;
              }).join(' ')}
            </span>
          </div>
        </div>
      </div>

      <div
        className={[
          'card p-0 overflow-hidden transition-shadow',
          isDragTarget
            ? 'ring-2 ring-[color:var(--color-primary)]/70 ring-offset-2 ring-offset-[color:var(--color-surface)]'
            : '',
        ].join(' ')}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
          onDragOverDate(date);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData('text/planning-id');
          if (!id) return;
          onMove(id, iso, event.altKey);
        }}
        onDragLeave={() => onDragLeaveDate(date)}
      >
        <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/65">
          Campaigns
        </div>
        {sortedItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-6 text-sm text-[color:var(--color-text)]/55">
            <span>Sin campañas programadas para este día.</span>
            <button
              type="button"
              className="btn-primary px-4 py-2 text-xs"
              onClick={() => onCreateAtDate(date)}
            >
              Crear campaña
            </button>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {sortedItems.map((item) => {
              const statusTheme = resolveStatusTheme(item.status);
              return (
                <div
                  key={item.id}
                  className={[
                    'rounded-2xl border p-4 flex flex-col gap-2 cursor-pointer transition-colors shadow-[0_1px_2px_rgba(16,24,40,0.06)]',
                    statusTheme.card,
                    statusTheme.hover,
                  ].join(' ')}
                  onClick={() => onSelectItem(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-[color:var(--color-text)]">{item.name}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDuplicate(item);
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-1 text-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]/80"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(item);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--color-text)]/65 uppercase tracking-[0.16em]">
                    {item.partner} | {item.database} | {item.type}
                  </div>
                  <div className="flex items-center justify-between text-sm text-[color:var(--color-text)]/75">
                    <span>{priceFormatter.format(item.price)}</span>
                    <span
                      className={[
                        'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-semibold border border-transparent',
                        statusTheme.pill,
                      ].join(' ')}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 ml-auto flex items-center gap-2 text-xs text-[color:var(--color-text)]/65 uppercase tracking-[0.14em]">
                    <DatabaseFlag name={item.database} className="h-4 w-4" />
                    {item.database}
                    {item.dsStatus?.toLowerCase() === 'preview_sent' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        Preview sent
                      </span>
                    ) : item.dsStatus ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-border)]/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text)]/70">
                        {item.dsStatus}
                      </span>
                    ) : null}
                  </div>
                  {item.notes ? (
                    <p className="text-xs text-[color:var(--color-text)]/55 leading-relaxed">{item.notes}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignChip({
  item,
  onClick,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  item: PlanningItem;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const statusTheme = resolveStatusTheme(item.status);
  const statusClass = statusTheme.pill;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const handleEdit = (event?: ReactMouseEvent) => {
    if (event) event.stopPropagation();
    closeMenu();
    onClick();
  };
  const handleDuplicate = (event?: ReactMouseEvent) => {
    if (event) event.stopPropagation();
    closeMenu();
    onDuplicate();
  };
  const handleDelete = (event?: ReactMouseEvent) => {
    if (event) event.stopPropagation();
    closeMenu();
    onDelete();
  };

  return (
    <div
      className={[
        'group relative flex cursor-pointer flex-col rounded-2xl border px-3 pb-3 pt-3 text-xs shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]/70',
        statusTheme.card,
        statusTheme.hover,
        isDragging
          ? 'opacity-60 ring-1 ring-[color:var(--color-primary)]/60'
          : 'hover:-translate-y-[1px] hover:border-[color:var(--color-primary)]/30 hover:shadow-[0_8px_24px_rgba(16,24,40,0.12)]',
      ].join(' ')}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/planning-id', item.id);
        event.dataTransfer.effectAllowed = 'copyMove';
        onDragStart(item.id);
      }}
      onDragEnd={(event) => {
        event.dataTransfer.clearData('text/planning-id');
        onDragEnd();
      }}
      onClick={handleEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleEdit();
        } else if (event.key.toLowerCase() === 'd') {
          event.preventDefault();
          handleDuplicate();
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          handleDelete();
        }
      }}
    >
      <span
        className={[
          'pointer-events-none absolute left-2 top-3 bottom-3 w-[3px] rounded-full transition-opacity group-hover:opacity-90',
          statusTheme.accent,
        ].join(' ')}
        aria-hidden="true"
      />
      <div className="flex items-start gap-3">
        <span
          className="flex h-7 w-3 items-center justify-center text-[color:var(--color-text)]/30 transition-colors group-hover:text-[color:var(--color-text)]/60"
          aria-hidden="true"
          title="Drag campaign"
        >
          <DragHandleIcon className="h-4 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div
                className="text-base font-semibold leading-tight text-[color:var(--color-text)]"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
                title={item.name}
              >
                {item.name}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--color-text)]/55">
                {item.partner}
              </div>
            </div>
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                type="button"
                className={[
                  'inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--color-text)]/55 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]/70',
                  menuOpen
                    ? 'bg-[color:var(--color-border)]/50 text-[color:var(--color-text)]'
                    : 'hover:bg-[color:var(--color-border)]/40 hover:text-[color:var(--color-text)]',
                ].join(' ')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={`campaign-actions-${item.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((open) => !open);
                }}
                title="More actions"
              >
                <EllipsisIcon className="h-4 w-4" />
                <span className="sr-only">Open campaign actions</span>
              </button>
              {menuOpen ? (
                <div
                  id={`campaign-actions-${item.id}`}
                  role="menu"
                  className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-1 shadow-lg"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]/60 focus-visible:outline-none focus-visible:bg-[color:var(--color-surface-2)]/80"
                    role="menuitem"
                    onClick={handleEdit}
                  >
                    Edit
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/45">Enter</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]/60 focus-visible:outline-none focus-visible:bg-[color:var(--color-surface-2)]/80"
                    role="menuitem"
                    onClick={handleDuplicate}
                  >
                    Duplicate
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/45">D</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-xs text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]/60 focus-visible:outline-none focus-visible:bg-[color:var(--color-surface-2)]/80"
                    role="menuitem"
                    onClick={handleDelete}
                  >
                    Delete
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-accent)]/70">Del</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-text)]/75">
            <span className="font-semibold text-[color:var(--color-text)]">{priceFormatter.format(item.price)}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/70">
              {item.type}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--color-text)]/60">
            <DatabaseFlag
              name={item.database}
              className="h-4 w-4 shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"
            />
            <span className="truncate text-[color:var(--color-text)]/70">{item.database}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={[
            'inline-flex items-center gap-1 rounded-full border border-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
            statusClass,
          ].join(' ')}
        >
          {item.status}
        </span>
        {item.dsStatus?.toLowerCase() === 'preview_sent' ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Preview sent
          </span>
        ) : item.dsStatus ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text)]/70">
            {item.dsStatus}
          </span>
        ) : null}
      </div>
    </div>
  );
}










