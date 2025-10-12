'use client';

import { useEffect, useRef, useState, useId } from 'react';

type Side = 'top' | 'right' | 'bottom' | 'left';

export default function Tooltip({
  content,
  side = 'top',
  children,
  className = '',
  /** Delay en ms para mostrar/ocultar (evita flicker) */
  delay = 80,
}: {
  content: React.ReactNode;
  side?: Side;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const tidRef = useRef<number | null>(null);
  const tipId = useId();

  // Cierre al hacer click fuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Limpia timers al desmontar
  useEffect(() => {
    return () => { if (tidRef.current) window.clearTimeout(tidRef.current); };
  }, []);

  const show = () => {
    if (tidRef.current) window.clearTimeout(tidRef.current);
    tidRef.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (tidRef.current) window.clearTimeout(tidRef.current);
    tidRef.current = window.setTimeout(() => setOpen(false), delay);
  };

  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 -translate-y-1'
      : side === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 translate-y-1'
      : side === 'left'
      ? 'right-full top-1/2 -translate-y-1/2 -translate-x-1'
      : 'left-full top-1/2 -translate-y-1/2 translate-x-1';

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      // Hover / focus accesibles
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className={`tooltip-panel absolute ${pos}`}
          // Transición sutil (opcional)
          style={{ transition: 'opacity .12s ease, transform .12s ease' }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
