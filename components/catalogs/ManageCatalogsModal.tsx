'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogs } from '@/context/CatalogOverridesContext';
import RowActions from '@/components/table/RowActions';
import { useAuth } from '@/context/AuthContext'; // 🆕 roles
import { normalizeGeoStrict } from '@/utils/geo'; // 🆕 GEO strict

const PARTNER_OFFICES = ['DAT', 'CAR', 'INT'] as const;
type PartnerOffice = typeof PARTNER_OFFICES[number];

const DB_TYPE_OPTIONS = ['B2B', 'B2C', 'Mixed'] as const;
type DatabaseTypeOption = typeof DB_TYPE_OPTIONS[number];

const toPartnerOffice = (value: string): PartnerOffice =>
  (PARTNER_OFFICES as readonly string[]).includes(value)
    ? (value as PartnerOffice)
    : 'DAT';

const toDatabaseType = (value: string): DatabaseTypeOption =>
  (DB_TYPE_OPTIONS as readonly string[]).includes(value)
    ? (value as DatabaseTypeOption)
    : 'B2C';

type TabKey = 'campaigns' | 'partners' | 'databases' | 'themes' | 'types';

export default function ManageCatalogsModal({ onClose }: { onClose: () => void }) {
  const {
    CAMPAIGNS, PARTNERS, DATABASES, THEMES, TYPES,
    addCampaignRef, updateCampaignRef, removeCampaignRef,
    addPartnerRef, updatePartnerRef, removePartnerRef,
    addDatabaseRef, updateDatabaseRef, removeDatabaseRef,
    addTheme, removeTheme, addType, removeType,
    loading, syncing, lastSyncedAt, error,
  } = useCatalogs();

  // 🆕 auth/roles
  const auth = useAuth?.();
  const role = (auth?.role as 'admin' | 'editor' | 'viewer' | undefined) ?? (auth?.isAdmin ? 'admin' : auth?.isEditor ? 'editor' : 'viewer');
  const isAdmin = role === 'admin' || !!auth?.isAdmin;
  const isEditor = role === 'editor' || !!auth?.isEditor;
  const canEdit = isAdmin || isEditor;

  const trapRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabKey>('campaigns');

  const canModify = canEdit && !loading && !error;

  // ESC -> cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);


  const statusText = error
    ? 'Sync disabled until shared storage is configured.'
    : loading
      ? 'Loading shared catalogs...'
      : syncing
        ? 'Syncing changes...'
        : lastSyncedAt
          ? `Last synced at ${new Date(lastSyncedAt).toLocaleTimeString()}`
          : '';

  const body = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        ref={trapRef}
        className="relative card w-full max-w-5xl max-h[90vh] max-h-[90vh] overflow-hidden border border-[--color-border] shadow-xl"
        style={{ background: 'var(--color-surface)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header (chrome unificado) */}
        <div className="sticky top-0 z-10 modal-chrome modal-header px-5 py-3">
          <div className="accent-strip" aria-hidden />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              Manage catalogs
              {/* 🆕 insignia de rol */}
              <RolePill role={isAdmin ? 'Admin' : isEditor ? 'Editor' : 'Viewer'} />
            </h3>
            <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Body (con edge fades para scroll) */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 relative">
          <div className="edge-fade edge-top" aria-hidden />

          {/* Avisos */}
          {!canEdit && (
            <div className="rounded-lg border px-3 py-2 text-sm border-sky-500/40 bg-sky-500/10 text-sky-700">
              Read-only. Ask an admin for edit access.
            </div>
          )}
          {loading && (
            <div className="rounded-lg border px-3 py-2 text-sm border-amber-400/40 bg-amber-400/10 text-amber-700">
              Loading shared catalog overrides...
            </div>
          )}
          {error && (
            <div className="rounded-lg border px-3 py-2 text-sm border-[--color-accent]/50 bg-[--color-accent]/10 text-[--color-accent]">
              {error}
            </div>
          )}

          {/* resumen (tiles tipo KPI/subcard) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Campaigns" value={CAMPAIGNS.length} />
            <Stat label="Partners" value={PARTNERS.length} />
            <Stat label="Databases" value={DATABASES.length} />
            <Stat label="Themes" value={THEMES.length} />
            <Stat label="Types" value={TYPES.length} />
          </div>

          {/* tabs (pill/segmented) */}
          <TabBar value={tab} onChange={setTab} />

          {/* panels */}
          {tab === 'campaigns' && (
            <CampaignsPanel
              items={CAMPAIGNS}
              onAdd={(name, advertiser) => {
                if (!canModify) return;
                addCampaignRef({ name, advertiser });
              }}
              onUpdate={(oldName, patch) => {
                if (!canModify) return;
                updateCampaignRef(oldName, patch);
              }}
              onRemove={(name) => {
                if (!canModify) return;
                if (confirm(`Remove override for campaign "${name}"?`)) removeCampaignRef(name);
              }}
              disabled={!canModify}
            />
          )}

          {tab === 'partners' && (
            <PartnersPanel
              items={PARTNERS}
              onAdd={(name, invoiceOffice) => {
                if (!canModify) return;
                addPartnerRef({ name, invoiceOffice });
              }}
              onUpdate={(oldName, patch) => {
                if (!canModify) return;
                updatePartnerRef(oldName, patch);
              }}
              onRemove={(name) => {
                if (!canModify) return;
                if (confirm(`Remove override for partner "${name}"?`)) removePartnerRef(name);
              }}
              disabled={!canModify}
            />
          )}

          {tab === 'databases' && (
            <DatabasesPanel
              items={DATABASES}
              onAdd={(payload) => {
                if (!canModify) return;
                addDatabaseRef(payload);
              }}
              onUpdate={(oldName, patch) => {
                if (!canModify) return;
                updateDatabaseRef(oldName, patch);
              }}
              onRemove={(name) => {
                if (!canModify) return;
                if (confirm(`Remove override for database "${name}"?`)) removeDatabaseRef(name);
              }}
              disabled={!canModify}
            />
          )}

          {tab === 'themes' && (
            <ThemesPanel
              items={THEMES}
              onAdd={(t) => {
                if (!canModify) return;
                addTheme(t);
              }}
              onRemove={(t) => {
                if (!canModify) return;
                if (confirm(`Remove theme "${t}"?`)) removeTheme(t);
              }}
              disabled={!canModify}
            />
          )}

          {tab === 'types' && (
            <TypesPanel
              items={TYPES}
              onAdd={(t) => {
                if (!canModify) return;
                addType(t);
              }}
              onRemove={(t) => {
                if (!canModify) return;
                if (confirm(`Remove type "${t}"?`)) removeType(t);
              }}
              disabled={!canModify}
            />
          )}

          <div className="edge-fade edge-bottom" aria-hidden />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 modal-chrome modal-footer px-5 py-3 flex items-center justify-end gap-2">
          <div className="text-sm mr-auto opacity-70">{statusText}</div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}

/* -------------------------------- UI bits -------------------------------- */

function RolePill({ role }: { role: 'Admin' | 'Editor' | 'Viewer' }) {
  const cls =
    role === 'Admin'
      ? 'bg-emerald-500/12 text-emerald-700 border-emerald-300/60'
      : role === 'Editor'
        ? 'bg-amber-500/12 text-amber-700 border-amber-300/60'
        : 'bg-slate-400/15 text-slate-700 border-slate-300/60';
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {role}
    </span>
  );
}

function TabBar({ value, onChange }: { value: TabKey; onChange: (k: TabKey) => void }) {
  const tabs: { k: TabKey; label: string }[] = [
    { k: 'campaigns', label: 'Campaigns' },
    { k: 'partners',  label: 'Partners'  },
    { k: 'databases', label: 'Databases' },
    { k: 'themes',    label: 'Themes'    },
    { k: 'types',     label: 'Types'     },
  ];

  return (
    <nav className="sticky top-0 z-[1] pt-1" aria-label="Catalog sections">
      <div className="segmented">
        {tabs.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={value === k}
            className="segmented-tab"
            onClick={() => onChange(k)}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-tile p-3">
      <div className="text-[11px] uppercase text-[color:var(--color-text)]/65">{label}</div>
      <div className="text-xl font-semibold mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------- Panels ---------------------------------- */

function CampaignsPanel(props: {
  items: { id: string; name: string; advertiser: string }[];
  onAdd: (name: string, advertiser?: string) => void;
  onUpdate: (oldName: string, patch: Partial<{ name: string; advertiser: string }>) => void;
  onRemove: (name: string) => void;
  disabled?: boolean;
}) {
  const { items, onAdd, onUpdate, onRemove, disabled } = props;
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [adv, setAdv] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i => i.name.toLowerCase().includes(s) || i.advertiser.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <section className="grid gap-3">
      <SearchAndAdd
        searchValue={q}
        onSearch={setQ}
        addArea={
          disabled ? null : (
            <>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Campaign name" className="input" />
              <input value={adv}  onChange={(e)=>setAdv(e.target.value)}  placeholder="Advertiser (optional)" className="input" />
              <button
                className="btn-primary"
                onClick={() => { if (name.trim()) { onAdd(name, adv || undefined); setName(''); setAdv(''); } }}
              >
                Add
              </button>
            </>
          )
        }
      />
      <EditableTable
        cols={['Name', 'Advertiser', '']}
        rows={list.map(i => ({
          key: i.id,
          cells: [
            <EditableText key="n" value={i.name} onSave={(v)=> v && onUpdate(i.name,{name:v})} disabled={disabled} />,
            <EditableText key="a" value={i.advertiser} onSave={(v)=> onUpdate(i.name,{advertiser:v})} disabled={disabled} />,
            <div key="act" className="shrink-0">
              {disabled ? null : (
                <RowActions
                  onEdit={() => {}}
                  onDuplicate={() => {
                    const newName = `${i.name} (copy)`;
                    onAdd(newName, i.advertiser);
                  }}
                  onDelete={() => onRemove(i.name)}
                />
              )}
            </div>
          ],
        }))}
      />
    </section>
  );
}

function PartnersPanel(props: {
  items: { id: string; name: string; defaultInvoiceOffice: 'DAT'|'CAR'|'INT'; isInternal?: boolean }[];
  onAdd: (name: string, invoiceOffice: string) => void;
  onUpdate: (oldName: string, patch: Partial<{ name: string; invoiceOffice: string }>) => void;
  onRemove: (name: string) => void;
  disabled?: boolean;
}) {
  const { items, onAdd, onUpdate, onRemove, disabled } = props;
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [office, setOffice] = useState<PartnerOffice>('DAT');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i => i.name.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <section className="grid gap-3">
      <SearchAndAdd
        searchValue={q}
        onSearch={setQ}
        addArea={
          disabled ? null : (
            <>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Partner name" className="input" />
              <select className="input" value={office} onChange={(e)=>setOffice(toPartnerOffice(e.target.value))}>
                <option value="DAT">DAT</option><option value="CAR">CAR</option><option value="INT">INT</option>
              </select>
              <button className="btn-primary" onClick={()=>{ if (name.trim()) { onAdd(name, office); setName(''); setOffice('DAT'); }}}>Add</button>
            </>
          )
        }
      />
      <EditableTable
        cols={['Name', 'Invoice office', '']}
        rows={list.map(i => ({
          key: i.id,
          cells: [
            <EditableText key="n" value={i.name} onSave={(v)=> v && onUpdate(i.name,{name:v})} disabled={disabled} />,
            <EditableSelect
              key="o"
              value={i.defaultInvoiceOffice}
              options={['DAT','CAR','INT']}
              onSave={(v)=> onUpdate(i.name,{invoiceOffice:v})}
              disabled={disabled}
            />,
            <div key="act" className="shrink-0">
              {disabled ? null : (
                <RowActions
                  onEdit={() => {}}
                  onDuplicate={() => onAdd(`${i.name} (copy)`, i.defaultInvoiceOffice)}
                  onDelete={() => onRemove(i.name)}
                />
              )}
            </div>,
          ],
        }))}
      />
    </section>
  );
}

function DatabasesPanel(props: {
  items: { id: string; name: string; geo: string; dbType: 'B2B'|'B2C'|'Mixed'|string }[];
  onAdd: (d: { name: string; id?: string; geo: string; dbType: 'B2B'|'B2C'|'Mixed'|string }) => void;
  onUpdate: (oldName: string, patch: Partial<{ name: string; id?: string; geo: string; dbType: 'B2B'|'B2C'|'Mixed'|string }>) => void;
  onRemove: (name: string) => void;
  disabled?: boolean;
}) {
  const { items, onAdd, onUpdate, onRemove, disabled } = props;
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [geo, setGeo] = useState('');
  const [dbType, setDbType] = useState<DatabaseTypeOption>('B2C');

  const geoStrict = normalizeGeoStrict(geo);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i => i.name.toLowerCase().includes(s) || i.geo.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <section className="grid gap-3">
      <SearchAndAdd
        searchValue={q}
        onSearch={setQ}
        addArea={
          disabled ? null : (
            <>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Database name" className="input" />
              <input
                value={geo}
                onChange={(e)=>setGeo(e.target.value.toUpperCase().slice(0,5))}
                placeholder="GEO (ES, FR, GB, MULTI)"
                className={`input ${geo && !geoStrict ? 'input-error' : ''}`}
                aria-invalid={geo && !geoStrict || undefined}
              />
              <select className="input" value={dbType} onChange={(e)=>setDbType(toDatabaseType(e.target.value))}>
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
                <option value="Mixed">Mixed</option>
              </select>
              <button
                className="btn-primary"
                disabled={!name.trim() || !geoStrict}
                onClick={()=>{
                  if (!name.trim() || !geoStrict) return;
                  onAdd({ name, geo: geoStrict, dbType });
                  setName(''); setGeo(''); setDbType('B2C');
                }}
              >
                Add
              </button>
            </>
          )
        }
      />
      <EditableTable
        cols={['Name', 'GEO', 'DB Type', '']}
        rows={list.map(i => ({
          key: i.id,
          cells: [
            <EditableText key="n" value={i.name} onSave={(v)=> v && onUpdate(i.name,{name:v})} disabled={disabled} />,
            <GeoCell key="g" value={i.geo} onValid={(g)=> onUpdate(i.name,{geo:g})} disabled={disabled} />,
            <EditableSelect
              key="t"
              value={i.dbType}
              options={['B2C','B2B','Mixed']}
              onSave={(v)=> onUpdate(i.name,{dbType:v})}
              disabled={disabled}
            />,
            <div key="act" className="shrink-0">
              {disabled ? null : (
                <RowActions
                  onEdit={() => {}}
                  onDuplicate={() =>
                  onAdd({ name: `${i.name} (copy)`, geo: i.geo, dbType: toDatabaseType(String(i.dbType)) })
                  }
                  onDelete={() => onRemove(i.name)}
                />
              )}
            </div>,
          ],
        }))}
      />
    </section>
  );
}

function ThemesPanel(props: {
  items: string[];
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  disabled?: boolean;
}) {
  const { items, onAdd, onRemove, disabled } = props;
  const [q, setQ] = useState('');
  const [val, setVal] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i => i.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <section className="grid gap-3">
      <SearchAndAdd
        searchValue={q}
        onSearch={setQ}
        addArea={
          disabled ? null : (
            <>
              <input value={val} onChange={(e)=>setVal(e.target.value)} placeholder="Theme" className="input" />
              <button className="btn-primary" onClick={()=>{ if (val.trim()) { onAdd(val); setVal(''); }}}>Add</button>
            </>
          )
        }
      />
      <EditableTable
        cols={['Theme', '']}
        rows={list.map(v => ({
          key: v,
          cells: [
            <span key="t" className="px-1.5 py-0.5 rounded bg-white/5 border border-[--color-border]">{v}</span>,
            <div key="d" className="shrink-0">
              {disabled ? null : <DangerButton onClick={()=>onRemove(v)} />}
            </div>,
          ],
        }))}
      />
    </section>
  );
}

