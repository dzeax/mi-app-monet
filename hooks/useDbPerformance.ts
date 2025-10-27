'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from 'date-fns';
import type { DBType } from '@/data/reference';
import { DB_TYPES } from '@/data/reference';
import type { CampaignRow } from '@/types/campaign';
import { useCampaignData } from '@/context/CampaignDataContext';
import { flagInfoForDatabase, flagInfoFromGeo, type FlagInfo } from '@/utils/flags';

export const KPI_KEYS = ['turnover', 'margin', 'routingCosts', 'vSent', 'ecpm', 'marginPct'] as const;
export type KpiKey = typeof KPI_KEYS[number];

export type MetricSnapshot = {
  turnover: number;
  margin: number;
  routingCosts: number;
  vSent: number;
  ecpm: number;
  marginPct: number | null;
  count: number;
};

export type MetricDelta = {
  absolute: number;
  percent: number | null;
};

export type MetricComparison = {
  current: MetricSnapshot;
  previous: MetricSnapshot;
  deltas: Record<KpiKey, MetricDelta>;
};

type TrendResolution = 'day' | 'week' | 'month';

export type TrendPoint = {
  key: string;
  label: string;
  date: string;
  current: MetricSnapshot;
  previous: MetricSnapshot;
};

export type TrendSeries = {
  resolution: TrendResolution;
  points: TrendPoint[];
  forecast?: TrendForecast | null;
};

export type DbPerformanceFilters = {
  from: string;
  to: string;
  countries: string[];
  dbTypes: DBType[];
  granularity: 'auto' | 'day' | 'week' | 'month';
};

export type DateRange = {
  from: string;
  to: string;
  days: number;
};

export type BasePerformance = {
  id: string;
  label: string;
  geo: string;
  dbType: DBType;
  flag: FlagInfo;
  metrics: MetricComparison;
};

export type QuickTrendPoint = {
  key: string;
  label: string;
  value: number;
};

export type BaseDailyTrendPoint = {
  date: string;
  turnover: number;
  margin: number;
  routingCosts: number;
  vSent: number;
};

export type BaseQuarterComparison = {
  key: string;
  label: string;
  turnover: number;
  marginPct: number | null;
};

export type BaseTopMover = {
  label: string;
  campaign: string;
  partner: string;
  current: number;
  previous: number;
  delta: MetricDelta;
};

export type BaseDetailData = {
  id: string;
  label: string;
  geo: string;
  section: string;
  metrics: MetricComparison;
  quickTrend: QuickTrendPoint[];
  yoyDelta: MetricDelta | null;
  dailyTrend: BaseDailyTrendPoint[];
  quarterComparison: BaseQuarterComparison[];
  topMovers: {
    gains: BaseTopMover[];
    drops: BaseTopMover[];
  };
  dataTeamNote: string | null;
};

export type ExportRow = {
  section: string;
  dbType: DBType;
  country: string;
  database: string;
  metrics: MetricComparison;
};

export type DbPerformanceExport = {
  generatedAt: string;
  range: DateRange;
  compareRange: DateRange;
  rows: ExportRow[];
};

export type ResolveBaseDetailArgs = {
  base: BasePerformance;
  sectionLabel: string;
};

export type CountryPerformance = {
  geo: string;
  label: string;
  flag: FlagInfo;
  metrics: MetricComparison;
  bases: BasePerformance[];
  quickTrend: QuickTrendPoint[];
  yoyDelta?: MetricDelta | null;
};

export type SectionPerformance = {
  type: DBType;
  label: string;
  metrics: MetricComparison;
  countries: CountryPerformance[];
  yoyDelta?: MetricDelta | null;
};

export type DbPerformanceSummary = {
  metrics: MetricComparison;
  yoyDelta?: MetricDelta | null;
};

export type ForecastInsight = {
  target: 'month' | 'quarter';
  label: string;
  endDate: string;
  actual: number;
  projected: number;
  remainingDays: number;
  runRate: number;
  bandLow: number;
  bandHigh: number;
};

type DailyPoint = {
  date: string;
  turnover: number;
  margin: number;
  routingCosts: number;
  vSent: number;
};

type TrendForecastPoint = {
  key: string;
  label: string;
  value: number;
  low: number;
  high: number;
};

type TrendForecast = {
  points: TrendForecastPoint[];
  lastActualKey: string | null;
  runRate: number;
};

