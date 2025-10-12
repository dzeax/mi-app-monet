// data/reference.ts
import { z } from 'zod';
import rawCampaigns from './catalogs/campaigns.json';
import rawPartners from './catalogs/partners.json';
import rawDatabases from './catalogs/databases.json';
import rawRules from './catalogs/invoice_rules.json';
import rawThemes from './catalogs/themes.json';

// ---------------- Constantes (tuplas as const) ----------------
export const DB_TYPES = ['B2B', 'B2C', 'Mixed'] as const;
export const INVOICE_OFFICES = ['CAR', 'DAT', 'INT'] as const;
export const TYPES = ['CPL', 'CPM', 'CPC', 'CPA'] as const;

// ---------------- Tipos base ----------------
export type DBType = 'B2C' | 'B2B' | 'Mixed';
export type InvoiceOffice = 'CAR' | 'DAT' | 'INT';

export type CampaignRef = { id: string; name: string; advertiser: string };

export type PartnerRef = {
  id: string;                          // slug estable
  name: string;                        // visible en UI
  defaultInvoiceOffice: InvoiceOffice; // fallback si no hay regla por GEO/partner
  isInternal?: boolean;                // flag si viene "Internal"/"INT" en la fuente
};

export type DatabaseRef = { id: string; name: string; geo: string; dbType: DBType };
export type ThemeRef = { id: string; label: string };

// ---------------- Utils (funciones hoisted) ----------------
export function trimCollapse(s: string) {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}
export function toSlug(s: string) {
  return (s ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60);
}
function norm(s?: string) {
  return (s ?? '').trim().toLowerCase();
}

// ---------------- THEMES (JSON) ----------------
const ThemeInZ = z.object({ label: z.string() });
type ThemeIn = z.infer<typeof ThemeInZ>;

function normalizeThemes(input: unknown): ThemeRef[] {
  const parsed = z.array(ThemeInZ).parse(input);

  const seen = new Set<string>();
  const out: ThemeRef[] = [];

  for (const r of parsed) {
    const label = trimCollapse(r.label);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue; // dedupe case-insensitive
    seen.add(key);

    const base = toSlug(label) || 'theme';
    let id = base, n = 2;
    while (out.some(t => t.id === id)) id = `${base}-${n++}`;

    out.push({ id, label });
  }

  // Orden alfabético, dejando "Unknown" al final si existe
  out.sort((a, b) => {
    const ax = a.label.toLowerCase() === 'unknown';
    const bx = b.label.toLowerCase() === 'unknown';
    if (ax && !bx) return 1;
    if (!ax && bx) return -1;
    return a.label.localeCompare(b.label, 'es');
  });

  return out;
}

export const THEMES_META: ThemeRef[] = normalizeThemes(rawThemes);
export const THEMES: string[] = THEMES_META.map(t => t.label);

// ---------------- CAMPAIGNS (JSON) ----------------
const CampaignInZ = z.object({ name: z.string(), advertiser: z.string() });
type CampaignIn = z.infer<typeof CampaignInZ>;

