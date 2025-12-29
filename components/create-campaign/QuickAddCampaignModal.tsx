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
  const {
    CAMPAIGNS,
    addCampaignRef,
    loading,
    error: catalogError,
  } = useCatalogOverrides();
  const [name, setName] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [formError, setFormError] = useState<{ message: string; field?: 'name' | 'advertiser' } | null>(null);
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const submit = async () => {
    const n = trim(name);
    const a = trim(advertiser);
    if (!n) { setFormError({ message: 'Name is required', field: 'name' }); return; }
    if (!a) { setFormError({ message: 'Advertiser is required', field: 'advertiser' }); return; }
    if (loading) { setFormError({ message: 'Still loading shared catalogs' }); return; }
    if (catalogError) { setFormError({ message: catalogError }); return; }

    const exists = CAMPAIGNS.some(c => norm(c.name) === norm(n));
    if (exists) { setFormError({ message: 'Campaign already exists', field: 'name' }); return; }

    try {
      setSaving(true);
      await addCampaignRef({ name: n, advertiser: a });
      onCreated(n);
      onClose();
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message || 'Unable to sync shared catalogs'
          : 'Unable to sync shared catalogs';
      setFormError({ message });
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

  const hasErr = Boolean(formError);
  const errId = 'quick-add-campaign-error';
  const nameHasErr = formError?.field === 'name';
  const advertiserHasErr = formError?.field === 'advertiser';

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
            disabled={loading || !!catalogError || !trim(name) || !trim(advertiser) || saving}
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
            className={`input ${nameHasErr ? 'input-error' : ''}`}
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (nameHasErr) setFormError(null);
            }}
            aria-invalid={nameHasErr || undefined}
            aria-describedby={nameHasErr ? errId : undefined}
          />
        </label>
        <label className="text-sm grid gap-1">
          <span className="muted">Advertiser</span>
          <input
            className={`input ${advertiserHasErr ? 'input-error' : ''}`}
            value={advertiser}
            onChange={e => {
              setAdvertiser(e.target.value);
              if (advertiserHasErr) setFormError(null);
            }}
            placeholder="White Label"
            aria-invalid={advertiserHasErr || undefined}
            aria-describedby={advertiserHasErr ? errId : undefined}
          />
        </label>
        {hasErr ? (
          <div id={errId} className="text-[--color-accent] text-sm">{formError?.message}</div>
        ) : null}
      </div>
    </MiniModal>
  );
}
