// hooks/useNormalizedCampaignRows.ts
'use client';

import { useMemo } from 'react';
import { useCampaignData } from '@/context/CampaignDataContext';
import type { RowWithIdx } from '@/types/campaign';
import { normalizeStr, normalizeForSearch, toMonthKey } from '@/lib/strings';

export type NormalizedCampaignRow = RowWithIdx & {
  norm: {
    date: string;         // "2025-07-01"
    month: string;        // "2025-07"
    campaign: string;
    advertiser: string;
    partner: string;
    theme: string;
    type: string;
    database: string;
    geo: string;
    databaseType: string;
    invoiceOffice: string;
    priceCurrency: string;
    blob: string;         // concatenación para búsqueda rápida
  };
};

/**
 * Devuelve las filas con campos ya normalizados para filtros/búsqueda.
 * Se recalcula SOLO cuando cambian las `rows` del store.
 */
export function useNormalizedCampaignRows(rowsOverride?: RowWithIdx[]): NormalizedCampaignRow[] {
  const { rows } = useCampaignData();
  const source = rowsOverride ?? rows;

  const normalized = useMemo<NormalizedCampaignRow[]>(() => {
    return source.map((r) => {
      const nCampaign      = normalizeStr(r.campaign);
      const nAdvertiser    = normalizeStr(r.advertiser);
      const nPartner       = normalizeStr(r.partner);
      const nTheme         = normalizeStr(r.theme);
      const nType          = normalizeStr(r.type);
      const nDatabase      = normalizeStr(r.database);
      const nGeo           = normalizeStr(r.geo);
      const nDbType        = normalizeStr(r.databaseType);
      const nInvoiceOffice = normalizeStr(r.invoiceOffice);
      const nCurrency      = normalizeStr(r.priceCurrency);

      // Blob para búsqueda libre
      const blob = normalizeForSearch(
        [
          r.campaign,
          r.advertiser,
          r.partner,
          r.theme,
          r.type,
          r.database,
          r.geo,
          r.databaseType,
          r.invoiceOffice,
        ].join(' | ')
      );

      return {
        ...r,
        norm: {
          date: r.date,
          month: toMonthKey(r.date),
          campaign: nCampaign,
          advertiser: nAdvertiser,
          partner: nPartner,
          theme: nTheme,
          type: nType,
          database: nDatabase,
          geo: nGeo,
          databaseType: nDbType,
          invoiceOffice: nInvoiceOffice,
          priceCurrency: nCurrency,
          blob,
        },
      };
    });
  }, [source]);

  return normalized;
}

export default useNormalizedCampaignRows;