export type UseDbPerformanceResult = {
  loading: boolean;
  filters: DbPerformanceFilters;
  setFilters: (next: Partial<DbPerformanceFilters> | ((prev: DbPerformanceFilters) => Partial<DbPerformanceFilters>)) => void;
  range: DateRange;
  compareRange: DateRange;
  summary: DbPerformanceSummary;
  sections: SectionPerformance[];
  availableCountries: string[];
  availableDbTypes: DBType[];
  showYoy: boolean;
  trend: TrendSeries;
  forecast: {
    month: ForecastInsight | null;
    quarter: ForecastInsight | null;
  };
  exportData: DbPerformanceExport;
  resolveBaseDetail: (input: ResolveBaseDetailArgs) => BaseDetailData | null;
  refresh: () => Promise<void>;
};

type Accumulator = {
  turnover: number;
  margin: number;
  routingCosts: number;
  vSent: number;
  weightedEcpm: number;
  count: number;
};

type SectionAccumulator = {
  totals: Accumulator;
  countries: Map<string, CountryAccumulator>;
};

type CountryAccumulator = {
  totals: Accumulator;
  bases: Map<string, Accumulator>;
};

const DEFAULT_DB_TYPES: DBType[] = ['B2B', 'B2C'];

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDefaultDbPerformanceFilters(): DbPerformanceFilters {
  const today = new Date();
  const from = addDays(today, -29);
  return {
    from: formatISODate(from),
    to: formatISODate(today),
    countries: [],
    dbTypes: [...DEFAULT_DB_TYPES],
    granularity: 'auto',
  };
}

function normalizeCountries(countries: string[] | undefined): string[] {
  if (!countries?.length) return [];
  const unique = new Set<string>();
  for (const raw of countries) {
    const iso = (raw ?? '').trim().toUpperCase();
    if (iso) unique.add(iso);
  }
  return Array.from(unique);
}

function normalizeDbTypes(types: DBType[] | undefined): DBType[] {
  if (!types?.length) return [...DEFAULT_DB_TYPES];
  const unique = new Set<DBType>();
  for (const t of types) {
    if (DB_TYPES.includes(t)) unique.add(t);
  }
  if (!unique.size) {
    DEFAULT_DB_TYPES.forEach((t) => unique.add(t));
  }
  return Array.from(unique);
}

function resolveBucketResolution(range: DateRange, preference: DbPerformanceFilters['granularity']): TrendResolution {
  if (preference !== 'auto') return preference;
  if (range.days <= 31) return 'day';
  if (range.days <= 120) return 'week';
  return 'month';
}

type BucketSeriesEntry = {
  key: string;
  label: string;
  sortKey: string;
  snapshot: MetricSnapshot;
};

type BucketInfo = {
  key: string;
  label: string;
  sortKey: string;
};

function bucketInfoFromDate(dateISO: string, resolution: TrendResolution): BucketInfo {
  const date = parseISO(dateISO);
  if (Number.isNaN(date.getTime())) {
    return { key: dateISO, label: dateISO, sortKey: dateISO };
  }

  if (resolution === 'day') {
    const iso = format(date, 'yyyy-MM-dd');
    return {
      key: iso,
      label: format(date, 'MMM dd'),
      sortKey: iso,
    };
  }

  if (resolution === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return {
      key: format(start, 'yyyy-MM-dd'),
      label: `Week of ${format(start, 'MMM dd')}`,
      sortKey: format(start, 'yyyy-MM-dd'),
    };
  }

  const start = startOfMonth(date);
  return {
    key: format(start, 'yyyy-MM'),
    label: format(start, 'MMM yyyy'),
    sortKey: format(start, 'yyyy-MM-dd'),
  };
}