function TypesPanel(props: {
  items: string[];
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  disabled?: boolean;
}) {
  const { items, onAdd, onRemove, disabled } = props;
  const [q, setQ] = useState('');
  const [val, setVal] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i => i.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <section className="grid gap-3">
      <SearchAndAdd
        searchValue={q}
        onSearch={setQ}
        addArea={
          disabled ? null : (
            <>
              <input value={val} onChange={(e)=>setVal(e.target.value)} placeholder="Type (e.g., CPL)" className="input" />
              <button className="btn-primary" onClick={()=>{ if (val.trim()) { onAdd(val); setVal(''); }}}>Add</button>
            </>
          )
        }
      />
      <EditableTable
        cols={['Type', '']}
        rows={list.map(v => ({
          key: v,
          cells: [
            <span key="t" className="px-1.5 py-0.5 rounded bg-white/5 border border-[--color-border]">{v}</span>,
            <div key="d" className="shrink-0">
              {disabled ? null : <DangerButton onClick={()=>onRemove(v)} />}
            </div>,
          ],
        }))}
      />
    </section>
  );
}

/* ---------------------------- Reusable pieces ----------------------------- */

function SearchAndAdd({
  searchValue, onSearch, addArea,
}: {
  searchValue: string;
  onSearch: (v: string) => void;
  addArea: React.ReactNode | null;
}) {
  return (
    <div className="subcard p-3 md:p-4 grid gap-2">
      <div className="flex items-center gap-2">
        <input
          className="input w-full"
          placeholder="Search…"
          value={searchValue}
          onChange={(e)=>onSearch(e.target.value)}
        />
      </div>
      {addArea && <div className="flex flex-wrap items-center gap-2">{addArea}</div>}
    </div>
  );
}

