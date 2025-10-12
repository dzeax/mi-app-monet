// hooks/useReportData.ts
'use client';

import { useMemo, useState, useCallback } from 'react';
import { addDays, parseISO, format, differenceInDays } from 'date-fns';
import { useCampaignData } from '@/context/CampaignDataContext';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import type {
  ReportFilters,
  GroupBy,
  Metric,
  AggregateRow,
  TrendPoint,
} from '@/types/reports';

/** Entrada opcional del hook (todas las props son iniciales) */
type UseReportParams = {
  groupBy?: GroupBy;
  metric?: Metric;
  topN?: number;
  filters?: ReportFilters;
};

type TrendMetric = 'ecpm' | 'turnover' | 'margin' | 'marginPct' | 'vSent';

/** Serie para charts de líneas */
type TrendSeries = {
  data: Array<Record<string, number | string>>;
  keys: string[];
};

/** Args del generador de series unificado */
type MakeTrendArgs = {
  metric?: TrendMetric;                            // métrica a graficar
  by?: 'none' | 'database' | 'partner' | 'geo';    // agrupación por línea
  topN?: number;                                   // nº de líneas Top
  includeOthers?: boolean;                         // incluir "Others"
  only?: string[];                                 // foco: restringe a estas claves
  bucket?: 'auto' | 'day' | 'month';               // agrupación temporal
};

/** Resultado del hook */
export type UseReportDataResult = {
  // estado + setters
  filters: ReportFilters;
  setFilters: (next: ReportFilters | ((prev: ReportFilters) => ReportFilters)) => void;

  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;

  metric: Metric;
  setMetric: (m: Metric) => void;

  topN: number;
  setTopN: (n: number) => void;

  // datos derivados
  ranking: AggregateRow[];      // Top-N ya cortado
  fullRanking: AggregateRow[];  // ranking completo (para export/paginación)
  ecpmTrend: TrendPoint[];      // serie temporal eCPM ponderado

  summary: {
    totals: { vSent: number; turnover: number; margin: number; ecpm: number; marginPct: number | null };
    filteredRows: number; // nº filas tras filtro
    groups: number;       // nº grupos tras agregación (antes de cortar TopN)
  };

  // helpers
  quickLast30: () => void;

  // generadores de series
  makeTrendSeries: (opts?: MakeTrendArgs) => TrendSeries;
  makeTurnoverSeries: (opts?: Omit<MakeTrendArgs, 'metric'>) => TrendSeries;

  // utilidades
  listAvailableKeys: (by: 'database' | 'partner' | 'geo') => string[];

  // NUEVO: agregador genérico de totales sobre el dataset filtrado (con predicado opcional)
  computeTotals: (predicate?: (row: any) => boolean) => {
    vSent: number; turnover: number; margin: number; ecpm: number; marginPct: number | null; count: number;
  };
};

const normalizeStr = (s?: string) => (s ?? '').trim();
const lc = (s?: string) => normalizeStr(s).toLowerCase();

/** Predicado de fecha inclusivo (strings ISO yyyy-mm-dd) */
function within(dateISO: string, from?: string, to?: string) {
  if (!from && !to) return true;
  if (from && dateISO < from) return false;
  if (to && dateISO > to) return false;
  return true;
}

