import { autoFromCampaign, autoFromDatabase, autoInvoiceOffice, calcDerived, DEFAULT_ROUTING_RATE } from '@/lib/campaign-calcs';
import type { CampaignRow } from '@/types/campaign';
import type { CampaignRef, DatabaseRef, InvoiceOffice } from '@/data/reference';

export type MaybeDate = string | null | undefined;

export type ResolveRateFn = (date: MaybeDate) => number;

type CatalogBridge = {
  campaigns?: CampaignRef[];
  databases?: DatabaseRef[];
  resolveInvoiceOffice?: (geo?: string, partner?: string) => InvoiceOffice;
};

export type BusinessRulesContext = {
  resolveRate: ResolveRateFn;
  fallbackRate?: number;
  catalogs?: CatalogBridge;
};

const normalize = (value?: string) => (value ?? '').trim().toLowerCase();

const pickCampaignFromBridge = (name: string, catalogs?: CatalogBridge) => {
  if (!catalogs?.campaigns?.length) return undefined;
  const needle = normalize(name);
  return catalogs.campaigns.find((c) => normalize(c.name) === needle);
};

const pickDatabaseFromBridge = (name: string, catalogs?: CatalogBridge) => {
  if (!catalogs?.databases?.length) return undefined;
  const needle = normalize(name);
  return catalogs.databases.find((d) => normalize(d.name) === needle);
};

export function applyBusinessRules(
  row: CampaignRow,
  ctx: BusinessRulesContext
): CampaignRow {
  const { resolveRate, fallbackRate = DEFAULT_ROUTING_RATE } = ctx;

  const catalogCampaign = pickCampaignFromBridge(row.campaign, ctx.catalogs);
  const advertiser =
    catalogCampaign?.advertiser ||
    autoFromCampaign(row.campaign).advertiser ||
    row.advertiser ||
    '';

  const catalogDb = pickDatabaseFromBridge(row.database, ctx.catalogs);
  const dbAuto = autoFromDatabase(row.database);
  const geo = catalogDb?.geo || dbAuto.geo || row.geo || '';
  const databaseType =
    (catalogDb?.dbType as CampaignRow['databaseType']) ||
    (dbAuto.dbType as CampaignRow['databaseType']) ||
    row.databaseType;

  const resolveInvoice =
    ctx.catalogs?.resolveInvoiceOffice || autoInvoiceOffice;
  const invoiceOffice = resolveInvoice(geo, row.partner);
  const effectiveRate =
    row.routingRateOverride != null && Number.isFinite(row.routingRateOverride)
      ? Number(row.routingRateOverride)
      : resolveRate(row.date ?? null) ?? fallbackRate;
  const rate = Number.isFinite(effectiveRate) ? Number(effectiveRate) : fallbackRate;
  const derived = calcDerived({ price: row.price, qty: row.qty, vSent: row.vSent }, rate || fallbackRate);

  return {
    ...row,
    advertiser,
    geo,
    databaseType,
    invoiceOffice,
    routingCosts: derived.routingCosts,
    turnover: derived.turnover,
    margin: derived.margin,
    ecpm: derived.ecpm,
  };
}

export function compositeKey(
  row: Pick<CampaignRow, 'date' | 'campaign' | 'partner' | 'database'>
) {
  return [row.date, row.campaign, row.partner, row.database]
    .map((value) => (value ?? '').trim().toLowerCase())
    .join('|');
}
