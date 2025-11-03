'use client';

import React from 'react';

type Props = {
  children: React.ReactNode;
  onAdd?: () => void;
  addAriaLabel?: string;
  className?: string;
  buttonDisabled?: boolean;
};

export default function FieldWithAddon({
  children,
  onAdd,
  addAriaLabel = 'Add item',
  className = '',
  buttonDisabled = false,
}: Props) {
  const disabled = buttonDisabled || !onAdd;

  return (
    <div
      className={[
        'field-addon',
        'grid',
        'grid-cols-[minmax(0,1fr)_auto]',
        'items-end',
        'gap-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Los controles hijos heredan el espacio, no necesitan forzar bordes planos */}
      <div className="contents">{children}</div>

      <button
        type="button"
        onClick={disabled ? undefined : onAdd}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        aria-label={addAriaLabel}
        title={addAriaLabel}
        className={[
          'field-addon-button transition-colors',
          'disabled:opacity-50 disabled:pointer-events-none',
        ].join(' ')}
      >
        {/* Plus en SVG para mejor nitidez y hereda el color actual */}
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
        >
          <path
            d="M7 2v10M2 7h10"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