export function useReportData(params: UseReportParams = {}): UseReportDataResult {
  const { rows } = useCampaignData();
  const { PARTNERS } = useCatalogOverrides();

  // -------- iniciales seguros
  const initialGroupBy: GroupBy = params.groupBy ?? 'database';
  const initialMetric:  Metric  = params.metric  ?? 'margin';
  const initialTopN             = Math.max(1, Math.min(50, params.topN ?? 10));
  const initialFilters: ReportFilters = params.filters ?? {};

  // -------- estado controlado
  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy);
  const [metric, setMetric]   = useState<Metric>(initialMetric);
  const [topN, setTopN]       = useState<number>(initialTopN);
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);

  // -------- sets normalizados para filtros
  const sets = useMemo(() => {
    const toSetLC = (arr?: string[]) => new Set((arr ?? []).map((s) => lc(s)));
    const toSetUP = (arr?: string[]) => new Set((arr ?? []).map((s) => normalizeStr(s).toUpperCase()));

    const internalPartnerNamesLC = new Set(
      PARTNERS.filter((p) => p.isInternal).map((p) => lc(p.name)),
    );

    return {
      geos: toSetUP(filters.geos),
      partners: toSetLC(filters.partners),
      campaigns: toSetLC(filters.campaigns),
      advertisers: toSetLC(filters.advertisers),
      themes: toSetLC(filters.themes),
      databases: toSetLC(filters.databases),
      types: new Set(filters.types ?? []),               // union ya válida
      dbTypes: new Set(filters.databaseTypes ?? []),     // union ya válida
      onlyInternalPartners: !!filters.onlyInternalPartners,
      internalPartnerNamesLC,
    };
  }, [filters, PARTNERS]);

  // -------- 1) Filtrado fila a fila
  const filtered = useMemo(() => {
    const f = filters;
    const s = sets;

    return rows.filter((r) => {
      // fechas
      if (!within(r.date, f.from, f.to)) return false;

      // GEO
      if (s.geos.size && !s.geos.has((r.geo || '').toUpperCase())) return false;

      // Partner (incluye flag "solo internos")
      const partnerLC = lc(r.partner);
      if (s.onlyInternalPartners && !s.internalPartnerNamesLC.has(partnerLC)) return false;
      if (s.partners.size && !s.partners.has(partnerLC)) return false;

      // Campaign / Advertiser / Theme / Database
      if (s.campaigns.size && !s.campaigns.has(lc(r.campaign))) return false;
      if (s.advertisers.size && !s.advertisers.has(lc(r.advertiser))) return false;
      if (s.themes.size && !s.themes.has(lc(r.theme))) return false;
      if (s.databases.size && !s.databases.has(lc(r.database))) return false;

      // Type / DBType
      if (s.types.size && !s.types.has(r.type)) return false;
      if (s.dbTypes.size && !s.dbTypes.has(r.databaseType)) return false;

      return true;
    });
  }, [rows, filters, sets]);

  // -------- 2) KPIs globales
  const totals = useMemo(() => {
    let vSent = 0, turnover = 0, margin = 0, wEcpm = 0;

    for (const r of filtered) {
      vSent     += r.vSent || 0;
      turnover  += r.turnover || 0;
      margin    += r.margin || 0;
      wEcpm     += (r.ecpm || 0) * (r.vSent || 0);
    }
    const ecpm = vSent > 0 ? wEcpm / vSent : 0;
    const marginPct = turnover > 0 ? margin / turnover : null;

    return { vSent, turnover, margin, ecpm, marginPct };
  }, [filtered]);

  // -------- 3) Agregación por dimensión (groupBy)
  const { fullRanking, groupCount } = useMemo(() => {
    type Acc = {
      key: string;
      label: string;
      vSent: number;
      turnover: number;
      margin: number;
      qty: number;
      _w: number; // peso vSent
      count: number;
    };

    const keyOf = (r: typeof filtered[number]): string => {
      switch (groupBy) {
        case 'database':    return r.database || '(unknown)';
        case 'partner':     return r.partner || '(unknown)';
        case 'campaign':    return r.campaign || '(unknown)';
        case 'advertiser':  return r.advertiser || '(unknown)';
        case 'theme':       return r.theme || '(unknown)';
        case 'geo':         return (r.geo || '(unknown)').toUpperCase();
        case 'type':        return r.type || '(unknown)';
        case 'databaseType':return r.databaseType || '(unknown)';
      }
    };

    const map = new Map<string, Acc>();
    for (const r of filtered) {
      const key = keyOf(r);
      const curr = map.get(key) ?? {
        key, label: key, vSent: 0, turnover: 0, margin: 0, qty: 0, _w: 0, count: 0,
      };
      curr.vSent     += r.vSent || 0;
      curr.turnover  += r.turnover || 0;
      curr.margin    += r.margin || 0;
      curr.qty       += r.qty || 0;
      curr._w        += r.vSent || 0;
      curr.count     += 1;
      map.set(key, curr);
    }

    const arr: AggregateRow[] = Array.from(map.values()).map(a => ({
      key: a.key,
      label: a.label,
      vSent: a.vSent,
      turnover: +a.turnover.toFixed(2),
      margin: +a.margin.toFixed(2),
      ecpm: a._w > 0 ? +((a.turnover / a._w) * 1000).toFixed(2) : 0,
      qty: a.qty,
      count: a.count,
    }));

    // ordenar por métrica y por label como desempate estable
    arr.sort((x, y) => {
      const d = (y as any)[metric] - (x as any)[metric];
      return d !== 0 ? d : x.label.localeCompare(y.label, 'es');
    });

    return { fullRanking: arr, groupCount: arr.length };
  }, [filtered, groupBy, metric]);

  // -------- 4) Top-N
  const ranking = useMemo<AggregateRow[]>(() => fullRanking.slice(0, topN), [fullRanking, topN]);

  // -------- 5) Serie temporal (eCPM ponderado por día) [legacy: eCPM]
  const ecpmTrend = useMemo<TrendPoint[]>(() => {
    const map = new Map<string, { vSent: number; turnover: number }>();
    for (const r of filtered) {
      const key = r.date;
      const curr = map.get(key) ?? { vSent: 0, turnover: 0 };
      curr.vSent    += r.vSent || 0;
      curr.turnover += r.turnover || 0;
      map.set(key, curr);
    }
    return Array.from(map.entries())
      .map(([date, v]) => ({
        date,
        vSent: v.vSent,
        turnover: +v.turnover.toFixed(2),
        ecpm: v.vSent > 0 ? +((v.turnover / v.vSent) * 1000).toFixed(2) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // -------- Lista de claves disponibles para un agrupador (para Focus)
  const listAvailableKeys = useCallback((by: 'database' | 'partner' | 'geo'): string[] => {
    const s = new Set<string>();
    for (const r of filtered) {
      if (by === 'database') s.add((r.database || '(unknown)').trim());
      else if (by === 'partner') s.add((r.partner || '(unknown)').trim());
      else if (by === 'geo') s.add((r.geo || '(unknown)').toUpperCase());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }, [filtered]);

  // -------- Generador de series UNIFICADO
  const makeTrendSeries = useCallback((opts?: MakeTrendArgs): TrendSeries => {
    const metric: TrendMetric = opts?.metric ?? 'turnover';
    const by = opts?.by ?? 'none';
    const includeOthers = opts?.includeOthers ?? true;
    const only = (opts?.only ?? []).map(s => s.trim()).filter(Boolean);
    const top = Math.max(1, Math.min(20, opts?.topN ?? 5));

    // bucket temporal: auto => month si rango > 45 días
    let bucket: 'day' | 'month' = 'day';
    if (opts?.bucket === 'month') bucket = 'month';
    else if (opts?.bucket === 'day') bucket = 'day';
    else {
      // auto
      if (filtered.length > 1) {
        const min = filtered.reduce((m, r) => (r.date < m ? r.date : m), filtered[0].date);
        const max = filtered.reduce((m, r) => (r.date > m ? r.date : m), filtered[0].date);
        const days = differenceInDays(parseISO(max), parseISO(min));
        if (days > 45) bucket = 'month';
      }
    }

    const bucketKey = (d: string) => bucket === 'month'
      ? format(parseISO(d), 'yyyy-MM')
      : d;

    type Sum = { v: number; t: number; m: number };
    const keyOf = (r: typeof filtered[number]) => {
      if (by === 'database') return (r.database || '(unknown)').trim();
      if (by === 'partner')  return (r.partner || '(unknown)').trim();
      if (by === 'geo')      return (r.geo || '(unknown)').toUpperCase();
      return 'total';
    };

    if (by === 'none') {
      // una sola serie "total"
      const map = new Map<string, Sum>();
      for (const r of filtered) {
        const b = bucketKey(r.date);
        const s = map.get(b) ?? { v: 0, t: 0, m: 0 };
        s.v += r.vSent || 0;
        s.t += r.turnover || 0;
        s.m += r.margin || 0;
        map.set(b, s);
      }
      const data = Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, s]) => {
          const row: Record<string, number | string> = { date };
          let val = 0;
          if (metric === 'vSent') val = s.v;
          else if (metric === 'turnover') val = +s.t.toFixed(2);
          else if (metric === 'margin') val = +s.m.toFixed(2);
          else if (metric === 'ecpm') val = s.v > 0 ? +((s.t / s.v) * 1000).toFixed(2) : 0;
          else if (metric === 'marginPct') val = s.t > 0 ? +(s.m / s.t).toFixed(6) : 0; // 0..1
          row['total'] = val;
          return row;
        });
      return { data, keys: ['total'] };
    }

    // Totales por clave (para Top-N si no hay "only")
    const totals = new Map<string, Sum>();
    for (const r of filtered) {
      const k = keyOf(r);
      const s = totals.get(k) ?? { v: 0, t: 0, m: 0 };
      s.v += r.vSent || 0;
      s.t += r.turnover || 0;
      s.m += r.margin || 0;
      totals.set(k, s);
    }

    const useOnly = only.length > 0;
    let keys: string[];
    if (useOnly) {
      const onlySet = new Set(only);
      keys = Array.from(totals.keys()).filter(k => onlySet.has(k));
      if (keys.length === 0) return { data: [], keys: [] };
    } else {
      // rankeamos por turnover acumulado
      const topKeys = Array.from(totals.entries())
        .sort((a, b) => b[1].t - a[1].t)
        .slice(0, top)
        .map(([k]) => k);
      keys = includeOthers ? [...topKeys, 'Others'] : topKeys;
    }
    const topSet = new Set(keys);

    // Agregación por fecha y clave (con Others si aplica)
    const dateMap = new Map<string, Map<string, Sum>>();
    const push = (d: string, k: string, add: Sum) => {
      const inner = dateMap.get(d) ?? new Map<string, Sum>();
      const s = inner.get(k) ?? { v: 0, t: 0, m: 0 };
      s.v += add.v; s.t += add.t; s.m += add.m;
      inner.set(k, s);
      dateMap.set(d, inner);
    };

    for (const r of filtered) {
      const d = bucketKey(r.date);
      const k = keyOf(r);
      const add: Sum = { v: r.vSent || 0, t: r.turnover || 0, m: r.margin || 0 };

      if (useOnly) {
        if (topSet.has(k)) push(d, k, add);
      } else {
        const seriesKey = topSet.has(k) ? k : (includeOthers ? 'Others' : null);
        if (seriesKey) push(d, seriesKey, add);
      }
    }

    const data = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, inner]) => {
        const row: Record<string, number | string> = { date };
        for (const k of keys) {
          const s = inner.get(k) ?? { v: 0, t: 0, m: 0 };
          let val = 0;
          if (metric === 'vSent') val = s.v;
          else if (metric === 'turnover') val = +s.t.toFixed(2);
          else if (metric === 'margin') val = +s.m.toFixed(2);
          else if (metric === 'ecpm') val = s.v > 0 ? +((s.t / s.v) * 1000).toFixed(2) : 0;
          else if (metric === 'marginPct') val = s.t > 0 ? +(s.m / s.t).toFixed(6) : 0; // 0..1
          row[k] = val;
        }
        return row;
      });

    return { data, keys };
  }, [filtered]);

  // Compat: turnover específico
  const makeTurnoverSeries = useCallback(
    (opts?: Omit<MakeTrendArgs, 'metric'>) =>
      makeTrendSeries({ metric: 'turnover', ...opts }),
    [makeTrendSeries]
  );

  // -------- NUEVO: agregador genérico de totales sobre el "filtered" actual
  const computeTotals = useCallback((
    predicate?: (row: typeof filtered[number]) => boolean
  ) => {
    let vSent = 0, turnover = 0, margin = 0, wEcpm = 0, count = 0;
    for (const r of filtered) {
      if (predicate && !predicate(r)) continue;
      vSent    += r.vSent || 0;
      turnover += r.turnover || 0;
      margin   += r.margin || 0;
      wEcpm    += (r.ecpm || 0) * (r.vSent || 0);
      count++;
    }
    const ecpm = vSent > 0 ? wEcpm / vSent : 0;
    const marginPct = turnover > 0 ? margin / turnover : null;
    return { vSent, turnover, margin, ecpm, marginPct, count };
  }, [filtered]);

  // -------- helper: últimos 30 días respecto al máximo disponible
  const quickLast30 = useCallback(() => {
    const max = rows.reduce(
      (m, r) => (r.date > m ? r.date : m),
      rows[0]?.date ?? new Date().toISOString().slice(0, 10),
    );
    const fromDate = format(addDays(parseISO(max), -29), 'yyyy-MM-dd');
    setFilters(prev => ({ ...prev, from: fromDate, to: max }));
  }, [rows, setFilters]);

  // -------- resumen para cabeceras
  const summary = useMemo(() => ({
    totals,
    filteredRows: filtered.length,
    groups: groupCount,
  }), [totals, filtered.length, groupCount]);

  return {
    // estado
    filters, setFilters,
    groupBy, setGroupBy,
    metric, setMetric,
    topN, setTopN,

    // datos
    ranking,
    fullRanking,
    ecpmTrend,
    summary,

    // helpers y series
    quickLast30,
    makeTrendSeries,
    makeTurnoverSeries,
    listAvailableKeys,

    // utilidades nuevas
    computeTotals,
  };
}
