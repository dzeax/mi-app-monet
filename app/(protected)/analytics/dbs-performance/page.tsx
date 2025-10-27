'use client';

import DbsPerformanceView from '@/components/dbs-performance/DbsPerformanceView';

export default function DbsPerformancePage() {
  return (
    <div data-page="analytics-dbs-performance" className="space-y-4">
      <DbsPerformanceView />
    </div>
  );
}
