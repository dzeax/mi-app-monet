/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import CrmStrategyTicketModal, { type StrategyTicketDraft } from "@/components/crm/CrmStrategyTicketModal";
import { showError } from "@/utils/toast";
import { useAuth } from "@/context/AuthContext";

type EffortRow = {
  id: string;
  ticketId: string;
  effortDate: string | null;
  owner: string;
  hours: number;
  notes: string | null;
};

type StrategyRow = {
  id: string;
  clientSlug: string;
  jiraTicket: string;
  jiraUrl: string | null;
  title: string;
  status: string;
  category: string;
  createdDate: string | null;
  dueDate: string | null;
  jiraAssignee: string | null;
  brand: string | null;
  segment: string | null;
  notes: string | null;
  efforts: EffortRow[];
};

type Filters = {
  search: string;
  status: string[];
  category: string[];
  brand: string[];
};

const STATUS_OPTIONS = ["Backlog", "Refining", "Ready", "In progress", "Validation", "Done"];
const CATEGORY_DEFAULTS = [
  "Weekly Preparation",
  "Monthly Performance Review",
  "QBR Preparation",
  "Bimonthly Review",
  "Documentation",
  "Workshops",
];

type Option = { label: string; value: string };

function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = "All",
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const toggle = useCallback(
    (val: string) => {
      if (values.includes(val)) onChange(values.filter((v) => v !== val));
      else onChange([...values, val]);
    },
    [values, onChange],
  );

  const display =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label || values[0]
        : `${values.length} selected`;

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="text-xs font-medium text-[color:var(--color-text)]/70">{label}</label>
      <button
        type="button"
        className="input h-10 w-full flex items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{display}</span>
        <span className="text-[color:var(--color-text)]/60">{open ? "˄" : "˅"}</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              if (values.length === 0) onChange(options.map((o) => o.value));
              else onChange([]);
              setOpen(false);
            }}
          >
            {values.length === 0 ? "Select all" : "Clear all"}
          </button>
          <div className="max-h-56 overflow-auto">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
              >
                <input type="checkbox" checked={values.includes(opt.value)} onChange={() => toggle(opt.value)} />
                <span className="flex-1">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const formatNumber = (val: number) =>
  Number.isFinite(val)
    ? val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0,00";

