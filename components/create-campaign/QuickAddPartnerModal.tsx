'use client';

import { useEffect, useRef, useState } from 'react';
import MiniModal from '@/components/ui/MiniModal';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import { trimCollapse, type InvoiceOffice } from '@/data/reference';

const norm = (s: string) => trimCollapse(s).toLowerCase();

export default function QuickAddPartnerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (partnerName: string) => void;
}) {
  const { PARTNERS, addPartnerRef, loading, error } = useCatalogOverrides();
  const [name, setName] = useState('');
  const [office, setOffice] = useState<InvoiceOffice>('DAT');
  const [err, setErr] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const hasErr = Boolean(err);
  const errId = 'quick-add-partner-error';

  const submit = async () => {
    const n = trimCollapse(name);
    if (!n) { setErr('Name is required'); return; }
    if (loading) { setErr('Shared catalogs are still loading'); return; }
    if (error) { setErr(error); return; }

    // 1) Evitar duplicado por NOMBRE (case-insensitive)
    const existsByName = PARTNERS.some(p => norm(p.name) === norm(n));
    if (existsByName) { setErr('Partner already exists'); return; }

    try {
      setSaving(true);
      await addPartnerRef({ name: n, invoiceOffice: office });
      onCreated(n);
      onClose();
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message || 'Unable to sync shared catalogs'
          : 'Unable to sync shared catalogs';
      setErr(message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <MiniModal
      title="Add partner"
      onClose={onClose}
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            onClick={submit}
            disabled={loading || !!error || !trimCollapse(name) || saving}
          >
            {saving ? 'Saving...' : 'Add'}
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

        <label className="text-sm grid gap-1">
          <span className="muted">Invoice office</span>
          <select
            className="input"
            value={office}
            onChange={e => setOffice(e.target.value as InvoiceOffice)}
          >
            <option value="DAT">DAT</option>
            <option value="CAR">CAR</option>
            <option value="INT">INT (Internal)</option>
          </select>
        </label>

        {hasErr ? <div id={errId} className="text-[--color-accent] text-sm">{err}</div> : null}
      </div>
    </MiniModal>
  );
}


