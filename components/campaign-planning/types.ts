import type { ReactNode } from 'react';

export type CampaignStatus =
  | 'Planning'
  | 'Refining'
  | 'Validation'
  | 'Approved'
  | 'Programmed'
  | 'Profit';

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'Planning',
  'Refining',
  'Validation',
  'Approved',
  'Programmed',
  'Profit',
];

export type CampaignType = 'CPL' | 'CPC' | 'CPM' | 'CPA' | 'CPI' | 'CPO';

export const CAMPAIGN_TYPES: CampaignType[] = ['CPL', 'CPC', 'CPM', 'CPA', 'CPI', 'CPO'];

export type PlanningItem = {
  id: string;
  date: string; // ISO (yyyy-MM-dd)
  name: string;
  partner: string;
  database: string;
  geo?: string | null;
  price: number;
  type: CampaignType;
  status: CampaignStatus;
  notes?: string;
  subject?: string | null;
  html?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  unsubscribeUrl?: string | null;
  categoryId?: number | null;
  languageId?: number | null;
  trackingDomain?: string | null;
  previewRecipients: string[];
  dsCampaignId?: string | null;
  dsStatus?: string | null;
  dsLastSyncAt?: string | null;
  dsError?: string | null;
  reportingCampaignId?: string | null;
  programmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanningDraft = {
  date: string;
  name: string;
  partner: string;
  database: string;
  geo?: string | null;
  price: number;
  type: CampaignType;
  status: CampaignStatus;
  notes?: string;
  subject?: string | null;
  html?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  unsubscribeUrl?: string | null;
  categoryId?: number | null;
  languageId?: number | null;
  trackingDomain?: string | null;
  previewRecipients: string[];
  dsCampaignId?: string | null;
  dsStatus?: string | null;
  dsLastSyncAt?: string | null;
  dsError?: string | null;
  reportingCampaignId?: string | null;
};

export type CampaignPlanningContextValue = {
  items: PlanningItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (payload: PlanningDraft) => Promise<void>;
  updateItem: (id: string, patch: Partial<PlanningDraft>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  duplicateItem: (id: string, dateOverride?: string) => Promise<void>;
};

export type CampaignPlanningProviderProps = {
  children: ReactNode;
};
