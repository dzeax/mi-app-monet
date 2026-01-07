"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, AlertTriangle, Clock, Users } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { DataQualityTicket } from "@/types/crm";
import { chartTheme } from "@/components/charts/theme";

type Option = { label: string; value: string };

type DashboardTicket = DataQualityTicket & {
  assigneeLabel?: string | null;
  assigneeKey?: string | null;
};

type DashboardMeta = {
  assignees: string[];
  statuses: string[];
  types: string[];
  priorities: string[];
};

type TicketView = DashboardTicket & {
  assigneeLabel: string;
  createdLabel: string;
  etaLabel: string;
  ageDays: number | null;
  etaDays: number | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  searchText: string;
};

const STATUS_OPTIONS = ["Backlog", "Refining", "Ready", "In progress", "Validation", "Done"];
const PRIORITY_OPTIONS = ["P1", "P2", "P3"];
const DEFAULT_STATUSES = ["Ready", "In progress"];
const DEFAULT_ASSIGNEES = ["Stephane Rabarinala", "Lucas Vialatte"];
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_COLORS: Record<string, string> = {
  "In progress": "bg-amber-100 text-amber-800",
  Ready: "bg-blue-100 text-blue-800",
  Backlog: "bg-slate-100 text-slate-700",
  Refining: "bg-purple-100 text-purple-800",
  Validation: "bg-teal-100 text-teal-800",
  Done: "bg-emerald-50 text-emerald-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-rose-50 text-rose-700",
  P2: "bg-amber-50 text-amber-700",
  P3: "bg-slate-50 text-slate-600",
};

const normalizePersonKey = (value?: string | null) =>
  value?.trim().toLowerCase() ?? "";

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const parts = value.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return value;
};

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const diffDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / DAY_MS);

