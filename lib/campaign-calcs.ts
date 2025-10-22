// lib/campaign-calcs.ts
import {
  findCampaignByName,
  findDatabaseByName,
  resolveInvoiceOffice,
} from '@/data/reference';
import type { DBType } from '@/data/reference';

type NumLike = number | null | undefined;

function n2(v: NumLike): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export const DEFAULT_ROUTING_RATE = 0.18;

export function calcDerived(
  input: { price: NumLike; qty: NumLike; vSent: NumLike },
  rate: number = DEFAULT_ROUTING_RATE
): { routingCosts: number; turnover: number; margin: number; ecpm: number; marginPct: number | null } {
  const price = n2(input.price);
  const qty   = Math.trunc(n2(input.qty));
  const vSent = Math.trunc(n2(input.vSent));

  const routingCosts = Number(((vSent / 1000) * rate).toFixed(2));
  const turnover     = Number((qty * price).toFixed(2));
  const margin       = Number((turnover - routingCosts).toFixed(2));
  const ecpm         = Number(((vSent > 0 ? (turnover / vSent) * 1000 : 0)).toFixed(2));
  const marginPct    = turnover > 0 ? Number((margin / turnover).toFixed(4)) : null;

  return { routingCosts, turnover, margin, ecpm, marginPct };
}

export function autoFromCampaign(name?: string): { advertiser: string } {
  const c = findCampaignByName(name);
  return { advertiser: c?.advertiser ?? '' };
}

export function autoFromDatabase(name?: string): { geo: string; dbType: DBType | '' } {
  const db = findDatabaseByName(name);
  return { geo: db?.geo ?? '', dbType: db?.dbType ?? '' };
}

export function autoInvoiceOffice(geo?: string, partner?: string) {
  return resolveInvoiceOffice(geo || undefined, partner || undefined);
}
