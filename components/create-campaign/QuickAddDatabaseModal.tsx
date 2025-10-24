'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MiniModal from '@/components/ui/MiniModal';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import { trimCollapse, type DBType } from '@/data/reference';

const norm = (s: string) => trimCollapse(s).toLowerCase();

/** --- ISO-3166 validator (estricto) con compat UK→GB + MULTI --- */
let regionDisplayNames: Intl.DisplayNames | null = null;
function isIsoCountry(code: string): boolean {
  const c = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return false;
  if (typeof Intl.DisplayNames !== 'function') {
    return true;
  }
  try {
    regionDisplayNames =
      regionDisplayNames ?? new Intl.DisplayNames(['en'], { type: 'region' });
    const name = regionDisplayNames.of(c);
    return typeof name === 'string' && name.length > 0 && name !== c;
  } catch {
    return false;
  }
}

function normalizeGeoStrict(raw: string): string | null {
  const g = trimCollapse(raw).toUpperCase();
  if (!g) return null;
  if (g === 'MULTI') return 'MULTI';
  const mapped = g === 'UK' ? 'GB' : g; // compatibilidad
  return isIsoCountry(mapped) ? mapped : null;
}

export default function QuickAddDatabaseModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (dbName: string) => void;
}) {
  const { DATABASES, addDatabaseRef, loading, error } = useCatalogOverrides();
  const [name, setName] = useState('');
  const [geo, setGeo] = useState('ES');
  const [dbType, setDbType] = useState<DBType>('B2B');
  const [err, setErr] = useState<string>('');

  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const geoNormalized = useMemo(() => normalizeGeoStrict(geo), [geo]);
  const geoValid = geoNormalized !== null;

  const hasErr = Boolean(err);
  const errId = 'quick-add-db-error';

  const submit = () => {
    const n = trimCollapse(name);
    if (!n) { setErr('Name is required'); return; }
    if (loading) { setErr('Shared catalogs are still loading'); return; }
    if (error) { setErr(error); return; }

    // GEO estricto
    if (!geoValid) {
      setErr('Invalid GEO. Use ISO-3166-1 alpha-2 (e.g., ES, FR, GB) or MULTI.');
      return;
    }

    // 1) Evitar duplicado por NOMBRE (case-insensitive)
    const existsByName = DATABASES.some(d => norm(d.name) === norm(n));
    if (existsByName) { setErr('Database already exists'); return; }

    addDatabaseRef({
      name: n,
      geo: geoNormalized!,          // ya validado (incluye UK→GB y MULTI)
      dbType,
    });
    onCreated(n);
    onClose();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <MiniModal
      title="Add database"
      onClose={onClose}
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            onClick={submit}
            disabled={loading || !!error || !trimCollapse(name) || !geoValid}
          >
            Add
          </button>
        </>
      )}
    >
      <div className="grid gap-3" onKeyDown={onKeyDown}>
        <label className="text-sm grid gap-1">
          <span className="muted">Name</span>
          <input
            ref={nameRef}
            className={`input ${hasErr ? 'input-error' : ''}`}
            value={name}
            onChange={e => { setName(e.target.value); setErr(''); }}
            aria-invalid={hasErr || undefined}
            aria-describedby={hasErr ? errId : undefined}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm grid gap-1">
            <span className="muted">GEO</span>
            <input
              className={`input ${!geoValid ? 'input-error' : ''}`}
              value={geo}
              onChange={e => { setGeo(e.target.value.toUpperCase()); setErr(''); }}
              placeholder="ES / FR / GB / MULTI (UK → GB)"
              aria-invalid={!geoValid || undefined}
            />
            {!geoValid && (
              <span className="text-[--color-accent] text-xs">
                Use ISO-3166-1 alpha-2 (p. ej., ES, FR, GB) o MULTI. (UK se normaliza a GB)
              </span>
            )}
          </label>

          <label className="text-sm grid gap-1">
            <span className="muted">DB Type</span>
            <select
              className="input"
              value={dbType}
              onChange={e => setDbType(e.target.value as DBType)}
            >
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
              <option value="Mixed">Mixed</option>
            </select>
          </label>
        </div>

        {hasErr ? <div id={errId} className="text-[--color-accent] text-sm">{err}</div> : null}
      </div>
    </MiniModal>
  );
}

