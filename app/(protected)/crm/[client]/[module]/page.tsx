import { notFound } from 'next/navigation';
import CrmDataQualityView from '@/components/crm/CrmDataQualityView';
import CrmCampaignReportingView from '@/components/crm/CrmCampaignReportingView';
import CrmOperationsOverview from '@/components/crm/CrmOperationsOverview';
import { getCrmClient, getCrmModule } from '@/lib/crm/clients';

type Props = {
  params: Promise<{
    client: string;
    module: string;
  }>;
};

export default async function CrmModulePage({ params }: Props) {
  const { client: clientSlug, module: moduleSlug } = await params;
  const client = getCrmClient(clientSlug);
  const module = getCrmModule(client, moduleSlug);

  if (!client || !module) {
    notFound();
  }

  if (module.type === 'data_quality') {
    return <CrmDataQualityView />;
  }
  if (module.type === 'campaign_reporting') {
    return <CrmCampaignReportingView />;
  }

  // Temporary placeholders for modules not yet implemented
  if (module.type === 'runbook' || module.type === 'insights' || module.comingSoon) {
    return <CrmOperationsOverview />;
  }

  return <CrmOperationsOverview />;
}
