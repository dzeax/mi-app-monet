'use client';

import { useEffect, useRef, useState } from 'react';

export default function RowActions({
  onEdit,
  onDuplicate,
  onDelete,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative flex justify-end">
      <button
        type="button"
        className="rounded-md border border-[--color-border] px-2 py-1 text-sm
                   hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Row actions"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(o => !o);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-36 rounded-md border border-[--color-border]
                     bg-[color:var(--color-surface-2)] p-1 shadow-[0_12px_32px_rgba(0,0,0,.12)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left text-sm
                       hover:bg-black/5 focus:bg-primary/5 focus:outline-none focus:ring-1 focus:ring-primary/30"
            onClick={() => { setOpen(false); onEdit(); }}
          >
            Edit
          </button>

          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left text-sm
                       hover:bg-black/5 focus:bg-primary/5 focus:outline-none focus:ring-1 focus:ring-primary/30"
            onClick={() => { setOpen(false); onDuplicate(); }}
          >
            Duplicate…
          </button>

          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left text-sm text-[--color-accent]
                       hover:bg-black/5 focus:bg-primary/5 focus:outline-none focus:ring-1 focus:ring-primary/30"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
