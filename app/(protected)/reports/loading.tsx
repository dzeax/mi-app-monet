import Image from 'next/image';

export default function ReportsLoading() {
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center px-4"
      style={{
        top: 'var(--header-h)',
        bottom: 'var(--footer-h)',
      }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-3 text-sm text-white/85">
        <Image
          src="/animations/login-spinner.gif"
          alt="Loading reports"
          width={64}
          height={64}
          className="h-16 w-16 drop-shadow-lg"
          priority
        />
        <span>Loading reports…</span>
      </div>
    </div>
  );
}
