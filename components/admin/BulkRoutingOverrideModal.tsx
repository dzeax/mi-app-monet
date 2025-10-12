'use client';

import { useEffect, useMemo, useState } from 'react';

import MiniModal from '@/components/ui/MiniModal';

type Scope = 'all' | 'page';
type Mode = 'set' | 'clear';

export type BulkRoutingOverridePayload = {
  scope: Scope;
  mode: Mode;
  rate: number | null;
};

type Props = {
  onClose: () => void;
  onConfirm: (payload: BulkRoutingOverridePayload) => void;
  countAll: number;
  countPage: number;
  defaultRate: number;
};

function formatRate(rate: number) {
  return Number.isFinite(rate) ? rate.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : '';
}

export default function BulkRoutingOverrideModal({
  onClose,
  onConfirm,
  countAll,
  countPage,
  defaultRate,
}: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [mode, setMode] = useState<Mode>('set');
  const [rate, setRate] = useState<string>(() => formatRate(defaultRate));
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setRate(formatRate(defaultRate));
  }, [defaultRate]);

  const parsedRate = useMemo(() => {
    const num = Number(rate);
    return Number.isFinite(num) ? num : NaN;
  }, [rate]);

  const hasRows = scope === 'all' ? countAll > 0 : countPage > 0;
  const canSubmit =
    mode === 'clear'
      ? hasRows
      : hasRows && !Number.isNaN(parsedRate) && parsedRate >= 0;

  const handleConfirm = () => {
    if (!canSubmit) {
      setStatus('Select at least one row and provide a valid rate.');
      return;
    }
    setStatus(null);
    const payload: BulkRoutingOverridePayload = {
      scope,
      mode,
      rate: mode === 'clear' ? null : parsedRate,
    };
    onConfirm(payload);
  };

  const rowsTargeted = scope === 'all' ? countAll : countPage;

  return (
    <MiniModal
      title="Routing Rate Override"
      onClose={onClose}
      widthClass="max-w-lg w-full"
      bodyClassName="space-y-5"
      footer={
        <>
          {status && <div className="mr-auto text-xs text-[--color-accent]">{status}</div>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Scope</h4>
        <div className="grid gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="routing-scope"
              value="all"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
            />
            All filtered rows ({countAll})
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="routing-scope"
              value="page"
              checked={scope === 'page'}
              onChange={() => setScope('page')}
            />
            Current page only ({countPage})
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Action</h4>
        <div className="grid gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="routing-mode"
              value="set"
              checked={mode === 'set'}
              onChange={() => setMode('set')}
            />
            Set custom rate
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="routing-mode"
              value="clear"
              checked={mode === 'clear'}
              onChange={() => setMode('clear')}
            />
            Remove override (use global plan)
          </label>
        </div>
      </div>

      {mode === 'set' && (
        <div className="space-y-1">
          <label className="text-sm font-medium">
            Custom rate (€/1,000 sends)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="input w-40"
          />
          <p className="text-xs opacity-70">
            This will affect {rowsTargeted} row{rowsTargeted === 1 ? '' : 's'}. Leave empty if you want to keep the current value.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-[--color-border] bg-[color:var(--color-surface-2)] px-4 py-3 text-xs leading-relaxed">
        <ul className="list-disc list-inside space-y-1">
          <li>Manual overrides take precedence over the global period plan.</li>
          <li>Remove the override later by choosing “Remove override”.</li>
          <li>Margins and turnover will be recalculated automatically.</li>
        </ul>
      </div>
    </MiniModal>
  );
}
