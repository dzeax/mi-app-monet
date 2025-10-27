'use client';

import CampaignTable from '@/components/CampaignTable';

export default function CampaignReportingView() {
  return (
    <div
      data-page="analytics-campaign-reporting"
      className="space-y-4"
    >
      <CampaignTable />
    </div>
  );
}

