'use client';

export default function Card({
  title,
  right,
  className = '',
  children,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card ${title || right ? '' : ''} ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="text-sm font-medium">{title}</div>
          <div className="flex items-center gap-2">{right}</div>
        </header>
      )}
      <div className={title || right ? 'px-4 pb-4' : 'p-4'}>{children}</div>
    </section>
  );
}
