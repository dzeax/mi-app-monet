import type { CampaignRow } from '@/types/campaign';

export type CampaignDbRow = {
  id: string;
  date: string;
  campaign: string;
  advertiser: string;
  invoice_office: string;
  partner: string;
  theme: string;
  price: number;
  price_currency: string;
  type: string;
  v_sent: number;
  routing_costs: number;
  routing_rate_override: number | null;
  qty: number;
  turnover: number;
  margin: number;
  ecpm: number;
  database: string;
  geo: string;
  database_type: string;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CampaignDbInsert = {
  id: string;
  date: string;
  campaign: string;
  advertiser: string;
  invoice_office: string;
  partner: string;
  theme: string;
  price: number;
  price_currency: string;
  type: CampaignRow['type'];
  v_sent: number;
  routing_costs: number;
  routing_rate_override: number | null;
  qty: number;
  turnover: number;
  margin: number;
  ecpm: number;
  database: string;
  geo: string;
  database_type: CampaignRow['databaseType'];
  created_by?: string | null;
};

export function mapFromDb(row: CampaignDbRow): CampaignRow {
  return {
    id: row.id,
    date: row.date,
    campaign: row.campaign,
    advertiser: row.advertiser,
    invoiceOffice: row.invoice_office as CampaignRow['invoiceOffice'],
    partner: row.partner,
    theme: row.theme,
    price: Number(row.price ?? 0),
    priceCurrency: (row.price_currency || 'EUR') as CampaignRow['priceCurrency'],
    type: row.type as CampaignRow['type'],
    vSent: Number(row.v_sent ?? 0),
    routingCosts: Number(row.routing_costs ?? 0),
    routingRateOverride: row.routing_rate_override ?? null,
    qty: Number(row.qty ?? 0),
    turnover: Number(row.turnover ?? 0),
    margin: Number(row.margin ?? 0),
    ecpm: Number(row.ecpm ?? 0),
    database: row.database,
    geo: row.geo ?? '',
    databaseType: (row.database_type || 'B2C') as CampaignRow['databaseType'],
  };
}

export function mapToDb(row: CampaignRow, createdBy?: string | null): CampaignDbInsert {
  return {
    id: row.id,
    date: row.date,
    campaign: row.campaign,
    advertiser: row.advertiser,
    invoice_office: row.invoiceOffice,
    partner: row.partner,
    theme: row.theme,
    price: row.price,
    price_currency: row.priceCurrency,
    type: row.type,
    v_sent: row.vSent,
    routing_costs: row.routingCosts,
    routing_rate_override: row.routingRateOverride ?? null,
    qty: row.qty,
    turnover: row.turnover,
    margin: row.margin,
    ecpm: row.ecpm,
    database: row.database,
    geo: row.geo,
    database_type: row.databaseType,
    ...(createdBy != null ? { created_by: createdBy } : {}),
  };
}
