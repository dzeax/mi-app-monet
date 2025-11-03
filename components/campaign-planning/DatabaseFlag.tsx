'use client';

import { flagInfoForDatabase } from '@/utils/flags';

type Props = {
  name: string;
  className?: string;
};

export default function DatabaseFlag({ name, className }: Props) {
  const info = flagInfoForDatabase(name);

  if (info.code) {
    return (
      <span
        className={['inline-flex h-4 w-4 items-center justify-center rounded-full bg-[color:var(--color-border)]/60 text-xs', className]
          .filter(Boolean)
          .join(' ')}
        title={info.text ?? name}
        aria-hidden="true"
      >
        <span className={`fi fis fi-${info.code}`} />
      </span>
    );
  }

  if (info.emoji) {
    return (
      <span
        className={['inline-flex h-4 w-4 items-center justify-center text-sm leading-none', className]
          .filter(Boolean)
          .join(' ')}
        title={info.text ?? name}
        aria-hidden="true"
      >
        {info.emoji}
      </span>
    );
  }

  if (info.text) {
    return (
      <span
        className={['inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-[color:var(--color-border)]/80 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text)]', className]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      >
        {info.text.slice(0, 2)}
      </span>
    );
  }

  return (
    <span
      className={['inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-[color:var(--color-border)]/60 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text)]/60', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      ?
    </span>
  );
}
