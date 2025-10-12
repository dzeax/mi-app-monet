'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CampaignRow } from '@/types/campaign';
import { useCampaignData } from '@/context/CampaignDataContext';
import { useAuth } from '@/context/AuthContext';
import { useRoutingSettings } from '@/context/RoutingSettingsContext';
import CampaignFilters from './CampaignFilters';
import { useCampaignFilterEngine } from '@/hooks/useCampaignFilterEngine';

import ColumnPicker from '@/components/ui/ColumnPicker';
import BulkRoutingOverrideModal, { type BulkRoutingOverridePayload } from '@/components/admin/BulkRoutingOverrideModal';
import RowActions from '@/components/table/RowActions';
import CreateCampaignModal from './create-campaign/CreateCampaignModal';
import type { DBType } from '@/data/reference';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import { DEFAULT_ROUTING_RATE } from '@/lib/campaign-calcs';

import ExportModal from '@/components/export/ExportModal';          // [EXPORT]
import { type ColumnSpec } from '@/utils/exporters';                // [EXPORT]

/* ====== formatters ====== */
const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmtInt = new Intl.NumberFormat('es-ES');
const fmtPct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 });

type SortKey = keyof CampaignRow | 'marginPct' | '_idx' | 'none';

const COLVIS_STORAGE_KEY = 'monet_colvis_v1';
const ALWAYS_VISIBLE = new Set(['date', 'campaign']);

/* ====== helpers ====== */
const lc = (s?: string) => (s ?? '').trim().toLowerCase();

/* Canoniza DB Type a su forma correcta o null si no cuadra */
function canonDbType(s?: string): DBType | null {
  const n = lc(s);
  if (n === 'b2b') return 'B2B';
  if (n === 'b2c') return 'B2C';
  if (n === 'mixed') return 'Mixed';
  return null;
}

/* ====== tipos ====== */
type SummaryAgg = {
  vSent: number; routingCosts: number; qty: number; turnover: number; margin: number;
  weightedEcpm: number; marginPct: number | null; count: number;
};

type ColumnDef = {
  id:
    | 'date' | 'campaign' | 'advertiser' | 'invoiceOffice' | 'partner' | 'theme'
    | 'price' | 'type' | 'vSent' | 'routingCosts' | 'qty' | 'turnover'
    | 'margin' | 'marginPct' | 'ecpm' | 'database' | 'geo' | 'databaseType';
  label: string;
  numeric?: boolean;
  defaultVisible?: boolean;
  sortable?: boolean;
  sortKey?: SortKey;
  renderCell: (r: CampaignRow) => React.ReactNode;
  renderSummary?: (s: SummaryAgg) => React.ReactNode;
};

/* ====== helpers de estilo ====== */
type MarginTier = 'green' | 'amber' | 'red' | null;
function marginPctTier(pct: number | null | undefined): MarginTier {
  if (pct == null) return null;
  if (pct >= 0.70) return 'green';
  if (pct >= 0.01) return 'amber';
  return 'red';
}
function marginPctTextClass(pct: number | null | undefined) {
  const t = marginPctTier(pct);
  switch (t) {
    case 'green': return 'text-[color:var(--color-primary)]';
    case 'amber': return 'text-[color-mix(in_oklab,var(--color-accent)_58%,var(--color-primary)_42%)]';
    case 'red':   return 'text-[color:var(--color-accent)]';
    default:      return 'opacity-70';
  }
}

