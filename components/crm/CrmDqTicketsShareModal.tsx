"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Trash2 } from "lucide-react";
import ModalShell from "@/components/ui/ModalShell";

type ShareRow = {
  id: string;
  allowed_years: number[];
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  clientSlug: string;
};

const formatDate = (value: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export default function CrmDqTicketsShareModal({ open, onClose, clientSlug }: Props) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadShares = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/dq-tickets-shares?client=${clientSlug}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Unable to load shares.");
      }
      setShares(Array.isArray(body?.shares) ? body.shares : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shares.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadShares();
  }, [open]);

  const createShare = async () => {
    setCreating(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/crm/dq-tickets-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Unable to create share link.");
      }
      const token = String(body?.token || "");
      if (token) {
        setLastLink(`${window.location.origin}/share/${clientSlug}/dq-tickets/${token}`);
      }
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create share link.");
    } finally {
      setCreating(false);
    }
  };

  const revokeShare = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/crm/dq-tickets-shares/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Unable to revoke share.");
      }
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke share.");
    }
  };

  const copyLink = async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      title={
        <span className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Share DQ SLA Tracker
        </span>
      }
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
            Create share link
          </div>
          <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
            Share links can be used by multiple people.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-ghost h-9 px-4"
              onClick={createShare}
              disabled={creating}
            >
              {creating ? "Creating..." : "Generate link"}
            </button>
            {lastLink ? (
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs">
                <span className="truncate">{lastLink}</span>
                <button
                  type="button"
                  className="btn-ghost h-7 w-7"
                  onClick={copyLink}
                  title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </button>
                {copied ? (
                  <span className="text-[color:var(--color-primary)]">Copied</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              Active shares
            </div>
            {loading ? (
              <span className="text-xs text-[color:var(--color-text)]/60">Loading...</span>
            ) : null}
          </div>
          {error ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {shares.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-[color:var(--color-border)] px-4 py-6 text-center text-sm text-[color:var(--color-text)]/60">
                No share links created yet.
              </div>
            ) : null}
            {shares.map((share) => (
              <div
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 px-3 py-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-[color:var(--color-text)]">
                    Created {formatDate(share.created_at)} - Used {share.use_count ?? 0} times
                  </div>
                  <div className="text-[color:var(--color-text)]/60">
                    Last used {formatDate(share.last_used_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      share.is_active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    {share.is_active ? "Active" : "Revoked"}
                  </span>
                  {share.is_active ? (
                    <button
                      type="button"
                      className="btn-ghost h-8 px-3 text-xs text-red-600"
                      onClick={() => revokeShare(share.id)}
                    >
                      <span className="flex items-center gap-1">
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ModalShell>
  );
}
