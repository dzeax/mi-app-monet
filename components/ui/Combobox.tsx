'use client';
import { useEffect, useMemo, useRef, useState, useId } from 'react';
import type { JSX } from 'react';

type Option = { id?: string; value: string; label?: string };

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Start typing to search…',
  ariaLabel,
  id,
  invalid = false,
  ariaDescribedby,
  className,
}: {
  options: Option[];
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  invalid?: boolean;
  ariaDescribedby?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? `cb_${autoId}`;
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || '');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [suppressNextOpen, setSuppressNextOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sincroniza valor externo
  useEffect(() => {
    setQ(value || '');
  }, [value]);

  // Cierre al hacer click fuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Filtrado + dedupe + truncado a 50
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? options.filter(o => (o.label || o.value).toLowerCase().includes(s)) : options;
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const o of base) {
      const k = (o.label || o.value).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(o);
      if (out.length >= 50) break;
    }
    return out;
  }, [q, options]);

  // Determina índice "seleccionado" dentro del array filtrado (si coincide el valor exacto)
  const selectedIndex = useMemo(() => {
    const val = (q || '').toLowerCase();
    return filtered.findIndex(o => (o.value || '').toLowerCase() === val);
  }, [filtered, q]);

  // Al abrir, sitúa el foco en el elemento seleccionado o el primero si hay query
  useEffect(() => {
    if (!open) return;
    if (selectedIndex >= 0) {
      setActiveIndex(selectedIndex);
    } else if (q && filtered.length) {
      setActiveIndex(0);
    } else {
      setActiveIndex(-1);
    }
  }, [open, selectedIndex, q, filtered.length]);

  // Asegura que el elemento activo quede visible en el scroll
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = document.getElementById(`${listboxId}-opt-${activeIndex}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, listboxId]);

  // Roving focus dentro del listbox
  const focusItem = (index: number) => {
    const btns = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    if (!btns || !btns.length) return;
    const i = Math.max(0, Math.min(index, btns.length - 1));
    setActiveIndex(i);
    btns[i].focus();
  };

  // Resalta todas las coincidencias
  const renderHighlighted = (text: string, query: string) => {
    if (!query) return text;
    const ql = query.trim().toLowerCase();
    if (!ql) return text;
    const parts: Array<string | JSX.Element> = [];
    let start = 0;
    const lower = text.toLowerCase();
    while (true) {
      const i = lower.indexOf(ql, start);
      if (i === -1) {
        parts.push(text.slice(start));
        break;
      }
      if (i > start) parts.push(text.slice(start, i));
      const mid = text.slice(i, i + ql.length);
      parts.push(
        <mark
          key={`${i}-${mid}`}
          className="px-0.5 rounded bg-[color:var(--color-primary)]/18 text-[color:var(--color-text)]"
        >
          {mid}
        </mark>
      );
      start = i + ql.length;
    }
    return <>{parts}</>;
  };

  const selectValue = (val: string) => {
    onChange(val);
    setQ(val);
    setOpen(false);
    setActiveIndex(-1);
    setSuppressNextOpen(true);
  };

  return (
    <div ref={wrapRef} className={`relative w-full min-w-0 ${className ?? ''}`}>
      {/* Input + acciones inline */}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedby}
          aria-autocomplete="list"
          className={`input h-10 w-full pr-18 ${invalid ? 'input-error' : ''}`}
          placeholder={placeholder}
          value={q}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          inputMode="search" data-gramm="false" data-lt-active="false"
          onFocus={() => {
            if (suppressNextOpen) { setSuppressNextOpen(false); return; }
            setOpen(true);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            setOpen(true);
            setActiveIndex(v ? 0 : -1);
            onChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) setOpen(true);
              focusItem(activeIndex >= 0 ? activeIndex + 1 : 0);
            }
            if (e.key === 'ArrowUp') {
              if (!open) return;
              e.preventDefault();
              if (activeIndex <= 0) {
                setActiveIndex(-1);
                inputRef.current?.focus();
              } else {
                focusItem(activeIndex - 1);
              }
            }
            if (e.key === 'PageDown') {
              if (!open) return;
              e.preventDefault();
              focusItem(activeIndex + 10);
            }
            if (e.key === 'PageUp') {
              if (!open) return;
              e.preventDefault();
              focusItem(activeIndex - 10);
            }
            if (e.key === 'Home') { if (open) { e.preventDefault(); focusItem(0); } }
            if (e.key === 'End')  { if (open) { e.preventDefault(); focusItem(filtered.length - 1); } }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (open && activeIndex >= 0 && filtered[activeIndex]) {
                selectValue(filtered[activeIndex].value);
              } else if (selectedIndex >= 0) {
                // Si el texto coincide exactamente con una opción, selecciónala
                selectValue(filtered[selectedIndex].value);
              } else {
                setOpen(false);
              }
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              if (q) {
                // Escape limpia primero; segundo Escape cierra
                setQ('');
                onChange('');
                setActiveIndex(-1);
              } else {
                setOpen(false);
                setActiveIndex(-1);
              }
            }
          }}
        />

        {/* Botones: clear + toggle */}
        {q ? (
          <button
            type="button"
            aria-label="Clear"
            title="Clear"
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-sm border border-[--color-border] bg-[color:var(--color-surface-2)] hover:bg-[color:var(--color-surface)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQ('');
              onChange('');
              setActiveIndex(-1);
              inputRef.current?.focus();
              setOpen(true);
            }}
          >
            ×
          </button>
        ) : null}

        <button
          type="button"
          aria-label={open ? 'Close options' : 'Open options'}
          title={open ? 'Close' : 'Open'}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 border border-[--color-border] bg-[color:var(--color-surface-2)] hover:bg-[color:var(--color-surface)]"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) {
              inputRef.current?.focus();
              setActiveIndex(selectedIndex >= 0 ? selectedIndex : (q ? 0 : -1));
            }
          }}
        >
          ▾
        </button>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 left-0 right-0 overflow-auto rounded-lg border border-[--color-border] bg-[color:var(--color-surface-2)] p-1 shadow-xl"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm opacity-70">No results</li>
          )}
          {filtered.map((o, idx) => {
            const isSelected = (q || '').toLowerCase() === (o.value || '').toLowerCase();
            const isActive = idx === activeIndex;
            const optId = `${listboxId}-opt-${idx}`;
            return (
              <li key={o.id ?? o.value}>
                <button
                  id={optId}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    'w-full rounded px-3 py-2 text-left text-sm flex items-center justify-between',
                    isActive
                      ? 'bg-[color:var(--color-surface)]/80 outline-none'
                      : 'hover:bg-[color:var(--color-surface)]/55 focus:bg-[color:var(--color-surface)]/70',
                  ].join(' ')}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    // Evita perder el foco del input antes de seleccionar
                    e.preventDefault();
                  }}
                  onClick={() => selectValue(o.value)}
                  onKeyDown={(e) => {
                    const btns = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
                    const count = btns?.length ?? 0;
                    if (!count) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      focusItem(Math.min(idx + 1, count - 1));
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (idx <= 0) {
                        inputRef.current?.focus();
                        setActiveIndex(-1);
                      } else {
                        focusItem(idx - 1);
                      }
                    }
                    if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
                    if (e.key === 'End') { e.preventDefault(); focusItem(count - 1); }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      selectValue(o.value);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setOpen(false);
                      setActiveIndex(-1);
                      inputRef.current?.focus();
                    }
                  }}
                >
                  <span className="truncate">{renderHighlighted(o.label || o.value, q)}</span>
                  {isSelected ? (
                    <span aria-hidden className="ml-3 text-[--color-primary]">✓</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
