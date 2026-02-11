"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Clock, Edit2, Filter, List, Plus, RefreshCw, Search, Trash2, User, X } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";
import MiniModal from "@/components/ui/MiniModal";
import { useAuth } from "@/context/AuthContext";
import { showError, showSuccess } from "@/utils/toast";

type WorklogScope = "monetization" | "internal";

type WorklogRow = {
  id: string;
  scope: WorklogScope;
  effortDate: string;
  userId: string | null;
  owner: string;
  ownerAvatarUrl?: string | null;
  workstream: string;
  inputUnit: "hours" | "days";
  inputValue: number;
  hours: number;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserOption = {
  value: string;
  label: string;
  isActive: boolean;
  avatarUrl: string | null;
};

type DraftEntry = {
  id: string;
  effortDate: string;
  userId: string;
  workstream: string;
  unit: "hours" | "days";
  value: string;
  comments: string;
};

type WorkstreamRow = {
  id: string;
  label: string;
};

type Option = { label: string; value: string };

function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = "All",
  hideLabel = false,
  containerClassName,
  triggerClassName,
  panelClassName,
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  hideLabel?: boolean;
  containerClassName?: string;
  triggerClassName?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

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
  const hasOptions = options.length > 0;

  const updatePanelPosition = useCallback(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const EDGE_GAP = 8;
    const FLOAT_GAP = 6;
    const rect = trigger.getBoundingClientRect();
    const width = rect.width;
    const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 280;

    let left = rect.left;
    const maxLeft = Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP);
    left = Math.min(Math.max(EDGE_GAP, left), maxLeft);

    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldOpenUp = spaceBelow < panelHeight + FLOAT_GAP + EDGE_GAP && rect.top > spaceBelow;
    let top = shouldOpenUp ? rect.top - panelHeight - FLOAT_GAP : rect.bottom + FLOAT_GAP;
    const maxTop = Math.max(EDGE_GAP, window.innerHeight - panelHeight - EDGE_GAP);
    top = Math.min(Math.max(EDGE_GAP, top), maxTop);

    setPanelStyle((prev) => {
      const next: React.CSSProperties = {
        position: "fixed",
        top,
        left,
        width,
      };
      if (
        prev.position === next.position &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width
      ) {
        return prev;
      }
      return next;
    });
  }, [open]);

  const scheduleReposition = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      updatePanelPosition();
      rafRef.current = requestAnimationFrame(() => {
        updatePanelPosition();
      });
    });
  }, [updatePanelPosition]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition, options.length, values.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scheduleReposition();
    const handleReposition = () => scheduleReposition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, scheduleReposition]);

  return (
    <div className={`relative ${containerClassName ?? ""}`} data-ms={`worklogs-${label}`} ref={wrapRef}>
      {!hideLabel ? <label className="text-xs font-medium text-[color:var(--color-text)]/70">{label}</label> : null}
      <button
        ref={triggerRef}
        type="button"
        className={[
          "w-full flex items-center justify-between gap-2",
          hideLabel
            ? "h-8 rounded-lg border border-transparent bg-[var(--color-surface-2)]/50 px-3 text-xs"
            : "input h-10",
          triggerClassName ?? "",
        ].join(" ")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{display}</span>
        <span className="text-[color:var(--color-text)]/60">{open ? "^" : "v"}</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={panelRef}
            className={`z-[140] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg ${panelClassName ?? ""}`}
            style={panelStyle}
          >
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
              disabled={!hasOptions}
            onClick={() => {
                if (!hasOptions) return;
                if (values.length === 0) onChange(options.map((o) => o.value));
              else onChange([]);
              setOpen(false);
            }}
          >
              {!hasOptions ? "No options" : values.length === 0 ? "Select all" : "Clear all"}
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
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

const buildKey = () => `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatNumber = (val: number, digits = 2) =>
  Number.isFinite(val)
    ? val.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "0,00";

const defaultWorkstreamForScope: Record<WorklogScope, string> = {
  monetization: "Monetization",
  internal: "Internal",
};

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const formatEffortDate = (value: string) => {
  if (!value) return "--";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
};

const WORKSTREAM_BADGE_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-100",
  "bg-purple-50 text-purple-700 border-purple-100",
  "bg-emerald-50 text-emerald-700 border-emerald-100",
  "bg-amber-50 text-amber-700 border-amber-100",
  "bg-rose-50 text-rose-700 border-rose-100",
  "bg-indigo-50 text-indigo-700 border-indigo-100",
];

export default function WorklogView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAdmin, isEditor } = useAuth();
  const isSelfOnlyEditor = isEditor && !isAdmin;
  const currentUserId = user?.id ?? "";

  const scopeParam = searchParams.get("scope");
  const initialScope = scopeParam === "internal" ? "internal" : "monetization";

  const [scope, setScope] = useState<WorklogScope>(initialScope);
  const [rows, setRows] = useState<WorklogRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [workstreams, setWorkstreams] = useState<WorkstreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [ownerFilters, setOwnerFilters] = useState<string[]>([]);
  const [workstreamFilters, setWorkstreamFilters] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [openModal, setOpenModal] = useState(false);
  const [editRow, setEditRow] = useState<WorklogRow | null>(null);
  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [showWorkstreamInput, setShowWorkstreamInput] = useState(false);
  const [newWorkstream, setNewWorkstream] = useState("");
  const [workstreamSubmitting, setWorkstreamSubmitting] = useState(false);
  const [deleteDialogRow, setDeleteDialogRow] = useState<WorklogRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/worklogs/users");
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || "Failed to load users");
    }
    const list =
      Array.isArray(body?.users)
        ? body.users.map((user: any) => ({
            value: String(user.value),
            label: String(user.label ?? ""),
            isActive: user.isActive !== false,
            avatarUrl: typeof user.avatarUrl === "string" && user.avatarUrl.trim() ? user.avatarUrl.trim() : null,
          }))
        : [];
    list.sort((a: UserOption, b: UserOption) => a.label.localeCompare(b.label));
    setUsers(list);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/worklogs?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to load worklogs");
      setRows(Array.isArray(body?.rows) ? (body.rows as WorklogRow[]) : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load worklogs";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [fromDate, scope, toDate]);

  const loadWorkstreams = useCallback(async () => {
    const res = await fetch(`/api/worklogs/workstreams?scope=${scope}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || "Failed to load workstreams");
    }
    const list =
      Array.isArray(body?.workstreams)
        ? body.workstreams.map((row: any) => ({
            id: String(row.id),
            label: String(row.label ?? "").trim(),
          }))
        : [];
    list.sort((a: WorkstreamRow, b: WorkstreamRow) => a.label.localeCompare(b.label));
    setWorkstreams(list);
  }, [scope]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadWorkstreams();
  }, [loadWorkstreams]);

  const ownerOptions = useMemo<Option[]>(
    () => users.map((u) => ({ value: u.value, label: u.label })),
    [users],
  );

  const workstreamOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>();
    const fallback = defaultWorkstreamForScope[scope];
    if (fallback) {
      map.set(fallback, fallback);
    }
    workstreams.forEach((row) => {
      if (!row.label) return;
      map.set(row.label, row.label);
    });
    rows.forEach((row) => {
      if (!row.workstream) return;
      map.set(row.workstream, row.workstream);
    });
    return Array.from(map.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((ws) => ({ value: ws, label: ws }));
  }, [rows, workstreams]);

  const workstreamBadgeColorByLabel = useMemo(() => {
    const uniqueLabels = Array.from(
      new Set(rows.map((row) => row.workstream.trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    const map = new Map<string, string>();
    uniqueLabels.forEach((label, index) => {
      map.set(label, WORKSTREAM_BADGE_COLORS[index % WORKSTREAM_BADGE_COLORS.length]);
    });
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (ownerFilters.length && !ownerFilters.includes(row.userId ?? "")) return false;
      if (workstreamFilters.length && !workstreamFilters.includes(row.workstream)) return false;
      if (term) {
        const haystack = `${row.owner} ${row.workstream} ${row.comments ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rows, ownerFilters, workstreamFilters, search]);

  const totals = useMemo(() => {
    const hours = filteredRows.reduce((acc, row) => acc + (row.hours ?? 0), 0);
    const days = hours / 7;
    return {
      entries: filteredRows.length,
      hours,
      days,
    };
  }, [filteredRows]);

  const ownerMetaById = useMemo(() => {
    const map = new Map<string, UserOption>();
    users.forEach((entry) => {
      if (!entry.value) return;
      map.set(entry.value, entry);
    });
    return map;
  }, [users]);

  const ownerMetaByName = useMemo(() => {
    const map = new Map<string, UserOption>();
    users.forEach((entry) => {
      const normalized = normalizeText(entry.label);
      if (!normalized) return;
      map.set(normalized, entry);
    });
    return map;
  }, [users]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setOwnerFilters([]);
    setWorkstreamFilters([]);
    setFromDate("");
    setToDate("");
  }, []);

  const hasActiveFilters =
    search.trim().length > 0 ||
    ownerFilters.length > 0 ||
    workstreamFilters.length > 0 ||
    Boolean(fromDate) ||
    Boolean(toDate);

  const openAddModal = () => {
    setEditRow(null);
    setShowWorkstreamInput(false);
    setNewWorkstream("");
    setDraftEntries([
      {
        id: buildKey(),
        effortDate: new Date().toISOString().slice(0, 10),
        userId: isSelfOnlyEditor ? currentUserId : "",
        workstream: defaultWorkstreamForScope[scope],
        unit: "hours",
        value: "",
        comments: "",
      },
    ]);
    setOpenModal(true);
  };

  const openEditModal = (row: WorklogRow) => {
    setEditRow(row);
    setShowWorkstreamInput(false);
    setNewWorkstream("");
    setDraftEntries([
      {
        id: buildKey(),
        effortDate: row.effortDate,
        userId: isSelfOnlyEditor ? currentUserId || row.userId || "" : row.userId ?? "",
        workstream: row.workstream,
        unit: row.inputUnit,
        value: String(row.inputValue ?? ""),
        comments: row.comments ?? "",
      },
    ]);
    setOpenModal(true);
  };

  const handleSave = async () => {
    if (!isEditor && !isAdmin) return;
    if (isSelfOnlyEditor && !currentUserId) {
      showError("Unable to resolve current user.");
      return;
    }
    const entries = draftEntries
      .map((entry) => ({
        ...entry,
        value: entry.value.trim(),
        workstream: entry.workstream.trim(),
      }))
      .filter((entry) => entry.effortDate && entry.userId && entry.workstream && entry.value.length > 0);
    const normalizedEntries = isSelfOnlyEditor
      ? entries.map((entry) => ({ ...entry, userId: currentUserId }))
      : entries;

    if (normalizedEntries.length === 0) {
      showError("Fill at least one valid entry.");
      return;
    }

    setSaving(true);
    try {
      if (editRow) {
        const entry = normalizedEntries[0];
        const res = await fetch("/api/worklogs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editRow.id,
            scope,
            effortDate: entry.effortDate,
            userId: entry.userId,
            workstream: entry.workstream,
            unit: entry.unit,
            value: Number(entry.value),
            comments: entry.comments || null,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Failed to update entry");
        showSuccess("Entry updated");
      } else {
        const payload = normalizedEntries.map((entry) => ({
          effortDate: entry.effortDate,
          userId: entry.userId,
          workstream: entry.workstream,
          unit: entry.unit,
          value: Number(entry.value),
          comments: entry.comments || null,
        }));
        const res = await fetch("/api/worklogs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, entries: payload }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Failed to add entries");
        showSuccess("Entries saved");
      }
      setOpenModal(false);
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save entries";
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleAddWorkstream = async () => {
    if (!newWorkstream.trim() || workstreamSubmitting) return;
    setWorkstreamSubmitting(true);
    try {
      const res = await fetch("/api/worklogs/workstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, label: newWorkstream.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to add workstream");
      showSuccess("Workstream added");
      setNewWorkstream("");
      setShowWorkstreamInput(false);
      await loadWorkstreams();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to add workstream";
      showError(msg);
    } finally {
      setWorkstreamSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !deleteDialogRow) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/worklogs?id=${deleteDialogRow.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to delete entry");
      showSuccess("Entry deleted");
      setDeleteDialogRow(null);
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to delete entry";
      showError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const onScopeChange = (next: WorklogScope) => {
    setScope(next);
    setWorkstreamFilters([]);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("scope", next);
    router.replace(`/command-center/worklogs?${params.toString()}`);
  };

  return (
    <div className="space-y-6" data-page="worklogs">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">
                Command Center
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                Worklogs
              </h1>
              <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
                Track monetization and internal efforts to complete team capacity visibility.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
              <button className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs" onClick={loadRows}>
                <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
                Refresh
              </button>
              {isEditor || isAdmin ? (
                <>
                  <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />
                  <button className="btn-primary flex h-8 items-center gap-2 px-4 text-xs shadow-sm" onClick={openAddModal}>
                    <Plus size={14} />
                    Add entries
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {(["monetization", "internal"] as WorklogScope[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`h-9 rounded-full border px-4 text-xs transition ${
                  scope === value
                    ? value === "monetization"
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-700"
                      : "border-slate-400/70 bg-slate-400/20 text-slate-700"
                    : "border-[color:var(--color-border)] bg-transparent text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
                }`}
                onClick={() => onScopeChange(value)}
              >
                {value === "monetization" ? "Monetization" : "Internal"}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              label: "Entries",
              primary: totals.entries.toLocaleString("es-ES"),
              secondary: "Current filters",
              icon: List,
            },
            {
              label: "Hours",
              primary: `${formatNumber(totals.hours)} h`,
              secondary: `(${formatNumber(totals.days, 1)} d)`,
              icon: Clock,
            },
            {
              label: "Days",
              primary: `${formatNumber(totals.days)} d`,
              secondary: "Hours / 7",
              icon: Calendar,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="kpi-frame p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)]">
                    <Icon size={24} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
                      {item.label}
                    </p>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-2xl font-bold tracking-tight text-[var(--color-text)] tabular-nums">
                        {item.primary}
                      </span>
                      {item.secondary ? (
                        <span className="text-xs text-[var(--color-muted)]">
                          {item.secondary}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </header>

      <section>
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              className="h-10 w-full rounded-xl border-none bg-transparent pl-9 pr-4 text-sm placeholder:text-[var(--color-muted)] focus:ring-0"
              placeholder="Search comments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="hidden h-6 w-px bg-[var(--color-border)] md:block" />

          <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)]/35 px-2 py-1">
            <Filter className="h-3.5 w-3.5 text-[var(--color-muted)]" />
            <MultiSelect
              label="Owner"
              options={ownerOptions}
              values={ownerFilters}
              onChange={setOwnerFilters}
              placeholder="All owners"
              hideLabel
              containerClassName="min-w-[160px]"
              triggerClassName="h-8 border-transparent bg-[var(--color-surface-2)]/50 text-xs"
            />
            <MultiSelect
              label="Workstream"
              options={workstreamOptions}
              values={workstreamFilters}
              onChange={setWorkstreamFilters}
              placeholder="All workstreams"
              hideLabel
              containerClassName="min-w-[175px]"
              triggerClassName="h-8 border-transparent bg-[var(--color-surface-2)]/50 text-xs"
            />
          </div>

          <div className="hidden h-6 w-px bg-[var(--color-border)] lg:block" />

          <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)]/50 px-2 py-1">
            <Calendar className="h-3.5 w-3.5 text-[var(--color-muted)]" />
            <div className="min-w-[126px]">
              <DatePicker
                value={fromDate}
                onChange={setFromDate}
                placeholder="From"
                ariaLabel="From date"
                displayFormat="dd/MM/yy"
                buttonClassName="h-8 border-transparent bg-[var(--color-surface-2)]/50 px-3 text-xs"
              />
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">to</span>
            <div className="min-w-[126px]">
              <DatePicker
                value={toDate}
                onChange={setToDate}
                placeholder="To"
                ariaLabel="To date"
                displayFormat="dd/MM/yy"
                buttonClassName="h-8 border-transparent bg-[var(--color-surface-2)]/50 px-3 text-xs"
              />
            </div>
          </div>

          {hasActiveFilters ? (
            <button
              className="rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              type="button"
              onClick={clearFilters}
              title="Clear filters"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </section>

      <section className="card px-6 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Entries</h3>
          {loading ? (
            <span className="text-xs text-[color:var(--color-text)]/60">Loading...</span>
          ) : null}
        </div>
        <div className="table-wrap mt-1">
          <table className="table min-w-[940px] w-full table-fixed text-sm font-sans">
            <colgroup>
              <col className="w-[110px]" />
              <col className="w-[230px]" />
              <col className="w-[180px]" />
              <col className="w-[180px]" />
              <col />
              <col className="w-[96px]" />
            </colgroup>
            <thead>
              <tr className="bg-[var(--color-surface-2)] text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Workstream</th>
                <th className="px-3 py-2 text-right">Hours / Days</th>
                <th className="px-3 py-2 text-left">Comments</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="py-12 text-center text-sm text-[var(--color-muted)] font-sans" colSpan={6}>
                    No entries match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const ownerMeta =
                    (row.userId ? ownerMetaById.get(row.userId) : undefined) ??
                    ownerMetaByName.get(normalizeText(row.owner));
                  const ownerAvatarUrl = row.ownerAvatarUrl ?? ownerMeta?.avatarUrl ?? null;
                  const initials = getInitials(row.owner);
                  return (
                    <tr key={row.id} className="group transition-colors hover:bg-[var(--color-surface-2)]/50">
                      <td className="whitespace-nowrap px-3 py-3 text-[var(--color-muted)] font-sans">
                        {formatEffortDate(row.effortDate)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap font-sans">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]"
                            title={row.owner}
                          >
                            {ownerAvatarUrl ? (
                              <img
                                src={ownerAvatarUrl}
                                alt={row.owner}
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[color:var(--color-text)]/70">
                                {initials || <User size={13} />}
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-[var(--color-text)]">{row.owner}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap font-sans">
                        <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${workstreamBadgeColorByLabel.get(row.workstream) ?? WORKSTREAM_BADGE_COLORS[0]}`}>
                          {row.workstream}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-sans">
                        <span className="font-semibold text-[var(--color-text)] font-sans">
                          {formatNumber(row.hours)} h
                        </span>
                        <span className="ml-1.5 text-xs text-[var(--color-muted)] font-normal font-sans">
                          ({formatNumber(row.hours / 7, 1)} d)
                        </span>
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-3 text-[color:var(--color-text)]/80 font-sans" title={row.comments || ""}>
                        {row.comments || "--"}
                      </td>
                      <td className="px-3 py-3 font-sans">
                        <div className="flex items-center justify-end gap-2">
                          {isEditor || isAdmin ? (
                            <button
                              className="btn-ghost p-1.5 hover:text-blue-600"
                              type="button"
                              onClick={() => openEditModal(row)}
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                          ) : null}
                          {isAdmin ? (
                            <button
                              className="btn-ghost p-1.5 hover:text-red-600"
                              type="button"
                              onClick={() => setDeleteDialogRow(row)}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {openModal ? (
        <MiniModal
          onClose={() => setOpenModal(false)}
          title={editRow ? "Edit worklog" : "Add worklogs"}
          widthClass="max-w-4xl"
          bodyClassName="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-[color:var(--color-text)]/70">
              Log effort entries that count toward team workload.
            </div>
            {(isEditor || isAdmin) && (
              <button
                type="button"
                className="btn-ghost h-9 px-3 text-xs"
                onClick={() => setShowWorkstreamInput((v) => !v)}
              >
                {showWorkstreamInput ? "Cancel" : "Add workstream"}
              </button>
            )}
          </div>
          {showWorkstreamInput && (isEditor || isAdmin) && (
            <div className="flex flex-wrap items-center gap-2 max-w-md">
              <input
                className="input h-9 flex-1 min-w-[220px]"
                placeholder="New workstream name"
                value={newWorkstream}
                onChange={(e) => setNewWorkstream(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary h-9 px-3 text-xs"
                disabled={!newWorkstream.trim() || workstreamSubmitting}
                onClick={handleAddWorkstream}
              >
                {workstreamSubmitting ? "Adding..." : "Add"}
              </button>
            </div>
          )}

          <div className="space-y-3">
            {draftEntries.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-3 sm:grid-cols-[1fr_1.2fr_1.2fr_0.8fr_0.8fr_1.4fr_auto] sm:items-end"
              >
                <div>
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">Date</label>
                  <DatePicker
                    value={entry.effortDate}
                    ariaLabel="Effort date"
                    onChange={(value) =>
                      setDraftEntries((prev) =>
                        prev.map((item) =>
                          item.id === entry.id ? { ...item, effortDate: value } : item,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">Owner</label>
                  <select
                    className="input h-10 w-full"
                    value={entry.userId}
                    disabled={isSelfOnlyEditor}
                    onChange={(e) =>
                      setDraftEntries((prev) =>
                        prev.map((item) =>
                          item.id === entry.id ? { ...item, userId: e.target.value } : item,
                        ),
                      )
                    }
                  >
                    <option value="">Select owner</option>
                    {users.map((user) => (
                      <option key={user.value} value={user.value}>
                        {user.label}{!user.isActive ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">Workstream</label>
                  <select
                    className="input h-10 w-full"
                    value={entry.workstream}
                    onChange={(e) =>
                      setDraftEntries((prev) =>
                        prev.map((item) =>
                          item.id === entry.id ? { ...item, workstream: e.target.value } : item,
                        ),
                      )
                    }
                  >
                    <option value="">Select workstream</option>
                    {workstreamOptions.map((ws) => (
                      <option key={ws.value} value={ws.value}>
                        {ws.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">Unit</label>
                  <select
                    className="input h-10 w-full"
                    value={entry.unit}
                    onChange={(e) =>
                      setDraftEntries((prev) =>
                        prev.map((item) =>
                          item.id === entry.id ? { ...item, unit: e.target.value as "hours" | "days" } : item,
                        ),
                      )
                    }
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">Value</label>
                  <input
                    type="number"
                    step="0.25"
                    className="input h-10 w-full"
                    placeholder={entry.unit === "days" ? "2" : "4"}
                    value={entry.value}
                    onChange={(e) =>
                      setDraftEntries((prev) =>
                        prev.map((item) =>
                          item.id === entry.id ? { ...item, value: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">Comments</label>
                  <input
                    className="input h-10 w-full"
                    placeholder="Optional notes"
                    value={entry.comments}
                    onChange={(e) =>
                      setDraftEntries((prev) =>
                        prev.map((item) =>
                          item.id === entry.id ? { ...item, comments: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
                {!editRow && draftEntries.length > 1 ? (
                  <button
                    type="button"
                    className="btn-ghost h-10 px-3 text-xs text-red-500"
                    onClick={() =>
                      setDraftEntries((prev) => prev.filter((item) => item.id !== entry.id))
                    }
                  >
                    Remove
                  </button>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </div>
            ))}
          </div>

          {!editRow ? (
            <button
              type="button"
              className="btn-ghost h-9 px-3 text-xs"
              onClick={() =>
                setDraftEntries((prev) => [
                  ...prev,
                  {
                    id: buildKey(),
                    effortDate: new Date().toISOString().slice(0, 10),
                    userId: isSelfOnlyEditor ? currentUserId : "",
                    workstream: defaultWorkstreamForScope[scope],
                    unit: "hours",
                    value: "",
                    comments: "",
                  },
                ])
              }
            >
              Add another entry
            </button>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button className="btn-ghost h-9 px-3 text-xs" onClick={() => setOpenModal(false)}>
              Cancel
            </button>
            <button className="btn-primary h-9 px-4 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editRow ? "Save changes" : "Save entries"}
            </button>
          </div>
        </MiniModal>
      ) : null}

      {deleteDialogRow ? (
        <MiniModal
          onClose={() => {
            if (deleting) return;
            setDeleteDialogRow(null);
          }}
          title="Delete entry?"
          widthClass="max-w-md"
          bodyClassName="space-y-4"
        >
          <p className="text-sm text-[color:var(--color-text)]/75">
            Delete entry for {deleteDialogRow.owner} on {formatEffortDate(deleteDialogRow.effortDate)}?
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost h-9 px-3 text-xs"
              onClick={() => setDeleteDialogRow(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-3 text-xs"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </MiniModal>
      ) : null}
    </div>
  );
}
