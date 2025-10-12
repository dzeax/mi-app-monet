// hooks/useFilterPredicates.ts
'use client';

import { useMemo } from 'react';
import type { NormalizedCampaignRow } from '@/hooks/useNormalizedCampaignRows';
import { normalizeString } from '@/lib/strings';
import {
  buildIndexes as _noopBuild, // tip aid
  filterByIndexSet,
  intersectSets,
  setForSelection,
  type CampaignIndexes,
} from '@/lib/indexes';

export type Filters = {
  // texto libre (ya puedes pasar aquí el valor "debounced")
  q?: string;

  // multi-selects
  partners?: string[];
  themes?: string[];
  databases?: string[];
  types?: string[];
  geos?: string[];
  dbTypes?: Array<'B2B' | 'B2C' | 'Mixed'>;
  invoiceOffices?: Array<'DAT' | 'CAR' | 'INT'>;

  // rangos temporales
  /** YYYY-MM inclusive */
  monthRange?: [string | null | undefined, string | null | undefined];
  /** YYYY-MM-DD inclusive (tiene prioridad sobre monthRange si ambos existen) */
  dateRange?: [string | null | undefined, string | null | undefined];

  // numéricos
  priceMin?: number | null;
  priceMax?: number | null;
  /** -1 -> negativos, 0 -> ~0, 1 -> positivos */
  marginSign?: -1 | 0 | 1;
};

export type Totals = {
  count: number;
  vSent: number;
  qty: number;
  turnover: number;
  margin: number;
  ecpm: number; // ponderado por vSent
};

export type UseFilterPredicatesResult = {
  filteredRows: NormalizedCampaignRow[];
  totals: Totals;
  /** Predicado de depuración (el usado en la pasada final) */
  predicate: (r: NormalizedCampaignRow) => boolean;
};

