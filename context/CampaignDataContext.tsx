'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CampaignRow } from '@/types/campaign';
import { autoFromCampaign, autoFromDatabase, autoInvoiceOffice, calcDerived, DEFAULT_ROUTING_RATE } from '@/lib/campaign-calcs';
import { useAuth } from '@/context/AuthContext'; // 🆕 soft guard por rol
import { useRoutingSettings } from '@/context/RoutingSettingsContext';

/* ================================
   Tipado del contexto (ampliado)
   ================================ */
type BulkResult = { added: number; updated: number; skipped: number; total: number };
type UpsertKey = 'id' | 'composite';
type OnConflict = 'update' | 'skip';

type ImportCsvOptions = {
  delimiter?: string;
  headerMap?: Partial<Record<string, keyof CampaignRow>>;
  upsertBy?: UpsertKey;
  onConflict?: OnConflict;
};

type ImportCsvReport = BulkResult & {
  errors: { line: number; reason: string }[];
  columns: string[];
};

type Ctx = {
  rows: (CampaignRow & { _idx: number })[];
  addCampaign: (r: Omit<CampaignRow, 'id'> & { id?: string }) => void;
  updateCampaign: (id: string, patch: Partial<CampaignRow>) => void;
  removeCampaign: (id: string) => void;
  resetToMock: () => void; // mantiene el nombre por compat, ahora limpia
  addManyCampaigns: (
    list: (Omit<CampaignRow, 'id'> & { id?: string })[],
    opts?: { upsertBy?: UpsertKey; onConflict?: OnConflict }
  ) => BulkResult;
  importFromCsv: (csvText: string, opts?: ImportCsvOptions) => ImportCsvReport;
  setRoutingRateOverride: (ids: string[], rate: number | null) => void;
};

const CampaignDataContext = createContext<Ctx | null>(null);

const STORAGE_KEY = 'monet_campaigns_v1';

/* ==========================
   Helpers (reglas & parsing)
   ========================== */
function applyBusinessRules(
  row: CampaignRow,
  resolveRate: (date: string | null | undefined) => number,
  fallbackRate: number
): CampaignRow {
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
  const d = calcDerived({ price: row.price, qty: row.qty, vSent: row.vSent }, rate || DEFAULT_ROUTING_RATE);

  return {
    ...row,
    advertiser,
    geo,
    databaseType,
    invoiceOffice,
    routingCosts: d.routingCosts,
    turnover: d.turnover,
    margin: d.margin,
    ecpm: d.ecpm,
  };
}

function compositeKey(r: Pick<CampaignRow, 'date' | 'campaign' | 'partner' | 'database'>) {
  return [r.date, r.campaign, r.partner, r.database].map(s => (s ?? '').trim().toLowerCase()).join('|');
}

function parseNumberLoose(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseCsv(text: string, delimiter?: string): { header: string[]; rows: string[][] } {
  const firstLine = (text.split(/\r?\n/, 1)[0] ?? '');
  const guess = delimiter || (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const d = guess;

  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => { row.push(cell); cell = ''; };
  const pushRow = () => { if (row.length === 1 && row[0] === '') { row = []; return; } out.push(row); row = []; };

  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === d) { pushCell(); }
      else if (ch === '\n') { pushCell(); pushRow(); }
      else if (ch === '\r') { }
      else { cell += ch; }
    }
  }
  pushCell();
  if (row.length) pushRow();

  if (!out.length) return { header: [], rows: [] };
  const header = (out.shift() || []).map(h => h.trim());
  return { header, rows: out };
}

const REQUIRED_MIN: (keyof CampaignRow)[] = [
  'date', 'campaign', 'partner', 'database', 'type',
  'price', 'qty', 'vSent',
];

/* =========================
   Provider sin mocks
   ========================= */
