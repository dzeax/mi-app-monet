// components/export/ExportModal.tsx
'use client';

import { useMemo, useState } from 'react';
import MiniModal from '@/components/ui/MiniModal';
import { useAuth } from '@/context/AuthContext'; // 🆕 admin guard
import type { CampaignRow } from '@/types/campaign';
import {
  buildExportRows,
  rowsToCSV,
  rowsToJSON,
  downloadBlob,
  type ColumnSpec,
  type ExportScope,
  type ExportColumnsKind,
} from '@/utils/exporters';

type Props = {
  onClose: () => void;
  // filas ya filtradas y ordenadas (todas)
  allRows: CampaignRow[];
  // filas de la página actual (para scope=page)
  pageRows: CampaignRow[];
  // columnas visibles (para "visible")
  visibleColumns: ColumnSpec[];
  // columnas completas (para "all")
  allColumns: ColumnSpec[];
  defaultFilename?: string; // sin extensión
};

export default function ExportModal({
  onClose,
  allRows,
  pageRows,
  visibleColumns,
  allColumns,
  defaultFilename = 'campaigns_export',
}: Props) {
  const { isAdmin } = useAuth(); // 🆕

  const [format, setFormat] = useState<'csv-excel' | 'csv-rfc' | 'json'>('csv-excel');
  const [scope, setScope] = useState<ExportScope>('all');
  const [colsKind, setColsKind] = useState<ExportColumnsKind>('visible');
  const [includeSummary, setIncludeSummary] = useState(false);
  const [fileBase, setFileBase] = useState(defaultFilename);

  const effectiveRows = scope === 'all' ? allRows : pageRows;
  const effectiveColumns = colsKind === 'visible' ? visibleColumns : allColumns;
  const count = effectiveRows.length;

  const ext = format === 'json' ? 'json' : 'csv';
  const filename = `${fileBase}.${ext}`;

  // base y efectivo (admin-only)
  const canExportBase = count > 0 && effectiveColumns.length > 0;
  const canExport = canExportBase && !!isAdmin;

  function doExport() {
    if (!canExport) return;
    const rows = buildExportRows({
      rows: effectiveRows,
      columns: effectiveColumns,
      includeSummary,
    });

    if (format === 'json') {
      const blob = rowsToJSON(rows);
      downloadBlob(blob, filename);
      return;
    }

    const delimiter = format === 'csv-excel' ? ';' : ',';
    const blob = rowsToCSV(rows, delimiter);
    downloadBlob(blob, filename);
  }

  return (
    <MiniModal
      title="Export data"
      onClose={onClose}
      solid={false}
      widthClass="max-w-2xl w-[min(100vw-2rem,720px)]"
      footer={
        <>
          <div className="mr-auto text-xs opacity-80">
            {count === 0 ? 'No rows to export' : `Will export ${count} row${count === 1 ? '' : 's'}`}
          </div>
          {!isAdmin && (
            <div className="mr-2 text-xs text-[--color-accent]">
              Admin-only: exporting is disabled for your account.
            </div>
          )}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            onClick={doExport}
            disabled={!canExport}
            aria-disabled={!canExport}
            title={!isAdmin ? 'Admins only' : undefined}
          >
            Export
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        {/* Aviso admin-only */}
        {!isAdmin && (
          <div className="rounded-lg border border-[--color-accent]/40 bg-[--color-accent]/10 p-3 text-sm">
            <strong>Admin-only.</strong> You can adjust options, but exporting is disabled for non-admin users.
          </div>
        )}

        {/* Formato */}
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Format</legend>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="fmt" checked={format === 'csv-excel'} onChange={() => setFormat('csv-excel')} />
              CSV (Excel-friendly ; )
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="fmt" checked={format === 'csv-rfc'} onChange={() => setFormat('csv-rfc')} />
              CSV (RFC 4180 , )
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="fmt" checked={format === 'json'} onChange={() => setFormat('json')} />
              JSON
            </label>
          </div>
        </fieldset>

        {/* Ámbito */}
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Scope</legend>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
              All filtered rows
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="scope" checked={scope === 'page'} onChange={() => setScope('page')} />
              Current page only
            </label>
          </div>
        </fieldset>

        {/* Columnas */}
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Columns</legend>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="cols" checked={colsKind === 'visible'} onChange={() => setColsKind('visible')} />
              Visible only (default)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="cols" checked={colsKind === 'all'} onChange={() => setColsKind('all')} />
              All columns
            </label>
          </div>
        </fieldset>

        {/* Opciones extra */}
        <div className="flex items-center gap-2">
          <input
            id="incl-summary"
            type="checkbox"
            checked={includeSummary}
            onChange={(e) => setIncludeSummary(e.target.checked)}
          />
          <label htmlFor="incl-summary" className="text-sm">Include summary row</label>
        </div>

        {/* Nombre archivo */}
        <label className="text-sm grid gap-1">
          <span className="muted">File name</span>
          <div className="flex">
            <input
              className="input flex-1 rounded-r-none"
              value={fileBase}
              onChange={(e) => setFileBase(e.target.value.replace(/\.(csv|json)$/i, ''))}
            />
            <div className="input bg-[color:var(--color-surface-2)]/70 w-28 pointer-events-none rounded-l-none">
              .{format === 'json' ? 'json' : 'csv'}
            </div>
          </div>
        </label>
      </div>
    </MiniModal>
  );
}