function buildBucketSeries(rows: CampaignRow[], resolution: TrendResolution): BucketSeriesEntry[] {
  const map = new Map<string, { acc: Accumulator; label: string; sortKey: string }>();

  for (const row of rows) {
    const info = bucketInfoFromDate(row.date, resolution);
    let bucket = map.get(info.key);
    if (!bucket) {
      bucket = {
        acc: createAccumulator(),
        label: info.label,
        sortKey: info.sortKey,
      };
      map.set(info.key, bucket);
    }
    accumulate(bucket.acc, row);
  }

  return Array.from(map.entries())
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      sortKey: bucket.sortKey,
      snapshot: finalizeAccumulator(bucket.acc),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function groupRowsByGeo(rows: CampaignRow[]): Map<string, CampaignRow[]> {
  const map = new Map<string, CampaignRow[]>();
  for (const row of rows) {
    const geo = (row.geo ?? 'WW').trim().toUpperCase() || 'WW';
    const list = map.get(geo);
    if (list) {
      list.push(row);
    } else {
      map.set(geo, [row]);
    }
  }
  return map;
}

function buildQuickTrendPoints(rows: CampaignRow[], resolution: TrendResolution): QuickTrendPoint[] {
  if (!rows.length) return [];
  const series = buildBucketSeries(rows, resolution);
  const limited = series.slice(-30);
  return limited.map((entry) => ({
    key: entry.key,
    label: entry.label,
    value: entry.snapshot.turnover,
  }));
}

function createBaseKey(geo: string, database: string): string {
  const geoKey = (geo ?? 'WW').trim().toUpperCase() || 'WW';
  const dbKey = (database ?? 'Unknown').trim();
  return `${geoKey}__${dbKey}`;
}

function baseKeyFromRow(row: CampaignRow): string {
  const geo = row.geo ?? 'WW';
  const database = row.database ?? 'Unknown';
  return createBaseKey(geo, database);
}

function groupRowsByBase(rows: CampaignRow[]): Map<string, CampaignRow[]> {
  const map = new Map<string, CampaignRow[]>();
  for (const row of rows) {
    const key = baseKeyFromRow(row);
    const list = map.get(key);
    if (list) {
      list.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  return map;
}

function buildBaseDailyTrend(rows: CampaignRow[]): BaseDailyTrendPoint[] {
  if (!rows.length) return [];
  const map = new Map<string, BaseDailyTrendPoint>();
  rows.forEach((row) => {
    const entry = map.get(row.date);
    if (entry) {
      entry.turnover += row.turnover ?? 0;
      entry.margin += row.margin ?? 0;
      entry.routingCosts += row.routingCosts ?? 0;
      entry.vSent += row.vSent ?? 0;
    } else {
      map.set(row.date, {
        date: row.date,
        turnover: row.turnover ?? 0,
        margin: row.margin ?? 0,
        routingCosts: row.routingCosts ?? 0,
        vSent: row.vSent ?? 0,
      });
    }
  });
  const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  const MAX_POINTS = 60;
  return sorted.length > MAX_POINTS ? sorted.slice(-MAX_POINTS) : sorted;
}

function buildBaseQuarterComparison(rows: CampaignRow[]): BaseQuarterComparison[] {
  if (!rows.length) return [];
  const map = new Map<string, { turnover: number; margin: number }>();
  rows.forEach((row) => {
    const date = parseISO(row.date);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const key = `${date.getFullYear()}-Q${quarter}`;
    const current = map.get(key);
    if (current) {
      current.turnover += row.turnover ?? 0;
      current.margin += row.margin ?? 0;
    } else {
      map.set(key, {
        turnover: row.turnover ?? 0,
        margin: row.margin ?? 0,
      });
    }
  });

  return Array.from(map.entries())
    .map(([key, snapshot]) => {
      const [yearStr, quarterStr] = key.split('-Q');
      const year = Number(yearStr);
      const quarter = Number(quarterStr);
      const marginPct =
        snapshot.turnover > 0 ? snapshot.margin / snapshot.turnover : null;
      return {
        key,
        label: `Q${quarter} ${year}`,
        turnover: snapshot.turnover,
        marginPct,
      };
    })
    .sort((a, b) => (a.key > b.key ? -1 : 1))
    .slice(0, 6)
    .reverse();
}

function buildBaseTopMovers(
  currentRows: CampaignRow[],
  previousRows: CampaignRow[]
): { gains: BaseTopMover[]; drops: BaseTopMover[] } {
  if (!currentRows.length && !previousRows.length) {
    return { gains: [], drops: [] };
  }
  type Snapshot = { current: number; previous: number; partner: string };
  const map = new Map<string, Snapshot>();

  const ensureEntry = (row: CampaignRow) => {
    const key = row.campaign ?? 'Unknown';
    let entry = map.get(key);
    if (!entry) {
      entry = { current: 0, previous: 0, partner: row.partner ?? '' };
      map.set(key, entry);
    }
    return entry;
  };

  currentRows.forEach((row) => {
    const entry = ensureEntry(row);
    entry.current += row.turnover ?? 0;
    if (!entry.partner && row.partner) entry.partner = row.partner;
  });
  previousRows.forEach((row) => {
    const entry = ensureEntry(row);
    entry.previous += row.turnover ?? 0;
    if (!entry.partner && row.partner) entry.partner = row.partner;
  });

  const movers = Array.from(map.entries())
    .map(([campaign, snapshot]) => {
      const delta = computeDelta(snapshot.current, snapshot.previous);
      return {
        label: campaign,
        campaign,
        partner: snapshot.partner ?? '',
        current: snapshot.current,
        previous: snapshot.previous,
        delta,
      } satisfies BaseTopMover;
    })
    .filter((entry) => entry.current !== 0 || entry.previous !== 0)
    .sort((a, b) => Math.abs(b.delta.absolute) - Math.abs(a.delta.absolute));

  const gains = movers.filter((entry) => entry.delta.absolute > 0).slice(0, 3);
  const drops = movers.filter((entry) => entry.delta.absolute < 0).slice(0, 3);

  return { gains, drops };
}

function generateDataTeamNote(base: BasePerformance, delta: MetricDelta): string | null {
  if (delta.absolute === 0) return null;
  const percent = delta.percent ?? 0;
  if (percent <= -0.15) {
    return `Turnover for ${base.label} decreased ${Math.abs(percent * 100).toFixed(
      1
    )}% versus the previous period. Data team suggests revisiting routing mix.`;
  }
  if (percent >= 0.2) {
    return `Turnover for ${base.label} increased ${Math.abs(percent * 100).toFixed(
      1
    )}%. Ensure capacity planning covers the additional volume.`;
  }
  return null;
}

function sanitizeFilters(input: DbPerformanceFilters): DbPerformanceFilters {
  let { from, to } = input;
  if (!from || !to) {
    const defaults = createDefaultDbPerformanceFilters();
    from = from ?? defaults.from;
    to = to ?? defaults.to;
  }
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return {
    from,
    to,
    countries: normalizeCountries(input.countries),
    dbTypes: normalizeDbTypes(input.dbTypes),
    granularity: input.granularity ?? 'auto',
  };
}

function createAccumulator(): Accumulator {
  return {
    turnover: 0,
    margin: 0,
    routingCosts: 0,
    vSent: 0,
    weightedEcpm: 0,
    count: 0,
  };
}

function accumulate(acc: Accumulator, row: CampaignRow) {
  const turnover = row.turnover ?? 0;
  const margin = row.margin ?? 0;
  const routing = row.routingCosts ?? 0;
  const vSent = row.vSent ?? 0;
  const ecpm = row.ecpm ?? 0;

  acc.turnover += turnover;
  acc.margin += margin;
  acc.routingCosts += routing;
  acc.vSent += vSent;
  acc.weightedEcpm += ecpm * vSent;
  acc.count += 1;
}

function finalizeAccumulator(acc?: Accumulator): MetricSnapshot {
  const base = acc ?? createAccumulator();
  const { turnover, margin, routingCosts, vSent, weightedEcpm, count } = base;
  const ecpm = vSent > 0 ? weightedEcpm / vSent : 0;
  const marginPct = turnover > 0 ? margin / turnover : null;
  return {
    turnover,
    margin,
    routingCosts,
    vSent,
    ecpm,
    marginPct,
    count,
  };
}

function computeDelta(currentValue: number | null, previousValue: number | null): MetricDelta {
  const current = currentValue ?? 0;
  const previous = previousValue ?? 0;
  const absolute = current - previous;
  const percent =
    previous !== 0
      ? absolute / Math.abs(previous)
      : previousValue === null && currentValue === null
        ? null
        : null;
  return { absolute, percent };
}

function compareMetrics(current?: Accumulator, previous?: Accumulator): MetricComparison {
  const currentSnapshot = finalizeAccumulator(current);
  const previousSnapshot = finalizeAccumulator(previous);

  const deltas: Record<KpiKey, MetricDelta> = {
    turnover: computeDelta(currentSnapshot.turnover, previousSnapshot.turnover),
    margin: computeDelta(currentSnapshot.margin, previousSnapshot.margin),
    routingCosts: computeDelta(currentSnapshot.routingCosts, previousSnapshot.routingCosts),
    vSent: computeDelta(currentSnapshot.vSent, previousSnapshot.vSent),
    ecpm: computeDelta(currentSnapshot.ecpm, previousSnapshot.ecpm),
    marginPct: computeDelta(
      currentSnapshot.marginPct ?? null,
      previousSnapshot.marginPct ?? null
    ),
  };

  return {
    current: currentSnapshot,
    previous: previousSnapshot,
    deltas,
  };
}

function within(dateISO: string, from: string, to: string): boolean {
  if (dateISO < from) return false;
  if (dateISO > to) return false;
  return true;
}

function computeRange(from: string, to: string): DateRange {
  const start = parseISO(from);
  const end = parseISO(to);
  const diff = Math.max(0, differenceInCalendarDays(end, start));
  return {
    from,
    to,
    days: diff + 1,
  };
}

function computePreviousRange(range: DateRange): DateRange {
  const start = parseISO(range.from);
  const end = parseISO(range.to);
  const length = Math.max(1, range.days);
  const prevTo = addDays(start, -1);
  const prevFrom = addDays(prevTo, -(length - 1));
  return {
    from: formatISODate(prevFrom),
    to: formatISODate(prevTo),
    days: length,
  };
}

function buildStructure(rows: CampaignRow[]): Map<DBType, SectionAccumulator> {
  const sections = new Map<DBType, SectionAccumulator>();

  for (const row of rows) {
    const type = (row.databaseType ?? 'Mixed') as DBType;
    let section = sections.get(type);
    if (!section) {
      section = {
        totals: createAccumulator(),
        countries: new Map<string, CountryAccumulator>(),
      };
      sections.set(type, section);
    }

    accumulate(section.totals, row);

    const geoKey = (row.geo ?? 'WW').trim().toUpperCase() || 'WW';
    let country = section.countries.get(geoKey);
    if (!country) {
      country = {
        totals: createAccumulator(),
        bases: new Map<string, Accumulator>(),
      };
      section.countries.set(geoKey, country);
    }

    accumulate(country.totals, row);

    const dbKey = row.database?.trim() || 'Unknown';
    let base = country.bases.get(dbKey);
    if (!base) {
      base = createAccumulator();
      country.bases.set(dbKey, base);
    }
    accumulate(base, row);
  }

  return sections;
}

const SECTION_ORDER: DBType[] = ['B2B', 'B2C', 'Mixed'];

function buildSections(
  current: Map<DBType, SectionAccumulator>,
  previous: Map<DBType, SectionAccumulator>,
  yoy: Map<DBType, SectionAccumulator>,
  showYoy: boolean,
  resolution: TrendResolution,
  currentGeoRows: Map<string, CampaignRow[]>
): SectionPerformance[] {
  const results: SectionPerformance[] = [];

  for (const sectionType of SECTION_ORDER) {
    const currentSection = current.get(sectionType);
    const previousSection = previous.get(sectionType);
    const yoySection = yoy.get(sectionType);
    if (!currentSection && !previousSection && !yoySection) continue;

    const countriesKeys = new Set<string>([
      ...(currentSection ? currentSection.countries.keys() : []),
      ...(previousSection ? previousSection.countries.keys() : []),
      ...(yoySection ? yoySection.countries.keys() : []),
    ]);

    const countries: CountryPerformance[] = [];

    countriesKeys.forEach((geo) => {
      const currentCountry = currentSection?.countries.get(geo);
      const previousCountry = previousSection?.countries.get(geo);
      const yoyCountry = yoySection?.countries.get(geo);

      const baseKeys = new Set<string>([
        ...(currentCountry ? currentCountry.bases.keys() : []),
        ...(previousCountry ? previousCountry.bases.keys() : []),
        ...(yoyCountry ? yoyCountry.bases.keys() : []),
      ]);

      const bases: BasePerformance[] = [];
      baseKeys.forEach((dbName) => {
        const comparison = compareMetrics(
          currentCountry?.bases.get(dbName),
          previousCountry?.bases.get(dbName)
        );
        bases.push({
          id: dbName,
          label: dbName,
          geo,
          dbType: sectionType,
          flag: flagInfoForDatabase(dbName),
          metrics: comparison,
        });
      });

      bases.sort(
        (a, b) => b.metrics.current.turnover - a.metrics.current.turnover
      );

      const comparison = compareMetrics(
        currentCountry?.totals,
        previousCountry?.totals
      );

      const yoyDelta = showYoy
        ? computeDelta(
            finalizeAccumulator(currentCountry?.totals).turnover,
            finalizeAccumulator(yoyCountry?.totals).turnover
          )
        : null;

      const quickTrend = buildQuickTrendPoints(
        currentGeoRows.get(geo) ?? [],
        resolution
      );

      countries.push({
        geo,
        label: geo,
        flag: flagInfoFromGeo(geo),
        metrics: comparison,
        bases,
        quickTrend,
        yoyDelta,
      });
    });

    countries.sort(
      (a, b) => b.metrics.current.turnover - a.metrics.current.turnover
    );

    const sectionComparison = compareMetrics(
      currentSection?.totals,
      previousSection?.totals
    );

    const sectionYoy = showYoy
      ? computeDelta(
          finalizeAccumulator(currentSection?.totals).turnover,
          finalizeAccumulator(yoySection?.totals).turnover
        )
      : null;

    const label =
      sectionType === 'B2B'
        ? 'B2B Databases'
        : sectionType === 'B2C'
          ? 'B2C Databases'
          : 'Mixed Databases';

    results.push({
      type: sectionType,
      label,
      metrics: sectionComparison,
      countries,
      yoyDelta: sectionYoy,
    });
  }

  return results;
}

function buildDailySeries(rows: CampaignRow[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const row of rows) {
    const key = row.date;
    let entry = map.get(key);
    if (!entry) {
      entry = { date: key, turnover: 0, margin: 0, routingCosts: 0, vSent: 0 };
      map.set(key, entry);
    }
    entry.turnover += row.turnover ?? 0;
    entry.margin += row.margin ?? 0;
    entry.routingCosts += row.routingCosts ?? 0;
    entry.vSent += row.vSent ?? 0;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function computeForecastWindow(
  daily: DailyPoint[],
  windowStartISO: string,
  windowEndISO: string,
  target: 'month' | 'quarter'
): ForecastInsight | null {
  if (!daily.length) return null;
  const filtered = daily.filter((point) => point.date >= windowStartISO && point.date <= windowEndISO);
  if (filtered.length < 3) return null;
  const sorted = filtered.sort((a, b) => a.date.localeCompare(b.date));
  const lastActualISO = sorted[sorted.length - 1].date;
  const lastActualDate = parseISO(lastActualISO);
  const endDate = parseISO(windowEndISO);
  if (lastActualDate >= endDate) return null;
  const remainingDays = differenceInCalendarDays(endDate, lastActualDate);
  if (remainingDays <= 0) return null;

  const window = Math.min(10, sorted.length);
  if (window < 3) return null;
  const recent = sorted.slice(-window);
  const runRate = recent.reduce((sum, point) => sum + point.turnover, 0) / window;
  const actualTotal = sorted.reduce((sum, point) => sum + point.turnover, 0);
  const projected = actualTotal + runRate * remainingDays;

  const variance = recent.reduce((sum, point) => sum + Math.pow(point.turnover - runRate, 2), 0) / window;
  const stdDev = Math.sqrt(Math.max(variance, 0));
  const lowDaily = Math.max(runRate - stdDev, 0);
  const highDaily = runRate + stdDev;
  const bandLow = Math.max(0, actualTotal + lowDaily * remainingDays);
  const bandHigh = actualTotal + highDaily * remainingDays;

  const label =
    target === 'month'
      ? format(endDate, 'MMMM yyyy')
      : `Q${Math.floor(endDate.getMonth() / 3) + 1} ${endDate.getFullYear()}`;

  return {
    target,
    label,
    endDate: formatISODate(endDate),
    actual: actualTotal,
    projected,
    remainingDays,
    runRate,
    bandLow,
    bandHigh,
  };
}

function computeTrendForecast(daily: DailyPoint[], range: DateRange): TrendForecast | null {
  if (!daily.length) return null;
  const sorted = daily.slice().sort((a, b) => a.date.localeCompare(b.date));
  const lastActual = sorted[sorted.length - 1];
  const lastActualDate = parseISO(lastActual.date);
  const rangeEnd = parseISO(range.to);
  if (lastActualDate >= rangeEnd) return null;
  const remainingDays = differenceInCalendarDays(rangeEnd, lastActualDate);
  if (remainingDays <= 0) return null;

  const window = Math.min(10, sorted.length);
  if (window < 3) return null;
  const recent = sorted.slice(-window);
  const runRate = recent.reduce((sum, point) => sum + point.turnover, 0) / window;
  const variance = recent.reduce((sum, point) => sum + Math.pow(point.turnover - runRate, 2), 0) / window;
  const stdDev = Math.sqrt(Math.max(variance, 0));
  const lowDaily = Math.max(runRate - stdDev, 0);
  const highDaily = runRate + stdDev;

  const points: TrendForecastPoint[] = [];
  for (let i = 1; i <= remainingDays; i++) {
    const date = addDays(lastActualDate, i);
    const iso = formatISODate(date);
    points.push({
      key: iso,
      label: format(date, 'MMM dd'),
      value: runRate,
      low: lowDaily,
      high: highDaily,
    });
  }

  if (!points.length) return null;

  return {
    points,
    lastActualKey: lastActual.date,
    runRate,
  };
}

export function useDbPerformance(initial?: Partial<DbPerformanceFilters>): UseDbPerformanceResult {
  const defaults = useMemo(() => createDefaultDbPerformanceFilters(), []);
  const [filters, setFiltersState] = useState<DbPerformanceFilters>(() =>
    sanitizeFilters({
      ...defaults,
      ...(initial ?? {}),
    })
  );

  const setFilters = useCallback<UseDbPerformanceResult['setFilters']>(
    (next) => {
      setFiltersState((prev) => {
        const patch = typeof next === 'function' ? next(prev) : next;
        return sanitizeFilters({
          ...prev,
          ...patch,
        });
      });
    },
    []
  );

  const { rows, loading, refresh } = useCampaignData();

  const range = useMemo(() => computeRange(filters.from, filters.to), [filters.from, filters.to]);
  const compareRange = useMemo(() => computePreviousRange(range), [range]);
  const showYoy = useMemo(() => range.days >= 28, [range.days]);
  const yoyRange = useMemo<DateRange | null>(() => {
    if (!showYoy) return null;
    const start = parseISO(range.from);
    const end = parseISO(range.to);
    const prevFrom = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
    const prevTo = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    return {
      from: formatISODate(prevFrom),
      to: formatISODate(prevTo),
      days: range.days,
    };
  }, [range, showYoy]);
  const resolution = useMemo(
    () => resolveBucketResolution(range, filters.granularity),
    [range, filters.granularity]
  );

  const filterSets = useMemo(() => {
    return {
      countries: new Set(filters.countries),
      dbTypes: new Set(filters.dbTypes),
    };
  }, [filters.countries, filters.dbTypes]);

  const currentRows = useMemo(() => {
    return rows.filter((row) => {
      if (!within(row.date, filters.from, filters.to)) return false;
      if (filterSets.dbTypes.size && !filterSets.dbTypes.has(row.databaseType)) return false;
      if (filterSets.countries.size && !filterSets.countries.has((row.geo ?? '').toUpperCase())) return false;
      return true;
    });
  }, [rows, filters.from, filters.to, filterSets]);

const previousRows = useMemo(() => {
  return rows.filter((row) => {
    if (!within(row.date, compareRange.from, compareRange.to)) return false;
    if (filterSets.dbTypes.size && !filterSets.dbTypes.has(row.databaseType)) return false;
    if (filterSets.countries.size && !filterSets.countries.has((row.geo ?? '').toUpperCase())) return false;
    return true;
  });
}, [rows, compareRange.from, compareRange.to, filterSets]);

const yoyRows = useMemo(() => {
  if (!yoyRange) return [];
  return rows.filter((row) => {
    if (!within(row.date, yoyRange.from, yoyRange.to)) return false;
    if (filterSets.dbTypes.size && !filterSets.dbTypes.has(row.databaseType)) return false;
    if (filterSets.countries.size && !filterSets.countries.has((row.geo ?? '').toUpperCase())) return false;
    return true;
  });
}, [rows, yoyRange?.from, yoyRange?.to, filterSets]);

const currentRowsByBase = useMemo(() => groupRowsByBase(currentRows), [currentRows]);
const previousRowsByBase = useMemo(() => groupRowsByBase(previousRows), [previousRows]);
const yoyRowsByBase = useMemo(() => groupRowsByBase(yoyRows), [yoyRows]);
const allRowsByBase = useMemo(() => groupRowsByBase(rows), [rows]);

const dailySeries = useMemo(() => buildDailySeries(currentRows), [currentRows]);
const monthStartISO = useMemo(() => formatISODate(startOfMonth(parseISO(range.to))), [range.to]);
const monthEndISO = useMemo(() => formatISODate(endOfMonth(parseISO(range.to))), [range.to]);
const quarterStartISO = useMemo(() => formatISODate(startOfQuarter(parseISO(range.to))), [range.to]);
const quarterEndISO = useMemo(() => formatISODate(endOfQuarter(parseISO(range.to))), [range.to]);

const monthForecast = useMemo(
  () => computeForecastWindow(dailySeries, monthStartISO, monthEndISO, 'month'),
  [dailySeries, monthStartISO, monthEndISO]
);
const quarterForecast = useMemo(
  () => computeForecastWindow(dailySeries, quarterStartISO, quarterEndISO, 'quarter'),
  [dailySeries, quarterStartISO, quarterEndISO]
);
const trendForecast = useMemo(() => computeTrendForecast(dailySeries, range), [dailySeries, range]);

  const summary = useMemo<DbPerformanceSummary>(() => {
    const currentAcc = createAccumulator();
    currentRows.forEach((row) => accumulate(currentAcc, row));

    const previousAcc = createAccumulator();
    previousRows.forEach((row) => accumulate(previousAcc, row));

    const yoyAcc = createAccumulator();
    yoyRows.forEach((row) => accumulate(yoyAcc, row));

    const currentSnapshot = finalizeAccumulator(currentAcc);
    const yoySnapshot = finalizeAccumulator(yoyAcc);

    return {
      metrics: compareMetrics(currentAcc, previousAcc),
      yoyDelta: showYoy ? computeDelta(currentSnapshot.turnover, yoySnapshot.turnover) : null,
    };
  }, [currentRows, previousRows, yoyRows, showYoy]);

  const sections = useMemo<SectionPerformance[]>(() => {
    const currentStructure = buildStructure(currentRows);
    const previousStructure = buildStructure(previousRows);
    const yoyStructure = showYoy ? buildStructure(yoyRows) : new Map<DBType, SectionAccumulator>();
    const currentGeoRows = groupRowsByGeo(currentRows);
    const built = buildSections(
      currentStructure,
      previousStructure,
      yoyStructure,
      showYoy,
      resolution,
      currentGeoRows
    );
    const selectedTypes = new Set(filters.dbTypes);

    const withPlaceholders = [...built];
    selectedTypes.forEach((type) => {
      if (!withPlaceholders.some((section) => section.type === type)) {
        const label =
          type === 'B2B'
            ? 'B2B Databases'
            : type === 'B2C'
              ? 'B2C Databases'
              : 'Mixed Databases';
        withPlaceholders.push({
          type,
          label,
          metrics: compareMetrics(undefined, undefined),
          countries: [],
        });
      }
    });

    return SECTION_ORDER.filter((type) => selectedTypes.has(type))
      .map((type) => withPlaceholders.find((section) => section.type === type))
      .filter((section): section is SectionPerformance => Boolean(section));
  }, [currentRows, previousRows, yoyRows, filters.dbTypes, showYoy, resolution]);

  const exportRows = useMemo<ExportRow[]>(() => {
    const rows: ExportRow[] = [];
    sections.forEach((section) => {
      section.countries.forEach((country) => {
        country.bases.forEach((base) => {
          rows.push({
            section: section.label,
            dbType: section.type,
            country: country.label,
            database: base.label,
            metrics: base.metrics,
          });
        });
      });
    });
    return rows;
  }, [sections]);

  const exportData = useMemo<DbPerformanceExport>(
    () => ({
      generatedAt: new Date().toISOString(),
      range,
      compareRange,
      rows: exportRows,
    }),
    [exportRows, range, compareRange]
  );

  const resolveBaseDetail = useCallback(
    ({ base, sectionLabel }: ResolveBaseDetailArgs): BaseDetailData | null => {
      if (!base) return null;
      const key = createBaseKey(base.geo, base.id);
      const currentBaseRows = currentRowsByBase.get(key) ?? [];
      const previousBaseRows = previousRowsByBase.get(key) ?? [];
      const allBaseRows = allRowsByBase.get(key) ?? [];
      const yoyBaseRows = yoyRowsByBase.get(key) ?? [];

      const quickTrend = buildQuickTrendPoints(currentBaseRows, 'day');
      const dailyTrend = buildBaseDailyTrend(currentBaseRows);
      const quarterComparison = buildBaseQuarterComparison(allBaseRows);
      const topMovers = buildBaseTopMovers(currentBaseRows, previousBaseRows);

      const currentAcc = createAccumulator();
      currentBaseRows.forEach((row) => accumulate(currentAcc, row));
      const yoyAcc = createAccumulator();
      yoyBaseRows.forEach((row) => accumulate(yoyAcc, row));
      const currentSnapshot = finalizeAccumulator(currentAcc);
      const yoySnapshot = finalizeAccumulator(yoyAcc);
      const yoyDelta = showYoy ? computeDelta(currentSnapshot.turnover, yoySnapshot.turnover) : null;

      const note = generateDataTeamNote(base, base.metrics.deltas.turnover) ?? null;

      return {
        id: base.id,
        label: base.label,
        geo: base.geo,
        section: sectionLabel,
        metrics: base.metrics,
        quickTrend,
        yoyDelta,
        dailyTrend,
        quarterComparison,
        topMovers,
        dataTeamNote: note,
      };
    },
    [
      allRowsByBase,
      currentRowsByBase,
      previousRowsByBase,
      showYoy,
      yoyRowsByBase,
    ]
  );

  const trend = useMemo<TrendSeries>(() => {
    const currentSeries = buildBucketSeries(currentRows, resolution);
    const previousSeries = buildBucketSeries(previousRows, resolution);

    const points: TrendPoint[] = currentSeries.map((entry, index) => {
      const previousEntry = previousSeries[index];
      return {
        key: entry.key,
        label: entry.label,
        date: entry.sortKey,
        current: entry.snapshot,
        previous: previousEntry ? previousEntry.snapshot : finalizeAccumulator(),
      };
    });

    return {
      resolution,
      points,
      forecast: trendForecast ?? null,
    };
  }, [currentRows, previousRows, resolution, trendForecast]);

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      const geo = (row.geo ?? '').trim().toUpperCase();
      if (geo) set.add(geo);
    });
    return Array.from(set).sort();
  }, [rows]);

  const availableDbTypes = useMemo(() => {
    const set = new Set<DBType>();
    rows.forEach((row) => {
      if (row.databaseType) set.add(row.databaseType);
    });
    return SECTION_ORDER.filter((type) => set.has(type));
  }, [rows]);

  return {
    loading,
    filters,
    setFilters,
    range,
    compareRange,
    summary,
    sections,
    availableCountries,
    availableDbTypes,
    showYoy,
    trend,
    forecast: {
      month: monthForecast,
      quarter: quarterForecast,
    },
    exportData,
    resolveBaseDetail,
    refresh,
  };
}
