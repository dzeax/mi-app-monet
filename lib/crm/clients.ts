export type CrmModuleType =
  | 'data_quality'
  | 'campaign_reporting'
  | 'budget'
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
        slug: 'ticket-reporting',
        type: 'data_quality',
        label: 'Ticket Reporting',
        description: 'CRM tickets synced from JIRA.',
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
        slug: 'budget',
        type: 'budget',
        label: 'Budget',
        description: 'Annual budget planning and tracking.',
        icon: 'chart',
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
