"use client";

import type React from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CrmOwnerRate, DataQualityTicket } from "@/types/crm";
import { useAuth } from "@/context/AuthContext";
import MiniModal from "@/components/ui/MiniModal";
import ColumnPicker from "@/components/ui/ColumnPicker";
import { showError, showSuccess } from "@/utils/toast";

type Filters = {
  status: string[];
  owner: string[];
  assignee: string[];
  priority: string[];
  type: string[];
  search: string;
  assignedFrom: string;
  assignedTo: string;
  dueFrom: string;
  dueTo: string;
  daysBucket: string;
};

const STATUS_OPTIONS = [
  "Backlog",
  "Refining",
  "Ready",
  "In progress",
  "Validation",
  "Done",
];
const OWNER_DEFAULTS = ["Stephane", "Lucas V."];
const TYPE_DEFAULTS = ["DATA", "LIFECYCLE", "CAMPAIGNS", "GLOBAL", "OPS"];

const unique = (values: (string | null)[]) =>
  Array.from(new Set(values)).filter(Boolean) as string[];

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return value;
};

function daysToDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date();
  const due = new Date(dueDate);
  const diff =
    due.getTime() -
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

type Option = { label: string; value: string };
const STATUS_COLORS: Record<string, string> = {
  "In progress": "bg-amber-100 text-amber-800",
  Ready: "bg-blue-100 text-blue-800",
  Backlog: "bg-slate-100 text-slate-800",
  Refining: "bg-purple-100 text-purple-800",
  Validation: "bg-teal-100 text-teal-800",
  Done: "bg-emerald-100 text-emerald-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-rose-100 text-rose-800",
  P2: "bg-amber-100 text-amber-800",
  P3: "bg-slate-100 text-slate-800",
};

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

const renderPlaceholder = (text = "n/a") => (
  <span className="text-[color:var(--color-text)]/55" title="Not available">
    {text}
  </span>
);

const renderStatusBadge = (status: string) => {
  const cls = STATUS_COLORS[status] || "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {status}
    </span>
  );
};

const renderPriorityBadge = (priority: string) => {
  const cls = PRIORITY_COLORS[priority] || "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {priority}
    </span>
  );
};

type SortKey =
  | "assignedDate"
  | "dueDate"
  | "daysToDue"
  | "priority"
  | "owner"
  | "workHours"
  | "prepHours"
  | "totalHours"
  | "totalDays"
  | "budget"
  | "";
