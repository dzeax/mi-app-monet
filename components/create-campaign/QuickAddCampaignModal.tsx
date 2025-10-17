'use client';

import { useEffect, useRef, useState } from 'react';
import MiniModal from '@/components/ui/MiniModal';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import { trimCollapse } from '@/data/reference';

const trim = trimCollapse;
const norm = (s: string) => trimCollapse(s).toLowerCase();

export default function QuickAddCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaignName: string) => void;
}) {
  const { CAMPAIGNS, addCampaignRef, loading, error } = useCatalogOverrides();
  const [name, setName] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [err, setErr] = useState<string>('');

  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const submit = () => {
    const n = trim(name);
    const a = trim(advertiser) || 'White Label';
    if (!n) { setErr('Name is required'); return; }
    if (loading) { setErr('Still loading shared catalogs'); return; }
    if (error) { setErr(error); return; }

    const exists = CAMPAIGNS.some(c => norm(c.name) === norm(n));
    if (exists) { setErr('Campaign already exists'); return; }

    addCampaignRef({ name: n, advertiser: a });
    onCreated(n);
    onClose();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const hasErr = Boolean(err);
  const errId = 'quick-add-campaign-error';

  return (
    <MiniModal
      title="Add campaign"
      onClose={onClose}
      footer={(
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            onClick={submit}
            disabled={loading || !!error || !trim(name)}
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
        <label className="text-sm grid gap-1">
          <span className="muted">Advertiser</span>
          <input
            className="input"
            value={advertiser}
            onChange={e => setAdvertiser(e.target.value)}
            placeholder="White Label"
          />
        </label>
        {hasErr ? (
          <div id={errId} className="text-[--color-accent] text-sm">{err}</div>
        ) : null}
      </div>
    </MiniModal>
  );
}
