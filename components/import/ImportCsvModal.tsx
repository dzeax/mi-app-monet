// components/import/ImportCsvModal.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';                 // ðŸ†• admin guard
import MiniModal from '@/components/ui/MiniModal';
import { useCampaignData } from '@/context/CampaignDataContext';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import type { CampaignRef, PartnerRef, DatabaseRef } from '@/data/reference';
import type { CampaignRow } from '@/types/campaign';

type Draft = Omit<CampaignRow, 'id'>;

type RowState = 'OK' | 'WARN' | 'ERROR';
type RowIssue = { level: RowState; msg: string };

const REQUIRED_HEADERS = [
  'date','campaign','partner','theme','price','type','vSent','qty','database'
] as const;

const OPTIONAL_HEADERS = ['priceCurrency'] as const;

const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

type ToastVariant = 'success' | 'error';

const EMPTY_CAMPAIGNS: CampaignRef[] = [];
const EMPTY_PARTNERS: PartnerRef[] = [];
const EMPTY_DATABASES: DatabaseRef[] = [];
const EMPTY_THEMES: string[] = [];
const DEFAULT_TYPES = ['CPL', 'CPM', 'CPC', 'CPA'] as const;
const INVOICE_OFFICES = ['DAT', 'CAR', 'INT'] as const;
type InvoiceOfficeOption = typeof INVOICE_OFFICES[number];

const toInvoiceOffice = (value: string): InvoiceOfficeOption =>
  (INVOICE_OFFICES as readonly string[]).includes(value)
    ? (value as InvoiceOfficeOption)
    : 'DAT';

function showToast(message: string, opts?: { variant?: ToastVariant; duration?: number }) {
  if (typeof document === 'undefined') return;
  const hostId = 'monet-toasts-host';
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '9999';
    host.style.display = 'grid';
    host.style.gap = '8px';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);
  }

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto select-none rounded-lg border px-3 py-2 shadow-xl text-sm';
  toast.style.borderColor = 'var(--color-border)';
  toast.style.background = 'var(--color-surface)';
  toast.style.color = 'var(--color-text)';
  toast.style.transition = 'transform 180ms ease, opacity 180ms ease';
  toast.style.transform = 'translateY(8px)';
  toast.style.opacity = '0';
  toast.style.maxWidth = '360px';
  toast.textContent = message;

  if (opts?.variant === 'error') {
    toast.style.outline = '1px solid #ff6b6b55';
    toast.style.boxShadow = '0 10px 30px rgba(239,68,68,0.12)';
  } else if (opts?.variant === 'success') {
    toast.style.outline = '1px solid rgba(16,185,129,.25)';
    toast.style.boxShadow = '0 10px 30px rgba(16,185,129,.12)';
  }

  host.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0px)';
    toast.style.opacity = '1';
  });

  const duration = opts?.duration ?? 3200;
  window.setTimeout(() => {
    toast.style.transform = 'translateY(8px)';
    toast.style.opacity = '0';
    window.setTimeout(() => {
      toast.remove();
      if (host && host.children.length === 0) host.remove();
    }, 200);
  }, duration);
}

/* =======================
   Utils
   ======================= */

function parseNum(v: unknown): number {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\s/g, '');
  s = s.replace(/[^\d,.\-]/g, '');

  if (s === '' || s === '-' || s === ',' || s === '.') return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(d: string): string | null {
  const s = (d || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const t = new Date(s);
  if (isNaN(t.getTime())) return null;
  return t.toISOString().slice(0, 10);
}

// CSV parser con autodetecciÃ³n de delimitador
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = lines[0];
  const delim = detectDelimiter(firstLine);

  const headers = splitCSVLine(firstLine, delim).map(h => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], delim);
    if (cols.length === 1 && cols[0].trim() === '') continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function detectDelimiter(sample: string): string {
  const count = (d: string) => {
    let c = 0, inQ = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') {
        if (inQ && sample[i + 1] === '"') { i++; continue; }
        inQ = !inQ;
      } else if (!inQ && ch === d) c++;
    }
    return c;
  };
  const candidates: readonly string[] = [',',';','\t'];
  let best = candidates[0], bestCount = -1;
  for (const d of candidates) {
    const n = count(d);
    if (n > bestCount) { best = d; bestCount = n; }
  }
  return best;
}

function splitCSVLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === d && !inQuotes) { out.push(cur); cur = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !inQuotes) { continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// Lectura case-insensitive de celdas
function getCI(obj: Record<string, string>, key: string): string {
  const target = key.trim().toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.trim().toLowerCase() === target) return obj[k];
  }
  return '';
}

/* =======================
   Componente
   ======================= */
export default function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useAuth();                                  // ðŸ†•
  const { refresh } = useCampaignData();

  const catalogs = useCatalogOverrides();
  const CAMPAIGNS = catalogs?.CAMPAIGNS ?? EMPTY_CAMPAIGNS;
  const PARTNERS = catalogs?.PARTNERS ?? EMPTY_PARTNERS;
  const DATABASES = catalogs?.DATABASES ?? EMPTY_DATABASES;
  const THEMES = catalogs?.THEMES ?? EMPTY_THEMES;
  const TYPES = catalogs?.TYPES ?? [...DEFAULT_TYPES];
  const resolveInvoiceOfficeMerged = catalogs?.resolveInvoiceOfficeMerged ?? (() => 'DAT');

  // ðŸ”’ Guard: solo admins pueden importar
  // archivo + datos parseados
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);

  // preview
  const [issues, setIssues] = useState<RowIssue[][]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const headerOk = useMemo(() => {
    const hset = new Set(rawHeaders.map(h => h.trim().toLowerCase()));
    return REQUIRED_HEADERS.every(h => hset.has(h.toLowerCase()));
  }, [rawHeaders]);

  // Helpers de catÃ¡logo
  const normalizeKey = (value: string) => value.trim().toLowerCase();
  const findCampaign = (name: string) =>
    CAMPAIGNS.find((campaign) => normalizeKey(campaign.name) === normalizeKey(name));
  const partnerExists = (name: string) =>
    PARTNERS.some((partner) => normalizeKey(partner.name) === normalizeKey(name));
  const findDatabase = (name: string) =>
    DATABASES.find((db) => normalizeKey(db.name) === normalizeKey(name));
  const themeExists = (name: string) =>
    THEMES.some((theme) => normalizeKey(theme) === normalizeKey(name));
  const typeExists = (name: string) =>
    TYPES.some((type) => normalizeKey(type) === normalizeKey(name));

  // Parse + validar
  useEffect(() => {
    if (!isAdmin) {
      setIssues([]);
      setDrafts([]);
      return;
    }
    if (!rawRows.length || !headerOk) { setIssues([]); setDrafts([]); return; }

    const nextDrafts: Draft[] = [];
    const nextIssues: RowIssue[][] = [];

    for (const row of rawRows) {
      const rowIssues: RowIssue[] = [];

      const date = normalizeDate(getCI(row, 'date'));
      if (!date) rowIssues.push({ level: 'ERROR', msg: 'Fecha invÃ¡lida' });

      const campaign = (getCI(row, 'campaign') || '').trim();
      if (!campaign) rowIssues.push({ level: 'ERROR', msg: 'Campaign requerida' });
      const cRef = findCampaign(campaign);
      if (!cRef) rowIssues.push({ level: 'ERROR', msg: 'Campaign no existe en catÃ¡logo' });
      const advertiser = cRef?.advertiser || '';

      const partner = (getCI(row, 'partner') || '').trim();
      if (!partner) rowIssues.push({ level: 'ERROR', msg: 'Partner requerido' });
      if (partner && !partnerExists(partner)) rowIssues.push({ level: 'ERROR', msg: 'Partner no existe en catÃ¡logo' });

      const theme = (getCI(row, 'theme') || '').trim();
      if (!theme) rowIssues.push({ level: 'ERROR', msg: 'Theme requerido' });
      if (theme && !themeExists(theme)) rowIssues.push({ level: 'ERROR', msg: 'Theme no existe en catÃ¡logo' });

      const type = (getCI(row, 'type') || '').trim();
      if (!type) rowIssues.push({ level: 'ERROR', msg: 'Type requerido' });
      if (type && !typeExists(type)) rowIssues.push({ level: 'ERROR', msg: 'Type no existe en catÃ¡logo' });

      const price = parseNum(getCI(row, 'price'));
      if (price < 0) rowIssues.push({ level: 'ERROR', msg: 'Price < 0' });

      const vSent = parseNum(getCI(row, 'vSent'));
      if (vSent < 0) rowIssues.push({ level: 'ERROR', msg: 'vSent < 0' });
      if (vSent === 0) rowIssues.push({ level: 'WARN', msg: 'vSent = 0' });

      const qty = parseNum(getCI(row, 'qty'));
      if (qty < 0) rowIssues.push({ level: 'ERROR', msg: 'qty < 0' });

      const database = (getCI(row, 'database') || '').trim();
      if (!database) rowIssues.push({ level: 'ERROR', msg: 'Database requerida' });
      const dbRef = findDatabase(database);
      if (!dbRef) rowIssues.push({ level: 'ERROR', msg: 'Database no existe en catÃ¡logo' });

      const rawCurrency = (getCI(row, 'priceCurrency') || 'EUR').trim().toUpperCase() || 'EUR';
      const priceCurrency: CampaignRow['priceCurrency'] = rawCurrency === 'EUR' ? 'EUR' : 'EUR';
      if (rawCurrency !== 'EUR') {
        rowIssues.push({ level: 'WARN', msg: `priceCurrency "${rawCurrency}" no soportado. Se forzará a EUR.` });
      }

      const geo = dbRef?.geo ?? '';
      const databaseType: CampaignRow['databaseType'] = dbRef?.dbType ?? 'B2C';
      const invoiceOfficeValue = resolveInvoiceOfficeMerged(geo || undefined, partner || undefined);
      const invoiceOffice: CampaignRow['invoiceOffice'] = toInvoiceOffice(invoiceOfficeValue);

      const routingCosts = Number(((vSent / 1000) * 0.18).toFixed(2));
      const turnover = Number((qty * price).toFixed(2));
      const margin = Number((turnover - routingCosts).toFixed(2));
      const ecpm = Number((vSent > 0 ? (turnover / vSent) * 1000 : 0).toFixed(2));

      const draft: Draft = {
        date: date || '',
        campaign,
        advertiser,
        invoiceOffice,
        partner,
        theme,
        price,
        priceCurrency,
        type: type as CampaignRow['type'],
        vSent,
        routingCosts,
        qty,
        turnover,
        margin,
        ecpm,
        database,
        geo,
        databaseType,
      };

      nextDrafts.push(draft);
      nextIssues.push(rowIssues);
    }

    setDrafts(nextDrafts);
    setIssues(nextIssues);
  }, [isAdmin, rawRows, headerOk]); // eslint-disable-line

  const totals = useMemo(() => {
    let ok = 0, warn = 0, err = 0;
    let vSent = 0, turnover = 0, margin = 0, wEcpm = 0;
    drafts.forEach((d, i) => {
      const rowErr = issues[i]?.some(x => x.level === 'ERROR');
      const rowWarn = !rowErr && issues[i]?.some(x => x.level === 'WARN');
      if (rowErr) err++; else if (rowWarn) warn++; else ok++;
      vSent += d.vSent || 0;
      turnover += d.turnover || 0;
      margin += d.margin || 0;
      wEcpm += (d.ecpm || 0) * (d.vSent || 0);
    });
    const ecpm = vSent > 0 ? wEcpm / vSent : 0;
    return { ok, warn, err, vSent, turnover, margin, ecpm };
  }, [drafts, issues]);

  const canImport = drafts.length > 0 && totals.err === 0;

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      setRawHeaders(parsed.headers);
      setRawRows(parsed.rows);
    } finally {
      setParsing(false);
    }
  }, []);

  function onPickFile() { inputRef.current?.click(); }
  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    await handleFile(file);
  }

  // Dropzone
  function onDropFile(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void handleFile(file);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault(); }

  async function doImport() {
    if (!canImport) return;
    try {
      setImporting(true);
      const response = await fetch('/api/campaigns/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: drafts,
          options: { upsertBy: 'composite' },
        }),
      });

      const raw = await response.json().catch(() => ({}));
      const payload: Record<string, unknown> =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

      if (!response.ok) {
        const errorMsg = payload['error'];
        const message = typeof errorMsg === 'string' ? errorMsg : 'Import failed.';
        showToast(message, { variant: 'error' });
        return;
      }

      const processed = typeof payload['total'] === 'number' ? (payload['total'] as number) : drafts.length;
      const duplicates = typeof payload['duplicates'] === 'number' ? (payload['duplicates'] as number) : 0;
      showToast(`Import done Â· Processed: ${processed} Â· Duplicates skipped: ${duplicates}`, {
        variant: 'success',
      });
      await refresh();
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Import failed. See console for details.', { variant: 'error' });
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const headers = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS].join(',');
    const sample = [
      headers,
      '2025-01-15,Winter Sale,Partner A,Retail,1.2,CPL,100000,8000,DB_ES,EUR'
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'campaigns_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // === Responsive modal width: compacto vs preview ===
  const preview = headerOk && drafts.length > 0;
  const modalWidthClass = preview
    ? 'w-full max-w-[min(95vw,1400px)]'
    : 'w-full max-w-[720px]';

  // === Fades locales para overflow-x del Ã¡rea de tabla ===
  const hWrapRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  function updateHFades() {
    const el = hWrapRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 1);
  }
  useEffect(() => {
    if (!isAdmin) return;
    const el = hWrapRef.current;
    if (!el) return;
    updateHFades();
    el.addEventListener('scroll', updateHFades);
    window.addEventListener('resize', updateHFades);
    return () => {
      el.removeEventListener('scroll', updateHFades);
      window.removeEventListener('resize', updateHFades);
    };
  }, [isAdmin, preview]);

  /* =======================
     UI
     ======================= */
  if (!isAdmin) {
    return (
      <MiniModal
        title="Import from CSV"
        onClose={onClose}
        solid={false}
        footer={<button className="btn-primary" onClick={onClose}>Close</button>}
      >
        <div className="p-2 text-sm">
          This action is restricted to <strong>admins</strong>. If you think this is a mistake, please contact an administrator.
        </div>
      </MiniModal>
    );
  }

  return (
    <MiniModal
      title="Import from CSV"
      onClose={onClose}
      widthClass={modalWidthClass}
      solid={false}
      headerClassName="modal-chrome py-2.5"
      footerClassName="modal-chrome py-2.5"
      accentStrip
      /* edgeFades quitado aquÃ­ para que no oscurezca todo el body */
      footer={(
        <>
          <button className="btn-ghost" onClick={downloadTemplate}>Download template</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            disabled={!canImport || importing}
            onClick={doImport}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {importing ? 'Importingâ€¦' : `Import ${totals.ok + totals.warn} rows`}
          </button>
        </>
      )}
    >
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".csv,text/csv"
        onChange={onFileChange}
      />

      {/* Uploader / Dropzone */}
      <div className="grid gap-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Select or drop a CSV file"
          onDragOver={onDragOver}
          onDrop={onDropFile}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickFile(); }
          }}
          className="rounded-lg border border-[--color-border] p-3 flex items-center justify-between
                     bg-[color:var(--color-surface)] outline-none transition
                     hover:shadow-md focus:shadow-md"
        >
          <div className="text-sm">
            <div className="font-medium">CSV file</div>
            <div className="opacity-70" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fileName || (parsing ? 'Parsingâ€¦' : 'No file selected')}
            </div>
          </div>
          <button className="btn-ghost" onClick={onPickFile} disabled={parsing}>
            {parsing ? 'Parsingâ€¦' : 'Select CSV'}
          </button>
        </div>

        {/* Headers check */}
        {rawHeaders.length > 0 && (
          <div
            className={`rounded-lg border p-3 ${
              headerOk
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-[--color-accent]/40 bg-[--color-accent]/10'
            }`}
          >
            <div className="text-sm font-medium mb-1">Headers detected</div>
            <div className="text-xs opacity-80 break-words">{rawHeaders.join(', ')}</div>
            {!headerOk && (
              <div className="text-xs mt-2">
                Missing required headers:{' '}
                <strong>
                  {REQUIRED_HEADERS
                    .filter(h => !rawHeaders.map(x=>x.trim().toLowerCase()).includes(h.toLowerCase()))
                    .join(', ')}
                </strong>
              </div>
            )}
          </div>
        )}

        {/* Preview & summary */}
        {preview && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Stat label="Rows" value={drafts.length} />
              <Stat label="OK" value={totals.ok} />
              <Stat label="Warnings" value={totals.warn} />
              <Stat label="Errors" value={totals.err} />
              <Stat label="Turnover" value={fmtEUR.format(totals.turnover)} />
            </div>

            <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface)]">
              {/* Wrapper relativo para los fades locales */}
              <div className="relative">
                <div ref={hWrapRef} className="overflow-x-auto">
                  {/* Header */}
                  <table className="w-full min-w-[1000px] lg:min-w-[1200px] xl:min-w-[1400px] text-sm">
                    <thead className="bg-[color:var(--color-surface-2)]/60">
                      <tr>
                        <Th>State</Th>
                        <Th>Date</Th>
                        <Th>Campaign</Th>
                        <Th>Partner</Th>
                        <Th>Theme</Th>
                        <Th>Type</Th>
                        <Th className="text-right">Price</Th>
                        <Th className="text-right">QTY</Th>
                        <Th className="text-right">V Sent</Th>
                        <Th>Database</Th>
                        <Th>GEO</Th>
                        <Th>DB Type</Th>
                        <Th className="text-right">Turnover</Th>
                        <Th className="text-right">Margin</Th>
                        <Th className="text-right">eCPM</Th>
                      </tr>
                    </thead>
                  </table>

                  {/* Body (scroll) */}
                  <div className="max-h-[50vh] overflow-y-auto">
                    <div className="min-w-[1000px] lg:min-w-[1200px] xl:min-w-[1400px] divide-y divide-[--color-border]/60">
                      {drafts.map((d, i) => {
                        const isErr = issues[i]?.some(x => x.level === 'ERROR');
                        const isWarn = !isErr && issues[i]?.some(x => x.level === 'WARN');
                        const badge =
                          isErr ? <Badge className="bg-[--color-accent]/15 text-[--color-accent] border border-[--color-accent]/30">ERROR</Badge> :
                          isWarn ? <Badge className="bg-amber-500/12 text-amber-700 border border-amber-300/60">WARN</Badge> :
                          <Badge className="bg-emerald-500/12 text-emerald-700 border border-emerald-300/60">OK</Badge>;

                        return (
                          <div
                            key={i}
                            className="grid grid-cols-[auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto] gap-3 px-3 py-2 items-center hover:bg-black/[0.03] transition-colors"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            <div>{badge}</div>
                            <Cell>{d.date}</Cell>
                            <Cell>{d.campaign}</Cell>
                            <Cell>{d.partner}</Cell>
                            <Cell>{d.theme}</Cell>
                            <Cell>{d.type}</Cell>
                            <Cell className="text-right">{d.price.toFixed(2)}</Cell>
                            <Cell className="text-right">{d.qty}</Cell>
                            <Cell className="text-right">{d.vSent}</Cell>
                            <Cell>{d.database}</Cell>
                            <Cell>{d.geo}</Cell>
                            <Cell>{d.databaseType || 'â€”'}</Cell>
                            <Cell className="text-right">{d.turnover.toFixed(2)}</Cell>
                            <Cell
                              className={`text-right ${
                                d.margin > 0 ? 'text-[--color-primary]' :
                                d.margin < 0 ? 'text-[--color-accent]' : ''
                              }`}
                            >
                              {d.margin.toFixed(2)}
                            </Cell>
                            <Cell className="text-right">{d.ecpm.toFixed(2)}</Cell>

                            {(issues[i] && issues[i].length > 0) && (
                              <div className="col-span-full text-xs opacity-80 -mt-1">
                                {issues[i].map((it, k) => (
                                  <span
                                    key={k}
                                    className="inline-block mr-2 mt-1 px-1.5 py-0.5 rounded border border-[--color-border] bg-[color:var(--color-surface)]"
                                  >
                                    {it.level}: {it.msg}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {drafts.length === 0 && (
                        <div className="px-3 py-5 text-sm opacity-70">No rows.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fades locales solo si hay overflow-x */}
                {showLeftFade && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-6
                               bg-gradient-to-r from-[color:var(--color-surface)] to-transparent"
                  />
                )}
                {showRightFade && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 w-6
                               bg-gradient-to-l from-[color:var(--color-surface)] to-transparent"
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </MiniModal>
  );
}

/* =======================
   Subcomponentes
   ======================= */
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left font-medium px-3 py-2 border-b border-[--color-border]/60 ${className}`}>
      {children}
    </th>
  );
}
function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}>{children}</div>;
}
function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[color:var(--color-surface)]/70 p-3">
      <div className="text-xs uppercase text-[color:var(--color-text)]/65">{label}</div>
      <div className="text-xl font-semibold mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {String(value)}
      </div>
    </div>
  );
}
