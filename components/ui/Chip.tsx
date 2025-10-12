type Props = {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
};

export default function Chip({ active = false, children, onClick, title }: Props) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full border text-sm transition',
        'focus:outline-none focus:ring-2',
        'focus:ring-[color:var(--color-primary)] focus:ring-opacity-30',
        active
          ? [
              'bg-[color:var(--color-primary)]',
              'hover:bg-[color:color-mix(in oklab,var(--color-primary) 88%, black)]',
              'text-white border-transparent shadow-sm',
            ].join(' ')
          : [
              'bg-[color:var(--color-surface-2)]',
              'hover:bg-[color:var(--color-surface)]',
              'text-[color:var(--color-text)]/80',
              'border-[color:var(--color-border)]',
            ].join(' '),
      ].join(' ')}
    >
      {children}
    </button>
  );
}
