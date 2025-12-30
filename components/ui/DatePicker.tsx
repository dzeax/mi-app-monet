'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parseISO } from 'date-fns';

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatPickerDate = (value?: string | null) => {
  if (!value || !isIsoDate(value)) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, 'dd/MM/yyyy');
};

export interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  ariaDescribedby?: string;
  invalid?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  disabled?: boolean;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  ariaLabel,
  ariaDescribedby,
  invalid = false,
  buttonRef,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = value && isIsoDate(value) ? parseISO(value) : undefined;
  const display = formatPickerDate(value) ?? placeholder;
  const hasValue = Boolean(selectedDate);
  const toIso = (date: Date) => format(date, 'yyyy-MM-dd');

  // Cierre al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative w-full" ref={wrapRef}>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          // Nota: Usamos la clase 'input' para heredar los estilos globales (Solid Depth)
          className={`input w-full min-w-0 text-left text-sm flex items-center ${
            hasValue ? 'text-[color:var(--color-text)]' : 'text-[color:var(--color-text)]/50'
          } ${invalid ? 'input-error' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedby}
          aria-invalid={invalid || undefined}
          aria-expanded={open}
        >
          {display}
        </button>

        {/* Boton Clear (solo si hay valor y no esta deshabilitado) */}
        {hasValue && !disabled ? (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--color-text)]/40 hover:text-[color:var(--color-text)] p-1"
            onClick={(event) => {
              event.stopPropagation();
              onChange('');
            }}
            aria-label={`Clear ${ariaLabel ?? 'date'}`}
            title="Clear"
          >
            x
          </button>
        ) : null}
      </div>

      {/* Popover del Calendario */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-xl ring-1 ring-black/5">
          <div className="rounded-lg border border-[color:var(--color-border)] bg-white/60 p-2">
            <DayPicker
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate || new Date()}
              onSelect={(date) => {
                onChange(date ? toIso(date) : '');
                setOpen(false);
              }}
              showOutsideDays
              classNames={{
                root: 'relative text-sm',
                months: 'flex pt-6',
                month: 'min-w-[224px] space-y-2',
                month_caption: 'flex items-center justify-center gap-2',
                caption_label: 'text-sm font-semibold',
                nav: 'absolute left-2 right-2 top-2 flex items-center justify-between',
                button_previous:
                  'h-7 w-7 flex items-center justify-center rounded-md border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-surface-2)]',
                button_next:
                  'h-7 w-7 flex items-center justify-center rounded-md border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-surface-2)]',
                month_grid: 'w-full border-collapse',
                weekdays: 'flex',
                weekday:
                  'w-8 text-center text-[10px] font-semibold uppercase text-[color:var(--color-text)]/50',
                weeks: 'flex flex-col gap-1',
                week: 'flex w-full',
                day: 'h-8 w-8 p-0 text-center flex items-center justify-center',
                day_button:
                  'h-8 w-8 rounded-md text-xs hover:bg-[color:var(--color-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]/40',
                selected:
                  'bg-[color:var(--color-primary)] text-white hover:bg-[color:var(--color-primary)] font-medium',
                today:
                  'font-semibold text-[color:var(--color-text)] underline decoration-dotted underline-offset-2',
                outside: 'text-[color:var(--color-text)]/30',
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="btn-ghost h-8 px-3 text-xs border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 text-[color:var(--color-text)]/80 hover:text-[color:var(--color-text)]"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-primary h-8 px-3 text-xs"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
