import { autoFromCampaign, autoFromDatabase, autoInvoiceOffice, calcDerived, DEFAULT_ROUTING_RATE } from '@/lib/campaign-calcs';
import type { CampaignRow } from '@/types/campaign';

export type MaybeDate = string | null | undefined;

export type ResolveRateFn = (date: MaybeDate) => number;

export type BusinessRulesContext = {
  resolveRate: ResolveRateFn;
  fallbackRate?: number;
};

export function applyBusinessRules(
  row: CampaignRow,
  ctx: BusinessRulesContext
): CampaignRow {
  const { resolveRate, fallbackRate = DEFAULT_ROUTING_RATE } = ctx;

  const { advertiser } = autoFromCampaign(row.campaign);
  const dbAuto = autoFromDatabase(row.database);
  const geo = dbAuto.geo || row.geo || '';
  const databaseType = (dbAuto.dbType as CampaignRow['databaseType']) || row.databaseType;
  const invoiceOffice = autoInvoiceOffice(geo, row.partner);
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
