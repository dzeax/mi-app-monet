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
  const moduleConfig = getCrmModule(client, moduleSlug);

  if (!client || !moduleConfig) {
    notFound();
  }

  if (moduleConfig.type === 'data_quality') {
    return <CrmDataQualityView />;
  }
  if (moduleConfig.type === 'campaign_reporting') {
    return <CrmCampaignReportingView />;
  }

  // Temporary placeholders for modules not yet implemented
  if (moduleConfig.type === 'runbook' || moduleConfig.type === 'insights' || moduleConfig.comingSoon) {
    return <CrmOperationsOverview />;
  }

  return <CrmOperationsOverview />;
}