type SortDir = "asc" | "desc";
type GroupBy = "none" | "owner" | "type";
export default function CrmDataQualityView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const { isEditor, isAdmin } = useAuth();

  const [filters, setFilters] = useState<Filters>({
    status: [],
    owner: [],
    assignee: [],
    priority: [],
    type: [],
    search: "",
    assignedFrom: `${new Date().getFullYear()}-01-01`,
    assignedTo: "",
    dueFrom: "",
    dueTo: "",
    daysBucket: "",
  });
  const [rows, setRows] = useState<DataQualityTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  type CatalogItem = { id: string; label: string };
  const [ownerItems, setOwnerItems] = useState<CatalogItem[]>(
    OWNER_DEFAULTS.map((o) => ({ id: `default-owner-${o}`, label: o })),
  );
  const [typeItems, setTypeItems] = useState<CatalogItem[]>(
    TYPE_DEFAULTS.map((t) => ({ id: `default-type-${t}`, label: t })),
  );
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [editRow, setEditRow] = useState<DataQualityTicket | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [syncingJira, setSyncingJira] = useState(false);
  const [compact, setCompact] = useState(false);
  const [ownerRates, setOwnerRates] = useState<
    Record<string, { dailyRate: number; currency: string; id?: string }>
  >({});
  const [form, setForm] = useState({
    status: STATUS_OPTIONS[0],
    assignedDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    ticketId: "",
    title: "",
    priority: "P2",
    owner: "",
    jiraAssignee: "",
    reporter: "",
    type: "",
    jiraUrl: "",
    workHours: "",
    prepHours: "",
    etaDate: "",
    comments: "",
  });
  const [formContribs, setFormContribs] = useState<
    { id: string; owner: string; workHours: string; prepHours: string }[]
  >([{ id: "c-0", owner: "", workHours: "", prepHours: "" }]);
  const [formError, setFormError] = useState<string | null>(null);
  const typeOptions = useMemo(() => {
    const existing = new Set(typeItems.map((t) => t.label));
    const list = [...typeItems];
    if (form.type && !existing.has(form.type)) {
      list.unshift({ id: `current-${form.type}`, label: form.type });
    }
    return list;
  }, [typeItems, form.type]);

  /* ===== Column visibility ===== */
  const COLVIS_STORAGE_KEY = "dq_colvis_v2";
  const columnOptions = useMemo(
    () =>
      [
        { id: "status", label: "Status" },
        { id: "ticket", label: "Ticket" },
        { id: "title", label: "Title" },
        { id: "type", label: "Type" },
        { id: "assignee", label: "Assignee (JIRA)" },
        { id: "contributors", label: "Contributors" },
        { id: "reporter", label: "Reporter" },
        { id: "created", label: "Created" },
        { id: "dueDate", label: "Due date" },
        { id: "daysToDue", label: "Days to due" },
        { id: "priority", label: "Priority" },
        { id: "work", label: "Work (hrs)" },
        { id: "prep", label: "Prep (hrs)" },
        { id: "totalHours", label: "Total (hrs)" },
        { id: "totalDays", label: "Total (days)" },
        { id: "budget", label: "Budget (€)" },
        { id: "eta", label: "ETA" },
        { id: "comments", label: "Comments" },
        { id: "jira", label: "JIRA" },
        ...(isEditor || isAdmin ? [{ id: "actions", label: "Actions" }] : []),
      ] as const,
    [isEditor, isAdmin],
  );
  const defaultVisible = useMemo(
    () => columnOptions.map((c) => c.id),
    [columnOptions],
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(defaultVisible),
  );

  useEffect(() => {
    const raw = localStorage.getItem(COLVIS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setVisibleCols(new Set(parsed));
      }
    } catch {
      /* ignore bad cache */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      COLVIS_STORAGE_KEY,
      JSON.stringify(Array.from(visibleCols)),
    );
  }, [visibleCols]);

  const showCol = useCallback(
    (id: string) => {
      if ((id === "actions" && !(isEditor || isAdmin))) return false;
      return visibleCols.has(id);
    },
    [visibleCols, isEditor, isAdmin],
  );

  const columnCount = useMemo(() => {
    let count = 0;
    columnOptions.forEach((c) => {
      if (showCol(c.id)) count += 1;
    });
    return count;
  }, [columnOptions, showCol]);

  const [sortKey, setSortKey] = useState<SortKey>("assignedDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const openDatePicker = (
    event:
      | React.FocusEvent<HTMLInputElement>
      | React.MouseEvent<HTMLInputElement>,
  ) => {
    const el = event.currentTarget;
    if (typeof (el as any).showPicker === "function") {
      try {
        (el as any).showPicker();
      } catch {
        /* ignore */
      }
    }
  };

  const rowMatches = (t: DataQualityTicket, exclude?: keyof Filters) => {
    if (
      exclude !== "status" &&
      filters.status.length > 0 &&
      !filters.status.includes(t.status)
    )
      return false;
    if (
      exclude !== "owner" &&
      filters.owner.length > 0 &&
      !filters.owner.includes(t.owner)
    )
      return false;
    if (
      exclude !== "assignee" &&
      filters.assignee.length > 0 &&
      !filters.assignee.includes(t.jiraAssignee || "")
    )
      return false;
    if (
      exclude !== "priority" &&
      filters.priority.length > 0 &&
      !filters.priority.includes(t.priority)
    )
      return false;
    if (
      exclude !== "type" &&
      filters.type.length > 0 &&
      (!t.type || !filters.type.includes(t.type))
    )
      return false;
    if (exclude !== "search" && filters.search) {
      const term = filters.search.toLowerCase();
      if (
        !t.ticketId.toLowerCase().includes(term) &&
        !t.title.toLowerCase().includes(term)
      )
        return false;
    }
    if (exclude !== "assignedFrom" && filters.assignedFrom) {
      if (!t.assignedDate || t.assignedDate < filters.assignedFrom)
        return false;
    }
    if (exclude !== "assignedTo" && filters.assignedTo) {
      if (!t.assignedDate || t.assignedDate > filters.assignedTo) return false;
    }
    if (exclude !== "dueFrom" && filters.dueFrom) {
      if (!t.dueDate || t.dueDate < filters.dueFrom) return false;
    }
    if (exclude !== "dueTo" && filters.dueTo) {
      if (!t.dueDate || t.dueDate > filters.dueTo) return false;
    }
    if (exclude !== "daysBucket" && filters.daysBucket) {
      const days = daysToDue(t.dueDate);
      switch (filters.daysBucket) {
        case "overdue":
          if (!(typeof days === "number" && days < 0)) return false;
          break;
        case "today":
          if (!(typeof days === "number" && days === 0)) return false;
          break;
        case "next7":
          if (!(typeof days === "number" && days > 0 && days <= 7))
            return false;
          break;
        case "next30":
          if (!(typeof days === "number" && days > 0 && days <= 30))
            return false;
          break;
        case "no-due":
          if (t.dueDate) return false;
          break;
        default:
          break;
      }
    }
    return true;
  };

  const activeChips = useMemo(() => {
    const chips: { label: string; onClear: () => void }[] = [];
    if (filters.status.length)
      chips.push({
        label: `Status: ${filters.status.join(", ")}`,
        onClear: () => handleChange("status", []),
      });
    if (filters.owner.length)
      chips.push({
        label: `Contributors: ${filters.owner.join(", ")}`,
        onClear: () => handleChange("owner", []),
      });
    if (filters.assignee.length)
      chips.push({
        label: `Assignee (JIRA): ${filters.assignee.join(", ")}`,
        onClear: () => handleChange("assignee", []),
      });
    if (filters.priority.length)
      chips.push({
        label: `Priority: ${filters.priority.join(", ")}`,
        onClear: () => handleChange("priority", []),
      });
    if (filters.type.length)
      chips.push({
        label: `Type: ${filters.type.join(", ")}`,
        onClear: () => handleChange("type", []),
      });
    if (filters.daysBucket)
      chips.push({
        label: `Days: ${filters.daysBucket}`,
        onClear: () => handleChange("daysBucket", ""),
      });
    if (filters.assignedFrom || filters.assignedTo) {
      chips.push({
        label: `Created: ${formatDate(filters.assignedFrom) || "--"} -> ${formatDate(filters.assignedTo) || "--"}`,
        onClear: () => {
          handleChange("assignedFrom", "");
          handleChange("assignedTo", "");
        },
      });
    }
    if (filters.dueFrom || filters.dueTo) {
      chips.push({
        label: `Due: ${formatDate(filters.dueFrom) || "--"} -> ${formatDate(filters.dueTo) || "--"}`,
        onClear: () => {
          handleChange("dueFrom", "");
          handleChange("dueTo", "");
        },
      });
    }
    if (filters.search)
      chips.push({
        label: `Search: ${filters.search}`,
        onClear: () => handleChange("search", ""),
      });
    return chips;
  }, [filters]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/data-quality?client=${clientSlug}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed to load tickets (${res.status})`);
      }
      const body = await res.json().catch(() => null);
      const tickets = Array.isArray(body?.tickets) ? body.tickets : [];
      setRows(tickets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tickets");
    } finally {
      setLoading(false);
    }
  }, [clientSlug]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ target?: string; client?: string }>)
        ?.detail;
      if (detail?.client && detail.client !== clientSlug) return;
      if (detail?.target && detail.target !== "data-quality") return;
      void fetchTickets();
    };
    window.addEventListener("crm:imported", handler);
    return () => {
      window.removeEventListener("crm:imported", handler);
    };
  }, [clientSlug, fetchTickets]);

  useEffect(() => {
    const handle = setTimeout(() => {
      handleChange("search", searchInput);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    const loadCatalogs = async () => {
      try {
        const resOwners = await fetch(
          `/api/crm/catalogs?client=${clientSlug}&kind=owner`,
        );
        const resTypes = await fetch(
          `/api/crm/catalogs?client=${clientSlug}&kind=type`,
        );
        if (resOwners.ok) {
          const body = await resOwners.json().catch(() => null);
          if (active && Array.isArray(body?.items) && body.items.length > 0) {
            setOwnerItems(
              body.items.map((i: any) => ({ id: i.id, label: i.label })),
            );
          }
        }
        if (resTypes.ok) {
          const body = await resTypes.json().catch(() => null);
          if (active && Array.isArray(body?.items) && body.items.length > 0) {
            setTypeItems(
              body.items.map((i: any) => ({ id: i.id, label: i.label })),
            );
          }
        }
      } catch {
        /* ignore; fall back to defaults */
      }
    };
    void loadCatalogs();
    return () => {
      active = false;
    };
  }, [clientSlug]);

  // Load owner rates (for budget column)
  useEffect(() => {
    let active = true;
    const loadRates = async () => {
      try {
        const res = await fetch(`/api/crm/rates?client=${clientSlug}`);
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as {
          rates?: CrmOwnerRate[];
        } | null;
        if (!body || !Array.isArray(body.rates) || !active) return;
        const map: Record<
          string,
          { dailyRate: number; currency: string; id?: string }
        > = {};
        body.rates.forEach((r) => {
          map[r.owner] = {
            dailyRate: r.dailyRate,
            currency: r.currency || "EUR",
            id: r.id,
          };
        });
        setOwnerRates(map);
      } catch {
        // ignore – budget column will show n/a when no rate
      }
    };
    void loadRates();
    return () => {
      active = false;
    };
  }, [clientSlug]);

  useEffect(() => {
    setPage(0);
  }, [filters, groupBy, sortKey, sortDir]);

  const options = useMemo(() => {
    const rowsForStatus = rows.filter((t) => rowMatches(t, "status"));
    const rowsForOwner = rows.filter((t) => rowMatches(t, "owner"));
    const rowsForAssignee = rows.filter((t) => rowMatches(t, "assignee"));
    const rowsForPriority = rows.filter((t) => rowMatches(t, "priority"));
    const rowsForType = rows.filter((t) => rowMatches(t, "type"));
    const countBy = (
      list: DataQualityTicket[],
      key: "status" | "owner" | "assignee" | "priority" | "type",
    ) => {
      const acc: Record<string, number> = {};
      list.forEach((t) => {
        const val = (t as any)[key] as string | null;
        if (!val) return;
        acc[val] = (acc[val] || 0) + 1;
      });
      return acc;
    };
    return {
      status: unique(rowsForStatus.map((t) => t.status)),
      owner: unique(rowsForOwner.map((t) => t.owner)),
      assignee: unique(rowsForAssignee.map((t) => t.jiraAssignee)),
      priority: unique(rowsForPriority.map((t) => t.priority)),
      type: unique(rowsForType.map((t) => t.type)),
      statusCounts: countBy(rowsForStatus, "status"),
      ownerCounts: countBy(rowsForOwner, "owner"),
      assigneeCounts: countBy(rowsForAssignee, "assignee"),
      priorityCounts: countBy(rowsForPriority, "priority"),
      typeCounts: countBy(rowsForType, "type"),
    };
  }, [rows, filters]);

  const filtered = useMemo(
    () => rows.filter((t) => rowMatches(t)),
    [filters, rows],
  );

  const sortedRows = useMemo(() => {
    const withMeta = filtered.map((t) => {
      const contribs =
        t.contributions && t.contributions.length > 0
          ? t.contributions
          : [{ owner: t.owner, workHours: t.workHours, prepHours: t.prepHours }];
      const totalWork = contribs.reduce((acc, c) => acc + (c.workHours ?? 0), 0);
      const totalPrep = contribs.reduce(
        (acc, c) => acc + (c.prepHours != null ? c.prepHours : (c.workHours ?? 0) * 0.35),
        0,
      );
      const totalHours = totalWork + totalPrep;
      const totalDays = totalHours / 7;
      const budget = contribs.reduce((acc, c) => {
        const rate = ownerRates[c.owner]?.dailyRate;
        if (rate != null) {
          const work = c.workHours ?? 0;
          const prep = c.prepHours != null ? c.prepHours : work * 0.35;
          acc += ((work + prep) / 7) * rate;
        }
        return acc;
      }, 0);
      return {
        ...t,
        __daysToDue: daysToDue(t.dueDate),
        __workHours: totalWork,
        __prepHours: totalPrep,
        __totalHours: totalHours,
        __totalDays: totalDays,
        __budget: budget,
      };
    });
    const cmp = (a: any, b: any) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "assignedDate":
          return dir * (a.assignedDate || "").localeCompare(b.assignedDate || "");
        case "dueDate":
          return dir * (a.dueDate || "").localeCompare(b.dueDate || "");
        case "daysToDue": {
          const av = a.__daysToDue ?? Number.POSITIVE_INFINITY;
          const bv = b.__daysToDue ?? Number.POSITIVE_INFINITY;
          return dir * (av - bv);
        }
        case "priority": {
          const order: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
          const av = order[a.priority] ?? 99;
          const bv = order[b.priority] ?? 99;
          return dir * (av - bv);
        }
        case "owner":
          return dir * (a.owner || "").localeCompare(b.owner || "");
        case "workHours":
          return dir * ((a.__workHours ?? 0) - (b.__workHours ?? 0));
        case "prepHours":
          return dir * ((a.__prepHours ?? 0) - (b.__prepHours ?? 0));
        case "totalHours":
          return dir * ((a.__totalHours ?? 0) - (b.__totalHours ?? 0));
        case "totalDays":
          return dir * ((a.__totalDays ?? 0) - (b.__totalDays ?? 0));
        case "budget":
          return dir * ((a.__budget ?? 0) - (b.__budget ?? 0));
        default:
          return 0;
      }
    };
    return withMeta.sort(cmp);
  }, [filtered, sortKey, sortDir, ownerRates]);

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(sortedRows.length / pageSize) - 1, 0);
    if (page > maxPage) setPage(maxPage);
  }, [sortedRows.length, page]);

  const pagedRows = useMemo(() => {
    if (sortedRows.length <= pageSize) return sortedRows;
    const start = Math.min(page * pageSize, Math.max(sortedRows.length - 1, 0));
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page]);

  const groupedRows = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", rows: pagedRows }];
    const groups = new Map<string, DataQualityTicket[]>();
    const keyField = groupBy === "owner" ? "owner" : "type";
    pagedRows.forEach((t) => {
      const key = (t as any)[keyField] || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    });
    return Array.from(groups.entries()).map(([key, list]) => ({
      key,
      label: `${groupBy === "owner" ? "Owner" : "Type"}: ${key} (${list.length} tickets)`,
      rows: list,
    }));
  }, [pagedRows, groupBy]);

  const handleChange = (key: keyof Filters, value: string | string[]) => {
    setFilters((prev) => ({ ...prev, [key]: value as any }));
  };

  const clearFilters = () => {
    setFilters({
      status: [],
      owner: [],
      assignee: [],
      priority: [],
      type: [],
      search: "",
      assignedFrom: `${new Date().getFullYear()}-01-01`,
      assignedTo: "",
      dueFrom: "",
      dueTo: "",
      daysBucket: "",
    });
    setSearchInput("");
    setPage(0);
  };

  const totals = useMemo(() => {
    let totalHours = 0;
    let totalDays = 0;
    let totalBudget = 0;
    filtered.forEach((t) => {
      const contribs =
        t.contributions && t.contributions.length > 0
          ? t.contributions
          : [{ owner: t.owner, workHours: t.workHours, prepHours: t.prepHours }];
      contribs.forEach((c) => {
        const prep = (c.prepHours ?? c.workHours * 0.35) || 0;
        const hours = c.workHours + prep;
        const days = hours / 7;
        totalHours += hours;
        totalDays += days;
        const rate = ownerRates[c.owner]?.dailyRate;
        if (rate != null) totalBudget += days * rate;
      });
    });
    return { totalHours, totalDays, totalBudget };
  }, [filtered, ownerRates]);

  const handleChangeForm = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openAddModal = () => {
    setEditRow(null);
    setForm({
      status: STATUS_OPTIONS[0],
      assignedDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      ticketId: "",
      title: "",
      priority: "P2",
      owner: "",
      jiraAssignee: "",
      reporter: "",
      type: "",
      jiraUrl: "",
      workHours: "",
      prepHours: "",
      etaDate: "",
      comments: "",
    });
    setFormContribs([{ id: `c-${Date.now()}`, owner: "", workHours: "", prepHours: "" }]);
    setOpenAdd(true);
  };

  const openEditModal = (row: DataQualityTicket) => {
    setEditRow(row);
    setForm({
      status: row.status,
      assignedDate: row.assignedDate || "",
      dueDate: row.dueDate || "",
      ticketId: row.ticketId,
      title: row.title,
      priority: row.priority as "P1" | "P2" | "P3",
    owner: row.owner,
    jiraAssignee: row.jiraAssignee || "",
    reporter: row.reporter || "",
    type: row.type || "",
    jiraUrl: row.jiraUrl || "",
      workHours: row.workHours?.toString() || "",
      prepHours: row.prepHours?.toString() || "",
      etaDate: row.etaDate || "",
      comments: row.comments || "",
    });
    const contribs =
      row.contributions && row.contributions.length > 0
        ? row.contributions.map((c, idx) => ({
            id: `c-${row.ticketId}-${idx}`,
            owner: c.owner,
            workHours: String(c.workHours ?? ""),
            prepHours:
              c.prepHours != null ? String(c.prepHours) : String((c.workHours ?? 0) * 0.35),
          }))
        : [
            {
              id: `c-${row.ticketId}-0`,
              owner: row.owner,
              workHours: String(row.workHours ?? ""),
              prepHours:
                row.prepHours != null ? String(row.prepHours) : String((row.workHours ?? 0) * 0.35),
            },
          ];
    setFormContribs(contribs);
    setOpenAdd(true);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? "^" : "v";
  };
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setFormError(null);
    try {
      const contributions = formContribs
        .map((c) => {
          const w = Number(c.workHours || "0");
          const pRaw = c.prepHours;
          const p =
            pRaw === "" || pRaw == null
              ? w * 0.35
              : Number(pRaw);
          return {
            owner: c.owner.trim(),
            workHours: Number.isFinite(w) && w >= 0 ? w : 0,
            prepHours: Number.isFinite(p) && p >= 0 ? p : w * 0.35,
          };
        })
        .filter((c) => c.owner);
      if (contributions.length === 0) {
        throw new Error("Please add at least one contribution with an owner.");
      }
      const totals = contributions.reduce(
        (acc, c) => {
          acc.work += c.workHours;
          acc.prep += c.prepHours ?? c.workHours * 0.35;
          return acc;
        },
        { work: 0, prep: 0 },
      );
      const requiredFields = [
        form.status,
        form.assignedDate,
        form.ticketId,
        form.title,
        form.priority,
        form.type,
        form.jiraUrl,
      ];
      if (requiredFields.some((f) => !String(f || "").trim())) {
        throw new Error("Please fill all required fields.");
      }
      const jiraPattern =
        /^https:\/\/europcarmobility\.atlassian\.net\/browse\/[A-Z0-9-]+$/i;
      if (form.jiraUrl && !jiraPattern.test(form.jiraUrl.trim())) {
        throw new Error(
          "JIRA URL must follow https://europcarmobility.atlassian.net/browse/CRM-XXXX",
        );
      }
      const payload = {
        client: clientSlug,
        status: form.status.trim(),
        assignedDate: form.assignedDate,
        dueDate: form.dueDate || null,
        ticketId: form.ticketId.trim(),
        title: form.title.trim(),
        priority: form.priority as "P1" | "P2" | "P3",
        owner: contributions[0].owner,
        jiraAssignee: form.jiraAssignee || null,
        reporter: form.reporter.trim() || null,
        type: form.type.trim() || null,
        jiraUrl: form.jiraUrl.trim() || null,
        workHours: totals.work,
        prepHours: totals.prep,
        etaDate: form.etaDate || null,
        comments: form.comments.trim() || null,
        contributions,
        id: editRow?.id,
      };
      const res = await fetch("/api/crm/data-quality", {
        method: editRow ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          body?.error || `Failed to create ticket (${res.status})`,
        );
      }
      setOpenAdd(false);
      setForm({
        status: STATUS_OPTIONS[0],
        assignedDate: new Date().toISOString().slice(0, 10),
        dueDate: "",
        ticketId: "",
        title: "",
        priority: "P2",
        owner: "",
        jiraAssignee: "",
        reporter: "",
        type: "",
        jiraUrl: "",
        workHours: "",
        prepHours: "",
        etaDate: "",
        comments: "",
      });
      setFormContribs([{ id: `c-${Date.now()}`, owner: "", workHours: "", prepHours: "" }]);
      setLoading(true);
      const reload = await fetch(`/api/crm/data-quality?client=${clientSlug}`);
      const reloadBody = await reload.json().catch(() => null);
      if (reload.ok && Array.isArray(reloadBody?.tickets)) {
        setRows(reloadBody.tickets);
      }
      setLoading(false);
      showSuccess(editRow ? "Ticket updated" : "Ticket created");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to create ticket";
      setFormError(msg);
      setError(msg);
      setLoading(false);
    } finally {
      setSubmitting(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageStart = sortedRows.length === 0 ? 0 : page * pageSize + 1;
  const pageEnd = Math.min(sortedRows.length, (page + 1) * pageSize);
  const hasGroups = groupBy !== "none";
  const totalTickets = sortedRows.length;
  const tableDensityClass = compact
    ? "text-xs [&_td]:py-2 [&_td]:px-2 [&_th]:py-2 [&_th]:px-2"
    : "";

  const formatCurrency = (amount: number | null, currency: string) => {
    if (amount == null || Number.isNaN(amount)) return "n/a";
    try {
      return amount.toLocaleString("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">
              Data Quality
            </p>
            <span className="rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--color-text)]/80">
              {clientSlug?.toUpperCase()} - CRM Ops
            </span>
          </div>
          <h1
            className="text-2xl font-semibold text-[color:var(--color-text)]"
            title="JIRA tickets for this client. Track workload, SLAs and priorities in one place."
          >
            Data Quality Reporting
          </h1>
        </div>
        <div className="flex gap-2">
          {(isEditor || isAdmin) && (
            <button
              className="btn-primary"
              type="button"
              onClick={openAddModal}
            >
              Add ticket
            </button>
          )}
          {(isEditor || isAdmin) && (
            <button
              className="btn-ghost"
              type="button"
              onClick={async () => {
                setSyncingJira(true);
                try {
                  const res = await fetch(
                    `/api/admin/jira-sync?client=${clientSlug}`,
                    { method: "POST" },
                  );
                  const body = await res.json().catch(() => null);
                  if (!res.ok)
                    throw new Error(
                      body?.error || `JIRA sync failed (${res.status})`,
                    );
                  showSuccess(`JIRA synced: ${body?.imported ?? 0} tickets`);
                  setLoading(true);
                  const reload = await fetch(
                    `/api/crm/data-quality?client=${clientSlug}`,
                  );
                  const reloadBody = await reload.json().catch(() => null);
                  if (reload.ok && Array.isArray(reloadBody?.tickets)) {
                    setRows(reloadBody.tickets);
                  }
                  setLoading(false);
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : typeof err === "object" &&
                          err &&
                          "error" in (err as any)
                        ? String((err as any).error)
                        : "JIRA sync failed";
                  showError(message);
                  setLoading(false);
                } finally {
                  setSyncingJira(false);
                }
              }}
              disabled={syncingJira}
            >
              {syncingJira ? (
                <span className="flex items-center gap-2">
                  <img
                    src="/animations/data-sync.gif"
                    alt="Syncing JIRA"
                    className="h-6 w-6 rounded-full border border-[color:var(--color-border)] bg-white/70 shadow-sm"
                  />
                  <span>Syncing JIRA...</span>
                </span>
              ) : (
                "Sync JIRA"
              )}
            </button>
          )}
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
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input h-10 w-full"
                placeholder="Ticket ID or title"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <MultiSelect
                label="Status"
                options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))}
                values={filters.status}
                counts={options.statusCounts}
                onChange={(vals) => handleChange("status", vals)}
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <MultiSelect
                label="Contributors"
                options={options.owner.map((s) => ({ label: s, value: s }))}
                values={filters.owner}
                counts={options.ownerCounts}
                onChange={(vals) => handleChange("owner", vals)}
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <MultiSelect
                label="Assignee (JIRA)"
                options={options.assignee.map((s) => ({ label: s, value: s }))}
                values={filters.assignee}
                counts={options.assigneeCounts}
                onChange={(vals) => handleChange("assignee", vals)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                className="btn-ghost h-10"
                type="button"
                onClick={() => setOpenAdvanced((v) => !v)}
              >
                {openAdvanced ? "Hide filters" : "More filters"}
                {filters.daysBucket ||
                filters.assignedFrom ||
                filters.assignedTo ||
                filters.dueFrom ||
                filters.dueTo
                  ? " *"
                  : ""}
              </button>
              <button
                className="btn-ghost h-10"
                type="button"
                onClick={() => setShowColumnPicker(true)}
              >
                Columns
              </button>
              <button
                className="btn-ghost h-10"
                type="button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
              <label className="flex items-center gap-2 text-xs text-[color:var(--color-text)]/80">
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={(e) => setCompact(e.target.checked)}
                  className="h-4 w-4"
                />
                Compact view
              </label>
            </div>
          </div>
        </div>
        {openAdvanced ? (
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <MultiSelect
              label="Priority"
              options={options.priority.map((s) => ({ label: s, value: s }))}
              values={filters.priority}
              counts={options.priorityCounts}
              onChange={(vals) => handleChange("priority", vals)}
            />
            <MultiSelect
              label="Type"
              options={options.type.map((s) => ({ label: s, value: s }))}
              values={filters.type}
              counts={options.typeCounts}
              onChange={(vals) => handleChange("type", vals)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Created from
              </label>
              <input
                type="date"
                className="input input-date h-10 placeholder:text-[color:var(--color-text)]/50"
                value={filters.assignedFrom}
                onChange={(e) => handleChange("assignedFrom", e.target.value)}
                onFocus={openDatePicker}
                onMouseDown={openDatePicker}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Created to
              </label>
              <input
                type="date"
                className="input input-date h-10 placeholder:text-[color:var(--color-text)]/50"
                value={filters.assignedTo}
                onChange={(e) => handleChange("assignedTo", e.target.value)}
                onFocus={openDatePicker}
                onMouseDown={openDatePicker}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Due from
              </label>
              <input
                type="date"
                className="input input-date h-10 placeholder:text-[color:var(--color-text)]/50"
                value={filters.dueFrom}
                onChange={(e) => handleChange("dueFrom", e.target.value)}
                onFocus={openDatePicker}
                onMouseDown={openDatePicker}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Due to
              </label>
              <input
                type="date"
                className="input input-date h-10 placeholder:text-[color:var(--color-text)]/50"
                value={filters.dueTo}
                onChange={(e) => handleChange("dueTo", e.target.value)}
                onFocus={openDatePicker}
                onMouseDown={openDatePicker}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Days to due
              </label>
              <select
                value={filters.daysBucket}
                onChange={(e) => handleChange("daysBucket", e.target.value)}
                className="input h-10"
              >
                <option value="">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="next7">Next 7 days</option>
                <option value="next30">Next 30 days</option>
                <option value="no-due">No due date</option>
              </select>
            </div>
          </div>
        ) : null}
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
                x
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-4 py-3 text-sm text-[color:var(--color-text)]/80">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">
              Rows
            </span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">
              {filtered.length}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">
              Hours
            </span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">
              {totals.totalHours.toFixed(2)}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">
              Days
            </span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">
              {totals.totalDays.toFixed(2)}
            </div>
          </div>
          <div>
            <span className="text-xs uppercase text-[color:var(--color-text)]/60">
              Budget (€)
            </span>
            <div className="text-lg font-semibold text-[color:var(--color-text)]">
              {formatCurrency(totals.totalBudget, "EUR")}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        {error ? (
          <div className="px-4 py-3 text-sm text-[color:var(--color-text)]/75">
            {error}
          </div>
        ) : null}
        <div className="flex justify-end px-4 py-2 text-sm text-[color:var(--color-text)]/80">
          {totalTickets} tickets
        </div>
        <div className="overflow-auto">
          <table className={`min-w-full text-sm ${tableDensityClass}`}>
            <thead className="bg-[color:var(--color-surface-2)]/60 text-left text-[color:var(--color-text)]/80">
              <tr>
                {showCol("status") ? (
                  <th className="px-3 py-3 font-semibold">Status</th>
                ) : null}
                {showCol("ticket") ? (
                  <th className="px-3 py-3 font-semibold">Ticket</th>
                ) : null}
                {showCol("title") ? (
                  <th className="px-3 py-3 font-semibold">Title</th>
                ) : null}
                {showCol("type") ? (
                  <th className="px-3 py-3 font-semibold">
                    <span title="Parent from JIRA (e.g. 'CRM-6 CAMPAIGNS')">
                      Type
                    </span>
                  </th>
                ) : null}
                {showCol("assignee") ? (
                  <th className="px-3 py-3 font-semibold">Assignee (JIRA)</th>
                ) : null}
                {showCol("contributors") ? (
                  <th className="px-3 py-3 font-semibold">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("owner")}
                    >
                      Contributors
                      <span className="text-xs">{sortIndicator("owner")}</span>
                    </button>
                  </th>
                ) : null}
                {showCol("reporter") ? (
                  <th className="px-3 py-3 font-semibold">Reporter</th>
                ) : null}
                {showCol("created") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/30">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("assignedDate")}
                    >
                      Created
                      <span className="text-xs">
                        {sortIndicator("assignedDate")}
                      </span>
                    </button>
                  </th>
                ) : null}
                {showCol("dueDate") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/30">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("dueDate")}
                    >
                      Due date
                      <span className="text-xs">
                        {sortIndicator("dueDate")}
                      </span>
                    </button>
                  </th>
                ) : null}
                {showCol("daysToDue") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/30">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("daysToDue")}
                      title="Difference in days between today and the Due date. Negative means overdue."
                    >
                      Days to due
                      {sortIndicator("daysToDue") ? (
                        <span className="text-xs">
                          {sortIndicator("daysToDue")}
                        </span>
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("priority") ? (
                  <th className="px-3 py-3 font-semibold">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("priority")}
                    >
                      Priority
                      <span className="text-xs">
                        {sortIndicator("priority")}
                      </span>
                    </button>
                  </th>
                ) : null}
                {showCol("work") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/40 border-l border-[color:var(--color-border)]">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("workHours")}
                    >
                      Work (hrs)
                      <span className="text-xs">
                        {sortIndicator("workHours")}
                      </span>
                    </button>
                  </th>
                ) : null}
                {showCol("prep") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/40">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("prepHours")}
                    >
                      Prep (hrs)
                      <span className="text-xs">
                        {sortIndicator("prepHours")}
                      </span>
                    </button>
                  </th>
                ) : null}
                {showCol("totalHours") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/40">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("totalHours")}
                    >
                      Total (hrs)
                      <span className="text-xs">
                        {sortIndicator("totalHours")}
                      </span>
                    </button>
                  </th>
                ) : null}
                {showCol("totalDays") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/40">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("totalDays")}
                    >
                      Total (days)
                      <span className="text-xs">
                        {sortIndicator("totalDays")}
                      </span>
                    </button>
                  </th>
                ) : null}
                {showCol("budget") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/40">
                    <button
                      className="flex items-center gap-1 font-semibold"
                      onClick={() => toggleSort("budget")}
                    >
                      Budget (€)
                      <span className="text-xs">{sortIndicator("budget")}</span>
                    </button>
                  </th>
                ) : null}
                {showCol("eta") ? (
                  <th className="px-3 py-3 font-semibold bg-[color:var(--color-surface-2)]/30">
                    ETA
                  </th>
                ) : null}
                {showCol("comments") ? (
                  <th className="px-3 py-3 font-semibold">Comments</th>
                ) : null}
                {showCol("jira") ? (
                  <th className="px-3 py-3 font-semibold">JIRA</th>
                ) : null}
                {isEditor || isAdmin ? (
                  showCol("actions") ? (
                    <th className="px-3 py-3 font-semibold text-right">Actions</th>
                  ) : null
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]/70 text-[color:var(--color-text)]">
              {loading ? (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-[color:var(--color-text)]/60"
                    colSpan={columnCount}
                  >
                    Loading tickets...
                  </td>
                </tr>
              ) : null}
              {!loading &&
                groupedRows.map((group) => (
                  <Fragment key={group.key}>
                    {hasGroups ? (
                      <tr className="bg-[color:var(--color-surface-2)]/40 text-[color:var(--color-text)]/80">
                        <td
                          className="px-3 py-2 text-sm font-semibold"
                          colSpan={columnCount}
                        >
                          {group.label}
                        </td>
                      </tr>
                    ) : null}
                    {group.rows.map((t) => {
                      const contribs =
                        t.contributions && t.contributions.length > 0
                          ? t.contributions
                          : [{ owner: t.owner, workHours: t.workHours, prepHours: t.prepHours }];
                      const owners = contribs.map((c) => c.owner).filter(Boolean);
                      const ownerLabel =
                        owners.length === 0
                          ? null
                          : owners.length === 1
                            ? owners[0]
                            : `${owners[0]} +${owners.length - 1}`;
                      const totalWork = contribs.reduce(
                        (acc, c) => acc + (c.workHours ?? 0),
                        0,
                      );
                      const totalPrep = contribs.reduce(
                        (acc, c) =>
                          acc +
                          (c.prepHours != null ? c.prepHours : (c.workHours ?? 0) * 0.35),
                        0,
                      );
                      const totalHours = totalWork + totalPrep;
                      const totalDays = totalHours / 7;
                      const budget = contribs.reduce((acc, c) => {
                        const rate = ownerRates[c.owner]?.dailyRate;
                        if (rate != null) {
                          const work = c.workHours ?? 0;
                          const prep = c.prepHours != null ? c.prepHours : work * 0.35;
                          acc += ((work + prep) / 7) * rate;
                        }
                        return acc;
                      }, 0);
                      const budgetCurrency =
                        (owners.length > 0 ? ownerRates[owners[0]]?.currency : null) || "EUR";
                      const daysRemaining = daysToDue(t.dueDate);
                      const dueClass =
                        daysRemaining == null
                          ? ""
                          : daysRemaining < 0
                            ? "bg-rose-50 text-rose-800 font-semibold"
                            : daysRemaining <= 7
                              ? "bg-amber-50 text-amber-800 font-semibold"
                              : "";
                      return (
                        <tr
                          key={t.ticketId}
                          className="hover:bg-[color:var(--color-surface-2)]/40"
                        >
                          {showCol("status") ? (
                            <td className="px-3 py-3 font-semibold">
                              {renderStatusBadge(t.status)}
                            </td>
                          ) : null}
                          {showCol("ticket") ? (
                            <td className="px-3 py-3 font-semibold">
                              {t.ticketId}
                            </td>
                          ) : null}
                          {showCol("title") ? (
                            <td
                              className="px-3 py-3 max-w-[420px] truncate"
                              title={t.title}
                            >
                              {t.title || renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("type") ? (
                            <td className="px-3 py-3 font-semibold">
                              {t.type || renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("assignee") ? (
                            <td
                              className="px-3 py-3 font-semibold"
                              title={t.jiraAssignee || undefined}
                            >
                              {t.jiraAssignee || renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("contributors") ? (
                            <td className="px-3 py-3 font-semibold">
                              {ownerLabel || renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("reporter") ? (
                            <td className="px-3 py-3">
                              {t.reporter ? (
                                <span className="font-semibold">
                                  {t.reporter}
                                </span>
                              ) : (
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                          {showCol("created") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/30"
                              aria-label={
                                t.assignedDate
                                  ? `Created date ${formatDate(t.assignedDate)}`
                                  : "Created date not available"
                              }
                            >
                              {t.assignedDate ? (
                                <span className="font-semibold text-[color:var(--color-text)]/85">
                                  {formatDate(t.assignedDate)}
                                </span>
                              ) : (
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                          {showCol("dueDate") ? (
                            <td
                              className={`px-3 py-3 bg-[color:var(--color-surface-2)]/30 ${dueClass}`}
                              aria-label={
                                t.dueDate
                                  ? `Due date ${formatDate(t.dueDate)}`
                                  : "Due date not available"
                              }
                            >
                              {t.dueDate ? (
                                <span className="font-semibold text-[color:var(--color-text)]/85">
                                  {formatDate(t.dueDate)}
                                </span>
                              ) : (
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                          {showCol("daysToDue") ? (
                            <td
                              className={`px-3 py-3 bg-[color:var(--color-surface-2)]/30 ${dueClass}`}
                              aria-label={
                                daysRemaining != null
                                  ? `Days to due ${daysRemaining}`
                                  : "Days to due not available"
                              }
                            >
                              {daysRemaining != null
                                ? daysRemaining
                                : renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("priority") ? (
                            <td className="px-3 py-3 font-semibold">
                              {renderPriorityBadge(t.priority)}
                            </td>
                          ) : null}
                          {showCol("work") ? (
                            <td
                              className="px-3 py-3 border-l border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Work hours ${totalWork.toFixed(2)}`}
                            >
                              {totalWork.toFixed(2)}
                            </td>
                          ) : null}
                          {showCol("prep") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Prep hours ${totalPrep.toFixed(2)}`}
                            >
                              {totalPrep.toFixed(2)}
                            </td>
                          ) : null}
                          {showCol("totalHours") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Total hours ${totalHours.toFixed(2)}`}
                            >
                              {totalHours.toFixed(2)}
                            </td>
                          ) : null}
                          {showCol("totalDays") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Total days ${totalDays.toFixed(2)}`}
                            >
                              {totalDays.toFixed(2)}
                            </td>
                          ) : null}
                          {showCol("budget") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/40"
                              aria-label={
                                budget > 0
                                  ? `Budget ${formatCurrency(budget, budgetCurrency)}`
                                  : "Budget not available"
                              }
                            >
                              {budget > 0
                                ? formatCurrency(budget, budgetCurrency)
                                : renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("eta") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/30"
                              aria-label={
                                t.etaDate
                                  ? `ETA ${formatDate(t.etaDate)}`
                                  : "ETA not available"
                              }
                            >
                              {t.etaDate ? (
                                <span className="font-semibold text-[color:var(--color-text)]/85">
                                  {formatDate(t.etaDate)}
                                </span>
                              ) : (
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                          {showCol("comments") ? (
                            <td className="px-3 py-3 text-[color:var(--color-text)]/80">
                              {t.comments ? (
                                <span title={t.comments}>{t.comments}</span>
                              ) : (
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                          {showCol("jira") ? (
                            <td className="px-3 py-3">
                              {t.jiraUrl ? (
                                <Link
                                  href={t.jiraUrl}
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
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                          {isEditor || isAdmin ? (
                            showCol("actions") ? (
                              <td className="relative px-3 py-3 text-right">
                                <button
                                  className="rounded-md p-1.5 text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
                                  onClick={() =>
                                    setOpenMenuId((prev) =>
                                      prev === t.ticketId ? null : t.ticketId,
                                    )
                                  }
                                  aria-label={`Actions for ${t.ticketId}`}
                                >
                                  <span className="text-lg leading-none">
                                    ⋯
                                  </span>
                                </button>
                                {openMenuId === t.ticketId ? (
                                  <div className="absolute right-2 top-10 z-20 w-36 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
                                    <button
                                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        openEditModal(t);
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        const clone = {
                                          ...t,
                                          ticketId: "",
                                          jiraUrl: t.jiraUrl || "",
                                        };
                                        openEditModal(clone);
                                        showSuccess(
                                          "Duplicating ticket (set new ID)",
                                        );
                                      }}
                                    >
                                      Duplicate
                                    </button>
                                    <button
                                      className="block w-full px-3 py-2 text-left text-sm text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]"
                                      onClick={async () => {
                                        setOpenMenuId(null);
                                        const ok = window.confirm(
                                          `Delete ticket ${t.ticketId}?`,
                                        );
                                        if (!ok) return;
                                        await fetch(
                                          `/api/crm/data-quality?client=${clientSlug}&ticketId=${encodeURIComponent(t.ticketId)}`,
                                          { method: "DELETE" },
                                        );
                                        setRows((prev) =>
                                          prev.filter(
                                            (row) => row.ticketId !== t.ticketId,
                                          ),
                                        );
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                            ) : null
                          ) : null}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}

              {!loading && sortedRows.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-[color:var(--color-text)]/60"
                    colSpan={columnCount}
                  >
                    No tickets match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-start justify-between gap-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/50 px-4 py-3 text-sm text-[color:var(--color-text)]/80 sm:flex-row sm:items-center">
          <div>
            Showing {pageStart}-{pageEnd} of {sortedRows.length} tickets
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost h-9 px-3"
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
            >
              Prev
            </button>
            <span>
              Page {page + 1} / {pageCount}
            </span>
            <button
              className="btn-ghost h-9 px-3"
              type="button"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => (p + 1 >= pageCount ? p : p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      {openAdd ? (
        <MiniModal
          onClose={() => setOpenAdd(false)}
          title="Add ticket"
          bodyClassName="max-h-[65vh] overflow-y-auto"
        >
          {formError ? (
            <div className="mb-3 rounded-lg border border-[color:var(--color-border)] bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </div>
          ) : null}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Status
                </span>
                <select
                  className="input h-10"
                  value={form.status}
                  onChange={(e) => handleChangeForm("status", e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Assignment date
                </span>
                <input
                  type="date"
                  className="input input-date h-10"
                  value={form.assignedDate}
                  onChange={(e) =>
                    handleChangeForm("assignedDate", e.target.value)
                  }
                  onFocus={openDatePicker}
                  onMouseDown={openDatePicker}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Due date
                </span>
                <input
                  type="date"
                  className="input input-date h-10"
                  value={form.dueDate}
                  onChange={(e) => handleChangeForm("dueDate", e.target.value)}
                  onFocus={openDatePicker}
                  onMouseDown={openDatePicker}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Ticket ID
                </span>
                <input
                  className="input h-10"
                  value={form.ticketId}
                  readOnly
                  placeholder="Auto from JIRA URL"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-[color:var(--color-text)]/70">Title</span>
                <input
                  className="input h-10"
                  value={form.title}
                  onChange={(e) => handleChangeForm("title", e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Priority
                </span>
                <select
                  className="input h-10"
                  value={form.priority}
                  onChange={(e) => handleChangeForm("priority", e.target.value)}
                >
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Assignee (JIRA)
                </span>
                <input
                  className="input h-10"
                  value={form.jiraAssignee || ""}
                  readOnly
                  placeholder="From JIRA sync"
                  title={form.jiraAssignee || "Synced from JIRA"}
                />
              </label>
              <div className="sm:col-span-2 space-y-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[color:var(--color-text)]">
                    Contributions
                  </span>
                  <button
                    type="button"
                    className="btn-primary h-8 px-3 text-xs"
                    onClick={() =>
                      setFormContribs((prev) => [
                        ...prev,
                        { id: `c-${Date.now()}`, owner: "", workHours: "", prepHours: "" },
                      ])
                    }
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {formContribs.map((c, idx) => (
                    <div
                      key={c.id}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 sm:grid-cols-4 sm:items-center sm:gap-3"
                    >
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                          Owner
                        </label>
                        <select
                          className="input h-10 w-full"
                          value={c.owner}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormContribs((prev) =>
                              prev.map((item) =>
                                item.id === c.id ? { ...item, owner: val } : item,
                              ),
                            );
                          }}
                        >
                          <option value="">Select owner</option>
                          {ownerItems.map((o) => (
                            <option key={o.id} value={o.label}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                  Work (hrs)
                </label>
                <input
                  className="input h-10 w-full"
                  type="number"
                  step="0.01"
                  min="0"
                  value={c.workHours}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormContribs((prev) =>
                      prev.map((item) =>
                        item.id === c.id ? { ...item, workHours: val } : item,
                      ),
                    );
                  }}
                />
              </div>
                      <div>
                        <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                          Prep (hrs)
                        </label>
                        <input
                          className="input h-10 w-full"
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.prepHours}
                          placeholder="Auto 35% if blank"
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormContribs((prev) =>
                              prev.map((item) =>
                                item.id === c.id ? { ...item, prepHours: val } : item,
                              ),
                            );
                          }}
                        />
                      </div>
                      <div className="flex justify-end sm:col-span-4">
                        {formContribs.length > 1 ? (
                          <button
                            type="button"
                            className="text-xs text-[color:var(--color-accent)]"
                            onClick={() =>
                              setFormContribs((prev) =>
                                prev.filter((item) => item.id !== c.id),
                              )
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Reporter
                </span>
                <input
                  className="input h-10"
                  value={form.reporter}
                  onChange={(e) => handleChangeForm("reporter", e.target.value)}
                  placeholder="Reporter name (optional)"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Type (parent)
                </span>
                <select
                  className="input h-10"
                  value={form.type}
                  onChange={(e) => handleChangeForm("type", e.target.value)}
                >
                  <option value="">Select type</option>
                  {typeOptions.map((t) => (
                    <option key={t.id} value={t.label}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  JIRA URL
                </span>
                <input
                  className="input h-10"
                  value={form.jiraUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    handleChangeForm("jiraUrl", url);
                    const match = url.match(/browse\/([A-Z0-9-]+)$/i);
                    handleChangeForm("ticketId", match?.[1] ?? "");
                  }}
                  placeholder="https://europcarmobility.atlassian.net/browse/CRM-1234"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">ETA</span>
                <input
                  type="date"
                  className="input input-date h-10"
                  value={form.etaDate}
                  onChange={(e) => handleChangeForm("etaDate", e.target.value)}
                  onFocus={openDatePicker}
                  onMouseDown={openDatePicker}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-[color:var(--color-text)]/70">
                  Comments
                </span>
                <textarea
                  className="input min-h-[80px]"
                  value={form.comments}
                  onChange={(e) => handleChangeForm("comments", e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setOpenAdd(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Saving..." : "Save ticket"}
              </button>
            </div>
          </div>
        </MiniModal>
      ) : null}
      {showColumnPicker ? (
        <ColumnPicker
          columns={columnOptions as any}
          visible={visibleCols}
          defaults={defaultVisible}
          onChange={setVisibleCols}
          onClose={() => setShowColumnPicker(false)}
        />
      ) : null}
    </div>
  );
}
