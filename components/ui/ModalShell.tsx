'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalShellProps {
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  widthClass?: string; // Para controlar el ancho (ej: max-w-4xl)
  hideCloseButton?: boolean;
}

export default function ModalShell({
  title,
  children,
  footer,
  onClose,
  widthClass = 'max-w-4xl',
  hideCloseButton = false,
}: ModalShellProps) {
  const trapRef = useRef<HTMLDivElement>(null);

  // 1. Scroll Lock del Body
  useEffect(() => {
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    const prevPadRight = html.style.paddingRight;
    const scrollbarW = window.innerWidth - html.clientWidth;

    html.style.overflow = 'hidden';
    if (scrollbarW > 0) html.style.paddingRight = `${scrollbarW}px`;

    return () => {
      html.style.overflow = prevOverflow;
      html.style.paddingRight = prevPadRight;
    };
  }, []);

  // 2. Tecla ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 3. Focus Trap simple
  useEffect(() => {
    const node = trapRef.current;
    if (!node) return;
    const focusables = node.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length) focusables[0].focus();
  }, []);

  const modalContent = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-hidden="true"
        onMouseDown={onClose}
      />

      {/* Card Principal */}
      <div
        ref={trapRef}
        className={`relative card w-full ${widthClass} max-h-[90vh] overflow-hidden border border-[--color-border] shadow-xl flex flex-col`}
        style={{ background: 'var(--color-surface)' }}
      >
        {/* Header (Gris Estructural .modal-chrome) */}
        <div className="sticky top-0 z-10 modal-header modal-chrome border-b px-5 py-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-bold truncate">{title}</div>
            {!hideCloseButton && (
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                onClick={onClose}
                aria-label="Close modal"
              >
                <span aria-hidden className="text-xl leading-none">x</span>
              </button>
            )}
          </div>
        </div>

        {/* Body (Scrollable & Tinted) */}
        <div className="flex-1 overflow-y-auto bg-slate-50 px-5 pt-6 pb-6 relative">
          {children}
        </div>

        {/* Footer (Sticky & Gris Estructural) */}
        {footer && (
          <div className="sticky bottom-0 z-10 modal-footer modal-chrome border-t px-5 py-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