/* === iconos === */
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden>
        <path d="M7 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2"/>
        <path d="M7 14l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" opacity=".6"/>
      </svg>
    );
  }
  return dir === 'asc' ? (
    <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
function DownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

/* ====== columnas ====== */
const COLUMN_DEFS: ColumnDef[] = [
  { id: 'date', label: 'DATE', defaultVisible: true, sortable: true, sortKey: 'date',
    renderCell: (r) => new Date(r.date).toLocaleDateString('es-ES') },
  { id: 'campaign', label: 'CAMPAIGN', defaultVisible: true, sortable: true, sortKey: 'campaign',
    renderCell: (r) => r.campaign },
  { id: 'advertiser', label: 'ADVERTISER', defaultVisible: true, sortable: true, sortKey: 'advertiser',
    renderCell: (r) => r.advertiser },
  { id: 'invoiceOffice', label: 'INVOICE OFFICE', defaultVisible: true, sortable: true, sortKey: 'invoiceOffice',
    renderCell: (r) => r.invoiceOffice },
  { id: 'partner', label: 'PARTNER', defaultVisible: true, sortable: true, sortKey: 'partner',
    renderCell: (r) => r.partner },
  { id: 'theme', label: 'THEME', defaultVisible: true, sortable: true, sortKey: 'theme',
    renderCell: (r) => r.theme },
  { id: 'price', label: 'PRICE', numeric: true, defaultVisible: true, sortable: true, sortKey: 'price',
    renderCell: (r) => fmtEUR.format(r.price) },
  { id: 'type', label: 'TYPE', defaultVisible: true, sortable: true, sortKey: 'type',
    renderCell: (r) => r.type },
  { id: 'vSent', label: 'V SENT', numeric: true, defaultVisible: true, sortable: true, sortKey: 'vSent',
    renderCell: (r) => fmtInt.format(r.vSent), renderSummary: (s) => fmtInt.format(s.vSent) },
  { id: 'routingCosts', label: 'ROUTING COSTS', numeric: true, defaultVisible: true, sortable: true, sortKey: 'routingCosts',
    renderCell: (r) => fmtEUR.format(r.routingCosts), renderSummary: (s) => fmtEUR.format(s.routingCosts) },
  { id: 'qty', label: 'QTY', numeric: true, defaultVisible: true, sortable: true, sortKey: 'qty',
    renderCell: (r) => fmtInt.format(r.qty), renderSummary: (s) => fmtInt.format(s.qty) },
  { id: 'turnover', label: 'TURNOVER', numeric: true, defaultVisible: true, sortable: true, sortKey: 'turnover',
    renderCell: (r) => fmtEUR.format(r.turnover), renderSummary: (s) => fmtEUR.format(s.turnover) },
  { id: 'margin', label: 'MARGIN', numeric: true, defaultVisible: true, sortable: true, sortKey: 'margin',
    renderCell: (r) => {
      const pct = r.turnover > 0 ? r.margin / r.turnover : null;
      return <span className={marginPctTextClass(pct)}>{fmtEUR.format(r.margin)}</span>;
    },
    renderSummary: (s) => (
      <span className={marginPctTextClass(s.marginPct)}>{fmtEUR.format(s.margin)}</span>
    ) },
  { id: 'marginPct', label: 'MARGIN (%)', numeric: true, defaultVisible: true, sortable: true, sortKey: 'marginPct',
    renderCell: (r) => {
      const pct = r.turnover > 0 ? r.margin / r.turnover : null;
      return <span className={marginPctTextClass(pct)}>{pct == null ? '—' : fmtPct.format(pct)}</span>;
    },
    renderSummary: (s) => {
      const tier = marginPctTier(s.marginPct);
      const badge =
        tier === 'green' ? 'badge-positive'
        : tier === 'amber' ? 'badge-warn'
        : tier === 'red'   ? 'badge-negative'
        : '';
      return (
        <span className={`font-bold ${marginPctTextClass(s.marginPct)} ${badge}`}>
          {s.marginPct == null ? '—' : fmtPct.format(s.marginPct)}
        </span>
      );
    } },
  { id: 'ecpm', label: 'ECPM', numeric: true, defaultVisible: true, sortable: true, sortKey: 'ecpm',
    renderCell: (r) => fmtEUR.format(r.ecpm), renderSummary: (s) => fmtEUR.format(s.weightedEcpm) },
  { id: 'database', label: 'DATABASE', defaultVisible: true, sortable: true, sortKey: 'database',
    renderCell: (r) => r.database },
  { id: 'geo', label: 'GEO', defaultVisible: true, sortable: true, sortKey: 'geo',
    renderCell: (r) => r.geo },
  { id: 'databaseType', label: 'DB TYPE', defaultVisible: true, sortable: true, sortKey: 'databaseType',
    renderCell: (r) => r.databaseType },
];

/* ====== [EXPORT] columnas crudas para export ====== */
const EXPORT_COLS_ALL: ColumnSpec[] = [
  { id: 'date',         label: 'DATE',            accessor: r => r.date },
  { id: 'campaign',     label: 'CAMPAIGN',        accessor: r => r.campaign },
  { id: 'advertiser',   label: 'ADVERTISER',      accessor: r => r.advertiser },
  { id: 'invoiceOffice',label: 'INVOICE OFFICE',  accessor: r => r.invoiceOffice },
  { id: 'partner',      label: 'PARTNER',         accessor: r => r.partner },
  { id: 'theme',        label: 'THEME',           accessor: r => r.theme },
  { id: 'price',        label: 'PRICE',           accessor: r => r.price },
  { id: 'type',         label: 'TYPE',            accessor: r => r.type },
  { id: 'vSent',        label: 'V SENT',          accessor: r => r.vSent },
  { id: 'routingCosts', label: 'ROUTING COSTS',   accessor: r => r.routingCosts },
  { id: 'qty',          label: 'QTY',             accessor: r => r.qty },
  { id: 'turnover',     label: 'TURNOVER',        accessor: r => r.turnover },
  { id: 'margin',       label: 'MARGIN',          accessor: r => r.margin },
  { id: 'marginPct',    label: 'MARGIN (%)',      accessor: r => (r.turnover > 0 ? r.margin / r.turnover : null) },
  { id: 'ecpm',         label: 'ECPM',            accessor: r => r.ecpm },
  { id: 'database',     label: 'DATABASE',        accessor: r => r.database },
  { id: 'geo',          label: 'GEO',             accessor: r => r.geo },
  { id: 'databaseType', label: 'DB TYPE',         accessor: r => r.databaseType },
];

/* ====== helpers periodo (badge en KPIs) ====== */
function fmtLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function startOfWeek(d: Date) {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = (n.getDay() || 7) - 1;
  n.setDate(n.getDate() - w);
  return n;
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function rangeForPresetKey(
  key: 'today'|'yesterday'|'thisWeek'|'lastWeek'|'thisMonth'|'lastMonth'|'last7'|'last30'
): [string,string] {
  const now = new Date();
  if (key==='today')     { const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()); const s=fmtLocal(a); return [s,s]; }
  if (key==='yesterday') { const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1); const s=fmtLocal(a); return [s,s]; }
  if (key==='thisWeek')  return [fmtLocal(startOfWeek(now)), fmtLocal(endOfWeek(now))];
  if (key==='lastWeek')  { const k=new Date(now.getFullYear(),now.getMonth(),now.getDate()-7); return [fmtLocal(startOfWeek(k)), fmtLocal(endOfWeek(k))]; }
  if (key==='thisMonth') return [fmtLocal(startOfMonth(now)), fmtLocal(endOfMonth(now))];
  if (key==='lastMonth') { const k=new Date(now.getFullYear(),now.getMonth()-1,15); return [fmtLocal(startOfMonth(k)), fmtLocal(endOfMonth(k))]; }
  if (key==='last7')     { const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6); const b=new Date(now.getFullYear(),now.getMonth(),now.getDate()); return [fmtLocal(a),fmtLocal(b)]; }
  const a=new Date(now.getFullYear(),now.getMonth(),now.getDate()-29);
  const b=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return [fmtLocal(a),fmtLocal(b)];
}
function activePresetLabelFromRange(range?: [string|null,string|null] | null) {
  const start = range?.[0], end = range?.[1];
  if (!start || !end) return null;
  const entries = [
    ['today','Today'],['yesterday','Yesterday'],['thisWeek','This week'],['lastWeek','Last week'],
    ['thisMonth','This month'],['lastMonth','Last month'],['last7','Last 7'],['last30','Last 30'],
  ] as const;
  for (const [k,label] of entries) {
    const [s,e] = rangeForPresetKey(k as any);
    if (s===start && e===end) return label;
  }
  return `${start} → ${end}`;
}

