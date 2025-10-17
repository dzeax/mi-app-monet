'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CAMPAIGNS as BASE_CAMPAIGNS,
  PARTNERS as BASE_PARTNERS,
  DATABASES as BASE_DATABASES,
  THEMES as BASE_THEMES,
  TYPES as BASE_TYPES,
  INVOICE_RULES,
} from '@/data/reference';
import type {
  CampaignRef,
  PartnerRef,
  DatabaseRef,
  DBType,
  InvoiceOffice,
  InvoiceRule,
} from '@/data/reference';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useAuth } from '@/context/AuthContext';

/* ============================== Normalización ============================== */
type CampaignIn = { name: string; advertiser?: string };
type PartnerIn  = { name: string; invoiceOffice: string };
type DatabaseIn = { id?: string; name: string; geo: string; dbType: DBType };

type OverridesShape = {
  campaigns?: CampaignIn[];
  partners?: PartnerIn[];
  databases?: DatabaseIn[];
  themes?: string[] | { label: string }[];
  types?: string[];
};

function trimCollapse(s: string) {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}
function norm(s?: string) {
  return (s ?? '').trim().toLowerCase();
}
function toSlug(s?: string) {
  const x = (s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return x || 'item';
}
function mapInvoiceOffice(s: string): { office: InvoiceOffice; isInternal?: boolean } {
  const v = norm(s);
  if (v === 'car') return { office: 'CAR' };
  if (v === 'dat') return { office: 'DAT' };
  if (v === 'internal' || v === 'int') return { office: 'INT', isInternal: true };
  return { office: 'DAT' };
}

/** ===== GEO estricto: ISO-3166-1 alpha-2 + MULTI, con alias UK→GB ===== */
function isIsoCountry(code: string): boolean {
  const c = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return false;
  try {
    const dn = new (Intl as any).DisplayNames(['en'], { type: 'region' });
    const name = dn?.of?.(c);
    return typeof name === 'string' && name && name !== c;
  } catch {
    return false;
  }
}
function normalizeGeoStrict(raw?: string): string | null {
  const g = trimCollapse(raw || '').toUpperCase();
  if (!g) return null;
  if (g === 'MULTI') return 'MULTI';
  const mapped = g === 'UK' ? 'GB' : g;
  return isIsoCountry(mapped) ? mapped : null;
}

function normalizeOverrides(raw: any): OverridesShape {
  const out: OverridesShape = {};
  if (Array.isArray(raw?.campaigns)) {
    out.campaigns = raw.campaigns
      .map((c: any) => ({
        name: trimCollapse(c?.name || ''),
        advertiser: trimCollapse(c?.advertiser || 'White Label'),
      }))
      .filter((c: any) => !!c.name);
  }
  if (Array.isArray(raw?.partners)) {
    out.partners = raw.partners
      .map((p: any) => ({
        name: trimCollapse(p?.name || ''),
        invoiceOffice: (p?.invoiceOffice || 'DAT') as string,
      }))
      .filter((p: any) => !!p.name);
  }
  if (Array.isArray(raw?.databases)) {
    out.databases = raw.databases
      .map((d: any) => {
        const name = trimCollapse(d?.name || '');
        const geoNorm = normalizeGeoStrict(d?.geo);
        return {
          id: trimCollapse(d?.id || ''),
          name,
          geo: geoNorm ?? '',
          dbType: (d?.dbType || 'B2C') as DBType,
        };
      })
      .filter((d: any) => !!d.name && !!normalizeGeoStrict(d.geo));
  }
  if (Array.isArray(raw?.themes)) {
    out.themes = raw.themes
      .map((t: any) => (typeof t === 'string' ? trimCollapse(t) : trimCollapse(t?.label || '')))
      .filter((t: string) => !!t);
  }
  if (Array.isArray(raw?.types)) {
    out.types = raw.types
      .map((t: any) => trimCollapse(String(t || '')).toUpperCase())
      .filter((t: string) => !!t);
  }
  return out;
}

function hasAnyOverrides(o?: OverridesShape): boolean {
  if (!o) return false;
  return Boolean(
    (Array.isArray(o.campaigns) && o.campaigns.length) ||
    (Array.isArray(o.partners) && o.partners.length) ||
    (Array.isArray(o.databases) && o.databases.length) ||
    (Array.isArray(o.themes as any) && (o.themes as any).length) ||
    (Array.isArray(o.types) && o.types.length)
  );
}

/* ============================== Merge helpers ============================== */
function mergeCampaigns(base: CampaignRef[], adds: CampaignIn[] = []): CampaignRef[] {
  const out = [...base.map((c) => ({ ...c }))];
  const usedIds = new Set(out.map((c) => c.id));
  const seenNames = new Set(out.map((c) => norm(c.name)));

  for (const r of adds) {
    const name = trimCollapse(r.name);
    if (!name) continue;
    const key = norm(name);
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    const advertiser = trimCollapse(r.advertiser || 'White Label');
    let id = toSlug(name);
    let n = 2;
    while (usedIds.has(id)) id = `${id}-${n++}`;
    usedIds.add(id);

    out.push({ id, name, advertiser });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return out;
}

function mergePartners(base: PartnerRef[], adds: PartnerIn[] = []): PartnerRef[] {
  const out = [...base.map((p) => ({ ...p }))];
  const usedIds = new Set(out.map((p) => p.id));
  const seenNames = new Set(out.map((p) => norm(p.name)));

  for (const r of adds) {
    const name = trimCollapse(r.name);
    if (!name) continue;
    const key = norm(name);
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    const baseId = toSlug(name);
    let id = baseId;
    let n = 2;
    while (usedIds.has(id)) id = `${baseId}-${n++}`;
    usedIds.add(id);

    const { office, isInternal } = mapInvoiceOffice(r.invoiceOffice);
    out.push({
      id,
      name,
      defaultInvoiceOffice: office,
      ...(isInternal ? { isInternal: true } : {}),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return out;
}

function mergeDatabases(base: DatabaseRef[], adds: DatabaseIn[] = []): DatabaseRef[] {
  const out = [...base.map((d) => ({ ...d }))];
  const usedIds = new Set(out.map((d) => d.id));
  const seen = new Set(out.map((d) => norm(d.name)));

  for (const r of adds) {
    const name = trimCollapse(r.name);
    if (!name) continue;
    const key = norm(name);
    if (seen.has(key)) continue;

    const geoStrict = normalizeGeoStrict(r.geo);
    if (!geoStrict) continue;

    // ID autogenerado (o normalizado si viene)
    const baseId = toSlug(r.id ? r.id : name);
    let id = baseId || 'db';
    let n = 2;
    while (usedIds.has(id)) id = `${baseId}-${n++}`;

    usedIds.add(id);
    seen.add(key);

    out.push({
      id,
      name,
      geo: geoStrict,
      dbType: r.dbType,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return out;
}

function mergeThemes(base: string[], adds: (string | { label: string })[] = []): string[] {
  const out = new Set(base);
  for (const t of adds) {
    const label = typeof t === 'string' ? t : t?.label;
    const v = trimCollapse(label || '');
    if (!v) continue;
    out.add(v);
  }
  const arr = [...out];
  arr.sort((a, b) => {
    const ax = a.toLowerCase() === 'unknown';
    const bx = b.toLowerCase() === 'unknown';
    if (ax && !bx) return 1;
    if (!ax && bx) return -1;
    return a.localeCompare(b, 'es');
  });
  return arr;
}

function mergeTypes(base: readonly string[], adds: string[] = []): string[] {
  const out = new Set<string>(base);
  for (const t of adds) {
    const v = trimCollapse(t).toUpperCase();
    if (!v) continue;
    out.add(v);
  }
  return [...out].sort();
}

/* ====== Resolver de invoice office con reglas + partners fusionados ======= */
function makeResolveInvoiceOffice(rules: InvoiceRule[], partners: PartnerRef[]) {
  return (geo?: string, partnerNameOrId?: string): InvoiceOffice => {
    const g = norm(geo);
    const pRaw = norm(partnerNameOrId);

    const partnerObj =
      partners.find((pp) => norm(pp.id) === pRaw || norm(pp.name) === pRaw) || null;
    const p = partnerObj ? norm(partnerObj.name) : pRaw;

    const rulesEff = rules.filter((r) => !!(r.geo || r.partner));

    const exact = rulesEff.find(
      (r) => r.geo && r.partner && norm(r.geo) === g && norm(r.partner) === p,
    );
    if (exact) return exact.invoiceOffice;

    const byPartner = rulesEff.find((r) => r.partner && !r.geo && norm(r.partner) === p);
    if (byPartner) return byPartner.invoiceOffice;

    if (partnerObj?.defaultInvoiceOffice) return partnerObj.defaultInvoiceOffice;

    const byGeo = rulesEff.find((r) => r.geo && !r.partner && norm(r.geo) === g);
    if (byGeo) return byGeo.invoiceOffice;

    return 'DAT';
  };
}

/* ================================ Contexto ================================= */
export type CatalogsCtx = {
  // Colecciones fusionadas (BASE + overrides compartidos)
  CAMPAIGNS: CampaignRef[];
  PARTNERS: PartnerRef[];
  DATABASES: DatabaseRef[];
  THEMES: string[];
  TYPES: string[];
  resolveInvoiceOfficeMerged: (geo?: string, partner?: string) => InvoiceOffice;

  // CRUD (APIs existentes - compat)
  addCampaignRef: (c: CampaignIn) => void;
  addPartnerRef:  (p: PartnerIn) => void;
  addDatabaseRef: (d: DatabaseIn) => void;
  addTheme: (t: string) => void;
  addType:  (t: string) => void;

  updateCampaignRef: (name: string, patch: Partial<CampaignIn>) => void;
  removeCampaignRef: (name: string) => void;

  updatePartnerRef: (name: string, patch: Partial<PartnerIn>) => void;
  removePartnerRef: (name: string) => void;

  updateDatabaseRef: (name: string, patch: Partial<DatabaseIn>) => void;
  removeDatabaseRef: (name: string) => void;

  removeTheme: (t: string) => void;
  removeType:  (t: string) => void;

  // Info remota
  loading: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  canWriteShared: boolean;
};

const CatalogOverridesContext = createContext<CatalogsCtx | null>(null);

/* ======================= Supabase adapter (tabla única) ====================

  Tabla sugerida en Supabase (SQL):

  create table if not exists catalog_overrides (
    key text primary key,
    data jsonb not null default '{}',
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id)
  );

  -- Para realtime
  alter publication supabase_realtime add table catalog_overrides;

  Usamos la fila con key='global'. Puedes cambiarlo a nivel organización si lo necesitáis.
============================================================================= */

const S_TABLE = 'catalog_overrides';
const S_KEY   = 'global';

export function CatalogOverridesProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isEditor } = useAuth();
  const canWriteShared = Boolean(isAdmin || isEditor);

  const supabase = useMemo(() => createClientComponentClient(), []);

  const [overrides, setOverrides] = useState<OverridesShape>({});
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Para evitar bucles de eco: cuando aplicamos remoto, no disparemos guardado
  const skipNextSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  /* -------------------------- Carga inicial remota ------------------------- */
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setSyncing(true);
        const { data, error } = await supabase
          .from(S_TABLE)
          .select('data, updated_at')
          .eq('key', S_KEY)
          .maybeSingle();

        if (!active) return;

        if (!error && data) {
          const remote = normalizeOverrides(data.data);
          if (hasAnyOverrides(remote)) {
            skipNextSaveRef.current = true;
            setOverrides(remote);
            setLastSyncedAt(data.updated_at ?? new Date().toISOString());
          }
        }
      } catch (err) {
        console.warn('[CatalogOverrides] Failed to fetch shared catalogs:', err);
      } finally {
        if (!active) return;
        setLoading(false);
        setSyncing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  /* --------------------------- Suscripción realtime ------------------------ */
  useEffect(() => {
    const channel = supabase
      .channel('catalog_overrides_global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: S_TABLE, filter: `key=eq.${S_KEY}` },
        (payload) => {
          const row: any = payload.new || payload.record || null;
          if (!row || !row.data) return;
          const remote = normalizeOverrides(row.data);
          if (!hasAnyOverrides(remote)) return; // ignora vacíos para no borrar local
          // Aplicar remoto y evitar eco
          skipNextSaveRef.current = true;
          setOverrides(remote);
          setLastSyncedAt(row.updated_at ?? new Date().toISOString());
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  /* ----------------------------- Guardado remoto --------------------------- */
  const upsertRemote = useCallback(async (data: OverridesShape) => {
    if (!canWriteShared) return; // viewers no escriben
    setSyncing(true);
    try {
      const { error } = await supabase
        .from(S_TABLE)
        .upsert({
          key: S_KEY,
          data,
          updated_by: user?.id ?? null,
        }, { onConflict: 'key' })
        .select()
        .single();
      if (error) throw error as any;
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CatalogOverrides] Failed to sync overrides to remote:', err);
    } finally {
      setSyncing(false);
    }
  }, [supabase, user?.id, canWriteShared]);

  // Debounce: cada cambio local (user action) -> upsert remoto (si procede)
  useEffect(() => {
    if (loading) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!canWriteShared) return; // viewers no suben

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      upsertRemote(overrides);
    }, 300);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [overrides, canWriteShared, upsertRemote, loading]);

  /* -------------------------- Fusionados (memo) ---------------------------- */
  const CAMPAIGNS = useMemo(
    () => mergeCampaigns(BASE_CAMPAIGNS, overrides.campaigns),
    [overrides.campaigns],
  );
  const PARTNERS = useMemo(
    () => mergePartners(BASE_PARTNERS, overrides.partners),
    [overrides.partners],
  );
  const DATABASES = useMemo(
    () => mergeDatabases(BASE_DATABASES, overrides.databases),
    [overrides.databases],
  );
  const THEMES = useMemo(
    () => mergeThemes(BASE_THEMES, overrides.themes as any),
    [overrides.themes],
  );
  const TYPES = useMemo(
    () => mergeTypes(BASE_TYPES, overrides.types),
    [overrides.types],
  );

  const resolveInvoiceOfficeMerged = useMemo(
    () => makeResolveInvoiceOffice(INVOICE_RULES, PARTNERS),
    [PARTNERS],
  );

  /* ---------------------------- Mutadores (compat) ------------------------- */
  const setLocal = useCallback(
    (updater: (prev: OverridesShape) => OverridesShape) => {
      if (loading) return;
      setOverrides(prev => updater(prev));
    },
    [loading],
  );

  const addCampaignRef = useCallback((c: CampaignIn) => {
    setLocal(prev => {
      const list = [...(prev.campaigns || [])];
      const key = norm(c.name);
      const exists =
        list.some((x) => norm(x.name) === key) ||
        CAMPAIGNS.some((x) => norm(x.name) === key);
      if (!exists) {
        list.push({
          name: trimCollapse(c.name),
          advertiser: trimCollapse(c.advertiser || 'White Label'),
        });
      }
      return { ...prev, campaigns: list };
    });
  }, [CAMPAIGNS, setLocal]);

  const addPartnerRef = useCallback((p: PartnerIn) => {
    setLocal(prev => {
      const list = [...(prev.partners || [])];
      const key = norm(p.name);
      const exists =
        list.some((x) => norm(x.name) === key) ||
        PARTNERS.some((x) => norm(x.name) === key);
      if (!exists) {
        list.push({ name: trimCollapse(p.name), invoiceOffice: p.invoiceOffice });
      }
      return { ...prev, partners: list };
    });
  }, [PARTNERS, setLocal]);

  const addDatabaseRef = useCallback((d: DatabaseIn) => {
    setLocal(prev => {
      const list = [...(prev.databases || [])];

      // Dedupe por nombre (case-insensitive)
      const key = norm(d.name);
      const exists =
        list.some((x) => norm(x.name) === key) ||
        DATABASES.some((x) => norm(x.name) === key);
      if (exists) return prev;

      // GEO validado (estricto)
      const geoStrict = normalizeGeoStrict(d.geo);
      if (!geoStrict) {
        console.warn('Invalid GEO ignored in addDatabaseRef:', d.geo);
        return prev;
      }

      // ID autogenerado único (ignora cualquier id externo)
      const usedIds = new Set<string>([
        ...DATABASES.map(db => db.id.toLowerCase()),
        ...list.map(db => (db.id || '').toLowerCase()),
      ]);
      const baseId = toSlug(d.name) || 'db';
      let id = baseId;
      let n = 2;
      while (usedIds.has(id.toLowerCase())) id = `${baseId}-${n++}`;

      list.push({
        id,
        name: trimCollapse(d.name),
        geo: geoStrict,      // UK→GB, permite MULTI
        dbType: d.dbType,
      });
      return { ...prev, databases: list };
    });
  }, [DATABASES, setLocal]);

  const addTheme = useCallback((t: string) => {
    setLocal(prev => {
      const list = Array.isArray(prev.themes) ? [...prev.themes] : [];
      const label = trimCollapse(t);
      if (!label) return prev;
      const exists =
        (list as any[]).some(
          (x) => trimCollapse(typeof x === 'string' ? x : x?.label) === label,
        ) || THEMES.some((v) => v === label);
      if (!exists) (list as any[]).push(label);
      return { ...prev, themes: list as any };
    });
  }, [THEMES, setLocal]);

  const addType = useCallback((t: string) => {
    setLocal(prev => {
      const list = [...(prev.types || [])];
      const v = trimCollapse(t).toUpperCase();
      if (!v) return prev;
      const exists = list.includes(v) || TYPES.includes(v);
      if (!exists) list.push(v);
      return { ...prev, types: list };
    });
  }, [TYPES, setLocal]);

  const updateCampaignRef = useCallback((name: string, patch: Partial<CampaignIn>) => {
    const key = norm(name);
    setLocal(prev => {
      const list = [...(prev.campaigns || [])];
      const idx = list.findIndex((x) => norm(x.name) === key);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          ...(patch.name ? { name: trimCollapse(patch.name) } : {}),
          ...(patch.advertiser ? { advertiser: trimCollapse(patch.advertiser) } : {}),
        };
      } else {
        list.push({
          name: trimCollapse(patch.name || name),
          advertiser: trimCollapse(patch.advertiser || 'White Label'),
        });
      }
      return { ...prev, campaigns: list };
    });
  }, [setLocal]);

  const removeCampaignRef = useCallback((name: string) => {
    const key = norm(name);
    setLocal(prev => ({
      ...prev,
      campaigns: (prev.campaigns || []).filter((x) => norm(x.name) !== key),
    }));
  }, [setLocal]);

  const updatePartnerRef = useCallback((name: string, patch: Partial<PartnerIn>) => {
    const key = norm(name);
    setLocal(prev => {
      const list = [...(prev.partners || [])];
      const idx = list.findIndex((x) => norm(x.name) === key);
      const invoiceOffice = patch.invoiceOffice ?? list[idx]?.invoiceOffice ?? 'DAT';
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          ...(patch.name ? { name: trimCollapse(patch.name) } : {}),
          invoiceOffice,
        };
      } else {
        list.push({ name: trimCollapse(patch.name || name), invoiceOffice });
      }
      return { ...prev, partners: list };
    });
  }, [setLocal]);

  const removePartnerRef = useCallback((name: string) => {
    const key = norm(name);
    setLocal(prev => ({
      ...prev,
      partners: (prev.partners || []).filter((x) => norm(x.name) !== key),
    }));
  }, [setLocal]);

  const updateDatabaseRef = useCallback((name: string, patch: Partial<DatabaseIn>) => {
    const key = norm(name);
    setLocal(prev => {
      const list = [...(prev.databases || [])];
      const idx = list.findIndex((x) => norm(x.name) === key);

      const applyGeo = (g?: string) => {
        if (g == null) return undefined;
        const strict = normalizeGeoStrict(g);
        return strict ?? undefined;
      };

      // Helper para generar ID único si se edita el id
      const makeUniqueId = (desiredBase: string) => {
        const used = new Set<string>([
          ...DATABASES.map(db => db.id.toLowerCase()),
          ...list.map(db => (db.id || '').toLowerCase()),
        ]);
        const baseId = toSlug(desiredBase) || 'db';
        let id = baseId, n = 2;
        while (used.has(id.toLowerCase())) id = `${baseId}-${n++}`;
        return id;
      };

      if (idx >= 0) {
        const next = { ...list[idx] };
        if (patch.name) next.name = trimCollapse(patch.name);
        const g = applyGeo(patch.geo);
        if (g) next.geo = g; // si no es válido, se ignora cambio de GEO
        if (patch.dbType) next.dbType = patch.dbType;
        if (patch.id) next.id = makeUniqueId(patch.id || next.name);
        list[idx] = next;
      } else {
        // Si no existía, creamos nuevo (con validación)
        const nm = trimCollapse(patch.name || name);
        const g = applyGeo(patch.geo || '');
        if (!nm || !g) return prev;
        list.push({
          id: makeUniqueId(patch.id || nm),
          name: nm,
          geo: g,
          dbType: (patch.dbType || 'B2C') as DBType,
        });
      }
      return { ...prev, databases: list };
    });
  }, [DATABASES, setLocal]);

  const removeDatabaseRef = useCallback((name: string) => {
    const key = norm(name);
    setLocal(prev => ({
      ...prev,
      databases: (prev.databases || []).filter((x) => norm(x.name) !== key),
    }));
  }, [setLocal]);

  const removeTheme = useCallback((t: string) => {
    const lbl = trimCollapse(t);
    setLocal(prev => ({
      ...prev,
      themes: (prev.themes || []).filter((x: any) =>
        trimCollapse(typeof x === 'string' ? x : x?.label) !== lbl,
      ),
    }));
  }, [setLocal]);

  const removeType = useCallback((t: string) => {
    const v = trimCollapse(t).toUpperCase();
    setLocal(prev => ({
      ...prev,
      types: (prev.types || []).filter((x) => x !== v),
    }));
  }, [setLocal]);

  const value: CatalogsCtx = {
    CAMPAIGNS,
    PARTNERS,
    DATABASES,
    THEMES,
    TYPES,
    resolveInvoiceOfficeMerged,

    addCampaignRef,
    addPartnerRef,
    addDatabaseRef,
    addTheme,
    addType,

    updateCampaignRef,
    removeCampaignRef,
    updatePartnerRef,
    removePartnerRef,
    updateDatabaseRef,
    removeDatabaseRef,
    removeTheme,
    removeType,

    loading,
    syncing,
    lastSyncedAt,
    canWriteShared,
  };

  return (
    <CatalogOverridesContext.Provider value={value}>
      {children}
    </CatalogOverridesContext.Provider>
  );
}

/** Hook principal */
export function useCatalogs() {
  const ctx = useContext(CatalogOverridesContext);
  if (!ctx) throw new Error('useCatalogs must be used within CatalogOverridesProvider');
  return ctx;
}

/** Alias de compatibilidad */
export function useCatalogOverrides() {
  return useCatalogs();
}
