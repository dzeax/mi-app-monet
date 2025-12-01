"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type Row = {
  id: string;
  clientSlug: string;
  week: number | null;
  year: number | null;
  campaignName: string;
  variant: string;
  brand: string;
  sendDate: string | null;
  market: string;
  scope: string;
  segment: string | null;
  touchpoint: string | null;
  owner: string;
  jiraTicket: string;
  status: string;
  hoursTotal: number;
  daysTotal: number;
  budgetEur: number | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return value;
};

export default function CrmCampaignReportingView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";

  const [rows, setRows] = useState<Row[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resRates = await fetch(`/api/crm/campaign-owner-rates?client=${clientSlug}`);
        const bodyRates = await resRates.json().catch(() => null);
        if (resRates.ok && bodyRates?.rates && active) {
          setRates(bodyRates.rates as Record<string, number>);
        }

        const res = await fetch(`/api/crm/campaign-email-units?client=${clientSlug}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Failed to load (${res.status})`);
        const list: Row[] = Array.isArray(body?.rows)
          ? body.rows.map((r: any) => ({
              id: r.id,
              clientSlug: r.clientSlug,
              week: r.week ?? null,
              year: r.year ?? null,
              campaignName: r.campaignName || r.campaign_name || "",
              variant: r.variant || "",
              brand: r.brand || "",
              sendDate: r.sendDate || null,
              market: r.market || "",
              scope: r.scope || "",
              segment: r.segment ?? null,
              touchpoint: r.touchpoint ?? null,
              owner: r.owner || "",
              jiraTicket: r.jiraTicket || "",
              status: r.status || "",
              hoursTotal: Number(r.hoursTotal ?? 0),
              daysTotal: Number(r.daysTotal ?? 0),
              budgetEur: r.budgetEur != null ? Number(r.budgetEur) : null,
            }))
          : [];
        if (active) setRows(list);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load data");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail?.client === clientSlug) void load();
    };
    window.addEventListener("crm:imported", handler);
    return () => {
      active = false;
      window.removeEventListener("crm:imported", handler);
    };
  }, [clientSlug]);

  const totals = useMemo(() => {
    const totalHours = rows.reduce((acc, r) => acc + r.hoursTotal, 0);
    const totalDays = rows.reduce((acc, r) => acc + r.daysTotal, 0);
    const totalBudget = rows.reduce((acc, r) => {
      const rate = rates[r.owner];
      if (rate != null) return acc + r.daysTotal * rate;
      return acc + (r.budgetEur ?? 0);
    }, 0);
    return { totalHours, totalDays, totalBudget };
  }, [rows, rates]);

  const exportCsv = async () => {
    if (rows.length === 0) return;
    try {
      setExporting(true);
      const header = [
        "date",
        "brand",
        "campaign",
        "market",
        "scope",
        "segment",
        "touchpoint",
        "variant",
        "owner",
        "status",
        "hours",
        "days",
        "budget_eur",
        "jira_ticket",
      ];
      const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
      const lines = rows.map((r) => {
        const rate = rates[r.owner];
        const budget =
          rate != null ? r.daysTotal * rate : r.budgetEur ?? r.daysTotal * 0;
        return [
          formatDate(r.sendDate) || "",
          r.brand,
          r.campaignName,
          r.market,
          r.scope,
          r.segment ?? "",
          r.touchpoint ?? "",
          r.variant ?? "",
          r.owner,
          r.status,
          r.hoursTotal.toFixed(2),
          r.daysTotal.toFixed(2),
          budget.toFixed(2),
          r.jiraTicket,
        ]
          .map((v) => escape(String(v ?? "")))
          .join(",");
      });
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign_reporting_${clientSlug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">
              Campaigns
            </p>
            <span className="rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--color-text)]/80">
              {clientSlug?.toUpperCase()} - Campaign Ops
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Campaign Reporting</h1>
          <p className="text-sm text-[color:var(--color-text)]/70">
            Track email production effort per campaign/market/segment.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-4 py-3 text-sm text-[color:var(--color-text)]/80">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">Rows</span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">{rows.length}</div>
          </div>
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">Hours</span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">
              {totals.totalHours.toFixed(2)}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">Days</span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">
              {totals.totalDays.toFixed(2)}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">Budget (€)</span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">
              {totals.totalBudget.toFixed(2)}
            </div>
          </div>
          <div className="flex-1" />
          <button
            className="btn-ghost"
            type="button"
            onClick={exportCsv}
            disabled={exporting || rows.length === 0}
          >
            {exporting ? "Exporting..." : "Download CSV"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        {error ? (
          <div className="px-4 py-3 text-sm text-[color:var(--color-text)]/75">{error}</div>
        ) : null}
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)]/60 text-left text-[color:var(--color-text)]/80">
              <tr>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 font-semibold">Brand</th>
                <th className="px-3 py-3 font-semibold">Campaign</th>
                <th className="px-3 py-3 font-semibold">Market</th>
                <th className="px-3 py-3 font-semibold">Scope</th>
                <th className="px-3 py-3 font-semibold">Segment</th>
                <th className="px-3 py-3 font-semibold">Touchpoint</th>
                <th className="px-3 py-3 font-semibold">Variant</th>
                <th className="px-3 py-3 font-semibold">Owner</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Hours</th>
                <th className="px-3 py-3 font-semibold">Days</th>
                <th className="px-3 py-3 font-semibold">Budget (€)</th>
                <th className="px-3 py-3 font-semibold">JIRA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]/70 text-[color:var(--color-text)]">
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={12}>
                    Loading...
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[color:var(--color-surface-2)]/40">
                    <td className="px-3 py-3 font-semibold">
                      {r.sendDate ? formatDate(r.sendDate) : ""}
                    </td>
                    <td className="px-3 py-3">{r.brand}</td>
                    <td className="px-3 py-3">{r.campaignName || "n/a"}</td>
                    <td className="px-3 py-3">{r.market}</td>
                    <td className="px-3 py-3">{r.scope}</td>
                    <td className="px-3 py-3">{r.segment || "n/a"}</td>
                    <td className="px-3 py-3">{r.touchpoint || "n/a"}</td>
                    <td className="px-3 py-3">{r.variant || "n/a"}</td>
                    <td className="px-3 py-3 font-semibold">{r.owner}</td>
                    <td className="px-3 py-3">{r.status}</td>
                    <td className="px-3 py-3">{r.hoursTotal.toFixed(2)}</td>
                    <td className="px-3 py-3">{r.daysTotal.toFixed(2)}</td>
                    <td className="px-3 py-3">
                      {(() => {
                        const rate = rates[r.owner];
                        const budget = rate != null ? r.daysTotal * rate : r.budgetEur ?? 0;
                        return budget.toFixed(2);
                      })()}
                    </td>
                    <td className="px-3 py-3">
                      {r.jiraTicket ? (
                        <Link
                          href={r.jiraTicket.startsWith("http") ? r.jiraTicket : `https://europcarmobility.atlassian.net/browse/${r.jiraTicket}`}
                          className="text-[color:var(--color-primary)] underline"
                          target="_blank"
                        >
                          {r.jiraTicket}
                        </Link>
                      ) : (
                        "n/a"
                      )}
                    </td>
                  </tr>
                ))
              )}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={12}>
                    No data yet. Import a CSV to get started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}




