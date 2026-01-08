"use client";

import { useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type Props = {
  clientSlug: string;
  onClose: () => void;
  onImported?: () => void;
};

const TEMPLATE = [
  "date,owner,workstream,hours,days,comments",
  "2025-02-01,Jane Doe,Strategy & Governance,6,,Workshop prep",
].join("\n");

export default function CrmManualEffortsImportModal({ clientSlug, onClose, onImported }: Props) {
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
      const res = await fetch(`/api/crm/manual-efforts?client=${clientSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Import failed (${res.status})`);
      const imported = Number(body?.imported ?? 0);
      const skipped = Number(body?.skipped ?? 0);
      setResult(`Imported ${imported} rows. Skipped ${skipped}.`);
      setStatus("Done");
      showSuccess("CSV imported");
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

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "manual_efforts_template.csv";
    a.click();
    URL.revokeObjectURL(url);
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
      title="Import CSV (Manual Efforts)"
      widthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-4 py-3 text-sm text-[color:var(--color-text)]/80">
          <p className="font-semibold text-[color:var(--color-text)]">Expected columns</p>
          <p className="mt-1">date, owner, workstream, hours, days, comments</p>
          <p className="mt-1">Use hours or days (one is enough). Dates: yyyy-mm-dd or dd/mm/yyyy.</p>
          <p className="mt-1">Owner must exist in People & aliases.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost h-9 px-3 text-xs" type="button" onClick={downloadTemplate}>
            Download template
          </button>
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
