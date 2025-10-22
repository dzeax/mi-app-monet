import type { DBType } from '@/data/reference';

// Métricas soportadas en Reports
export type Metric =
  | 'turnover'
  | 'margin'
  | 'marginPct'
  | 'routingCosts'
  | 'ecpm'
  | 'vSent';

export const METRIC_LABELS: Record<Metric, string> = {
  turnover: 'Turnover',
  margin: 'Margin (€)',
  marginPct: 'Margin (%)',
  routingCosts: 'Routing costs',
  ecpm: 'eCPM',
  vSent: 'V Sent',
};

// Dimensiones por las que podemos agrupar el ranking / tabla
export type GroupBy =
  | 'database'
  | 'partner'
  | 'campaign'
  | 'advertiser'
  | 'theme'
  | 'geo'
  | 'type'
  | 'databaseType';

export const GROUP_LABELS: Record<GroupBy, string> = {
  database: 'Database',
  partner: 'Partner',
  campaign: 'Campaign',
  advertiser: 'Advertiser',
  theme: 'Theme',
  geo: 'GEO',
  type: 'Type',
  databaseType: 'DB Type',
};

// Filtros de alto nivel del reporte
export type ReportFilters = {
  from?: string;                 // yyyy-mm-dd (inclusive)
  to?: string;                   // yyyy-mm-dd (inclusive)
  geos?: string[];               // códigos en mayúsculas (ES, FR, ...)
  partners?: string[];           // nombres visibles
  campaigns?: string[];          // nombres visibles
  advertisers?: string[];        // nombres visibles
  themes?: string[];             // etiquetas
  databases?: string[];          // nombres visibles
  types?: Array<'CPL' | 'CPM' | 'CPC' | 'CPA'>;
  databaseTypes?: DBType[];      // tipado fuerte desde catálogos
  onlyInternalPartners?: boolean;
  includeInternalInvoiceOffice?: boolean;
};

// Fila agregada (resultado de agrupar por GroupBy)
export type AggregateRow = {
  /** clave cruda (ej. nombre de database o partner) */
  key: string;
  /** etiqueta presentable (por si en el futuro mapeamos ids→labels) */
  label: string;

  /** métricas agregadas */
  vSent: number;
  turnover: number;
  margin: number;
  routingCosts: number;
  marginPct: number | null;
  /** eCPM ponderado por vSent del agregado */
  ecpm: number;

  /** opcional: suma de qty cuando aplica (CPL, etc.) */
  qty?: number;

  /** nº de filas subyacentes en el agregado */
  count: number;
};

// Punto de serie temporal para tendencias
export type TrendPoint = {
  date: string;     // yyyy-mm-dd
  ecpm: number;     // ponderado en ese día
  vSent: number;    // total del día (útil para tooltips)
  turnover: number; // total del día (útil para tooltips)
};

// Resultado calculado por el hook de datos
export type ReportData = {
  filteredCount: number;
  kpis: {
    vSent: number;
    turnover: number;
    margin: number;
    routingCosts: number;
    ecpm: number;         // ponderado global
    marginPct: number | null;
  };
  ranking: AggregateRow[]; // ordenado y ya cortado por TopN
  trend: TrendPoint[];     // eCPM por día (ordenado asc)
};
