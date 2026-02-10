"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

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
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest(`[data-ms="worklogs-${label}"]`)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [label]);

  return (
    <div className="relative" data-ms={`worklogs-${label}`}>
      <label className="text-xs font-medium text-[color:var(--color-text)]/70">{label}</label>
      <button
        type="button"
        className="input h-10 w-full flex items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{display}</span>
        <span className="text-[color:var(--color-text)]/60">{open ? "^" : "v"}</span>
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

const buildKey = () => `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatNumber = (val: number, digits = 2) =>
  Number.isFinite(val)
    ? val.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "0,00";

const defaultWorkstreamForScope: Record<WorklogScope, string> = {
  monetization: "Monetization",
  internal: "Internal",
};

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

  const handleDelete = async (row: WorklogRow) => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`/api/worklogs?id=${row.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to delete entry");
      showSuccess("Entry deleted");
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to delete entry";
      showError(msg);
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
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
          <div className="flex flex-wrap items-center gap-2">
            {isEditor || isAdmin ? (
              <button className="btn-primary h-10 px-4" onClick={openAddModal}>
                Add entries
              </button>
            ) : null}
            <button className="btn-ghost h-10 px-4" onClick={loadRows}>
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="relative z-10 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(["monetization", "internal"] as WorklogScope[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`h-9 px-4 text-xs rounded-full border transition ${
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

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Entries", value: totals.entries.toLocaleString("es-ES"), helper: "Current filters" },
            { label: "Hours", value: formatNumber(totals.hours), helper: "Logged effort" },
            { label: "Days", value: formatNumber(totals.days), helper: "Hours / 7" },
          ].map((item) => (
            <div key={item.label} className="kpi-frame flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-[color:var(--color-primary)]">
                <span className="text-sm font-semibold">{item.label.slice(0, 1)}</span>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                  {item.label}
                </div>
                <div className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">
                  {item.value}
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-text)]/60">{item.helper}</div>
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="card px-6 py-5">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Search</label>
            <input
              className="input h-10 w-full"
              placeholder="Owner, workstream, comment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <MultiSelect
            label="Owner"
            options={ownerOptions}
            values={ownerFilters}
            onChange={setOwnerFilters}
            placeholder="All owners"
          />
          <div className="space-y-2">
            <MultiSelect
              label="Workstream"
              options={workstreamOptions}
              values={workstreamFilters}
              onChange={setWorkstreamFilters}
              placeholder="All workstreams"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">From</label>
            <DatePicker value={fromDate} onChange={setFromDate} ariaLabel="From date" />
          </div>
          <div>
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">To</label>
            <DatePicker value={toDate} onChange={setToDate} ariaLabel="To date" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="btn-ghost h-9 px-3 text-xs"
            type="button"
            onClick={() => {
              setSearch("");
              setOwnerFilters([]);
              setWorkstreamFilters([]);
              setFromDate("");
              setToDate("");
            }}
          >
            Clear filters
          </button>
        </div>
      </section>

      <section className="card px-6 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Entries</h3>
          {loading ? (
            <span className="text-xs text-[color:var(--color-text)]/60">Loading...</span>
          ) : null}
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-[960px] w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Workstream</th>
                <th className="px-3 py-2 text-right">Logged</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2">Comments</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-[color:var(--color-text)]/60" colSpan={8}>
                    No entries match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const loggedLabel = `${formatNumber(row.inputValue, 2)} ${row.inputUnit === "days" ? "d" : "h"}`;
                  return (
                    <tr key={row.id} className="border-t border-[color:var(--color-border)]">
                      <td className="px-3 py-3 whitespace-nowrap">{row.effortDate}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.owner}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.workstream}</td>
                      <td className="px-3 py-3 text-right">{loggedLabel}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.hours)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.hours / 7)}</td>
                      <td className="px-3 py-3 max-w-[260px] truncate" title={row.comments || ""}>
                        {row.comments || "--"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {isEditor || isAdmin ? (
                          <button
                            className="btn-ghost h-8 px-2 text-xs"
                            type="button"
                            onClick={() => openEditModal(row)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {isAdmin ? (
                          <button
                            className="btn-ghost h-8 px-2 text-xs text-red-500"
                            type="button"
                            onClick={() => void handleDelete(row)}
                          >
                            Delete
                          </button>
                        ) : null}
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
    </div>
  );
}
