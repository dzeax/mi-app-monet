export type CrmModuleType =
  | 'data_quality'
  | 'campaign_reporting'
  | 'runbook'
  | 'insights'
  | 'playbooks'
  | 'kpi_dashboard';

export type CrmModule = {
  slug: string;
  type: CrmModuleType;
  label: string;
  description?: string;
  icon?: 'table' | 'runbook' | 'chart' | 'insight';
  comingSoon?: boolean;
};

export type CrmClient = {
  slug: string;
  name: string;
  label?: string;
  modules: CrmModule[];
};

export const CRM_CLIENTS: CrmClient[] = [
  {
    slug: 'emg',
    name: 'Europcar Mobility Group',
    label: 'EMG',
    modules: [
      {
        slug: 'data-quality',
        type: 'data_quality',
        label: 'Data Quality Reporting',
        description: 'Tickets and quality controls synced from JIRA.',
        icon: 'table',
      },
      {
        slug: 'campaigns',
        type: 'campaign_reporting',
        label: 'Campaign Reporting',
        description: 'Email production tracking per market/segment.',
        icon: 'table',
      },
      {
        slug: 'runbooks',
        type: 'runbook',
        label: 'Runbooks & SLAs',
        description: 'Execution guides and SLA tracking.',
        icon: 'runbook',
        comingSoon: true,
      },
      {
        slug: 'insights',
        type: 'insights',
        label: 'Insights',
        description: 'Signals and alerts across pipelines.',
        icon: 'insight',
        comingSoon: true,
      },
    ],
  },
];

export function getCrmClient(slug?: string | null) {
  if (!slug) return null;
  return CRM_CLIENTS.find((c) => c.slug === slug) ?? null;
}

export function getCrmModule(client: CrmClient | null, moduleSlug?: string | null) {
  if (!client || !moduleSlug) return null;
  return client.modules.find((m) => m.slug === moduleSlug) ?? null;
}
