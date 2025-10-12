'use client';

import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';

export default function MiniModal({
  title,
  onClose,
  children,
  footer,
  widthClass = 'max-w-md',
  panelClassName = '',
  headerClassName = '',
  footerClassName = '',
  /** NUEVO: clases extra para el cuerpo */
  bodyClassName = '',
  /** NUEVO: muestra tira de acento en el header */
  accentStrip = false,
  /** NUEVO: añade fades superior/inferior dentro del área scroll */
  edgeFades = false,
  /** fuerza panel/header/footer opacos; true por defecto */
  solid = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  panelClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  bodyClassName?: string;
  accentStrip?: boolean;
  edgeFades?: boolean;
  solid?: boolean;
}) {
  const trapRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const node = trapRef.current;
    if (!node) return;
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
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
        if (active === first || !node.contains(active)) { last.focus(); e.preventDefault(); }
      } else {
        if (active === last) { first.focus(); e.preventDefault(); }
      }
    };
    node.addEventListener('keydown', onKeyDown);
    const t = setTimeout(() => {
      (node.querySelector<HTMLElement>('input,select,button,[tabindex]') || node).focus();
    }, 0);
    return () => { node.removeEventListener('keydown', onKeyDown); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Backdrop translúcido + blur
  const backdropStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  };

  const modal = (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0" style={backdropStyle} />

      <div
        ref={trapRef}
        className={[
          'relative card w-full',
          widthClass,
          'max-h-[90vh] overflow-hidden border border-[--color-border] shadow-xl',
          panelClassName,
        ].join(' ')}
        style={solid ? { background: 'var(--color-surface)' } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={[
            'sticky top-0 z-10 border-b border-[--color-border] px-5 py-3 flex items-center justify-between',
            solid
              ? '!bg-[color:var(--color-surface)] !backdrop-blur-0'
              : 'bg-[color:var(--color-surface)]/95 backdrop-blur-sm',
            headerClassName,
          ].join(' ')}
        >
          {accentStrip ? <div className="accent-strip" aria-hidden /> : null}
          <h3 id={titleId} className="text-base font-semibold">{title}</h3>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body (scroll) */}
        <div className={['px-5 py-4 overflow-y-auto', bodyClassName].join(' ')}>
          {edgeFades && (
            <div
              aria-hidden
              className="pointer-events-none sticky top-0 -mt-4 h-4 bg-gradient-to-b from-[color:var(--color-surface)] to-transparent z-[5]"
            />
          )}

          {children}

          {edgeFades && (
            <div
              aria-hidden
              className="pointer-events-none sticky bottom-0 -mb-4 h-4 bg-gradient-to-t from-[color:var(--color-surface)] to-transparent z-[5]"
            />
          )}
        </div>

        {/* Footer */}
        <div
          className={[
            'sticky bottom-0 z-10 border-t border-[--color-border] px-5 py-3 flex items-center justify-end gap-2',
            solid
              ? '!bg-[color:var(--color-surface)] !backdrop-blur-0'
              : 'bg-[color:var(--color-surface)]/95 backdrop-blur-sm',
            footerClassName,
          ].join(' ')}
        >
          {footer}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
