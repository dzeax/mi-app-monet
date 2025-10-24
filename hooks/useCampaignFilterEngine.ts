// hooks/useCampaignFilterEngine.ts
'use client';

import { useMemo, useState, useTransition, useCallback } from 'react';
import type { RowWithIdx } from '@/types/campaign';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNormalizedCampaignRows, type NormalizedCampaignRow } from '@/hooks/useNormalizedCampaignRows';
import { buildIndexes, type CampaignIndexes } from '@/lib/indexes';
import {
  useFilterPredicates,
  type Filters as RawFilters,
  type UseFilterPredicatesResult,
} from '@/hooks/useFilterPredicates';

export type Filters = RawFilters;

export const defaultFilters: Filters = {
  q: '',
  partners: [],
  themes: [],
  databases: [],
  types: [],
  geos: [],
  dbTypes: [],
  invoiceOffices: [],
  monthRange: undefined,
  dateRange: undefined,
  priceMin: null,
  priceMax: null,
  marginSign: undefined,
};

export type UseCampaignFilterEngineResult = {
  // estado de filtros
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  updateFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;

  // derivadas
  qDebounced: string;
  normalizedRows: NormalizedCampaignRow[];
  indexes: CampaignIndexes;

  // resultado
  filteredRows: NormalizedCampaignRow[];
  totals: UseFilterPredicatesResult['totals'];
  predicate: UseFilterPredicatesResult['predicate'];

  // UX
  pending: boolean; // true mientras recalculamos bajo startTransition
};

export function useCampaignFilterEngine(
  rows: RowWithIdx[],
  opts?: {
    initial?: Partial<Filters>;
    debounceMs?: number;
  }
): UseCampaignFilterEngineResult {
  const debounceMs = opts?.debounceMs ?? 300;

  // 1) estado de filtros
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultFilters,
    ...(opts?.initial || {}),
  }));

  // 2) transición para evitar jank en recomputos pesados
  const [pending, startTransition] = useTransition();

  // 3) debounced search
  const qDebounced = useDebouncedValue(filters.q ?? '', debounceMs);

  // 4) normalización única por fila (strings lower/trim/sin acentos + monthKey, nText…)
  const normalizedRows = useNormalizedCampaignRows(rows);

  // 5) índices por columna (partner/theme/database/type/geo/dbType/invoice/month)
  const indexes = useMemo<CampaignIndexes>(() => buildIndexes(normalizedRows), [normalizedRows]);

  // 6) filtros efectivos (sustituimos q por su versión debounced)
  const effectiveFilters: Filters = useMemo(
    () => ({ ...filters, q: qDebounced }),
    [filters, qDebounced]
  );

  // 7) pasada única con predicados + acumulación de totales
  const { filteredRows, totals, predicate } = useFilterPredicates({
    rows: normalizedRows,
    indexes,
    filters: effectiveFilters,
  });

  // 8) helpers de mutación (agrupan cambios y usan transición)
  const updateFilters = useCallback((patch: Partial<Filters>) => {
    startTransition(() => {
      setFilters(prev => ({ ...prev, ...patch }));
    });
  }, [startTransition]);

  const resetFilters = useCallback(() => {
    startTransition(() => setFilters(defaultFilters));
  }, [startTransition]);

  return {
    filters,
    setFilters,      // por si necesitas un control más fino
    updateFilters,   // recomendado para cambios desde la UI
    resetFilters,

    qDebounced,
    normalizedRows,
    indexes,

    filteredRows,
    totals,
    predicate,

    pending,
  };
}
