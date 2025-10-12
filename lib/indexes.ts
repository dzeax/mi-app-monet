// lib/indexes.ts
import type { NormalizedCampaignRow } from '@/hooks/useNormalizedCampaignRows';
import { normalizeString } from '@/lib/strings';

export type ColumnIndex = Map<string, Set<number>>;

export type CampaignIndexes = {
  byPartner: ColumnIndex;
  byTheme: ColumnIndex;
  byDatabase: ColumnIndex;
  byType: ColumnIndex;
  byGeo: ColumnIndex;
  byDbType: ColumnIndex;
  byInvoiceOffice: ColumnIndex;
  byMonth: ColumnIndex; // YYYY-MM
};

/** Util: añade un índice a un mapa Set<number> */
function addToIndex(map: ColumnIndex, key: string | undefined, idx: number) {
  if (!key) return;
  const k = normalizeString(key);
  if (!k) return;
  let set = map.get(k);
  if (!set) {
    set = new Set<number>();
    map.set(k, set);
  }
  set.add(idx);
}

/** Deriva YYYY-MM con fallback robusto */
function toMonthKey(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const s = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const t = new Date(s);
  if (Number.isFinite(t.getTime())) return t.toISOString().slice(0, 7);
  return undefined;
}

/** Construye todos los índices por columna */
export function buildIndexes(rows: NormalizedCampaignRow[]): CampaignIndexes {
  const byPartner: ColumnIndex = new Map();
  const byTheme: ColumnIndex = new Map();
  const byDatabase: ColumnIndex = new Map();
  const byType: ColumnIndex = new Map();
  const byGeo: ColumnIndex = new Map();
  const byDbType: ColumnIndex = new Map();
  const byInvoiceOffice: ColumnIndex = new Map();
  const byMonth: ColumnIndex = new Map();

  rows.forEach((row, i) => {
    // leemos normalizados si existen, si no normalizamos on the fly
    const partner = (row as any).nPartner ?? row.partner;
    const theme = (row as any).nTheme ?? row.theme;
    const database = (row as any).nDatabase ?? row.database;
    const type = (row as any).nType ?? row.type;
    const geo = (row as any).nGeo ?? row.geo;
    const dbType = (row as any).nDbType ?? row.databaseType;
    const invoiceOffice = (row as any).nInvoiceOffice ?? row.invoiceOffice;
    const month = (row as any).monthKey ?? toMonthKey(row.date);

    addToIndex(byPartner, partner, i);
    addToIndex(byTheme, theme, i);
    addToIndex(byDatabase, database, i);
    addToIndex(byType, type, i);
    addToIndex(byGeo, geo, i);
    addToIndex(byDbType, dbType, i);
    addToIndex(byInvoiceOffice, invoiceOffice, i);
    addToIndex(byMonth, month, i);
  });

  return {
    byPartner,
    byTheme,
    byDatabase,
    byType,
    byGeo,
    byDbType,
    byInvoiceOffice,
    byMonth,
  };
}

/* =========================
   Set operations helpers
   ========================= */

/** Intersección de varios sets (optimizada por tamaño) */
export function intersectSets(sets: Array<Set<number> | undefined | null>): Set<number> {
  const filtered = sets.filter((s): s is Set<number> => !!s && s.size > 0);
  if (filtered.length === 0) return new Set<number>(); // sin restricción -> vacío (útil para early-bail callers)
  // ordena por tamaño asc para menos iteraciones
  filtered.sort((a, b) => a.size - b.size);
  const [first, ...rest] = filtered;
  const out = new Set<number>();
  main: for (const v of first) {
    for (const s of rest) {
      if (!s.has(v)) continue main;
    }
    out.add(v);
  }
  return out;
}

/** Unión de varios sets */
export function unionSets(sets: Array<Set<number> | undefined | null>): Set<number> {
  const out = new Set<number>();
  for (const s of sets) {
    if (!s) continue;
    for (const v of s) out.add(v);
  }
  return out;
}

/** Convierte selección múltiple en un set de índices (OR dentro de la dimensión) */
export function setForSelection(index: ColumnIndex, selected: string[] | undefined | null): Set<number> | null {
  const arr = (selected || []).map(normalizeString).filter(Boolean);
  if (arr.length === 0) return null; // sin restricción
  const sets: Array<Set<number>> = [];
  for (const v of arr) {
    const s = index.get(v);
    if (s && s.size) sets.push(s);
  }
  return sets.length ? unionSets(sets) : new Set<number>(); // selección sin matches -> vacío
}

/** Filtra filas por un set de índices conservando el orden de entrada */
export function filterByIndexSet<T>(rows: T[], idxSet: Set<number>): T[] {
  if (!idxSet.size) return [];
  const out: T[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (idxSet.has(i)) out.push(rows[i]);
  }
  return out;
}
