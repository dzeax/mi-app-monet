'use client';

import { useEffect, useMemo, useState } from 'react';

import MiniModal from '@/components/ui/MiniModal';
import { useRoutingSettings, type RoutingRatePeriod, type RoutingSettings } from '@/context/RoutingSettingsContext';

type Props = {
  onClose: () => void;
};

const makeId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

type PeriodDraft = {
  id: string;
  from: string;
  to: string;
  rate: string;
  label: string;
};

function formatRate(value: number) {
  return Number.isFinite(value) ? value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : '';
}

function normalizeDrafts(periods: PeriodDraft[]): RoutingRatePeriod[] {
  return periods
    .map((p) => {
      const rate = Number(p.rate);
      if (!Number.isFinite(rate)) return null;
      return {
        id: p.id,
        from: p.from?.trim() ? p.from : null,
        to: p.to?.trim() ? p.to : null,
        rate: Number(rate.toFixed(6)),
        label: p.label?.trim() || undefined,
      };
    })
    .filter(Boolean) as RoutingRatePeriod[];
}

function detectOverlaps(periods: RoutingRatePeriod[]): string[] {
  const errors: string[] = [];
  const ranges = periods
    .map((p) => {
      const start = p.from ? new Date(p.from).getTime() : -Infinity;
      const end = p.to ? new Date(p.to).getTime() : Infinity;
      return { id: p.id, start, end, from: p.from, to: p.to };
    })
    .filter((r) => !Number.isNaN(r.start) && !Number.isNaN(r.end))
    .sort((a, b) => a.start - b.start);

  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1];
    const curr = ranges[i];
    if (prev.end >= curr.start) {
      const prevLabel = `${prev.from ?? '∞'} → ${prev.to ?? '∞'}`;
      const currLabel = `${curr.from ?? '∞'} → ${curr.to ?? '∞'}`;
      errors.push(`Periods ${prevLabel} and ${currLabel} overlap.`);
    }
  }
  return errors;
}

