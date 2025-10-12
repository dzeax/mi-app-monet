'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogs } from '@/context/CatalogOverridesContext';
import RowActions from '@/components/table/RowActions';
import { useAuth } from '@/context/AuthContext'; // 🆕 roles
import { normalizeGeoStrict } from '@/utils/geo'; // 🆕 GEO strict

type TabKey = 'campaigns' | 'partners' | 'databases' | 'themes' | 'types';

export default function ManageCatalogsModal({ onClose }: { onClose: () => void }) {
  const {
    CAMPAIGNS, PARTNERS, DATABASES, THEMES, TYPES,
    addCampaignRef, updateCampaignRef, removeCampaignRef,
    addPartnerRef, updatePartnerRef, removePartnerRef,
    addDatabaseRef, updateDatabaseRef, removeDatabaseRef,
    addTheme, removeTheme, addType, removeType,
    exportOverrides, resetOverrides,
    hasLocalChanges, importOverrides,
  } = useCatalogs();

  // 🆕 auth/roles
  const auth = useAuth?.();
  const role = (auth?.role as 'admin' | 'editor' | 'viewer' | undefined) ?? (auth?.isAdmin ? 'admin' : auth?.isEditor ? 'editor' : 'viewer');
  const isAdmin = role === 'admin' || !!auth?.isAdmin;
  const isEditor = role === 'editor' || !!auth?.isEditor;
  const canEdit = isAdmin || isEditor;    // puede CRUD unitario
  const canBulk = isAdmin;                // puede importar/exportar/reset

  const trapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabKey>('campaigns');

  // banner simple de feedback
  const [banner, setBanner] = useState<null | { text: string; variant: 'success' | 'error' | 'info' }>(null);
  const showBanner = (b: { text: string; variant: 'success' | 'error' | 'info' }) => {
    setBanner(b);
    window.clearTimeout((showBanner as any)._t);
    (showBanner as any)._t = window.setTimeout(() => setBanner(null), 3200);
  };

  // ESC -> cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Export JSON (delta de overrides)
  const download = () => {
    if (!canBulk) {
      showBanner({ text: 'Only admins can export overrides.', variant: 'error' });
      return;
    }
    if (!hasLocalChanges) return;
    const blob = new Blob([exportOverrides()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'catalog_overrides.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON
  const triggerImport = () => {
    if (!canBulk) {
      showBanner({ text: 'Only admins can import overrides.', variant: 'error' });
      return;
    }
    fileInputRef.current?.click();
  };

  const onFilePicked: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = ''; // permite re-seleccionar el mismo archivo
    if (!f) return;
    if (!canBulk) {
      showBanner({ text: 'Only admins can import overrides.', variant: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const res = importOverrides(text);
      if (res.ok) {
        showBanner({ text: 'Overrides imported successfully.', variant: 'success' });
      } else {
        showBanner({ text: `Import failed: ${res.reason}`, variant: 'error' });
      }
    };
    reader.onerror = () => showBanner({ text: 'Could not read file.', variant: 'error' });
    reader.readAsText(f);
  };

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

          {/* banner */}
          {banner && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                banner.variant === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                  : banner.variant === 'info'
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-700'
                    : 'border-[--color-accent]/50 bg-[--color-accent]/10 text-[--color-accent]'
              }`}
              role="status"
            >
              {banner.text}
            </div>
          )}

          {/* Aviso de permisos */}
          {!canEdit && (
            <div className="rounded-lg border px-3 py-2 text-sm border-sky-500/40 bg-sky-500/10 text-sky-700">
              Read-only. Ask an admin for edit access.
            </div>
          )}
          {canEdit && !canBulk && (
            <div className="rounded-lg border px-3 py-2 text-sm border-amber-400/40 bg-amber-400/10 text-amber-700">
              Editors can edit items but only admins can import/export or reset overrides.
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
              onAdd={(name, advertiser) => canEdit && addCampaignRef({ name, advertiser })}
              onUpdate={(oldName, patch) => canEdit && updateCampaignRef(oldName, patch)}
              onRemove={(name) => {
                if (!canEdit) return;
                if (confirm(`Remove local override for campaign "${name}"?`)) removeCampaignRef(name);
              }}
              disabled={!canEdit}
            />
          )}

          {tab === 'partners' && (
            <PartnersPanel
              items={PARTNERS}
              onAdd={(name, invoiceOffice) => canEdit && addPartnerRef({ name, invoiceOffice })}
              onUpdate={(oldName, patch) => canEdit && updatePartnerRef(oldName, patch)}
              onRemove={(name) => {
                if (!canEdit) return;
                if (confirm(`Remove local override for partner "${name}"?`)) removePartnerRef(name);
              }}
              disabled={!canEdit}
            />
          )}

          {tab === 'databases' && (
            <DatabasesPanel
              items={DATABASES}
              onAdd={(payload) => canEdit && addDatabaseRef(payload)}
              onUpdate={(oldName, patch) => canEdit && updateDatabaseRef(oldName, patch)}
              onRemove={(name) => {
                if (!canEdit) return;
                if (confirm(`Remove local override for database "${name}"?`)) removeDatabaseRef(name);
              }}
              disabled={!canEdit}
            />
          )}

          {tab === 'themes' && (
            <ThemesPanel
              items={THEMES}
              onAdd={(t) => canEdit && addTheme(t)}
              onRemove={(t) => {
                if (!canEdit) return;
                if (confirm(`Remove theme "${t}" from local overrides?`)) removeTheme(t);
              }}
              disabled={!canEdit}
            />
          )}

          {tab === 'types' && (
            <TypesPanel
              items={TYPES}
              onAdd={(t) => canEdit && addType(t)}
              onRemove={(t) => {
                if (!canEdit) return;
                if (confirm(`Remove type "${t}" from local overrides?`)) removeType(t);
              }}
              disabled={!canEdit}
            />
          )}

          <div className="edge-fade edge-bottom" aria-hidden />
        </div>

        {/* Footer (chrome unificado) */}
        <div className="sticky bottom-0 z-10 modal-chrome modal-footer px-5 py-3 flex items-center justify-end gap-2">
          {/* input oculto para importar */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFilePicked}
          />
          {canBulk && (
            <button type="button" className="btn-ghost" onClick={triggerImport}>
              Import
            </button>
          )}
          <button
            type="button"
            className="btn-ghost disabled:opacity-50 disabled:pointer-events-none"
            onClick={() => {
              if (!canBulk) {
                showBanner({ text: 'Only admins can reset overrides.', variant: 'error' });
                return;
              }
              resetOverrides();
            }}
            disabled={!hasLocalChanges || !canBulk}
            title={
              !canBulk
                ? 'Only admins can reset overrides'
                : hasLocalChanges
                  ? 'Clear local overrides'
                  : 'No local changes'
            }
          >
            Reset local changes
          </button>
          <button
            type="button"
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            onClick={download}
            disabled={!hasLocalChanges || !canBulk}
            title={
              !canBulk
                ? 'Only admins can export overrides'
                : hasLocalChanges
                  ? 'Export local overrides as JSON'
                  : 'Nothing to export'
            }
          >
            Export changes
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
  const [office, setOffice] = useState<'DAT'|'CAR'|'INT'>('DAT');

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
              <select className="input" value={office} onChange={(e)=>setOffice(e.target.value as any)}>
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
  const [dbType, setDbType] = useState<'B2B'|'B2C'|'Mixed'>('B2C');

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
              <select className="input" value={dbType} onChange={(e)=>setDbType(e.target.value as any)}>
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
                    onAdd({ name: `${i.name} (copy)`, geo: i.geo, dbType: (i.dbType as any) || 'B2C' })
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
