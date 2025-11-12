'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main
      data-page="analytics-shell"
      className="mx-auto w-full max-w-none px-2 md:px-3 lg:px-4 py-6"
    >
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-5 left-5 z-40 md:hidden rounded-full border border-[--color-border] bg-[color:var(--color-surface)] px-4 py-2 shadow-lg"
        aria-label="Open actions"
        aria-controls="mobile-actions-drawer"
        aria-expanded={mobileOpen}
      >
        Actions
      </button>

      <div
        className={[
          'grid grid-cols-1 gap-4 md:gap-4 xl:gap-5 items-start content-start',
          collapsed
            ? 'md:grid-cols-[64px_1fr]'
            : 'md:grid-cols-[200px_1fr] lg:grid-cols-[220px_1fr]',
        ].join(' ')}
      >
        <aside
          className="self-start md:sticky h-fit w-full"
          style={{ top: 'calc(var(--content-sticky-top) + 1rem)' }}
        >
          <div className="hidden md:block">
            <Sidebar
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed((value) => !value)}
            />
          </div>

          {mobileOpen && (
            <div
              id="mobile-actions-drawer"
              className="fixed inset-0 z-50 md:hidden"
              role="dialog"
              aria-modal="true"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setMobileOpen(false);
              }}
            >
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <div className="absolute left-0 top-0 h-full w-[85%] max-w-[320px] p-3">
                <div className="card h-full p-4 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold">Actions</h2>
                    <button
                      className="btn-ghost"
                      onClick={() => setMobileOpen(false)}
                      aria-label="Close"
                    >
                      Close
                    </button>
                  </div>
                  <Sidebar
                    collapsed={false}
                    onToggleCollapse={() => {}}
                    hideCollapseToggle
                    onActionDone={() => setMobileOpen(false)}
                  />
                </div>
              </div>
            </div>
          )}
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
