import { notFound, redirect } from 'next/navigation';
import CrmDataQualityView from '@/components/crm/CrmDataQualityView';
import CrmCampaignReportingView from '@/components/crm/CrmCampaignReportingView';
import CrmBudgetView from '@/components/crm/CrmBudgetView';
import CrmBudgetExecutionView from '@/components/crm/CrmBudgetExecutionView';
import CrmDqTicketsAnalyticsView from '@/components/crm/CrmDqTicketsAnalyticsView';
import CrmManualEffortsView from '@/components/crm/CrmManualEffortsView';
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
  if (moduleSlug === 'data-quality') {
    redirect(`/crm/${clientSlug}/ticket-reporting`);
  }
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
  if (moduleConfig.type === 'budget') {
    return <CrmBudgetView />;
  }
  if (moduleConfig.type === 'budget_execution') {
    return <CrmBudgetExecutionView />;
  }
  if (moduleConfig.type === 'dq_tickets') {
    return <CrmDqTicketsAnalyticsView />;
  }
  if (moduleConfig.type === 'manual_efforts') {
    return <CrmManualEffortsView />;
  }
  // Temporary placeholders for modules not yet implemented
  if (moduleConfig.comingSoon) {
    return <CrmOperationsOverview />;
  }

  return <CrmOperationsOverview />;
}