/* ====== KPI tile ====== */
function KpiTile({
  label, value, tone, asBadge = false, subValue, rightHint, title,
}: {
  label: string; value: string; tone?: 'pos' | 'warn' | 'neg' | null;
  asBadge?: boolean; subValue?: string | null; rightHint?: string | null; title?: string;
}) {
  const toneText =
    tone === 'pos'  ? 'text-[color:var(--color-primary)]' :
    tone === 'neg'  ? 'text-[color:var(--color-accent)]' :
    tone === 'warn' ? 'text-[color-mix(in_oklab,var(--color-accent)_58%,var(--color-primary)_42%)]'
                    : 'opacity-90';

  const badgeClass =
    tone === 'pos'
      ? 'text-[color:var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_32%,transparent)] border border-[color-mix(in_oklab,var(--color-primary)_55%,transparent)]'
      : tone === 'neg'
      ? 'text-[color:var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent)_30%,transparent)] border border-[color-mix(in_oklab,var(--color-accent)_55%,transparent)]'
      : tone === 'warn'
      ? 'text-[color-mix(in_oklab,var(--color-accent)_58%,var(--color-primary)_42%)] bg-[color-mix(in_oklab,var(--color-accent)_22%,var(--color-primary)_22%)] border border-[color-mix(in_oklab,var(--color-accent)_45%,var(--color-primary)_20%)]'
      : 'bg-[color-mix(in_oklab,var(--color-text)_14%,transparent)] text-[color-mix(in_oklab,var(--color-text)_90%,black)] border border-[color-mix(in_oklab,var(--color-text)_22%,transparent)]';

  return (
    <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface-2)]/60 p-3 md:p-4 min-h-[92px]" title={title}>
      <div className="text-[11px] md:text-xs uppercase tracking-wide opacity-70">{label}</div>
      {asBadge ? (
        <div className="mt-2">
          <span className={['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold tabular-nums leading-tight', badgeClass].join(' ')}>
            {tone === 'neg' ? <DownIcon /> : null}
            {value}
          </span>
          {subValue ? <div className={['mt-1 text-xs tabular-nums leading-tight', toneText].join(' ')}>{subValue}</div> : null}
        </div>
      ) : (
        <div className={['mt-1 flex items-baseline gap-2', toneText].join(' ')}>
          <span className="text-lg md:text-xl font-semibold tabular-nums leading-tight">{value}</span>
          {rightHint ? <span className="text-[11px] md:text-xs opacity-70">{rightHint}</span> : null}
        </div>
      )}
    </div>
  );
}