const toggleFilterValue = (values: string[], value: string) => {
  if (!value) return values;
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : Array.from(new Set([...values, value]));
};

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
  const itemRefs = useRef<(HTMLLabelElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const toggle = useCallback(
    (val: string) => {
      if (values.includes(val)) onChange(values.filter((v) => v !== val));
      else onChange([...values, val]);
    },
    [values, onChange],
  );

  const allSelected =
    values.length === options.length ||
    (values.length === 0 && options.length === 0);
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

  useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((idx) => {
          const next = (idx + 1) % options.length;
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((idx) => {
          const next = (idx - 1 + options.length) % options.length;
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[activeIdx];
        if (opt) toggle(opt.value);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, options, activeIdx, toggle]);

  return (
    <div className="relative" ref={ref}>
      <label className="text-xs font-medium text-[color:var(--color-text)]/70">
        {label}
      </label>
      <button
        type="button"
        className={`input h-10 w-full text-left truncate ${
          values.length > 0 ? "ring-1 ring-[color:var(--color-accent)]" : ""
        } focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]`}
        onClick={() => setOpen((v) => !v)}
        title={display}
      >
        {display}
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              if (values.length === 0 || values.length === options.length) {
                onChange([]);
              } else {
                onChange(options.map((o) => o.value));
              }
              setOpen(false);
            }}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <div className="max-h-48 overflow-auto">
            {options.map((opt, idx) => (
              <label
                key={opt.value}
                ref={(el) => (itemRefs.current[idx] = el)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)] ${
                  activeIdx === idx ? "bg-[color:var(--color-surface-2)]" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={values.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span className="flex-1">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CrmDqTicketsAnalyticsView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";

  const [rows, setRows] = useState<DashboardTicket[]>([]);
  const [meta, setMeta] = useState<DashboardMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<string[]>(DEFAULT_STATUSES);
  const [assigneeFilters, setAssigneeFilters] = useState<string[]>(DEFAULT_ASSIGNEES);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!meta?.assignees?.length) return;
    setAssigneeFilters((prev) => {
      const map = new Map(
        meta.assignees.map((name) => [normalizePersonKey(name), name]),
      );
      const next = prev.map((val) => map.get(normalizePersonKey(val)) ?? val);
      return Array.from(new Set(next.filter(Boolean)));
    });
  }, [meta]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ticketRes = await fetch(`/api/crm/dq-tickets-dashboard?client=${clientSlug}`);
      const ticketBody = await ticketRes.json().catch(() => null);
      if (!ticketRes.ok) {
        throw new Error(ticketBody?.error || `Failed to load tickets (${ticketRes.status})`);
      }
      const ticketList = Array.isArray(ticketBody?.tickets) ? ticketBody.tickets : [];
      setRows(ticketList);
      setMeta(ticketBody?.meta ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tickets");
    } finally {
      setLoading(false);
    }
  }, [clientSlug]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const viewRows = useMemo<TicketView[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows.map((ticket) => {
      const rawAssignee = ticket.assigneeLabel || ticket.jiraAssignee || ticket.owner || "";
      const assigneeLabel = rawAssignee.trim() || "Unassigned";
      const createdDate = parseLocalDate(ticket.assignedDate);
      const etaValue = ticket.etaDate || ticket.dueDate || null;
      const etaDate = parseLocalDate(etaValue);
      const ageDays =
        createdDate && !Number.isNaN(createdDate.getTime())
          ? Math.max(0, diffDays(createdDate, today))
          : null;
      const etaDays =
        etaDate && !Number.isNaN(etaDate.getTime())
          ? diffDays(today, etaDate)
          : null;
      const isOverdue = etaDays != null && etaDays < 0;
      const isDueSoon = etaDays != null && etaDays >= 0 && etaDays <= 7;
      const searchText = [
        ticket.ticketId,
        ticket.title,
        ticket.type,
        ticket.comments,
        ticket.priority,
        assigneeLabel,
        ticket.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return {
        ...ticket,
        assigneeLabel,
        createdLabel: formatDate(ticket.assignedDate),
        etaLabel: etaValue ? formatDate(etaValue) : "--",
        ageDays,
        etaDays,
        isOverdue,
        isDueSoon,
        searchText,
      };
    });
  }, [rows]);

  const statusOptions = useMemo<Option[]>(() => {
    const source = meta?.statuses?.length ? meta.statuses : rows.map((r) => r.status);
    const found = new Set(source.filter(Boolean));
    const merged = [
      ...STATUS_OPTIONS,
      ...Array.from(found).filter((s) => !STATUS_OPTIONS.includes(s)),
    ];
    return merged.map((value) => ({ label: value, value }));
  }, [rows, meta]);

  const assigneeOptions = useMemo<Option[]>(() => {
    const values = new Set<string>();
    DEFAULT_ASSIGNEES.forEach((name) => values.add(name));
    (meta?.assignees ?? []).forEach((name) => values.add(name));
    viewRows.forEach((row) => {
      if (row.assigneeLabel) values.add(row.assigneeLabel);
    });
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ label: value, value }));
  }, [meta, viewRows]);

  const priorityOptions = useMemo<Option[]>(() => {
    const source = meta?.priorities?.length
      ? meta.priorities
      : rows.map((row) => row.priority);
    const found = new Set(source.filter(Boolean));
    const merged = [
      ...PRIORITY_OPTIONS,
      ...Array.from(found).filter((item) => !PRIORITY_OPTIONS.includes(item)),
    ];
    return merged.map((value) => ({ label: value, value }));
  }, [meta, rows]);

  const typeOptions = useMemo<Option[]>(() => {
    const source = meta?.types?.length ? meta.types : rows.map((row) => row.type ?? "");
    const found = Array.from(new Set(source.filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b),
    );
    return found.map((value) => ({ label: value, value }));
  }, [meta, rows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const statusSet = new Set(statusFilters.map(normalizePersonKey));
    const assigneeSet = new Set(assigneeFilters.map(normalizePersonKey));
    const prioritySet = new Set(priorityFilters.map(normalizePersonKey));
    const typeSet = new Set(typeFilters.map(normalizePersonKey));
    return viewRows.filter((row) => {
      if (statusSet.size > 0 && !statusSet.has(normalizePersonKey(row.status))) return false;
      if (assigneeSet.size > 0 && !assigneeSet.has(normalizePersonKey(row.assigneeLabel))) return false;
      if (prioritySet.size > 0 && !prioritySet.has(normalizePersonKey(row.priority))) return false;
      if (typeSet.size > 0) {
        const typeValue = row.type ?? "";
        if (!typeSet.has(normalizePersonKey(typeValue))) return false;
      }
      if (query && !row.searchText.includes(query)) return false;
      return true;
    });
  }, [viewRows, statusFilters, assigneeFilters, priorityFilters, typeFilters, searchQuery]);

  const kpis = useMemo(() => {
    const overdue = filteredRows.filter((r) => r.isOverdue).length;
    const dueSoon = filteredRows.filter((r) => r.isDueSoon).length;
    const ages = filteredRows.map((r) => r.ageDays).filter((v) => Number.isFinite(v)) as number[];
    const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    return {
      total: filteredRows.length,
      overdue,
      dueSoon,
      avgAge,
    };
  }, [filteredRows]);

  const statusOwnerChart = useMemo(() => {
    const statusMap = new Map<string, Map<string, number>>();
    const ownerCounts = new Map<string, number>();
    filteredRows.forEach((row) => {
      const status = row.status || "Unknown";
      const owner = row.assigneeLabel || "Unassigned";
      const ownerMap = statusMap.get(status) ?? new Map<string, number>();
      ownerMap.set(owner, (ownerMap.get(owner) ?? 0) + 1);
      statusMap.set(status, ownerMap);
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    });
    const owners = Array.from(ownerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label], idx) => ({ label, key: `owner_${idx}` }));
    const ownerKeyMap = new Map(owners.map((owner) => [owner.key, owner.label]));
    const baseStatuses = STATUS_OPTIONS.filter((status) => statusMap.has(status));
    const extraStatuses = Array.from(statusMap.keys()).filter(
      (status) => !STATUS_OPTIONS.includes(status),
    );
    const statuses = [...baseStatuses, ...extraStatuses];
    const data = statuses.map((status) => {
      const entry: Record<string, number | string> = { status };
      owners.forEach((owner) => {
        entry[owner.key] = statusMap.get(status)?.get(owner.label) ?? 0;
      });
      entry.total = owners.reduce((acc, owner) => acc + Number(entry[owner.key] || 0), 0);
      return entry;
    });
    return { data, owners, ownerKeyMap };
  }, [filteredRows]);

  const priorityChartData = useMemo(() => {
    const counts = new Map<string, number>();
    filteredRows.forEach((row) => {
      const key = row.priority || "P3";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const extras = Array.from(counts.keys()).filter(
      (priority) => !PRIORITY_OPTIONS.includes(priority),
    );
    const ordered = [...PRIORITY_OPTIONS, ...extras].filter((priority) =>
      counts.has(priority),
    );
    return ordered.map((priority) => ({
      name: priority,
      value: counts.get(priority) ?? 0,
    }));
  }, [filteredRows]);

  const etaBucketData = useMemo(() => {
    const buckets = [
      { label: "Overdue", count: 0 },
      { label: "Due 0-7d", count: 0 },
      { label: "Due 8-14d", count: 0 },
      { label: "Due 15+d", count: 0 },
      { label: "No ETA", count: 0 },
    ];
    filteredRows.forEach((row) => {
      const days = row.etaDays;
      if (days == null) {
        buckets[4].count += 1;
      } else if (days < 0) {
        buckets[0].count += 1;
      } else if (days <= 7) {
        buckets[1].count += 1;
      } else if (days <= 14) {
        buckets[2].count += 1;
      } else {
        buckets[3].count += 1;
      }
    });
    return buckets;
  }, [filteredRows]);

  const handleStatusBarClick = useCallback((entry: any) => {
    const status = entry?.payload?.status;
    if (typeof status !== "string") return;
    setStatusFilters((prev) => toggleFilterValue(prev, status));
  }, []);

  const handlePriorityClick = useCallback((entry: any) => {
    const priority =
      typeof entry?.name === "string"
        ? entry.name
        : typeof entry?.payload?.name === "string"
        ? entry.payload.name
        : "";
    if (!priority) return;
    setPriorityFilters((prev) => toggleFilterValue(prev, priority));
  }, []);

  const clearFilters = () => {
    setStatusFilters([]);
    setAssigneeFilters([]);
    setPriorityFilters([]);
    setTypeFilters([]);
    setSearchQuery("");
  };

  const resetDefaults = () => {
    setStatusFilters(DEFAULT_STATUSES);
    setAssigneeFilters(DEFAULT_ASSIGNEES);
    setPriorityFilters([]);
    setTypeFilters([]);
    setSearchQuery("");
  };

  return (
    <div className="space-y-6" data-page="crm-dq-tickets-analytics">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
              DQ Tickets
            </h1>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
              Default focus on Stephane Rabarinala and Lucas Vialatte (Ready / In progress).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost h-10 px-4" type="button" onClick={loadTickets}>
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="relative z-10 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="kpi-frame flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-[color:var(--color-primary)]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Open tickets
              </div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">
                {loading ? "--" : kpis.total}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">
                Current filters
              </div>
            </div>
          </div>
          <div className="kpi-frame flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-amber-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Overdue
              </div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">
                {loading ? "--" : kpis.overdue}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">
                ETA in the past
              </div>
            </div>
          </div>
          <div className="kpi-frame flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-amber-500">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Due soon
              </div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">
                {loading ? "--" : kpis.dueSoon}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">
                ETA in 7 days
              </div>
            </div>
          </div>
          <div className="kpi-frame flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-[color:var(--color-primary)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                Avg age
              </div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">
                {loading ? "--" : kpis.avgAge != null ? `${kpis.avgAge}d` : "--"}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">
                Since assignment
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="card px-6 py-5">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          <MultiSelect
            label="Status"
            options={statusOptions}
            values={statusFilters}
            onChange={setStatusFilters}
            placeholder="All statuses"
          />
          <MultiSelect
            label="Owner"
            options={assigneeOptions}
            values={assigneeFilters}
            onChange={setAssigneeFilters}
            placeholder="All assignees"
          />
          <MultiSelect
            label="Priority"
            options={priorityOptions}
            values={priorityFilters}
            onChange={setPriorityFilters}
            placeholder="All priorities"
          />
          <MultiSelect
            label="Type"
            options={typeOptions}
            values={typeFilters}
            onChange={setTypeFilters}
            placeholder="All types"
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Search</label>
            <input
              type="search"
              className="input h-10 w-full"
              placeholder="Ticket, owner, comment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost h-9 px-3" type="button" onClick={resetDefaults}>
              Reset defaults
            </button>
            <button className="btn-ghost h-9 px-3" type="button" onClick={clearFilters}>
              Show all
            </button>
          </div>
          <span className="text-xs text-[color:var(--color-text)]/60">
            Filters update KPIs, charts, and ticket list.
          </span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Tickets by status</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              Click bars or legend to filter
            </span>
          </div>
          <div className="mt-4 min-h-[240px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : statusOwnerChart.data.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/60">
                No data for the selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusOwnerChart.data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="status"
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                  />
                  <YAxis
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltip.contentStyle}
                    itemStyle={chartTheme.tooltip.itemStyle}
                    labelStyle={chartTheme.tooltip.labelStyle}
                  />
                  <Legend
                    onClick={(entry: any) => {
                      const key = typeof entry?.dataKey === "string" ? entry.dataKey : "";
                      const label = statusOwnerChart.ownerKeyMap.get(key) ?? "";
                      if (!label) return;
                      setAssigneeFilters((prev) => toggleFilterValue(prev, label));
                    }}
                  />
                  {statusOwnerChart.owners.map((owner, idx) => (
                    <Bar
                      key={owner.key}
                      dataKey={owner.key}
                      name={owner.label}
                      stackId="status"
                      fill={chartTheme.palette[idx % chartTheme.palette.length]}
                      onClick={handleStatusBarClick}
                      cursor="pointer"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="card px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Priority mix</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              Click slices to filter
            </span>
          </div>
          <div className="mt-4 min-h-[240px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : priorityChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/60">
                No data for the selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={priorityChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="82%"
                    onClick={handlePriorityClick}
                    cursor="pointer"
                  >
                    {priorityChartData.map((entry, idx) => (
                      <Cell
                        key={entry.name}
                        fill={chartTheme.palette[idx % chartTheme.palette.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTheme.tooltip.contentStyle}
                    itemStyle={chartTheme.tooltip.itemStyle}
                    labelStyle={chartTheme.tooltip.labelStyle}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="card px-6 py-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[color:var(--color-text)]">ETA risk buckets</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              Overdue vs due soon
            </span>
          </div>
          <div className="mt-4 min-h-[220px] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/65">
                Loading chart...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text)]/60">
                No data for the selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={etaBucketData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                  />
                  <YAxis
                    tick={chartTheme.tick}
                    axisLine={chartTheme.axisLine}
                    tickLine={chartTheme.tickLine}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltip.contentStyle}
                    itemStyle={chartTheme.tooltip.itemStyle}
                    labelStyle={chartTheme.tooltip.labelStyle}
                  />
                  <Bar dataKey="count" name="Tickets" fill="var(--chart-3)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
      </section>

      <section className="card px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Ticket status</h2>
          <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
            {loading ? "Loading" : `${filteredRows.length} tickets`}
          </span>
        </div>
        <div className="mt-4 table-wrap">
          <table className="table min-w-[960px]">
            <thead>
              <tr>
                <th>Status</th>
                <th>Ticket</th>
                <th>Created</th>
                <th>Priority</th>
                <th>Owner</th>
                <th>Type</th>
                <th>ETA</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-[color:var(--color-text)]/60">
                    Loading tickets...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-[color:var(--color-text)]/60">
                    No tickets match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const statusClass = STATUS_COLORS[row.status] ?? "bg-slate-100 text-slate-700";
                  const priorityClass = PRIORITY_COLORS[row.priority] ?? "bg-slate-50 text-slate-600";
                  const etaClass = row.isOverdue
                    ? "text-red-600 font-semibold"
                    : row.isDueSoon
                    ? "text-amber-600 font-semibold"
                    : "text-[color:var(--color-text)]";
                  const etaMeta = row.isOverdue
                    ? "Overdue"
                    : row.isDueSoon
                    ? "Due soon"
                    : row.etaDays != null
                    ? `${row.etaDays}d`
                    : "";
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className={`dq-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="min-w-[240px]">
                        <div className="title-cell">
                          <div className="flex items-center gap-2">
                            {row.jiraUrl ? (
                              <a
                                href={row.jiraUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-[color:var(--color-primary)] hover:underline"
                              >
                                {row.ticketId}
                              </a>
                            ) : (
                              <span className="font-semibold">{row.ticketId}</span>
                            )}
                          </div>
                          <span className="title-meta-text">{row.title}</span>
                        </div>
                      </td>
                      <td>{row.createdLabel}</td>
                      <td>
                        <span className={`dq-priority-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClass}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td>{row.assigneeLabel}</td>
                      <td>
                        <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-text)]/80">
                          {row.type || "--"}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className={etaClass}>{row.etaLabel}</span>
                          {etaMeta ? (
                            <span className="text-[10px] text-[color:var(--color-text)]/60">{etaMeta}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[240px]">
                        <span
                          className="block truncate text-xs text-[color:var(--color-text)]/70"
                          title={row.comments ?? ""}
                        >
                          {row.comments || "--"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
