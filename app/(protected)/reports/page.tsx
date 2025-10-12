'use client';

import ReportsView from '@/components/reports/ReportsView';

export default function ReportsPage() {
  return (
    <main
      data-page="reports"
      className="mx-auto w-full max-w-none px-3 md:px-4 lg:px-6 py-6"
    >
      <ReportsView />
    </main>
  );
}