export default function RoutingSettingsModal({ onClose }: Props) {
  const { settings, updateSettings, loading, error } = useRoutingSettings();

  const [defaultRate, setDefaultRate] = useState(() => formatRate(settings.defaultRate));
  const [periods, setPeriods] = useState<PeriodDraft[]>(() =>
    (settings.periods || []).map((p) => ({
      id: p.id,
      from: p.from ?? '',
      to: p.to ?? '',
      rate: formatRate(p.rate),
      label: p.label ?? '',
    }))
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDefaultRate(formatRate(settings.defaultRate));
    setPeriods(
      (settings.periods || []).map((p) => ({
        id: p.id,
        from: p.from ?? '',
        to: p.to ?? '',
        rate: formatRate(p.rate),
        label: p.label ?? '',
      }))
    );
  }, [settings.defaultRate, settings.periods]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    const parsedDefault = Number(defaultRate);
    if (defaultRate.trim() === '') {
      errs.push('Enter a default rate.');
    } else if (!Number.isFinite(parsedDefault) || parsedDefault < 0) {
      errs.push('Default rate must be a positive number.');
    }

    const normalized = normalizeDrafts(periods);

    for (const draft of periods) {
      if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
        errs.push(`Range ${draft.from} → ${draft.to} is invalid (start date must be before end date).`);
      }
      if (draft.rate && Number(draft.rate) < 0) {
        errs.push(`Rate for the period starting ${draft.from || 'without a start date'} must be positive.`);
      }
    }

    if (normalized.length > 1) {
      errs.push(...detectOverlaps(normalized));
    }

    return errs;
  }, [defaultRate, periods]);

  const handleAddPeriod = () => {
    setPeriods((prev) => [
      ...prev,
      {
        id: makeId(),
        from: '',
        to: '',
        rate: formatRate(settings.defaultRate),
        label: '',
      },
    ]);
  };

  const handleUpdatePeriod = (id: string, patch: Partial<PeriodDraft>) => {
    setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const handleRemovePeriod = (id: string) => {
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  };

  const onSave = async () => {
    setStatus(null);
    if (errors.length > 0) return;

    const parsedDefault = Number(defaultRate);
    if (!Number.isFinite(parsedDefault)) return;

    const payload: RoutingSettings = {
      defaultRate: Number(parsedDefault.toFixed(6)),
      periods: normalizeDrafts(periods),
    };

    setSaving(true);
    const res = await updateSettings(payload);
    setSaving(false);

    if (!res.ok) {
      setStatus({ tone: 'err', text: res.message });
      return;
    }
    setStatus({ tone: 'ok', text: 'Routing settings saved successfully.' });
  };

  const footer = (
    <>
      {status && (
        <div
          className={
            status.tone === 'ok'
              ? 'text-xs text-green-600 mr-auto'
              : 'text-xs text-[--color-accent] mr-auto'
          }
        >
          {status.text}
        </div>
      )}
      <button className="btn-ghost" onClick={onClose}>
        Close
      </button>
      <button
        className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
        onClick={onSave}
        disabled={saving || errors.length > 0}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </>
  );

  return (
    <MiniModal
      title="Routing Cost Settings"
      onClose={onClose}
      widthClass="max-w-3xl w-full"
      bodyClassName="space-y-6"
      footer={footer}
    >
      <div className="space-y-1">
        <label className="text-sm font-medium">Default rate (€/1,000 sends)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={defaultRate}
          onChange={(e) => setDefaultRate(e.target.value)}
          className="input w-40"
          disabled={saving || loading}
        />
        <p className="text-xs opacity-70">
          Automatically applied to campaigns without a specific period or manual override.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Custom periods</h4>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={handleAddPeriod}
            disabled={saving}
          >
            Add period
          </button>
        </div>

        {periods.length === 0 ? (
          <div className="text-sm opacity-70 border border-dashed border-[--color-border] rounded-lg px-4 py-6 text-center">
            No periods defined. The default rate will always be used.
          </div>
        ) : (
          <div className="grid gap-3">
            {periods.map((period) => (
              <div
                key={period.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end border border-[--color-border] rounded-lg p-3"
              >
                <label className="text-xs uppercase tracking-wide opacity-70 grid gap-1">
                  Start date
                  <input
                    type="date"
                    value={period.from}
                    onChange={(e) => handleUpdatePeriod(period.id, { from: e.target.value })}
                    className="input"
                    disabled={saving}
                  />
                </label>

                <label className="text-xs uppercase tracking-wide opacity-70 grid gap-1">
                  End date
                  <input
                    type="date"
                    value={period.to}
                    onChange={(e) => handleUpdatePeriod(period.id, { to: e.target.value })}
                    className="input"
                    disabled={saving}
                  />
                </label>

                <label className="text-xs uppercase tracking-wide opacity-70 grid gap-1">
                  Rate (€/1,000)
                  <input
                    type="number"
                    step="0.01"
                    value={period.rate}
                    onChange={(e) => handleUpdatePeriod(period.id, { rate: e.target.value })}
                    className="input"
                    min="0"
                    disabled={saving}
                  />
                </label>

                <div className="flex items-center justify-between md:justify-end gap-2">
                  <input
                    type="text"
                    placeholder="Optional label"
                    value={period.label}
                    onChange={(e) => handleUpdatePeriod(period.id, { label: e.target.value })}
                    className="input md:max-w-[160px]"
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="btn-ghost text-[--color-accent]"
                    onClick={() => handleRemovePeriod(period.id)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(errors.length > 0 || error) && (
        <div className="rounded-lg border border-[--color-accent]/50 bg-[--color-accent]/10 px-4 py-3 text-sm text-[--color-accent] space-y-1">
          <strong>Please review the following:</strong>
          <ul className="list-disc list-inside space-y-1">
            {error ? <li>{error}</li> : null}
            {errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {settings.updatedAt && (
        <p className="text-xs opacity-60">
          Last updated: {new Date(settings.updatedAt).toLocaleString()} {settings.updatedBy ? `by ${settings.updatedBy}` : ''}
        </p>
      )}
    </MiniModal>
  );
}
