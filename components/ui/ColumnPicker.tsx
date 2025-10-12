'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useId } from 'react';

type ColumnItem = { id: string; label: string; disabled?: boolean };

export default function ColumnPicker({
  columns,
  visible,
  onChange,
  onClose,
  defaults,
}: {
  columns: ColumnItem[];
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose: () => void;
  /** ids visibles por defecto (para reset) */
  defaults?: string[];
}) {
  const [mounted, setMounted] = useState(false);
  const trapRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => { setMounted(true); }, []);

  // Cerrar con Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus trap simple (Tab/Shift+Tab)
  useEffect(() => {
    const node = trapRef.current;
    if (!node) return;

    const selector = [
      'a[href]','button:not([disabled])','textarea:not([disabled])','input:not([disabled])',
      'select:not([disabled])','[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(selector))
        .filter(el => el.offsetParent !== null);
      if (!focusables.length) return;

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          last.focus(); e.preventDefault();
        }
      } else {
        if (active === last) {
          first.focus(); e.preventDefault();
        }
      }
    };

    node.addEventListener('keydown', onKeyDown);
    const t = setTimeout(() => firstFocusRef.current?.focus(), 0);
    return () => { node.removeEventListener('keydown', onKeyDown); clearTimeout(t); };
  }, []);

  // Bloquear scroll de la página mientras el modal esté abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Acciones
  const toggle = (id: string) => {
    const next = new Set(visible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const selectAll = () => {
    const next = new Set(visible);
    for (const c of columns) next.add(c.id);
    onChange(next);
  };
  const resetDefaults = () => {
    if (!defaults?.length) return;
    onChange(new Set(defaults));
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop alineado con otros modales */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      />

      {/* Panel */}
      <div
        ref={trapRef}
        className="relative card w-full max-w-lg max-h-[85vh] overflow-hidden border border-[--color-border] shadow-xl"
        style={{ background: 'var(--color-surface)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header (chrome unificado) */}
        <div className="sticky top-0 z-10 modal-chrome modal-header px-5 py-3">
          <div className="accent-strip" aria-hidden />
          <div className="flex items-center justify-between">
            <h3 id={titleId} className="text-base font-semibold">Columns</h3>
            <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pb-4 pt-0 overflow-y-auto relative">
          <div className="edge-fade edge-top" aria-hidden />

          {/* Toolbar sticky dentro del scroll */}
          <div className="sticky top-0 z-[1] -mx-5 px-5 py-2 bg-[color:var(--color-surface)]/95 backdrop-blur-sm border-b border-[--color-border]">
            <div className="flex items-center gap-2 text-xs">
              <button ref={firstFocusRef} className="btn-ghost" onClick={selectAll}>
                Select all
              </button>
              {defaults?.length ? (
                <button className="btn-ghost" onClick={resetDefaults}>
                  Reset defaults
                </button>
              ) : null}
            </div>
          </div>

          {/* Lista en subcard con divisores suaves */}
          <div className="subcard p-0 mt-3">
            <ul className="max-h-[52vh] overflow-y-auto">
              {columns.map(col => {
                const checked = visible.has(col.id);
                const disabled = !!col.disabled;
                return (
                  <li key={col.id} className="group">
                    <label
                      className={[
                        'flex items-center gap-3 px-3 py-2.5',
                        disabled
                          ? 'opacity-55 cursor-not-allowed'
                          : 'cursor-pointer hover:bg-[color:var(--color-surface)]',
                        'rounded-md focus-within:outline-none focus-within:ring-2 focus-within:ring-[color:var(--color-primary)]/30',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => { if (!disabled) toggle(col.id); }}
                        className="h-4 w-4 rounded-sm"
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      <span className="text-sm select-none">{col.label}</span>
                    </label>
                    <div className="divider-soft mx-2" />
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="edge-fade edge-bottom" aria-hidden />
        </div>

        {/* Footer (chrome unificado) */}
        <div className="sticky bottom-0 z-10 modal-chrome modal-footer px-5 py-3">
          <div className="flex items-center justify-end">
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