/* =================================================================== */

export default function CampaignTable() {
  const { rows, removeCampaign, setRoutingRateOverride } = useCampaignData();
  const { isAdmin } = useAuth();
  const { settings } = useRoutingSettings();
  const defaultRoutingRate = settings.defaultRate ?? DEFAULT_ROUTING_RATE;

  /* ====== Catálogos canónicos ====== */
  const catalogs = useCatalogOverrides();
  const PARTNERS = catalogs?.PARTNERS ?? [];
  const THEMES = (catalogs?.THEMES ?? []) as string[];
  const TYPES = (catalogs?.TYPES ?? ['CPL', 'CPM', 'CPC', 'CPA']).slice();

  /* ====== Filtros ====== */
  const engine = useCampaignFilterEngine(rows);
  const dataSource = engine.filteredRows as unknown as (CampaignRow & { _idx: number })[];

  // Opciones sin duplicados y con etiquetas canónicas
  const options = useMemo(() => {
    // qué hay presente en el dataset (normalizado)
    const presentTypesLc = new Set(rows.map(r => lc(r.type)).filter(Boolean));
    const presentPartners = new Set(rows.map(r => lc(r.partner)).filter(Boolean));
    const presentThemes = new Set(rows.map(r => lc(r.theme)).filter(Boolean));
    const presentGeos = new Set(rows.map(r => (r.geo ?? '').trim().toUpperCase()).filter(Boolean));
    const presentDbTypes = new Set(
      rows.map(r => canonDbType(r.databaseType)).filter((x): x is DBType => !!x)
    );

    // mapas canónicos (lc -> etiqueta canónica)
    const partnerMap = new Map(PARTNERS.map(p => [lc(p.name), p.name]));
    const themeMap = new Map(THEMES.map(t => [lc(t), t]));

    // TYPE: intersección entre canónicos y presentes (evita cpl/CPL)
    const typeOpts = TYPES.filter(t => presentTypesLc.has(lc(t)));

    // PARTNER/THEME: colapsa por lc y etiqueta con la canónica si existe
    const partnerOpts = Array.from(presentPartners)
      .map(k => partnerMap.get(k) ?? (rows.find(r => lc(r.partner) === k)?.partner ?? k))
      .sort((a, b) => a.localeCompare(b, 'es'));

    const themeOpts = Array.from(presentThemes)
      .map(k => themeMap.get(k) ?? (rows.find(r => lc(r.theme) === k)?.theme ?? k))
      .sort((a, b) => a.localeCompare(b, 'es'));

    // GEO: mayúsculas
    const geoOpts = Array.from(presentGeos).sort();

    // DB TYPE: orden estable canónico
    const dbOrder: DBType[] = ['B2B', 'B2C', 'Mixed'];
    const dbTypeOpts = dbOrder.filter(t => presentDbTypes.has(t));

    return {
      geos: geoOpts,
      partners: partnerOpts,
      themes: themeOpts,
      types: typeOpts,
      dbTypes: dbTypeOpts,
    };
  }, [rows, PARTNERS, THEMES, TYPES]);

  /* ====== Orden/paginación ====== */
  const [sortKey, setSortKey] = useState<SortKey>('none');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [seedCreate, setSeedCreate] = useState<CampaignRow | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // [EXPORT]
  const [openExport, setOpenExport] = useState(false);
  const [openRoutingOverride, setOpenRoutingOverride] = useState(false);

  /* ====== Column visibility persistente ====== */
  const defaults = useMemo(
    () => COLUMN_DEFS.filter(c => c.defaultVisible !== false).map(c => c.id),
    []
  );
  const defaultVisibleSet = useMemo(() => {
    const s = new Set<string>(defaults);
    for (const id of ALWAYS_VISIBLE) s.add(id);
    return s;
  }, [defaults]);

  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set(defaultVisibleSet)
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLVIS_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as string[];
      const next = new Set(arr.filter(id => COLUMN_DEFS.some(c => c.id === id)));
      for (const id of ALWAYS_VISIBLE) next.add(id);
      let changed = next.size !== defaultVisibleSet.size;
      if (!changed) for (const id of next) if (!defaultVisibleSet.has(id)) { changed = true; break; }
      if (changed) setVisibleIds(next);
    } catch {}
  }, [defaultVisibleSet]);

  const applyVisible = (next: Set<string>) => {
    for (const id of ALWAYS_VISIBLE) next.add(id);
    if (sortKey !== 'none') {
      const sortedCol = COLUMN_DEFS.find(c => (c.sortKey ?? (c.id as SortKey)) === sortKey);
      if (sortedCol && !next.has(sortedCol.id)) setSortKey('none');
    }
    setVisibleIds(new Set(next));
    try { localStorage.setItem(COLVIS_STORAGE_KEY, JSON.stringify([...next])); } catch {}
  };

  useEffect(() => { setPage(1); }, [dataSource, sortKey, sortDir, pageSize, visibleIds]);

  const visibleCols = useMemo(
    () => COLUMN_DEFS.filter(c => visibleIds.has(c.id)),
    [visibleIds]
  );
  const marginPctOf = (r: CampaignRow) => (r.turnover > 0 ? r.margin / r.turnover : null);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(t);
  }, [flashId]);

  const sortedAll = useMemo(() => {
    const arr = [...dataSource];
    if (sortKey === 'none') return arr;
    return arr.sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'marginPct') { va = marginPctOf(a); vb = marginPctOf(b); }
      else { va = (a as any)[sortKey]; vb = (b as any)[sortKey]; }

      if (va == null && vb == null) return a._idx - b._idx;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      if (cmp === 0) cmp = a._idx - b._idx;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [dataSource, sortKey, sortDir]);

  type Totals = { vSent: number; routingCosts: number; qty: number; turnover: number; margin: number; weightedEcpm: number; };
  const summary = useMemo<SummaryAgg>(() => {
    const init: Totals = { vSent: 0, routingCosts: 0, qty: 0, turnover: 0, margin: 0, weightedEcpm: 0 };
    const totals = sortedAll.reduce<Totals>((acc, r) => {
      acc.vSent += r.vSent || 0;
      acc.routingCosts += r.routingCosts || 0;
      acc.qty += r.qty || 0;
      acc.turnover += r.turnover || 0;
      acc.margin += r.margin || 0;
      acc.weightedEcpm += (r.ecpm || 0) * (r.vSent || 0);
      return acc;
    }, init);
    const weightedEcpm = totals.vSent > 0 ? totals.weightedEcpm / totals.vSent : 0;
    const marginPct = totals.turnover > 0 ? totals.margin / totals.turnover : null;
    return { ...totals, weightedEcpm, marginPct, count: sortedAll.length };
  }, [sortedAll]);

  const pageCount = Math.max(1, Math.ceil(sortedAll.length / pageSize));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = sortedAll.slice(start, end);

  const handleRoutingOverride = ({ scope, mode, rate }: BulkRoutingOverridePayload) => {
    const target = scope === 'all' ? sortedAll : pageRows;
    if (!target.length) {
      setOpenRoutingOverride(false);
      return;
    }
    const ids = target.map(r => r.id);
    const value = mode === 'clear' ? null : (rate ?? null);
        void setRoutingRateOverride(ids, value);
    setOpenRoutingOverride(false);
  };

  function setSortBy(k: SortKey) {
    if (sortKey !== k) { setSortKey(k); setSortDir('asc'); }
    else { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
  }

  /* ====== Medición de alturas para la lámina / offset ====== */
  const refFilters = useRef<HTMLDivElement>(null);
  const refKpis = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState({ filters: 0, kpis: 0 });

  const bandGapPx = 16; // debe casar con --band-gap-y

  useEffect(() => {
    const update = () => {
      setSizes({
        filters: refFilters.current?.offsetHeight ?? 0,
        kpis: refKpis.current?.offsetHeight ?? 0,
      });
    };
    const ro = new ResizeObserver(update);
    if (refFilters.current) ro.observe(refFilters.current);
    if (refKpis.current) ro.observe(refKpis.current);
    window.addEventListener('resize', update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Offset donde debe “pegarse” el thead (debajo del stack sticky)
  const stackedBottom = `calc(var(--content-sticky-top) + ${sizes.filters}px + ${bandGapPx}px + ${sizes.kpis}px)`;

  /* === Header de columna sticky — usa la regla CSS global === */
  const Th = ({ col }: { col: ColumnDef }) => {
    const active = col.sortable && sortKey === (col.sortKey ?? (col.id as SortKey));
    const ariaSort =
      col.sortable
        ? (active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none')
        : undefined;
    return (
      <th
        onClick={col.sortable ? () => setSortBy(col.sortKey ?? (col.id as SortKey)) : undefined}
        aria-sort={ariaSort as any}
        className={`${col.numeric ? 'text-right whitespace-nowrap' : 'text-left'} ${col.sortable ? 'cursor-pointer select-none' : ''}`}
      >
        <div className="flex items-center gap-1 justify-between">
          <span>{col.label}</span>
          {col.sortable && <SortIcon active={!!active} dir={sortDir} />}
        </div>
      </th>
    );
  };

  /* ====== Column picker ====== */
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerColumns = useMemo(
    () => COLUMN_DEFS.map(c => ({ id: c.id, label: c.label, disabled: ALWAYS_VISIBLE.has(c.id) })), []
  );

  // [EXPORT] columnas visibles para export, en el mismo orden actual
  const exportVisibleCols: ColumnSpec[] = useMemo(() => {
    const ids = visibleCols.map(c => c.id);
    return EXPORT_COLS_ALL.filter(c => ids.includes(c.id));
  }, [visibleCols]);

  // [EXPORT] nombre sugerido de archivo con periodo + timestamp corto
  const exportFileBase = useMemo(() => {
    const period = activePresetLabelFromRange(engine.filters.dateRange ?? null) || 'All';
    const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'');
    return `campaigns_${String(period).toLowerCase().replace(/\s+/g,'-')}_${stamp}`;
  }, [engine.filters.dateRange]);

  return (
    <div className="w-full px-2 md:px-3 lg:px-4">
      {/* ===== Sticky stack: Filtros + Backplate + KPIs ===== */}
      <div
        className="-mx-2 md:-mx-3 lg:-mx-4 px-2 md:px-3 lg:px-4"
        style={{ ['--band-gap-y' as any]: `${bandGapPx}px` }}
      >
        {/* Filtros (sticky) */}
        <div
          ref={refFilters}
          style={{
            position: 'sticky',
            top: 'var(--content-sticky-top)',
            zIndex: 60,
            marginBottom: 'var(--band-gap-y)',
          }}
        >
          <CampaignFilters
            filters={engine.filters}
            updateFilters={engine.updateFilters}
            resetFilters={engine.resetFilters}
            options={options}
            pending={engine.pending}
            onOpenColumns={() => setPickerOpen(true)}
            onOpenExport={() => setOpenExport(true)}
            exportCount={sortedAll.length}
            onOpenRoutingOverride={isAdmin ? () => setOpenRoutingOverride(true) : undefined}
            canOverrideRouting={isAdmin}
          />
        </div>

        {/* Lámina de fondo — debajo de thead */}
        <div
          aria-hidden
          style={{
            position: 'sticky',
            top: 'var(--content-sticky-top)',
            zIndex: 20,      // por debajo de thead (45), KPIs (50) y filtros (60)
            height: 0,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '-0.5rem',
              right: '-0.5rem',
              height: `calc(${sizes.filters}px + ${bandGapPx}px + ${sizes.kpis}px)`,
              background: 'var(--color-bg-outer)',
              borderBottom: '1px solid var(--color-border)',
              boxShadow: '0 6px 16px rgba(0,0,0,.06)',
            }}
          />
        </div>

        {/* KPIs (sticky) */}
        <div
          ref={refKpis}
          style={{
            position: 'sticky',
            top: `calc(var(--content-sticky-top) + ${sizes.filters}px + var(--band-gap-y))`,
            zIndex: 50,
          }}
        >
          <div
            role="region"
            aria-labelledby="kpi-recap-title"
            aria-live="polite"
            className="rounded-xl border border-[--color-border] ring-1 ring-white/10 bg-[color:var(--color-surface)]/90 backdrop-blur-md shadow-xl"
          >
            <h2 id="kpi-recap-title" className="sr-only">Resumen de KPIs</h2>

            {/* badge de periodo + acciones */}
            <div className="px-3 md:px-4 pt-2 flex justify-end">
              <span className="text-[11px] md:text-xs rounded-full px-2 py-1
                                bg-[color-mix(in_oklab,var(--color-text)_10%,transparent)]
                                text-[color-mix(in_oklab,var(--color-text)_85%,black)]">
                {activePresetLabelFromRange(engine.filters.dateRange ?? null) || 'All data'}
              </span>
            </div>
            
            {/* KPIs */}
            <div className="p-3 md:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
              <KpiTile label="Turnover" value={fmtEUR.format(summary.turnover)} title="Suma de turnover del dataset filtrado" />
              <KpiTile
                label="Margin (%)"
                value={summary.marginPct == null ? '—' : fmtPct.format(summary.marginPct)}
                tone={(() => {
                  const tier = marginPctTier(summary.marginPct);
                  return tier === 'green' ? 'pos' : tier === 'amber' ? 'warn' : tier === 'red' ? 'neg' : null;
                })()}
                asBadge
                subValue={fmtEUR.format(summary.margin)}
                title="Margin% = Margin / Turnover"
              />
              <KpiTile label="V Sent" value={fmtInt.format(summary.vSent)} title="Volumen de envíos en el periodo" />
              <KpiTile label="eCPM" value={fmtEUR.format(summary.weightedEcpm)} rightHint="€/k" title="eCPM ponderado = Σ(ecpm·vSent) / Σ(vSent)" />
            </div>

            <div className="px-3 md:px-4 pb-3 -mt-1 border-t border-white/10 text-xs opacity-80">
              <span className="tabular-nums">
                Routing: <strong>{fmtEUR.format(summary.routingCosts)}</strong> • QTY: <strong>{fmtInt.format(summary.qty)}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ColumnPicker */}
      {pickerOpen && (
        <ColumnPicker
          columns={pickerColumns}
          visible={visibleIds}
          onChange={applyVisible}
          onClose={() => setPickerOpen(false)}
          defaults={defaults}
        />
      )}

      {/* ====== Tabla ====== */}
      <div
        className="table-wrap mt-6"
        style={{
          // por si en CSS usas la var para el offset
          ['--table-sticky-offset' as any]: stackedBottom,
        }}
      >
        <table className="table min-w-[1280px] tabular-nums">
          <thead>
            <tr>
              {visibleCols.map(col => (
                <Th key={col.id} col={col} />
              ))}
              <th className="w-[1%] text-right pr-2">⋯</th>
            </tr>
          </thead>

          <tbody>
            {/* SUMMARY */}
            <tr className="row-summary">
              {visibleCols.map((col, idx) => {
                if (idx === 0) {
                  return <td key={col.id} className="px-3 py-2 text-sm">SUMMARY ({summary.count})</td>;
                }
                const content = col.renderSummary ? col.renderSummary(summary) : null;
                return (
                  <td key={col.id} className={`px-3 py-2 text-sm ${col.numeric ? 'text-right whitespace-nowrap' : ''}`}>
                    {content}
                  </td>
                );
              })}
              <td />
            </tr>

            {/* Filas */}
            {pageRows.map((r) => {
              const rowFlash = r.id === flashId ? 'row-flash' : '';
              return (
                <tr
                  key={r.id}
                  className={`hover:bg-white/5 transition-colors ${rowFlash}`}
                  onDoubleClick={() => setEditing(r)}
                >
                  {visibleCols.map((col) => (
                    <td key={col.id} className={`px-3 py-2 text-sm ${col.numeric ? 'text-right whitespace-nowrap' : ''}`}>
                      {col.renderCell(r)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-sm">
                    <RowActions
                      onEdit={() => setEditing(r)}
                      onDuplicate={() => setSeedCreate(r)}
                      onDelete={() => {
                        if (!confirm('Delete this campaign? This cannot be undone.')) return;
                        void removeCampaign(r.id);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="text-sm opacity-80">
          Showing {sortedAll.length === 0 ? 0 : start + 1}–{Math.min(end, sortedAll.length)} of {sortedAll.length}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Rows per page</label>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="input w-24 py-1 text-sm">
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost disabled:opacity-40 text-sm">
            Previous
          </button>
          <span className="text-sm">Page {page} / {pageCount}</span>
          <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount} className="btn-primary disabled:opacity-40 text-sm">
            Next
          </button>
        </div>
      </div>

      {/* Modales */}
      {editing && (
        <CreateCampaignModal
          mode="edit"
          initialRow={editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); setFlashId(id); }}
        />
      )}
      {seedCreate && (
        <CreateCampaignModal
          mode="create"
          seed={seedCreate}
          onClose={() => setSeedCreate(null)}
        />
      )}

      {/* [EXPORT] Modal de exportación */}
      {openExport && (
        <ExportModal
          onClose={() => setOpenExport(false)}
          allRows={sortedAll}
          pageRows={pageRows}
          visibleColumns={exportVisibleCols}
          allColumns={EXPORT_COLS_ALL}
          defaultFilename={exportFileBase}
        />
      )}
    </div>
  );
}