function normalizeCampaigns(input: unknown): CampaignRef[] {
  const parsed = z.array(CampaignInZ).parse(input);

  const used = new Set<string>();
  const rows = parsed.map((r) => {
    const name = trimCollapse(r.name);
    const advertiser = trimCollapse(r.advertiser);
    const base = toSlug(name) || toSlug(`${name}-${advertiser || 'wl'}`) || 'campaign';
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return { id, name, advertiser };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return rows;
}

export const CAMPAIGNS: CampaignRef[] = normalizeCampaigns(rawCampaigns);

// ---------------- PARTNERS (JSON) ----------------
const PartnerInZ = z.object({
  name: z.string(),
  invoiceOffice: z.string(), // puede venir "Internal", "CAR", "DAT"
});
type PartnerIn = z.infer<typeof PartnerInZ>;

function mapInvoiceOffice(s: string): { office: InvoiceOffice; isInternal?: boolean } {
  const v = norm(s);
  if (v === 'car') return { office: 'CAR' };
  if (v === 'dat') return { office: 'DAT' };
  if (v === 'internal' || v === 'int') return { office: 'INT', isInternal: true };
  // fallback prudente
  return { office: 'DAT' };
}

function normalizePartners(input: unknown): PartnerRef[] {
  const parsed = z.array(PartnerInZ).parse(input);
  const used = new Set<string>();
  const out: PartnerRef[] = [];

  for (const r of parsed) {
    const name = trimCollapse(r.name);
    const base = toSlug(name) || 'partner';
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);

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

export const PARTNERS: PartnerRef[] = normalizePartners(rawPartners);

// ---------------- DATABASES (JSON) ----------------
const DatabaseInZ = z.object({
  id: z.string(),
  name: z.string(),
  geo: z.string(),                         // tal cual (ES, FR, UK, MULTI, etc.)
  dbType: z.enum(DB_TYPES),
});
type DatabaseIn = z.infer<typeof DatabaseInZ>;

function normalizeDatabases(input: unknown): DatabaseRef[] {
  const parsed = z.array(DatabaseInZ).parse(input);
  return parsed
    .map(d => ({ ...d, name: trimCollapse(d.name), geo: trimCollapse(d.geo).toUpperCase() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export const DATABASES: DatabaseRef[] = normalizeDatabases(rawDatabases);

// ---------------- REGLAS de invoice (JSON) ----------------
const RuleInZ = z.object({
  geo: z.string().optional(),
  partner: z.string().optional(), // por nombre o id; resolvemos abajo
  office: z.enum(INVOICE_OFFICES),
});
type RuleIn = z.infer<typeof RuleInZ>;

export type InvoiceRule = { geo?: string; partner?: string; invoiceOffice: InvoiceOffice };

function normalizeRules(input: unknown): InvoiceRule[] {
  const parsed = z.array(RuleInZ).parse(input);
  // Guardamos tal cual; la resolución hará el matching por id o nombre.
  return parsed.map(r => ({ geo: r.geo, partner: r.partner, invoiceOffice: r.office }));
}

export const INVOICE_RULES: InvoiceRule[] = normalizeRules(rawRules);

// ---------------- Resolución de Invoice Office ----------------
// Precedencia:
// 1) Regla exacta geo+partner
// 2) Regla por partner (sin geo)
// 3) Default del partner
// 4) Regla por geo (sin partner)
// 5) Fallback DAT
export function resolveInvoiceOffice(geo?: string, partnerNameOrId?: string): InvoiceOffice {
  const g = norm(geo);
  const pRaw = norm(partnerNameOrId);

  // Localiza partner por id o por nombre (soportamos ambos)
  const partnerObj = PARTNERS.find(pp => norm(pp.id) === pRaw || norm(pp.name) === pRaw);
  const pByName = partnerObj ? norm(partnerObj.name) : pRaw;
  const pById = partnerObj ? norm(partnerObj.id) : pRaw;

  const matchGeo = (rg?: string) => !!rg && norm(rg) === g;
  const matchPartner = (rp?: string) => {
    if (!rp) return false;
    const rpNorm = norm(rp);
    // match por nombre o por id
    return rpNorm === pByName || rpNorm === pById;
  };

  // Solo reglas con al menos una condición
  const rules = INVOICE_RULES.filter(r => !!(r.geo || r.partner));

  // 1) geo+partner
  const exact = rules.find(r => matchGeo(r.geo) && matchPartner(r.partner));
  if (exact) return exact.invoiceOffice;

  // 2) solo partner
  const byPartner = rules.find(r => !r.geo && matchPartner(r.partner));
  if (byPartner) return byPartner.invoiceOffice;

  // 3) default del partner
  if (partnerObj?.defaultInvoiceOffice) return partnerObj.defaultInvoiceOffice;

  // 4) solo geo
  const byGeo = rules.find(r => matchGeo(r.geo) && !r.partner);
  if (byGeo) return byGeo.invoiceOffice;

  // 5) fallback
  return 'DAT';
}

// Alias opcional por legibilidad — mismo comportamiento
export const resolveInvoiceOfficeMerged = resolveInvoiceOffice;

// ---------------- Helpers ----------------
export function findCampaignByName(name?: string) {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return undefined;
  return CAMPAIGNS.find(c => c.name.toLowerCase() === n)
      ?? CAMPAIGNS.find(c => toSlug(c.name) === toSlug(n));
}
export function findPartnerByName(name?: string) {
  const n = norm(name);
  return PARTNERS.find(p => norm(p.name) === n);
}
export function findPartnerById(id?: string) {
  const i = norm(id);
  return PARTNERS.find(p => norm(p.id) === i);
}
export function findDatabaseByName(name?: string) {
  const n = norm(name);
  return DATABASES.find(d => norm(d.name) === n);
}
export function findDatabaseById(id?: string) {
  const i = norm(id);
  return DATABASES.find(d => norm(d.id) === i);
}