export function CampaignDataProvider({ children }: { children: React.ReactNode }) {
  // 🆕 límites suaves para no-admin
  const { isAdmin } = useAuth();
  const { resolveRate, settings } = useRoutingSettings();
  const fallbackRate = settings.defaultRate ?? DEFAULT_ROUTING_RATE;
  const NON_ADMIN_BULK_LIMIT = 500; // número máximo de filas por operación para no-admin

  // 1) Arrancamos vacío; hidrataremos en efecto
  const [rows, setRows] = useState<(CampaignRow & { _idx: number })[]>([]);
  const idxRef = useRef(0);

  // Guardas para StrictMode y para bloquear la primera escritura
  const didInitRef = useRef(false);
  const hydratedRef = useRef(false);

  // 2) Hidratar una única vez desde LocalStorage; si no hay datos => quedamos vacíos
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let base: CampaignRow[] = [];

      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) base = parsed as CampaignRow[];
      }

      const withIdx = base.map((r, i) => ({ ...applyBusinessRules(r, resolveRate, fallbackRate), _idx: i }));
      idxRef.current = withIdx.length;
      setRows(withIdx);
    } catch {
      idxRef.current = 0;
      setRows([]);
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  // 3) Persistir SOLO después de hidratar
  useEffect(() => {
    if (!hydratedRef.current) return;
    const plain: CampaignRow[] = rows.map(({ _idx, ...r }) => r);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plain)); } catch {}
  }, [rows]);

  const addCampaign = useCallback((input: Omit<CampaignRow, 'id'> & { id?: string }) => {
    const id = input.id ?? (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    const row: CampaignRow & { _idx: number } = {
      ...applyBusinessRules({ ...input, id } as CampaignRow, resolveRate, fallbackRate),
      _idx: idxRef.current++,
    };
    setRows(prev => [row, ...prev]);
  }, [fallbackRate, resolveRate]);

  const updateCampaign = useCallback((id: string, patch: Partial<CampaignRow>) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const merged: CampaignRow = { ...r, ...patch };
      const finalRow = applyBusinessRules(merged, resolveRate, fallbackRate);
      return { ...finalRow, _idx: r._idx };
    }));
  }, [fallbackRate, resolveRate]);

  const removeCampaign = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  // Ahora limpia: borra storage y deja dataset vacío
  const resetToMock = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    idxRef.current = 0;
    setRows([]);
  }, []);

  // ============ Inserción masiva / upsert ============
  const addManyCampaigns = useCallback((
    list: (Omit<CampaignRow, 'id'> & { id?: string })[],
    opts?: { upsertBy?: UpsertKey; onConflict?: OnConflict }
  ): BulkResult => {
    // 🆕 guard suave para no-admin:
    const hardTotal = list.length;
    const effectiveList = isAdmin ? list : list.slice(0, NON_ADMIN_BULK_LIMIT);
    const trimmedOut = hardTotal - effectiveList.length;

    const upsertBy = opts?.upsertBy ?? 'composite';
    const onConflictEffective: OnConflict = isAdmin ? (opts?.onConflict ?? 'update') : 'skip';

    let added = 0, updated = 0, skipped = 0;

    setRows(prev => {
      let next = [...prev];

      for (const input of effectiveList) {
        const id =
          input.id ??
          (globalThis.crypto?.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2));

        const prepared = applyBusinessRules({ ...(input as any), id } as CampaignRow, resolveRate, fallbackRate);

        // Recalcular mapas sobre `next` en cada iteración
        const byId = new Map<string, number>();
        const byComposite = new Map<string, number>();
        for (let i = 0; i < next.length; i++) {
          const r = next[i];
          byId.set(r.id, i);
          byComposite.set(compositeKey(r), i);
        }

        let targetIndex: number | undefined = undefined;
        if (upsertBy === 'id' && id) {
          const idx = byId.get(id);
          if (idx != null) targetIndex = idx;
        } else {
          const key = compositeKey(prepared);
          const idx = byComposite.get(key);
          if (idx != null) targetIndex = idx;
        }

        if (targetIndex == null) {
          const rowWithIdx = { ...prepared, _idx: idxRef.current++ };
          next = [rowWithIdx, ...next];
          added++;
        } else {
          if (onConflictEffective === 'skip') {
            skipped++;
          } else {
            const prevRow = next[targetIndex];
            const preservedIdx =
              (prevRow as (CampaignRow & { _idx: number }) | undefined)?._idx ?? idxRef.current++;
            next[targetIndex] = { ...prepared, _idx: preservedIdx };
            updated++;
          }
        }
      }

      return next;
    });

    skipped += trimmedOut;

    return { added, updated, skipped, total: hardTotal };
  }, [fallbackRate, isAdmin, resolveRate]);

  const importFromCsv = useCallback((csvText: string, opts?: ImportCsvOptions): ImportCsvReport => {
    const parsed = parseCsv(csvText, opts?.delimiter);
    const headerRaw = parsed.header;
    const rowsRaw = parsed.rows;
    const normalize = (s: string) => s.trim().toLowerCase();
    const columns = headerRaw;
    const headerMap = new Map<string, keyof CampaignRow>();

    if (opts?.headerMap) {
      for (const [k, v] of Object.entries(opts.headerMap)) {
        headerMap.set(normalize(k), v);
      }
    }

    const possibleFields: (keyof CampaignRow)[] = [
      'id','date','campaign','advertiser','invoiceOffice','partner','theme','price','priceCurrency','type','vSent','routingCosts','qty','turnover','margin','ecpm','database','geo','databaseType',
    ];
    headerRaw.forEach(h => {
      const n = normalize(h);
      if (!headerMap.has(n)) {
        const direct = possibleFields.find(f => normalize(String(f)) === n);
        if (direct) headerMap.set(n, direct);
      }
    });

    const failures: { line: number; reason: string }[] = [];
    const batch: (Omit<CampaignRow, 'id'> & { id?: string })[] = [];

    rowsRaw.forEach((cells, rowIdx) => {
      const lineNo = rowIdx + 2;
      const obj: any = {};
      headerRaw.forEach((h, i) => {
        const mapped = headerMap.get(normalize(h));
        if (!mapped) return;
        obj[mapped] = cells[i];
      });

      obj.price = parseNumberLoose(obj.price);
      obj.qty = Math.round(parseNumberLoose(obj.qty));
      obj.vSent = Math.round(parseNumberLoose(obj.vSent));
      if (!obj.priceCurrency) obj.priceCurrency = 'EUR';
      if (!obj.type) obj.type = 'CPL';

      const missing = REQUIRED_MIN.filter(k => !String(obj[k] ?? '').trim());
      if (missing.length) {
        failures.push({ line: lineNo, reason: `Missing required: ${missing.join(', ')}` });
        return;
      }

      batch.push({
        id: obj.id || undefined,
        date: String(obj.date),
        campaign: String(obj.campaign),
        advertiser: String(obj.advertiser || ''),
        invoiceOffice: String(obj.invoiceOffice || 'DAT'),
        partner: String(obj.partner),
        theme: String(obj.theme || ''),
        price: Number(obj.price || 0),
        priceCurrency: String(obj.priceCurrency || 'EUR'),
        type: String(obj.type),
        vSent: Number(obj.vSent || 0),
        routingCosts: 0,
        qty: Number(obj.qty || 0),
        turnover: 0,
        margin: 0,
        ecpm: 0,
        database: String(obj.database),
        geo: String(obj.geo || ''),
        databaseType: String(obj.databaseType || ''),
      });
    });

    const bulk = addManyCampaigns(batch, {
      upsertBy: opts?.upsertBy ?? 'composite',
      onConflict: isAdmin ? (opts?.onConflict ?? 'update') : 'skip',
    });

  return {
    ...bulk,
    errors: failures,
    columns,
  };
}, [addManyCampaigns, isAdmin]);

  const setRoutingRateOverride = useCallback((ids: string[], rate: number | null) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const cleanRate =
      rate == null || Number.isNaN(Number(rate)) ? null : Number(rate);

    setRows(prev =>
      prev.map(r => {
        if (!ids.includes(r.id)) return r;
        const { _idx, ...rest } = r;
        const payload: CampaignRow = {
          ...(rest as CampaignRow),
          routingRateOverride: cleanRate,
        };
        const recomputed = applyBusinessRules(payload, resolveRate, fallbackRate);
        return { ...recomputed, _idx };
      })
    );
  }, [fallbackRate, resolveRate]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    setRows(prev =>
      prev.map(r => {
        const { _idx, ...rest } = r;
        const recomputed = applyBusinessRules(rest as CampaignRow, resolveRate, fallbackRate);
        return { ...recomputed, _idx };
      })
    );
  }, [fallbackRate, resolveRate]);

  const value = useMemo<Ctx>(
    () => ({
      rows,
      addCampaign,
      updateCampaign,
      removeCampaign,
      resetToMock,       // ahora limpia
      addManyCampaigns,
      importFromCsv,
      setRoutingRateOverride,
    }),
    [rows, addCampaign, updateCampaign, removeCampaign, resetToMock, addManyCampaigns, importFromCsv, setRoutingRateOverride]
  );

  return <CampaignDataContext.Provider value={value}>{children}</CampaignDataContext.Provider>;
}

export function useCampaignData() {
  const ctx = useContext(CampaignDataContext);
  if (!ctx) throw new Error('useCampaignData must be used within CampaignDataProvider');
  return ctx;
}
