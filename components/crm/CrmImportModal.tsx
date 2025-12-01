"use client";

import { useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type Props = {
  clientSlug: string;
  onClose: () => void;
  onImported?: () => void;
};

type ImportTarget = "data-quality" | "campaigns";

const EXPECTED: Record<ImportTarget, { title: string; cols: string }> = {
  "data-quality": {
    title: "Data Quality tickets",
    cols:
      "status, assigned_date, due_date, ticket_id, title, priority (P1/P2/P3), owner, reporter, type, jira_url, work_hours, prep_hours, eta_date, comments.",
  },
  campaigns: {
    title: "Campaign email units",
    cols:
      "week, year, campaign_name, brand, send_date, market, scope, segment, touchpoint, variant, owner, jira_ticket, status, hours_master_template, hours_translations, hours_copywriting, hours_assets, hours_revisions, hours_build, hours_prep.",
  },
};

export default function CrmImportModal({ clientSlug, onClose, onImported }: Props) {
  const [target, setTarget] = useState<ImportTarget>("data-quality");
  const [importing, setImporting] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setImporting(true);
    setStatus("Uploading and processing...");
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const endpoint =
        target === "data-quality"
          ? `/api/crm/data-quality?client=${clientSlug}`
          : `/api/crm/campaign-email-units?client=${clientSlug}`;
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Import failed (${res.status})`);
      setResult(`Imported ${body?.imported ?? 0} rows.`);
      setStatus("Done");
      showSuccess("CSV imported");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("crm:imported", {
            detail: { target, client: clientSlug },
          }),
        );
      }
      onImported?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      setStatus(null);
      showError(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <MiniModal
      onClose={() => {
        onClose();
        setStatus(null);
        setError(null);
        setResult(null);
        setFilename(null);
      }}
      title="Import CSV (CRM)"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="import-target"
              value="data-quality"
              checked={target === "data-quality"}
              onChange={() => setTarget("data-quality")}
            />
            Data Quality tickets
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="import-target"
              value="campaigns"
              checked={target === "campaigns"}
              onChange={() => setTarget("campaigns")}
            />
            Campaign email units
          </label>
        </div>

        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-4 py-3 text-sm text-[color:var(--color-text)]/80">
          <p className="font-semibold text-[color:var(--color-text)]">{EXPECTED[target].title}</p>
          <p className="mt-1">{EXPECTED[target].cols}</p>
          <p className="mt-1">Fechas: yyyy-mm-dd o dd/mm/aaaa. Números con coma o punto.</p>
          <p className="mt-1">
            Clave de upsert:
            {target === "data-quality"
              ? " (client_slug, ticket_id)"
              : " (client_slug, jira_ticket, send_date, market, segment, touchpoint, variant, owner)"}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="btn-primary cursor-pointer">
            Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await handleFile(file);
              }}
            />
          </label>
          <div className="flex-1 truncate text-xs text-[color:var(--color-text)]/70">
            {filename ? `Selected: ${filename}` : "No file selected"}
          </div>
        </div>

        {status ? <div className="text-xs text-[color:var(--color-text)]/70">{status}</div> : null}
        {error ? <div className="text-sm text-[color:var(--color-accent)]">{error}</div> : null}
        {result ? <div className="text-sm text-[color:var(--color-text)]/80">{result}</div> : null}

        <div className="flex justify-end">
          <button className="btn-primary" type="button" onClick={onClose} disabled={importing}>
            Close
          </button>
        </div>
      </div>
    </MiniModal>
  );
}
