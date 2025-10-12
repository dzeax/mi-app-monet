import type { DBType, InvoiceOffice } from '@/data/reference';

export type CampaignRow = {
  id: string;
  date: string;             // ISO: "2025-07-01"
  campaign: string;
  advertiser: string;
  invoiceOffice: InvoiceOffice; // 'DAT' | 'CAR' | 'INT'
  partner: string;
  theme: string;
  price: number;
  priceCurrency: 'EUR';
  type: 'CPL' | 'CPM' | 'CPC' | 'CPA';
  vSent: number;
  routingCosts: number;
  routingRateOverride?: number | null;
  qty: number;
  turnover: number;
  margin: number;
  ecpm: number;
  database: string;
  geo: string;              // "ES", "FR", "UK", ...
  databaseType: DBType;     // 'B2B' | 'B2C' | 'Mixed'
};

// Entrada del formulario (sin id; el provider lo genera)
export type NewCampaignInput = Omit<CampaignRow, 'id'>;

// Tipo interno del store para orden estable
export type RowWithIdx = CampaignRow & { _idx: number };