const parseYearFromDate = (value?: string | null) => {
  if (!value || value.length < 4) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const buildJiraUrl = (ticket: string) =>
  ticket.startsWith("http") ? ticket : `https://europcarmobility.atlassian.net/browse/${ticket}`;

export default function CrmStrategyReportingView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const { isAdmin, isEditor } = useAuth();
  const currentYear = new Date().getFullYear();

  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [ratesByYear, setRatesByYear] = useState<Record<number, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: [],
    category: [],
    brand: [],
  });

  const [openEdit, setOpenEdit] = useState(false);
  const [editTicket, setEditTicket] = useState<StrategyTicketDraft | null>(null);

  const getRateForEffort = useCallback(
    (effort: EffortRow, fallbackDate?: string | null) => {
      const year =
        parseYearFromDate(effort.effortDate) ??
        parseYearFromDate(fallbackDate) ??
        currentYear;
      return ratesByYear[year]?.[effort.owner] ?? 0;
    },
    [currentYear, ratesByYear],
  );

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(ratesByYear).forEach((bucket) => {
      Object.keys(bucket).forEach((owner) => set.add(owner));
    });
    rows.forEach((r) => {
      r.efforts.forEach((e) => {
        if (e.owner) set.add(e.owner);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [ratesByYear, rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(CATEGORY_DEFAULTS);
    rows.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.brand) set.add(r.brand);
    });
    ["Europcar", "Goldcar"].forEach((b) => set.add(b));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/strategy-reporting?client=${clientSlug}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed to load (${res.status})`);
      const list: StrategyRow[] = Array.isArray(body?.rows) ? (body.rows as any) : [];
      setRows(list);

      const yearSet = new Set<number>();
      list.forEach((row) => {
        row.efforts.forEach((effort) => {
          const year =
            parseYearFromDate(effort.effortDate) ??
            parseYearFromDate(row.createdDate);
          if (year) yearSet.add(year);
        });
      });
      if (yearSet.size === 0) yearSet.add(currentYear);
      const years = Array.from(yearSet).sort((a, b) => a - b);

      const resRates = await fetch(
        `/api/crm/rates?client=${clientSlug}&years=${years.join(",")}`,
      );
      const bodyRates = await resRates.json().catch(() => null);
      if (resRates.ok && Array.isArray(bodyRates?.rates)) {
        const map: Record<number, Record<string, number>> = {};
        bodyRates.rates.forEach((rate: any) => {
          const year = Number(rate.year ?? currentYear);
          if (!Number.isFinite(year)) return;
          if (!map[year]) map[year] = {};
          if (rate.owner) map[year][rate.owner] = Number(rate.dailyRate ?? 0);
        });
        setRatesByYear(map);
      } else {
        setRatesByYear({});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load data";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [clientSlug, currentYear]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const computed = useMemo(() => {
    return rows.map((r) => {
      const totalHours = r.efforts.reduce((acc, e) => acc + Number(e.hours ?? 0), 0);
      const totalDays = totalHours / 7;
      const totalBudget = r.efforts.reduce((acc, e) => {
        const rate = getRateForEffort(e, r.createdDate);
        return acc + (Number(e.hours ?? 0) / 7) * rate;
      }, 0);
      const owners = Array.from(new Set(r.efforts.map((e) => e.owner).filter(Boolean)));
      return { ...r, totalHours, totalDays, totalBudget, ownersCount: owners.length };
    });
  }, [rows, getRateForEffort]);

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return computed.filter((r) => {
      if (term) {
        const hay = `${r.jiraTicket} ${r.title} ${r.category} ${r.brand || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (filters.status.length && !filters.status.includes(r.status)) return false;
      if (filters.category.length && !filters.category.includes(r.category)) return false;
      if (filters.brand.length && !filters.brand.includes(r.brand || "")) return false;
      return true;
    });
  }, [computed, filters]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.tickets += 1;
        acc.hours += r.totalHours;
        acc.days += r.totalDays;
        acc.budget += r.totalBudget;
        return acc;
      },
      { tickets: 0, hours: 0, days: 0, budget: 0 },
    );
  }, [filtered]);

  const openNew = () => {
    setEditTicket(null);
    setOpenEdit(true);
  };

  const openExisting = (r: any) => {
    const draft: StrategyTicketDraft = {
      id: r.id,
      jiraTicket: r.jiraTicket || "",
      jiraUrl: r.jiraUrl || "",
      title: r.title || "",
      status: r.status || STATUS_OPTIONS[0] || "Backlog",
      category: r.category || CATEGORY_DEFAULTS[0] || "Weekly Preparation",
      createdDate: r.createdDate || (r.createdAt ? String(r.createdAt).slice(0, 10) : ""),
      dueDate: r.dueDate || "",
      jiraAssignee: r.jiraAssignee || "",
      brand: r.brand || "",
      segment: r.segment || "",
      notes: r.notes || "",
      efforts: (r.efforts || []).map((e: any) => ({
        id: e.id,
        effortDate: e.effortDate || "",
        owner: e.owner || "",
        hoursText: String(e.hours ?? ""),
        notes: e.notes || "",
      })),
    };
    setEditTicket(draft);
    setOpenEdit(true);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
              <span className="rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--color-text)]/80">
                {clientSlug?.toUpperCase()} - Strategy
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Strategy Reporting</h1>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-[color:var(--color-text)] lg:grid-cols-4">
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Tickets</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">{totals.tickets}</div>
            </div>
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Hours</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">{formatNumber(totals.hours)}</div>
            </div>
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Days</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">{formatNumber(totals.days)}</div>
            </div>
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Budget (€)</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">{formatNumber(totals.budget)}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">Search</label>
              <input
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                className="input h-10 w-full"
                placeholder="JIRA, title, category..."
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <MultiSelect
                label="Status"
                options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))}
                values={filters.status}
                onChange={(vals) => setFilters((p) => ({ ...p, status: vals }))}
              />
            </div>
            <div className="min-w-[240px] flex-1">
              <MultiSelect
                label="Category"
                options={categoryOptions.map((c) => ({ label: c, value: c }))}
                values={filters.category}
                onChange={(vals) => setFilters((p) => ({ ...p, category: vals }))}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <MultiSelect
                label="Brand"
                options={brandOptions.map((b) => ({ label: b, value: b }))}
                values={filters.brand}
                onChange={(vals) => setFilters((p) => ({ ...p, brand: vals }))}
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isEditor || isAdmin ? (
                <button className="btn-primary h-10" type="button" onClick={openNew}>
                  New ticket
                </button>
              ) : null}
              <button className="btn-ghost h-10" type="button" onClick={fetchAll} disabled={loading}>
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)]/60 text-left text-[color:var(--color-text)]/80">
              <tr>
                <th className="px-3 py-3 font-semibold">Created</th>
                <th className="px-3 py-3 font-semibold">Category</th>
                <th className="px-3 py-3 font-semibold">Brand</th>
                <th className="px-3 py-3 font-semibold">Segment</th>
                <th className="px-3 py-3 font-semibold">Assignee</th>
                <th className="px-3 py-3 font-semibold w-[420px]">Title</th>
                <th className="px-3 py-3 font-semibold">Due</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold text-right">Hours</th>
                <th className="px-3 py-3 font-semibold text-right">Days</th>
                <th className="px-3 py-3 font-semibold text-right">Budget (€)</th>
                <th className="px-3 py-3 font-semibold">JIRA</th>
                <th className="px-3 py-3 font-semibold w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]/70 text-[color:var(--color-text)]">
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={13}>
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={13}>
                    {error}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={13}>
                    No tickets found.
                  </td>
                </tr>
              ) : (
                filtered.map((r: any) => (
                  <tr key={r.id} className="hover:bg-[color:var(--color-surface-2)]/40">
                    <td className="px-3 py-3">{r.createdDate || ""}</td>
                    <td className="px-3 py-3">{r.category}</td>
                    <td className="px-3 py-3">{r.brand || ""}</td>
                    <td className="px-3 py-3">{r.segment || ""}</td>
                    <td className="px-3 py-3">{r.jiraAssignee || ""}</td>
                    <td className="px-3 py-3 max-w-[420px] truncate" title={r.title || undefined}>
                      {r.title || "n/a"}
                    </td>
                    <td className="px-3 py-3">{r.dueDate || ""}</td>
                    <td className="px-3 py-3">{r.status}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(r.totalHours)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(r.totalDays)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(r.totalBudget)}</td>
                    <td className="px-3 py-3">
                      {r.jiraTicket ? (
                        <Link
                          href={r.jiraUrl || buildJiraUrl(r.jiraTicket)}
                          className="text-[color:var(--color-primary)] underline"
                          target="_blank"
                          title="Open in JIRA"
                        >
                          {r.jiraTicket}
                        </Link>
                      ) : (
                        "n/a"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {isEditor || isAdmin ? (
                        <button className="btn-ghost h-9 px-3" type="button" onClick={() => openExisting(r)}>
                          Edit
                        </button>
                      ) : (
                        <span className="text-xs text-[color:var(--color-text)]/60">View</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openEdit ? (
        <CrmStrategyTicketModal
          clientSlug={clientSlug}
          ownerOptions={ownerOptions}
          categoryOptions={categoryOptions}
          initial={editTicket ?? undefined}
          onSaved={fetchAll}
          onClose={() => {
            setOpenEdit(false);
            setEditTicket(null);
          }}
        />
      ) : null}
    </div>
  );
}