function EditableTable({ cols, rows }: {
  cols: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
}) {
  return (
    <div className="manage-table">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[--color-surface] z-[1]">
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left font-medium px-3 py-2">{c}</th>
            ))}
          </tr>
        </thead>
      </table>

      {/* 🆕 Scroll vertical para todas las listas */}
      <div className="manage-rows divide-y divide-[--color-border]/60 max-h-[60vh] overflow-y-auto pr-1">
        {rows.map(r => (
          <div
            key={r.key}
            className="grid grid-cols-[1fr_1fr_auto] md:grid-cols-[1.2fr_1fr_1fr_auto] gap-3 px-3 py-2 items-center"
          >
            {r.cells.map((cell, i) => <div key={i} className="min-w-0">{cell}</div>)}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-3 py-5 text-sm opacity-70">No items.</div>
        )}
      </div>
    </div>
  );
}

function EditableText({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(()=>setV(value),[value]);
  return (
    <div className="flex items-center gap-2">
      <input className="input w-full" value={v} onChange={(e)=>setV(e.target.value)} disabled={disabled} />
      <button className="btn-ghost disabled:opacity-50" title="Save" onClick={()=>onSave(v)} disabled={disabled}>✔</button>
    </div>
  );
}

function EditableSelect({
  value, options, onSave, disabled,
}: { value: string; options: string[]; onSave: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(()=>setV(value),[value]);
  return (
    <div className="flex items-center gap-2">
      <select className="input" value={v} onChange={(e)=>setV(e.target.value)} disabled={disabled}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <button className="btn-ghost disabled:opacity-50" title="Save" onClick={()=>onSave(v)} disabled={disabled}>✔</button>
    </div>
  );
}

/** 🆕 Celda con validación estricta de GEO */
function GeoCell({
  value, onValid, disabled,
}: {
  value: string;
  onValid: (geo: string) => void; // sólo se llama con GEO válido
  disabled?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);

  const valid = normalizeGeoStrict(v);

  return (
    <div className="flex items-center gap-2">
      <input
        className={`input w-full ${v && !valid ? 'input-error' : ''}`}
        value={v}
        onChange={(e)=>setV(e.target.value.toUpperCase().slice(0,5))}
        onBlur={()=>{
          const norm = normalizeGeoStrict(v);
          if (norm && norm !== value) onValid(norm);
          else setV(value); // vuelve si no es válido
        }}
        placeholder="ES / FR / GB / MULTI"
        aria-invalid={v && !valid || undefined}
        disabled={disabled}
      />
      <button
        className="btn-ghost disabled:opacity-50"
        title="Save"
        onClick={()=>{ const norm = normalizeGeoStrict(v); if (norm) onValid(norm); }}
        disabled={disabled || !valid}
      >
        ✔
      </button>
    </div>
  );
}

function DangerButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className="btn-ghost text-[--color-accent] disabled:opacity-50 disabled:pointer-events-none" title="Remove" onClick={onClick} disabled={disabled}>
      ✕
    </button>
  );
}
