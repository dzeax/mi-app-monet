"use client";

import { useMemo, useRef, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";

export type CampaignUnitsBulkPatch = {
  sendDate?: string;
  owner?: string;
  status?: string;
};

type Props = {
  clientSlug: string;
  ids: string[];
  ownerOptions: string[];
  statusOptions: string[];
  onApplied: (patch: CampaignUnitsBulkPatch) => void;
  onClose: () => void;
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default function CrmBulkEditUnitsModal({
  clientSlug,
  ids,
  ownerOptions,
  statusOptions,
  onApplied,
  onClose,
}: Props) {
  const sendDateInputRef = useRef<HTMLInputElement | null>(null);
  const [updateDate, setUpdateDate] = useState(false);
  const [sendDate, setSendDate] = useState("");
  const [updateOwner, setUpdateOwner] = useState(false);
  const [owner, setOwner] = useState("");
  const [updateStatus, setUpdateStatus] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (saving) return false;
    const hasAny = (updateDate && !!sendDate) || (updateOwner && !!owner) || (updateStatus && !!status);
    const allValid =
      (!updateDate || (!!sendDate && isIsoDate(sendDate))) &&
      (!updateOwner || !!owner) &&
      (!updateStatus || !!status);
    return hasAny && allValid;
  }, [saving, updateDate, sendDate, updateOwner, owner, updateStatus, status]);

  const openDatePicker = () => {
    if (!updateDate || saving) return;
    const el = sendDateInputRef.current;
    if (!el) return;
    el.focus();
    // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
    if (typeof el.showPicker === "function") {
      try {
        // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
        el.showPicker();
      } catch {
        el.click();
      }
    } else {
      el.click();
    }
  };

  const submit = async () => {
    setError(null);

    const patch: CampaignUnitsBulkPatch = {};
    if (updateDate) patch.sendDate = sendDate;
    if (updateOwner) patch.owner = owner;
    if (updateStatus) patch.status = status;

    if (!Object.keys(patch).length) {
      setError("Select at least one field to update.");
      return;
    }

    if (patch.sendDate && !isIsoDate(patch.sendDate)) {
      setError("Date must be yyyy-mm-dd.");
      return;
    }

    if (patch.owner != null && patch.owner.trim() === "") {
      setError("Owner is required.");
      return;
    }

    if (patch.status != null && patch.status.trim() === "") {
      setError("Status is required.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/crm/campaign-email-units", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, ids, patch }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = body?.error || `Update failed (${res.status})`;
        console.error("Bulk edit email units failed", {
          status: res.status,
          message: msg,
          idsCount: ids.length,
          patch,
        });
        setError(msg);
        return;
      }

      onApplied(patch);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      console.error("Bulk edit email units error", err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MiniModal
      onClose={() => {
        if (saving) return;
        onClose();
      }}
      title="Edit email units"
      widthClass="max-w-lg"
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" type="button" onClick={submit} disabled={!canSubmit}>
            {saving ? "Saving..." : "Apply"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-[color:var(--color-text)]">
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-4 py-3 text-xs text-[color:var(--color-text)]/75">
          Applies to {ids.length.toLocaleString()} selected email unit(s).
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-2 h-4 w-4"
              checked={updateDate}
              onChange={(e) => setUpdateDate(e.target.checked)}
              disabled={saving}
              aria-label="Update date"
            />
            <div className="flex-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">Date</label>
              <div className="relative w-full">
                <input
                  ref={sendDateInputRef}
                  type="date"
                  className="input input-date h-10 w-full pr-10"
                  value={sendDate}
                  onChange={(e) => setSendDate(e.target.value)}
                  disabled={!updateDate || saving}
                  onClick={openDatePicker}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Open calendar"
                  onClick={openDatePicker}
                  disabled={!updateDate || saving}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M8 2v4" />
                    <path d="M16 2v4" />
                    <path d="M3 10h18" />
                    <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-2 h-4 w-4"
              checked={updateOwner}
              onChange={(e) => setUpdateOwner(e.target.checked)}
              disabled={saving}
              aria-label="Update owner"
            />
            <div className="flex-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">Owner</label>
              <select
                className="input h-10 w-full"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                disabled={!updateOwner || saving}
              >
                <option value="">{updateOwner ? "Select owner" : "Keep current"}</option>
                {ownerOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-2 h-4 w-4"
              checked={updateStatus}
              onChange={(e) => setUpdateStatus(e.target.checked)}
              disabled={saving}
              aria-label="Update status"
            />
            <div className="flex-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">Status</label>
              <select
                className="input h-10 w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!updateStatus || saving}
              >
                <option value="">{updateStatus ? "Select status" : "Keep current"}</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 px-4 py-3 text-sm text-[color:var(--color-accent)]">
            {error}
          </div>
        ) : null}
      </div>
    </MiniModal>
  );
}
