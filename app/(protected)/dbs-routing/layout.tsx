'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';

export default function DbsRoutingLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="mx-auto w-full max-w-none px-2 md:px-3 lg:px-4 py-6">
      <div
        className={[
          'grid grid-cols-1 gap-4 md:gap-4 xl:gap-5 items-start content-start',
          collapsed ? 'md:grid-cols-[72px_1fr]' : 'md:grid-cols-[220px_1fr]',
        ].join(' ')}
      >
        <aside
          className="self-start md:sticky h-fit w-full"
          style={{ top: 'calc(var(--content-sticky-top) + 1rem)' }}
        >
          <div className="hidden md:block">
            <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} />
         </div>

          <div className="mt-2 md:hidden">
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => setMobileOpen(true)}
            >
              Open menu
            </button>
          </div>

          {mobileOpen ? (
            <div
              className="fixed inset-0 z-50 md:hidden"
              role="dialog"
              aria-modal="true"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setMobileOpen(false);
              }}
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <div className="absolute left-0 top-0 h-full w-[85%] max-w-[300px] p-4">
                <div className="card h-full overflow-y-auto p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Navigation</h2>
                    <button className="btn-ghost" onClick={() => setMobileOpen(false)}>
                      Close
                    </button>
                  </div>
                  <Sidebar
                    collapsed={false}
                    hideCollapseToggle
                    onToggleCollapse={() => {}}
                    onActionDone={() => setMobileOpen(false)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
