// utils/exporters.ts
import type { CampaignRow } from '@/types/campaign';

export type ExportFormat = 'csv-excel' | 'csv-rfc' | 'json';
export type ExportScope = 'all' | 'page';
export type ExportColumnsKind = 'visible' | 'all';

export type ColumnSpec = {
  id: string;
  label: string;
  // devuelve el valor “crudo” (no formateado). Puede ser string | number | null | undefined
  accessor: (r: CampaignRow) => any;
};

export type BuildRowsOpts = {
  rows: CampaignRow[];
  columns: ColumnSpec[];
  includeSummary?: boolean;
};

export function buildExportRows(opts: BuildRowsOpts): Array<Record<string, any>> {
  const { rows, columns, includeSummary } = opts;
  const out: Array<Record<string, any>> = [];

  for (const r of rows) {
    const o: Record<string, any> = {};
    for (const c of columns) {
      let v = c.accessor(r);
      // normaliza números (punto decimal)
      if (typeof v === 'number') v = normalizeNumber(v);
      o[c.label] = v ?? '';
    }
    out.push(o);
  }

  if (includeSummary) {
    // calculamos como en la tabla
    let vSent = 0, routing = 0, qty = 0, turnover = 0, margin = 0, wEcpm = 0;
    for (const r of rows) {
      vSent     += r.vSent || 0;
      routing   += r.routingCosts || 0;
      qty       += r.qty || 0;
      turnover  += r.turnover || 0;
      margin    += r.margin || 0;
      wEcpm     += (r.ecpm || 0) * (r.vSent || 0);
    }
    const weightedEcpm = vSent > 0 ? wEcpm / vSent : 0;
    const marginPct = turnover > 0 ? margin / turnover : null;

    const summary: Record<string, any> = {};
    if (columns.length > 0) {
      // mete "SUMMARY" en la primera columna visible y deja el resto vacío salvo agregados conocidos
      summary[columns[0].label] = 'SUMMARY';
      for (let i = 1; i < columns.length; i++) summary[columns[i].label] = '';
    }
    setIfPresent(summary, columns, 'V SENT', vSent);
    setIfPresent(summary, columns, 'ROUTING COSTS', routing);
    setIfPresent(summary, columns, 'QTY', qty);
    setIfPresent(summary, columns, 'TURNOVER', turnover);
    setIfPresent(summary, columns, 'MARGIN', margin);
    setIfPresent(summary, columns, 'MARGIN (%)', marginPct);
    setIfPresent(summary, columns, 'ECPM', weightedEcpm);

    out.unshift(summary);
  }

  return out;
}

function setIfPresent(
  row: Record<string, any>,
  cols: ColumnSpec[],
  label: string,
  val: number | null
) {
  const c = cols.find(c => c.label.toUpperCase() === label);
  if (!c) return;
  row[c.label] = val == null ? '' : normalizeNumber(val);
}

function normalizeNumber(n: number, decimals?: number) {
  // valores por defecto razonables
  const d =
    decimals ?? (Number.isInteger(n) ? 0 : 2);
  return Number(n.toFixed(d));
}

export function rowsToCSV(
  rows: Array<Record<string, any>>,
  delimiter: ';' | ','
): Blob {
  if (!rows.length) return new Blob([''], { type: 'text/csv;charset=utf-8' });

  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    // si contiene comillas, separador o saltos de línea -> comillado y escape ""
    if (/[",\n\r;]/.test(s) || s.includes(delimiter)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [];
  lines.push(headers.map(h => esc(h)).join(delimiter));
  for (const r of rows) {
    lines.push(headers.map(h => esc(r[h])).join(delimiter));
  }
  const text = lines.join('\r\n');
  return new Blob([text], { type: 'text/csv;charset=utf-8' });
}

export function rowsToJSON(
  rows: Array<Record<string, any>>
): Blob {
  return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
