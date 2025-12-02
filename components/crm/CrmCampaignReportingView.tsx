"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import ColumnPicker from "@/components/ui/ColumnPicker";
import GeoFlag from "@/components/GeoFlag";

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

type Filters = {
  search: string;
  brand: string[];
  market: string[];
  scope: string[];
  segment: string[];
  touchpoint: string[];
  owner: string[];
  status: string[];
};

type ComputedRow = Row & { budgetValue: number };

type SortKey = "sendDate" | "hoursTotal" | "daysTotal" | "budgetValue";
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  Sent: "bg-blue-100 text-blue-800",
  Done: "bg-emerald-100 text-emerald-800",
  Planned: "bg-slate-100 text-slate-800",
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

const formatNumber = (val: number) =>
  Number.isFinite(val)
    ? val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0,00";

const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const effortHeaderCls =
  "bg-[color:var(--color-surface-2)]/70 border-l border-[color:var(--color-border)]/70";
const effortCellCls = "bg-[color:var(--color-surface-2)]/40";

type Option = { label: string; value: string };

function MultiSelect({
  label,
  options,
  values,
  onChange,
  counts,
  placeholder = "All",
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (vals: string[]) => void;
  counts?: Record<string, number>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLLabelElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const toggle = (val: string) => {
    if (values.includes(val)) onChange(values.filter((v) => v !== val));
    else onChange([...values, val]);
  };

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
      if (!open || options.length === 0) return;
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
  }, [open, options, activeIdx]);

  return (
    <div className="relative" ref={ref}>
      <label className="text-xs font-medium text-[color:var(--color-text)]/70">
        {label}
      </label>
      <button
        type="button"
        className={`input h-10 w-full text-left truncate ${values.length > 0 ? "ring-1 ring-[color:var(--color-accent)]" : ""} focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]`}
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
              if (values.length === 0 || values.length === options.length)
                onChange([]);
              else onChange(options.map((o) => o.value));
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
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)] ${activeIdx === idx ? "bg-[color:var(--color-surface-2)]" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={values.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span className="flex-1">
                  {opt.label}
                  {counts?.[opt.value] != null ? ` (${counts[opt.value]})` : ""}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const buildJiraUrl = (ticket: string) =>
  ticket.startsWith("http")
    ? ticket
    : `https://europcarmobility.atlassian.net/browse/${ticket}`;

export default function CrmCampaignReportingView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const currentYearStart = `${new Date().getFullYear()}-01-01`;

  const [rows, setRows] = useState<Row[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    brand: [],
    market: [],
    scope: [],
    segment: [],
    touchpoint: [],
    owner: [],
    status: [],
  });
  const today = new Date();
  const startOfThisMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const endOfThisMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const [dateFrom, setDateFrom] = useState(startOfThisMonth);
  const [dateTo, setDateTo] = useState<string>(endOfThisMonth);
  const [datePreset, setDatePreset] = useState<"this-week" | "last-week" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "last-year" | "">("this-month");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>("sendDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [compact, setCompact] = useState(false);
  const COLVIS_STORAGE_KEY = "campaign_colvis_v1";
  const columnOptions = useMemo(
    () =>
      [
        { id: "date", label: "Date" },
        { id: "brand", label: "Brand" },
        { id: "campaign", label: "Campaign" },
        { id: "market", label: "Market" },
        { id: "scope", label: "Scope" },
        { id: "segment", label: "Segment" },
        { id: "touchpoint", label: "Touchpoint" },
        { id: "variant", label: "Variant" },
        { id: "owner", label: "Owner" },
        { id: "status", label: "Status" },
        { id: "hours", label: "Hours" },
        { id: "days", label: "Days" },
        { id: "budget", label: "Budget (€)" },
        { id: "jira", label: "JIRA" },
      ] as const,
    [],
  );
  const defaultVisible = useMemo(
    () => columnOptions.map((c) => c.id),
    [columnOptions],
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(defaultVisible),
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const makeClearAndResetPage = useCallback(
    (fn: () => void) => () => {
      fn();
      setPage(0);
    },
    [],
  );

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

        const params = new URLSearchParams({ client: clientSlug });
        if (dateFrom) params.append("from", dateFrom);
        if (dateTo) params.append("to", dateTo);

        const res = await fetch(`/api/crm/campaign-email-units?${params.toString()}`);
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
  }, [clientSlug, dateFrom, dateTo]);

  const rowMatchesFilters = useCallback(
    (r: Row, exclude?: keyof Filters) => {
      if (dateFrom && (!r.sendDate || r.sendDate < dateFrom)) return false;
      if (dateTo && (!r.sendDate || r.sendDate > dateTo)) return false;
      if (exclude !== "brand" && filters.brand.length && !filters.brand.includes(r.brand || "")) return false;
      if (exclude !== "market" && filters.market.length && !filters.market.includes(r.market || "")) return false;
      if (exclude !== "scope" && filters.scope.length && !filters.scope.includes(r.scope || "")) return false;
      if (exclude !== "segment" && filters.segment.length && !filters.segment.includes(r.segment || "")) return false;
      if (exclude !== "touchpoint" && filters.touchpoint.length && !filters.touchpoint.includes(r.touchpoint || "")) return false;
      if (exclude !== "owner" && filters.owner.length && !filters.owner.includes(r.owner || "")) return false;
      if (exclude !== "status" && filters.status.length && !filters.status.includes(r.status || "")) return false;
      if (exclude !== "search" && filters.search) {
        const term = filters.search.toLowerCase();
        const haystack = [
          r.campaignName,
          r.brand,
          r.jiraTicket,
          r.market,
          r.segment ?? "",
          r.touchpoint ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    },
    [filters, dateFrom, dateTo],
  );

  const filterOptions = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.filter((v): v is string => !!v))).sort();
    const countEntries = (vals: (string | null)[]) => {
      const map = new Map<string, number>();
      vals.forEach((v) => {
        if (!v) return;
        map.set(v, (map.get(v) || 0) + 1);
      });
      return Object.fromEntries(map);
    };

    const subset = (exclude: keyof Filters) => rows.filter((r) => rowMatchesFilters(r, exclude));

    return {
      brand: {
        values: uniq(subset("brand").map((r) => r.brand)),
        counts: countEntries(subset("brand").map((r) => r.brand)),
      },
      market: {
        values: uniq(subset("market").map((r) => r.market)),
        counts: countEntries(subset("market").map((r) => r.market)),
      },
      scope: {
        values: uniq(subset("scope").map((r) => r.scope)),
        counts: countEntries(subset("scope").map((r) => r.scope)),
      },
      segment: {
        values: uniq(subset("segment").map((r) => r.segment)),
        counts: countEntries(subset("segment").map((r) => r.segment)),
      },
      touchpoint: {
        values: uniq(subset("touchpoint").map((r) => r.touchpoint)),
        counts: countEntries(subset("touchpoint").map((r) => r.touchpoint)),
      },
      owner: {
        values: uniq(subset("owner").map((r) => r.owner)),
        counts: countEntries(subset("owner").map((r) => r.owner)),
      },
      status: {
        values: uniq(subset("status").map((r) => r.status)),
        counts: countEntries(subset("status").map((r) => r.status)),
      },
    };
  }, [rows, rowMatchesFilters]);

  const handleFilterChange = (key: keyof Filters, value: string | string[]) => {
    setFilters((prev) => ({ ...prev, [key]: value as any }));
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      brand: [],
      market: [],
      scope: [],
      segment: [],
      touchpoint: [],
      owner: [],
      status: [],
    });
    setDatePreset("this-month");
    setDateFrom(startOfThisMonth);
    setDateTo(endOfThisMonth);
  };

  const filteredRows = useMemo(
    () => rows.filter((r) => rowMatchesFilters(r)),
    [rows, rowMatchesFilters],
  );

  const computedRows = useMemo<ComputedRow[]>(() => {
    return filteredRows.map((r) => {
      const rate = rates[r.owner];
      const budgetValue = rate != null ? r.daysTotal * rate : r.budgetEur ?? 0;
      return { ...r, budgetValue };
    });
  }, [filteredRows, rates]);

  const activeChips = useMemo(() => {
    const chips: { label: string; onClear: () => void }[] = [];
    const addChip = (label: string, clearFn: () => void) =>
      chips.push({ label, onClear: makeClearAndResetPage(clearFn) });

    if (filters.brand.length) addChip(`Brand: ${filters.brand.join(", ")}`, () => handleFilterChange("brand", []));
    if (filters.market.length) addChip(`Market: ${filters.market.join(", ")}`, () => handleFilterChange("market", []));
    if (filters.scope.length) addChip(`Scope: ${filters.scope.join(", ")}`, () => handleFilterChange("scope", []));
    if (filters.segment.length) addChip(`Segment: ${filters.segment.join(", ")}`, () => handleFilterChange("segment", []));
    if (filters.touchpoint.length)
      addChip(`Touchpoint: ${filters.touchpoint.join(", ")}`, () => handleFilterChange("touchpoint", []));
    if (filters.owner.length) addChip(`Owner: ${filters.owner.join(", ")}`, () => handleFilterChange("owner", []));
    if (filters.status.length) addChip(`Status: ${filters.status.join(", ")}`, () => handleFilterChange("status", []));
    if (filters.search) addChip(`Search: ${filters.search}`, () => handleFilterChange("search", ""));
    if ((dateFrom && dateFrom !== startOfThisMonth) || dateTo !== endOfThisMonth)
      addChip(
        `Date: ${dateFrom || "--"} -> ${dateTo || "--"}`,
        makeClearAndResetPage(() => {
          setDatePreset("");
          setDateFrom("");
          setDateTo("");
        }),
      );
    return chips;
  }, [
    filters.brand,
    filters.market,
    filters.scope,
    filters.segment,
    filters.touchpoint,
    filters.owner,
    filters.status,
    filters.search,
    dateFrom,
    dateTo,
    currentYearStart,
    handleFilterChange,
    makeClearAndResetPage,
  ]);

  useEffect(() => {
    const raw = typeof window !== "undefined"
      ? localStorage.getItem(COLVIS_STORAGE_KEY)
      : null;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((id: unknown) =>
          typeof id === "string" && defaultVisible.includes(id),
        );
        if (valid.length > 0) setVisibleCols(new Set(valid));
      }
    } catch {
      /* ignore */
    }
  }, [COLVIS_STORAGE_KEY, defaultVisible]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      COLVIS_STORAGE_KEY,
      JSON.stringify(Array.from(visibleCols)),
    );
  }, [COLVIS_STORAGE_KEY, visibleCols]);

  const showCol = useCallback(
    (id: string) => {
      if (id === "jira") return visibleCols.has(id);
      return visibleCols.has(id);
    },
    [visibleCols],
  );

  const columnCount = useMemo(() => {
    let count = 0;
    columnOptions.forEach((c) => {
      if (showCol(c.id)) count += 1;
    });
    return Math.max(count, 1);
  }, [columnOptions, showCol]);

  const applyDatePreset = useCallback((preset: typeof datePreset) => {
    const today = new Date();
    const startOfWeek = (offsetWeeks: number) => {
      const d = new Date(today);
      const day = d.getDay(); // 0 Sunday
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offsetWeeks * 7;
      d.setDate(diff);
      return d;
    };
    const startOfMonth = (offsetMonths: number) =>
      new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
    const endOfMonth = (offsetMonths: number) =>
      new Date(today.getFullYear(), today.getMonth() + offsetMonths + 1, 0);
    const startOfQuarter = (offsetQuarters: number) => {
      const currentQuarter = Math.floor(today.getMonth() / 3);
      const qStartMonth = (currentQuarter + offsetQuarters) * 3;
      const year = today.getFullYear() + Math.floor(qStartMonth / 12);
      const month = ((qStartMonth % 12) + 12) % 12;
      return new Date(year, month, 1);
    };
    const endOfQuarter = (offsetQuarters: number) => {
      const start = startOfQuarter(offsetQuarters);
      return new Date(start.getFullYear(), start.getMonth() + 3, 0);
    };
    const startOfYear = (offsetYears: number) => new Date(today.getFullYear() + offsetYears, 0, 1);
    const endOfYear = (offsetYears: number) => new Date(today.getFullYear() + offsetYears, 11, 31);

    let from = "";
    let to = "";

    switch (preset) {
      case "this-week":
        from = formatLocalDate(startOfWeek(0));
        to = formatLocalDate(new Date(startOfWeek(0).getFullYear(), startOfWeek(0).getMonth(), startOfWeek(0).getDate() + 6));
        break;
      case "last-week": {
        const start = startOfWeek(-1);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        from = formatLocalDate(start);
        to = formatLocalDate(end);
        break;
      }
      case "this-month":
        from = formatLocalDate(startOfMonth(0));
        to = formatLocalDate(endOfMonth(0));
        break;
      case "last-month":
        from = formatLocalDate(startOfMonth(-1));
        to = formatLocalDate(endOfMonth(-1));
        break;
      case "this-quarter":
        from = formatLocalDate(startOfQuarter(0));
        to = formatLocalDate(endOfQuarter(0));
        break;
      case "last-quarter":
        from = formatLocalDate(startOfQuarter(-1));
        to = formatLocalDate(endOfQuarter(-1));
        break;
      case "this-year":
        from = formatLocalDate(startOfYear(0));
        to = formatLocalDate(endOfYear(0));
        break;
      case "last-year":
        from = formatLocalDate(startOfYear(-1));
        to = formatLocalDate(endOfYear(-1));
        break;
      default:
        // Custom range: don't override manual dates
        setDatePreset(preset);
        return;
    }
    setDateFrom(from);
    setDateTo(to);
    setDatePreset(preset);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [
    filters.search,
    filters.brand,
    filters.market,
    filters.scope,
    filters.segment,
    filters.touchpoint,
    filters.owner,
    filters.status,
  ]);

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(computedRows.length / pageSize) - 1, 0);
    if (page > maxPage) setPage(maxPage);
  }, [computedRows.length, pageSize, page]);

  const totals = useMemo(() => {
    const totalHours = computedRows.reduce((acc, r) => acc + r.hoursTotal, 0);
    const totalDays = computedRows.reduce((acc, r) => acc + r.daysTotal, 0);
    const totalBudget = computedRows.reduce((acc, r) => acc + r.budgetValue, 0);
    return { totalHours, totalDays, totalBudget };
  }, [computedRows]);

  const sortedRows = useMemo(() => {
    const list = [...computedRows];
    const cmp = (a: any, b: any) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "sendDate": {
          const av = a.sendDate || "";
          const bv = b.sendDate || "";
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
        }
        case "hoursTotal": {
          return (a.hoursTotal - b.hoursTotal) * dir;
        }
        case "daysTotal": {
          return (a.daysTotal - b.daysTotal) * dir;
        }
        case "budgetValue": {
          return (a.budgetValue - b.budgetValue) * dir;
        }
        default:
          return 0;
      }
    };
    list.sort(cmp);
    return list;
  }, [computedRows, sortDir, sortKey]);

  const pagedRows = useMemo(() => {
    if (sortedRows.length <= pageSize) return sortedRows;
    const start = Math.min(page * pageSize, Math.max(sortedRows.length - 1, 0));
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const totalPages = Math.max(Math.ceil(sortedRows.length / pageSize), 1);
  const startIdx = sortedRows.length === 0 ? 0 : page * pageSize + 1;
  const endIdx = Math.min(sortedRows.length, (page + 1) * pageSize);
  const tableDensityClass = compact
    ? "text-xs [&_td]:py-2 [&_td]:px-2 [&_th]:py-2 [&_th]:px-2"
    : "";

  const sortHeaderClass = useCallback(
    (key: SortKey) =>
      sortKey === key
        ? "bg-[color:var(--color-surface-2)]/80 text-[color:var(--color-accent)] border-[color:var(--color-accent)]"
        : "",
    [sortKey],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);


  const exportCsv = async () => {
    if (sortedRows.length === 0) return;
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
      const lines = sortedRows.map((r) => {
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">
                Campaigns
              </p>
              <span className="rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--color-text)]/80">
                {clientSlug?.toUpperCase()} - Campaign Ops
              </span>
            </div>
            <h1
              className="text-2xl font-semibold text-[color:var(--color-text)]"
              title="Track email production effort per campaign/market/segment."
            >
              Campaign Reporting
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-[color:var(--color-text)] lg:grid-cols-4">
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Rows</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">{filteredRows.length}</div>
            </div>
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Hours</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">
                {formatNumber(totals.totalHours)}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Days</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">
                {formatNumber(totals.totalDays)}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase text-[color:var(--color-text)]/60">Budget (€)</span>
              <div className="text-lg font-semibold text-[color:var(--color-text)]">
                {formatNumber(totals.totalBudget)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Search
              </label>
              <input
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                className="input h-10 w-full"
                placeholder="Campaign, brand, JIRA..."
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <MultiSelect
                label="Owner"
                options={filterOptions.owner.values.map((s) => ({ label: s, value: s }))}
                values={filters.owner}
                counts={filterOptions.owner.counts}
                onChange={(vals) => handleFilterChange("owner", vals)}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <MultiSelect
                label="Brand"
                options={filterOptions.brand.values.map((s) => ({ label: s, value: s }))}
                values={filters.brand}
                counts={filterOptions.brand.counts}
                onChange={(vals) => handleFilterChange("brand", vals)}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <MultiSelect
                label="Market"
                options={filterOptions.market.values.map((s) => ({ label: s, value: s }))}
                values={filters.market}
                counts={filterOptions.market.counts}
                onChange={(vals) => handleFilterChange("market", vals)}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <MultiSelect
                label="Scope"
                options={filterOptions.scope.values.map((s) => ({ label: s, value: s }))}
                values={filters.scope}
                counts={filterOptions.scope.counts}
                onChange={(vals) => handleFilterChange("scope", vals)}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <MultiSelect
                label="Segment"
                options={filterOptions.segment.values.map((s) => ({ label: s, value: s }))}
                values={filters.segment}
                counts={filterOptions.segment.counts}
                onChange={(vals) => handleFilterChange("segment", vals)}
              />
            </div>
            <div className="min-w-[180px] flex-1 flex flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">Date range</label>
              <select
                className="input h-10"
                value={datePreset}
                onChange={(e) => applyDatePreset(e.target.value as typeof datePreset)}
              >
                <option value="this-week">This week</option>
                <option value="last-week">Last week</option>
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="this-quarter">This quarter</option>
                <option value="last-quarter">Last quarter</option>
                <option value="this-year">This year</option>
                <option value="last-year">Last year</option>
                <option value="">Custom range</option>
              </select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="btn-primary h-10"
                type="button"
                onClick={() => {
                  clearFilters();
                  setPage(0);
                }}
              >
                Clear filters
              </button>
              <button
                className="btn-ghost h-10"
                type="button"
                onClick={() => setOpenAdvanced((v) => !v)}
              >
                {openAdvanced ? "Hide filters" : "More filters"}
                {(filters.status.length ||
                  filters.touchpoint.length ||
                  datePreset === "") && !openAdvanced
                  ? " *"
                  : ""}
              </button>
            </div>
          </div>
          {openAdvanced ? (
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              <MultiSelect
                label="Touchpoint"
                options={filterOptions.touchpoint.values.map((s) => ({ label: s, value: s }))}
                values={filters.touchpoint}
                counts={filterOptions.touchpoint.counts}
                onChange={(vals) => handleFilterChange("touchpoint", vals)}
              />
              <MultiSelect
                label="Status"
                options={filterOptions.status.values.map((s) => ({ label: s, value: s }))}
                values={filters.status}
                counts={filterOptions.status.counts}
                onChange={(vals) => handleFilterChange("status", vals)}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[color:var(--color-text)]/70">From</label>
                <input
                  type="date"
                  className="input input-date h-10"
                  value={dateFrom}
                  onChange={(e) => {
                    setDatePreset("");
                    setDateFrom(e.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[color:var(--color-text)]/70">To</label>
                <input
                  type="date"
                  className="input input-date h-10"
                  value={dateTo}
                  onChange={(e) => {
                    setDatePreset("");
                    setDateTo(e.target.value);
                  }}
                />
              </div>
              {(dateFrom && dateFrom !== currentYearStart) || dateTo ? (
                <div className="flex items-end">
                  <button
                    className="btn-ghost h-10"
                    type="button"
                    onClick={() => {
                      setDatePreset("this-year");
                      setDateFrom(currentYearStart);
                      setDateTo("");
                    }}
                  >
                    Clear dates
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-[color:var(--color-text)]/80">
          {activeChips.map((chip, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2.5 py-1"
            >
              {chip.label}
              <button
                className="text-[color:var(--color-accent)]"
                onClick={chip.onClear}
                aria-label="Clear filter"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-[color:var(--color-border)]/70 px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-[color:var(--color-text)]/80">
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
              className="h-4 w-4"
            />
            Compact view
          </label>
          <div className="relative" ref={actionsRef}>
            <button
              className="btn-ghost h-9 w-9 text-lg"
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              aria-label="Table actions"
            >
              ⋯
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-44 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
                <button
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                  onClick={() => {
                    setShowColumnPicker(true);
                    setActionsOpen(false);
                  }}
                >
                  Columns
                </button>
                <button
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setActionsOpen(false);
                    void exportCsv();
                  }}
                  disabled={exporting || sortedRows.length === 0}
                >
                  {exporting ? "Exporting..." : "Download CSV"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="px-4 py-3 text-sm text-[color:var(--color-text)]/75">{error}</div>
        ) : null}
        <div className="overflow-auto">
          <table className={`min-w-full text-sm ${tableDensityClass}`}>
            <thead className="bg-[color:var(--color-surface-2)]/60 text-left text-[color:var(--color-text)]/80">
              <tr>
                {showCol("date") ? (
                  <th className={`px-3 py-3 font-semibold border-b-2 border-transparent ${sortHeaderClass("sendDate")}`}>
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("sendDate");
                        setSortDir((prev) =>
                          sortKey === "sendDate" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Date
                      {sortKey === "sendDate" ? (
                        <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("brand") ? (
                  <th className="px-3 py-3 font-semibold">Brand</th>
                ) : null}
                {showCol("campaign") ? (
                  <th className="px-3 py-3 font-semibold w-[340px]">Campaign</th>
                ) : null}
                {showCol("market") ? (
                  <th className="px-3 py-3 font-semibold">Market</th>
                ) : null}
                {showCol("scope") ? (
                  <th className="px-3 py-3 font-semibold">Scope</th>
                ) : null}
                {showCol("segment") ? (
                  <th className="px-3 py-3 font-semibold">Segment</th>
                ) : null}
                {showCol("touchpoint") ? (
                  <th className="px-3 py-3 font-semibold">Touchpoint</th>
                ) : null}
                {showCol("variant") ? (
                  <th className="px-3 py-3 font-semibold">Variant</th>
                ) : null}
                {showCol("owner") ? (
                  <th className="px-3 py-3 font-semibold">Owner</th>
                ) : null}
                {showCol("status") ? (
                  <th className="px-3 py-3 font-semibold">Status</th>
                ) : null}
                {showCol("hours") ? (
                  <th
                    className={`px-3 py-3 font-semibold border-b-2 border-transparent text-right ${effortHeaderCls} ${sortHeaderClass("hoursTotal")}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("hoursTotal");
                        setSortDir((prev) =>
                          sortKey === "hoursTotal" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Hours
                      {sortKey === "hoursTotal" ? (
                        <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("days") ? (
                  <th
                    className={`px-3 py-3 font-semibold border-b-2 border-transparent text-right ${effortHeaderCls} ${sortHeaderClass("daysTotal")}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("daysTotal");
                        setSortDir((prev) =>
                          sortKey === "daysTotal" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Days
                      {sortKey === "daysTotal" ? (
                        <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("budget") ? (
                  <th
                    className={`px-3 py-3 font-semibold border-b-2 border-transparent text-right ${effortHeaderCls} ${sortHeaderClass("budgetValue")}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("budgetValue");
                        setSortDir((prev) =>
                          sortKey === "budgetValue" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Budget (€)
                      {sortKey === "budgetValue" ? (
                        <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("jira") ? (
                  <th className="px-3 py-3 font-semibold">JIRA</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]/70 text-[color:var(--color-text)]">
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={columnCount}>
                    Loading...
                  </td>
                </tr>
              ) : (
                pagedRows.map((r) => (
                  <tr key={r.id} className="hover:bg-[color:var(--color-surface-2)]/40">
                    {showCol("date") ? (
                      <td className="px-3 py-3 font-semibold">
                        {r.sendDate ? formatDate(r.sendDate) : ""}
                      </td>
                    ) : null}
                    {showCol("brand") ? (
                      <td className="px-3 py-3">
                        {r.brand ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              r.brand === "Europcar + Goldcar"
                                ? "bg-slate-100 text-slate-800"
                                : r.brand === "Europcar"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : r.brand === "Goldcar"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]"
                            }`}
                          >
                            {r.brand}
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-text)]/55">n/a</span>
                        )}
                      </td>
                    ) : null}
                    {showCol("campaign") ? (
                      <td
                        className={`px-3 py-3 max-w-[340px] ${compact ? "truncate whitespace-nowrap" : "line-clamp-2 break-words"}`}
                        title={r.campaignName || undefined}
                      >
                        {r.campaignName || "n/a"}
                      </td>
                    ) : null}
                    {showCol("market") ? (
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2">
                          {r.market ? <GeoFlag geo={r.market} /> : null}
                          <span>{r.market || "n/a"}</span>
                        </span>
                      </td>
                    ) : null}
                    {showCol("scope") ? <td className="px-3 py-3">{r.scope}</td> : null}
                    {showCol("segment") ? (
                      <td className="px-3 py-3">{r.segment || "n/a"}</td>
                    ) : null}
                    {showCol("touchpoint") ? (
                      <td className="px-3 py-3">{r.touchpoint || "n/a"}</td>
                    ) : null}
                    {showCol("variant") ? (
                      <td className="px-3 py-3">{r.variant || "n/a"}</td>
                    ) : null}
                    {showCol("owner") ? (
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-text)]">
                          {r.owner || "n/a"}
                        </span>
                      </td>
                    ) : null}
                    {showCol("status") ? (
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            STATUS_COLORS[r.status] ||
                            "bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]"
                          }`}
                        >
                          {r.status || "n/a"}
                        </span>
                      </td>
                    ) : null}
                    {showCol("hours") ? (
                      <td className={`px-3 py-3 text-right ${effortCellCls}`}>
                        {formatNumber(r.hoursTotal)}
                      </td>
                    ) : null}
                    {showCol("days") ? (
                      <td className={`px-3 py-3 text-right ${effortCellCls}`}>
                        {formatNumber(r.daysTotal)}
                      </td>
                    ) : null}
                    {showCol("budget") ? (
                      <td className={`px-3 py-3 text-right ${effortCellCls}`}>
                        {formatNumber(r.budgetValue)} €
                      </td>
                    ) : null}
                    {showCol("jira") ? (
                      <td className="px-3 py-3">
                        {r.jiraTicket ? (
                          <Link
                            href={buildJiraUrl(r.jiraTicket)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--color-surface-2)]/60"
                            target="_blank"
                            title="Open in JIRA"
                          >
                            <img
                              src="/icons/ui/jira.png"
                              alt="Open in JIRA"
                              className="h-5 w-auto object-contain opacity-80"
                            />
                          </Link>
                        ) : (
                          <span className="text-[color:var(--color-text)]/55">n/a</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={columnCount}>
                    No data yet. Import a CSV to get started.
                  </td>
                </tr>
              ) : !loading && rows.length > 0 && filteredRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={columnCount}>
                    No rows match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)]/70 px-3 py-3 text-xs text-[color:var(--color-text)]/75">
          <div>
            {filteredRows.length > 0 ? (
              <span>
                Showing {startIdx.toLocaleString()}-{endIdx.toLocaleString()} of {filteredRows.length.toLocaleString()}
              </span>
            ) : (
              <span>0 results</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[color:var(--color-text)]/60">Rows per page</label>
            <select
              className="input h-9 w-20"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost h-9 px-2"
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={page === 0}
            >
              Prev
            </button>
            <span className="text-[color:var(--color-text)]/60">
              Page {page + 1} / {totalPages.toLocaleString()}
            </span>
            <button
              className="btn-ghost h-9 px-2"
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
              disabled={page + 1 >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showColumnPicker ? (
        <ColumnPicker
          columns={columnOptions as any}
          visible={visibleCols}
          defaults={defaultVisible}
          onChange={(next) => setVisibleCols(new Set(next))}
          onClose={() => setShowColumnPicker(false)}
        />
      ) : null}
    </div>
  );
}




