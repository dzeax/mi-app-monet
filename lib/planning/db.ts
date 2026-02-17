import type { CampaignStatus, CampaignType, PlanningItem } from '@/components/campaign-planning/types';

export type PlanningDbRow = {
  id: string;
  date: string;
  name: string;
  partner: string;
  database: string;
  geo: string | null;
  price: number;
  type: string;
  status: string;
  notes: string | null;
  subject: string | null;
  html: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  unsubscribe_url: string | null;
  category_id: number | null;
  language_id: number | null;
  tracking_domain: string | null;
  preview_recipients: string | null;
  ds_campaign_id: string | null;
  ds_status: string | null;
  ds_last_sync_at: string | null;
  ds_error: string | null;
  reporting_campaign_id: string | null;
  programmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanningDbInsert = {
  id: string;
  date: string;
  name: string;
  partner: string;
  database: string;
  geo?: string | null;
  price: number;
  type: string;
  status: string;
  notes?: string | null;
  subject?: string | null;
  html?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  unsubscribe_url?: string | null;
  category_id?: number | null;
  language_id?: number | null;
  tracking_domain?: string | null;
  preview_recipients?: string | null;
  ds_campaign_id?: string | null;
  ds_status?: string | null;
  ds_last_sync_at?: string | null;
  ds_error?: string | null;
  reporting_campaign_id?: string | null;
  programmed_at?: string | null;
  created_by?: string | null;
};

export type PlanningDbPatch = Partial<Omit<PlanningDbInsert, 'id'>>;

export function mapPlanningFromDb(row: PlanningDbRow): PlanningItem {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    partner: row.partner,
    database: row.database,
    geo: row.geo,
    price: row.price,
    type: row.type as CampaignType,
    status: row.status as CampaignStatus,
    notes: row.notes ?? '',
    subject: row.subject,
    html: row.html,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    unsubscribeUrl: row.unsubscribe_url,
    categoryId: row.category_id,
    languageId: row.language_id,
    trackingDomain: row.tracking_domain,
    previewRecipients: row.preview_recipients
      ? row.preview_recipients
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
    dsCampaignId: row.ds_campaign_id,
    dsStatus: row.ds_status,
    dsLastSyncAt: row.ds_last_sync_at,
    dsError: row.ds_error,
    reportingCampaignId: row.reporting_campaign_id,
    programmedAt: row.programmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPlanningToInsert(payload: PlanningItem | Omit<PlanningItem, 'id' | 'createdAt' | 'updatedAt'> & { id: string }, userId?: string | null): PlanningDbInsert {
  return {
    id: payload.id,
    date: payload.date,
    name: payload.name,
    partner: payload.partner,
    database: payload.database,
    geo: payload.geo ?? null,
    price: payload.price,
    type: payload.type,
    status: payload.status,
    notes: payload.notes ?? null,
    subject: payload.subject ?? null,
    html: payload.html ?? null,
    from_name: payload.fromName ?? null,
    from_email: payload.fromEmail ?? null,
    reply_to: payload.replyTo ?? null,
    unsubscribe_url: payload.unsubscribeUrl ?? null,
    category_id: payload.categoryId ?? null,
    language_id: payload.languageId ?? null,
    tracking_domain: payload.trackingDomain ?? null,
    preview_recipients: Array.isArray(payload.previewRecipients) ? payload.previewRecipients.join(',') : null,
    ds_campaign_id: payload.dsCampaignId ?? null,
    ds_status: payload.dsStatus ?? null,
    ds_last_sync_at: payload.dsLastSyncAt ?? null,
    ds_error: payload.dsError ?? null,
    reporting_campaign_id: payload.reportingCampaignId ?? null,
    programmed_at: payload.programmedAt ?? null,
    created_by: userId ?? null,
  };
}

export function mapPlanningPatch(patch: PlanningDbPatch): PlanningDbPatch {
  const normalised: PlanningDbPatch = {};
  if (patch.date != null) normalised.date = patch.date;
  if (patch.name != null) normalised.name = patch.name;
  if (patch.partner != null) normalised.partner = patch.partner;
  if (patch.database != null) normalised.database = patch.database;
  if (patch.geo !== undefined) normalised.geo = patch.geo ?? null;
  if (patch.price != null) normalised.price = patch.price;
  if (patch.type != null) normalised.type = patch.type;
  if (patch.status != null) normalised.status = patch.status;
  if (patch.notes !== undefined) normalised.notes = patch.notes ?? null;
  if (patch.subject !== undefined) normalised.subject = patch.subject ?? null;
  if (patch.html !== undefined) normalised.html = patch.html ?? null;
  if (patch.from_name !== undefined) normalised.from_name = patch.from_name ?? null;
  if (patch.from_email !== undefined) normalised.from_email = patch.from_email ?? null;
  if (patch.reply_to !== undefined) normalised.reply_to = patch.reply_to ?? null;
  if (patch.unsubscribe_url !== undefined) normalised.unsubscribe_url = patch.unsubscribe_url ?? null;
  if (patch.category_id !== undefined) normalised.category_id = patch.category_id ?? null;
  if (patch.language_id !== undefined) normalised.language_id = patch.language_id ?? null;
  if (patch.tracking_domain !== undefined) normalised.tracking_domain = patch.tracking_domain ?? null;
  if (patch.preview_recipients !== undefined) normalised.preview_recipients = patch.preview_recipients ?? null;
  if (patch.ds_campaign_id !== undefined) normalised.ds_campaign_id = patch.ds_campaign_id ?? null;
  if (patch.ds_status !== undefined) normalised.ds_status = patch.ds_status ?? null;
  if (patch.ds_last_sync_at !== undefined) normalised.ds_last_sync_at = patch.ds_last_sync_at ?? null;
  if (patch.ds_error !== undefined) normalised.ds_error = patch.ds_error ?? null;
  if (patch.reporting_campaign_id !== undefined) normalised.reporting_campaign_id = patch.reporting_campaign_id ?? null;
  if (patch.programmed_at !== undefined) normalised.programmed_at = patch.programmed_at ?? null;
  return normalised;
}