/** Util: comprueba ISO date (YYYY-MM-DD) y compara lexicográficamente */
function inIsoDateRange(dateISO: string, from?: string | null, to?: string | null): boolean {
  const d = (dateISO || '').slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** Genera meses YYYY-MM entre límites (inclusive) */
function enumerateMonths(a?: string | null, b?: string | null): string[] {
  const start = (a || '').slice(0, 7);
  const end = (b || '').slice(0, 7);
  if (!start && !end) return [];
  const s = start || end;
  const e = end || start;
  if (!s || !e) return [s || e].filter(Boolean) as string[];

  const [sy, sm] = s.split('-').map(Number);
  const [ey, em] = e.split('-').map(Number);
  let y = sy, m = sm;
  const out: string[] = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Crea un matcher de texto: todas las palabras deben aparecer en nText */
function makeTextMatcher(q?: string): ((row: NormalizedCampaignRow) => boolean) | null {
  const norm = normalizeString(q || '');
  if (!norm) return null;
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return (row: any) => {
    const haystack: string =
      row.nText ||
      normalizeString(
        [
          row.campaign, row.advertiser, row.partner, row.theme,
          row.database, row.type, row.geo, row.invoiceOffice,
        ]
          .filter(Boolean)
          .join(' '),
      );
    for (const tk of tokens) {
      if (!haystack.includes(tk)) return false;
    }
    return true;
  };
}

function signOf(n: number): -1 | 0 | 1 {
  if (Object.is(n, -0)) return 0;
  if (Math.abs(n) < 1e-9) return 0;
  return n > 0 ? 1 : -1;
}

export function useFilterPredicates({
  rows,
  indexes,
  filters,
}: {
  rows: NormalizedCampaignRow[];
  indexes: CampaignIndexes;
  filters: Filters;
}): UseFilterPredicatesResult {
  // Memo de normalizados/estructuras derivadas de filtros
  const {
    q,
    partners, themes, databases, types, geos, dbTypes, invoiceOffices,
    dateRange, monthRange,
    priceMin, priceMax, marginSign,
  } = filters;

  const textMatcher = useMemo(() => makeTextMatcher(q), [q]);

  // 1) Intersección por índices (OR dentro de cada dimensión; AND entre dimensiones)
  const candidateIdxSet = useMemo(() => {
    // Dimensiones categóricas indexadas
    const byPartner = setForSelection(indexes.byPartner, partners);
    const byTheme = setForSelection(indexes.byTheme, themes);
    const byDatabase = setForSelection(indexes.byDatabase, databases);
    const byType = setForSelection(indexes.byType, types);
    const byGeo = setForSelection(indexes.byGeo, geos);
    const byDbType = setForSelection(indexes.byDbType, dbTypes as string[] | undefined);
    const byInv = setForSelection(indexes.byInvoiceOffice, invoiceOffices as string[] | undefined);

    // Rango por meses: union de meses -> otro set OR que intersectaremos
    let byMonth: Set<number> | null = null;
    if (!dateRange && monthRange) {
      const [mFrom, mTo] = monthRange;
      const months = enumerateMonths(mFrom, mTo);
      const monthSets = months.map((m) => indexes.byMonth.get(normalizeString(m))).filter(Boolean) as Set<number>[];
      byMonth = monthSets.length ? (monthSets.length === 1 ? monthSets[0] : (monthSets.reduce((acc, s) => {
        const out = new Set<number>(acc);
        for (const v of s) out.add(v);
        return out;
      }))) : new Set<number>();
    }

    // Si ninguna dimensión está activa, devolvemos null para indicar "sin restricción previa"
    const dims = [byPartner, byTheme, byDatabase, byType, byGeo, byDbType, byInv, byMonth];
    const hasAnyDim = dims.some((s) => s && s.size >= 0); // size>=0 permite el caso 'vacío' (que debe vaciar el resultado)
    if (!hasAnyDim) return null;

    // Si alguna dimensión produjo set vacío -> no hay matches
    for (const s of dims) {
      if (s && s.size === 0) return new Set<number>();
    }

    // Intersección de todas las dimensiones activas
    const inter = intersectSets(dims.filter(Boolean) as Set<number>[]);
    return inter;
  }, [
    indexes,
    partners, themes, databases, types, geos, dbTypes, invoiceOffices,
    monthRange, dateRange,
  ]);

  // 2) Pasada final: aplica texto, rango fecha (ISO), numéricos y acumula totales
  const { filteredRows, totals, predicate } = useMemo(() => {
    const pred = (r: NormalizedCampaignRow): boolean => {
      // 2.a) pre-candidate por índices (si existen)
      // map rows->idx: usamos posición actual del array
      // (candidateIdxSet === null) => no restricción previa
      if (candidateIdxSet && candidateIdxSet.size && !candidateIdxSet.has((r as any).__rowIndex ?? -1)) {
        return false;
      }

      // 2.b) filtros de fecha (si hay dateRange tiene prioridad sobre monthRange)
      if (dateRange && (dateRange[0] || dateRange[1])) {
        if (!inIsoDateRange(r.date, dateRange[0] || undefined, dateRange[1] || undefined)) return false;
      } else if (monthRange && (monthRange[0] || monthRange[1])) {
        const month = (r as any).monthKey || (r.date || '').slice(0, 7);
        const [mFrom, mTo] = monthRange;
        const ms = enumerateMonths(mFrom, mTo);
        const want = new Set(ms.map(normalizeString));
        if (!want.has(normalizeString(month))) return false;
      }

      // 2.c) texto
      if (textMatcher && !textMatcher(r as any)) return false;

      // 2.d) numéricos
      if (priceMin != null && r.price < priceMin) return false;
      if (priceMax != null && r.price > priceMax) return false;
      if (marginSign != null) {
        const s = signOf(r.margin);
        if (s !== marginSign) return false;
      }

      return true;
    };

    const out: NormalizedCampaignRow[] = [];
    let vSent = 0, qty = 0, turnover = 0, margin = 0;

    // recorremos una sola vez
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as any;
      // anotamos index para la comprobación candidateIdxSet (sin mutar el objeto “real”)
      r.__rowIndex = i;
      if (!pred(r)) continue;
      out.push(r);
      vSent += r.vSent || 0;
      qty += r.qty || 0;
      turnover += r.turnover || 0;
      margin += r.margin || 0;
    }

    const ecpm = vSent > 0 ? (turnover / vSent) * 1000 : 0;
    const t: Totals = {
      count: out.length,
      vSent,
      qty,
      turnover: Number(turnover.toFixed(2)),
      margin: Number(margin.toFixed(2)),
      ecpm: Number(ecpm.toFixed(2)),
    };

    return { filteredRows: out as NormalizedCampaignRow[], totals: t, predicate: pred };
  }, [rows, candidateIdxSet, textMatcher, dateRange, monthRange, priceMin, priceMax, marginSign]);

  return { filteredRows, totals, predicate };
}
