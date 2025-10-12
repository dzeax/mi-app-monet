// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
// Extra input styles were moved into globals; omit secondary CSS import to simplify Tailwind build
import AppProviders from './providers';

export const metadata: Metadata = {
  title: 'Monet Email Dashboard',
  description: 'Campaign reporting',
  icons: {
    icon: '/dvlogo2.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="min-h-dvh font-sans antialiased bg-[color:var(--color-bg)] text-[color:var(--color-text)]"
        // La dejamos en root por compat: los sticky del app pueden leerla
        style={{ ['--content-sticky-top' as any]: '5.5rem' }}
        suppressHydrationWarning
      >
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
