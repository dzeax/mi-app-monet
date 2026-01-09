"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { endOfMonth, format, parseISO, startOfMonth, startOfYear } from "date-fns";
import CrmManualEffortsImportModal from "@/components/crm/CrmManualEffortsImportModal";
import DatePicker from "@/components/ui/DatePicker";
import MiniModal from "@/components/ui/MiniModal";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_WORKSTREAM } from "@/lib/crm/workstreams";
import { showError, showSuccess } from "@/utils/toast";

type ManualEffortRow = {
  id: string;
  clientSlug: string;
  effortDate: string;
  personId: string;
  owner: string;
  workstream: string;
  inputUnit: "hours" | "days";
  inputValue: number;
  hours: number;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
};

type PersonOption = {
  value: string;
  label: string;
  isActive: boolean;
};

type RateBucket = {
  byPerson: Record<string, number>;
  byOwner: Record<string, number>;
};

type DraftEntry = {
  id: string;
  effortDate: string;
  personId: string;
  workstream: string;
  unit: "hours" | "days";
  value: string;
  comments: string;
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
      if (!target.closest(`[data-ms="manual-efforts-${label}"]`)) {
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
    <div className="relative" data-ms={`manual-efforts-${label}`}>
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

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatRangeInputDate = (value?: string | null) => {
  if (!value || !isIsoDate(value)) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "dd/MM/yy");
};

function DateRangeField({
  label,
  from,
  to,
  onChangeFrom,
  onChangeTo,
  onClear,
}: {
  label: string;
  from: string;
  to: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const fromDate = from && isIsoDate(from) ? parseISO(from) : undefined;
  const toDate = to && isIsoDate(to) ? parseISO(to) : undefined;
  const hasRange = Boolean(fromDate || toDate);
  const display = (() => {
    const fromLabel = formatRangeInputDate(from);
    const toLabel = formatRangeInputDate(to);
    if (fromLabel && toLabel) return `${fromLabel} - ${toLabel}`;
    if (fromLabel) return `Since ${fromLabel}`;
    if (toLabel) return `Until ${toLabel}`;
    return "All time";
  })();
  const selectedRange: DateRange | undefined = hasRange
    ? { from: fromDate, to: toDate }
    : undefined;
  const today = new Date();
  const toIso = (date: Date) => format(date, "yyyy-MM-dd");
  const applyRange = (range?: DateRange) => {
    onChangeFrom(range?.from ? toIso(range.from) : "");
    onChangeTo(range?.to ? toIso(range.to) : "");
  };
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "This month", from: startOfMonth(today), to: endOfMonth(today) },
    { label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { label: "This year", from: startOfYear(today), to: today },
    {
      label: "Last year",
      from: new Date(today.getFullYear() - 1, 0, 1),
      to: new Date(today.getFullYear() - 1, 11, 31),
    },
  ];

  const updatePosition = useCallback(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const rect = trigger.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUp = spaceBelow < popRect.height && spaceAbove > spaceBelow;
    const shouldAlignRight =
      rect.left + popRect.width > viewportWidth && rect.right - popRect.width >= 0;
    setOpenUp((prev) => (prev === shouldOpenUp ? prev : shouldOpenUp));
    setAlignRight((prev) => (prev === shouldAlignRight ? prev : shouldAlignRight));
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, from, to]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updatePosition();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, updatePosition]);

  return (
    <div className="relative flex flex-col gap-1" ref={wrapRef}>
      <label className="text-xs font-medium text-[color:var(--color-text)]/70">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          className="input h-10 w-full text-left"
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={
              hasRange
                ? "text-[color:var(--color-text)]"
                : "text-[color:var(--color-text)]/50"
            }
          >
            {display}
          </span>
        </button>
        {hasRange ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[color:var(--color-text)]/50 hover:text-[color:var(--color-text)]"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            aria-label={`Clear ${label} range`}
            title="Clear"
          >
            x
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          ref={popoverRef}
          className="absolute z-50 w-[560px] max-w-[calc(100vw-32px)] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-xl ring-1 ring-black/5"
          style={{
            top: openUp ? "auto" : "calc(100% + 6px)",
            bottom: openUp ? "calc(100% + 6px)" : "auto",
            left: alignRight ? "auto" : 0,
            right: alignRight ? 0 : "auto",
          }}
        >
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)]/80 hover:bg-[color:var(--color-surface-2)]/80"
                onClick={() => {
                  applyRange({ from: preset.from, to: preset.to });
                  setOpen(false);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-white/60 p-2">
            <DayPicker
              mode="range"
              numberOfMonths={2}
              selected={selectedRange}
              defaultMonth={fromDate || toDate || today}
              onSelect={(range) => applyRange(range)}
              showOutsideDays
              classNames={{
                root: "relative text-sm",
                months: "flex gap-4 pt-6",
                month: "min-w-[224px] space-y-2",
                month_caption: "flex items-center justify-center gap-2",
                caption_label: "text-sm font-semibold",
                nav: "absolute left-2 right-2 top-2 flex items-center justify-between",
                button_previous:
                  "h-7 w-7 rounded-md border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-surface-2)]",
                button_next:
                  "h-7 w-7 rounded-md border border-[color:var(--color-border)] bg-white hover:bg-[color:var(--color-surface-2)]",
                month_grid: "w-full border-collapse",
                weekdays: "flex",
                weekday:
                  "w-8 text-center text-[10px] font-semibold uppercase text-[color:var(--color-text)]/50",
                weeks: "flex flex-col gap-1",
                week: "flex w-full",
                day: "h-8 w-8 p-0 text-center",
                day_button:
                  "h-8 w-8 rounded-md text-xs hover:bg-[color:var(--color-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]/40",
                range_start:
                  "bg-[color:var(--color-primary)] text-white font-semibold rounded-full ring-2 ring-white shadow-sm hover:bg-[color:var(--color-primary)]",
                range_end:
                  "bg-[color:var(--color-primary)] text-white font-semibold rounded-full ring-2 ring-white shadow-sm hover:bg-[color:var(--color-primary)]",
                range_middle:
                  "bg-[color:var(--color-primary)]/10 text-[color:var(--color-text)]/80",
                selected:
                  "bg-[color:var(--color-primary)] text-white hover:bg-[color:var(--color-primary)]",
                today: "font-semibold text-[color:var(--color-text)]",
                outside: "text-[color:var(--color-text)]/30",
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="btn-ghost h-8 px-3 text-xs border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 text-[color:var(--color-text)]/80 hover:text-[color:var(--color-text)]"
              onClick={onClear}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-primary h-8 px-3 text-xs"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const formatNumber = (val: number, digits = 2) =>
  Number.isFinite(val)
    ? val.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "0,00";

const parseYearFromDate = (value?: string | null) => {
  if (!value || value.length < 4) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const buildKey = () => `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function CrmManualEffortsView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const { isAdmin, isEditor } = useAuth();
  const currentYear = new Date().getFullYear();

  const [rows, setRows] = useState<ManualEffortRow[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [workstreams, setWorkstreams] = useState<string[]>([]);
  const [ratesByYear, setRatesByYear] = useState<Record<number, RateBucket>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [ownerFilters, setOwnerFilters] = useState<string[]>([]);
  const [workstreamFilters, setWorkstreamFilters] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState(`${currentYear}-12-31`);

  const [openModal, setOpenModal] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [editRow, setEditRow] = useState<ManualEffortRow | null>(null);
  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const [showWorkstreamInput, setShowWorkstreamInput] = useState(false);
  const [newWorkstream, setNewWorkstream] = useState("");
  const [workstreamSubmitting, setWorkstreamSubmitting] = useState(false);

  const currency = "EUR";
  const currencyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      });
    } catch {
      return null;
    }
  }, [currency]);

  const formatCurrency = (value: number) => {
    if (!Number.isFinite(value)) return "--";
    if (currencyFormatter) return currencyFormatter.format(value);
    const fallback = value.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${fallback} ${currency}`;
  };

  const loadPeople = useCallback(async () => {
    const res = await fetch(`/api/crm/people?client=${clientSlug}&includeInactive=1`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || "Failed to load people");
    }
    const list =
      Array.isArray(body?.people) ?
        body.people.map((p: any) => ({
          value: String(p.personId ?? p.id),
          label: String(p.displayName ?? ""),
          isActive: p.isActive !== false,
        }))
      : [];
    list.sort((a: PersonOption, b: PersonOption) => a.label.localeCompare(b.label));
    setPeople(list);
  }, [clientSlug]);

  const loadWorkstreams = useCallback(async () => {
    const res = await fetch(`/api/crm/catalogs?client=${clientSlug}&kind=workstream`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error || "Failed to load workstreams");
    }
    const list =
      Array.isArray(body?.items)
        ? body.items.map((item: any) => String(item.label ?? "")).filter(Boolean)
        : [];
    setWorkstreams(list);
  }, [clientSlug]);

  const loadRates = useCallback(
    async (sourceRows: ManualEffortRow[]) => {
      const yearSet = new Set<number>();
      sourceRows.forEach((row) => {
        const year = parseYearFromDate(row.effortDate);
        if (year) yearSet.add(year);
      });
      if (yearSet.size === 0) yearSet.add(currentYear);
      const years = Array.from(yearSet).sort((a, b) => a - b);
      const res = await fetch(`/api/crm/rates?client=${clientSlug}&years=${years.join(",")}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load rates");
      }
      const map: Record<number, RateBucket> = {};
      if (Array.isArray(body?.rates)) {
        body.rates.forEach((rate: any) => {
          const year = Number(rate.year ?? currentYear);
          if (!Number.isFinite(year)) return;
          if (!map[year]) map[year] = { byPerson: {}, byOwner: {} };
          if (rate.personId) {
            map[year].byPerson[String(rate.personId)] = Number(rate.dailyRate ?? 0);
          }
          if (rate.owner) {
            map[year].byOwner[String(rate.owner)] = Number(rate.dailyRate ?? 0);
          }
        });
      }
      setRatesByYear(map);
    },
    [clientSlug, currentYear],
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ client: clientSlug });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/crm/manual-efforts?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to load manual efforts");
      }
      const list = Array.isArray(body?.rows) ? (body.rows as ManualEffortRow[]) : [];
      setRows(list);
      await loadRates(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load manual efforts";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [clientSlug, fromDate, loadRates, toDate]);

  useEffect(() => {
    void Promise.all([loadPeople(), loadWorkstreams(), loadRows()]);
  }, [loadPeople, loadRows, loadWorkstreams]);

  const ownerOptions = useMemo(
    () => people.map((p) => ({ label: p.label, value: p.value })),
    [people],
  );
  const workstreamOptions = useMemo(
    () => workstreams.map((label) => ({ label, value: label })),
    [workstreams],
  );

  const getRateForRow = useCallback(
    (row: ManualEffortRow) => {
      const year = parseYearFromDate(row.effortDate) ?? currentYear;
      const bucket = ratesByYear[year];
      if (!bucket) return 0;
      const byPerson = bucket.byPerson[row.personId];
      if (byPerson != null) return byPerson;
      return bucket.byOwner[row.owner] ?? 0;
    },
    [currentYear, ratesByYear],
  );

  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const days = row.hours / 7;
      const rate = getRateForRow(row);
      const budget = days * rate;
      return { ...row, days, rate, budget };
    });
  }, [rows, getRateForRow]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return computedRows.filter((row) => {
      if (term) {
        const hay = `${row.owner} ${row.workstream} ${row.comments || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (ownerFilters.length > 0 && !ownerFilters.includes(row.personId)) return false;
      if (workstreamFilters.length > 0 && !workstreamFilters.includes(row.workstream)) return false;
      if (fromDate && row.effortDate < fromDate) return false;
      if (toDate && row.effortDate > toDate) return false;
      return true;
    });
  }, [computedRows, fromDate, ownerFilters, search, toDate, workstreamFilters]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.entries += 1;
        acc.hours += row.hours;
        acc.days += row.days;
        acc.budget += row.budget;
        if (row.rate <= 0 && row.hours > 0) acc.missingRates += 1;
        return acc;
      },
      { entries: 0, hours: 0, days: 0, budget: 0, missingRates: 0 },
    );
  }, [filteredRows]);

  const openAddModal = () => {
    setEditRow(null);
    setShowWorkstreamInput(false);
    setNewWorkstream("");
    setDraftEntries([
      {
        id: buildKey(),
        effortDate: new Date().toISOString().slice(0, 10),
        personId: "",
        workstream: DEFAULT_WORKSTREAM,
        unit: "hours",
        value: "",
        comments: "",
      },
    ]);
    setOpenModal(true);
  };

  const openEditModal = (row: ManualEffortRow) => {
    setEditRow(row);
    setShowWorkstreamInput(false);
    setNewWorkstream("");
    setDraftEntries([
      {
        id: buildKey(),
        effortDate: row.effortDate,
        personId: row.personId,
        workstream: row.workstream,
        unit: row.inputUnit,
        value: row.inputValue.toString(),
        comments: row.comments ?? "",
      },
    ]);
    setOpenModal(true);
  };

  const handleAddWorkstream = async () => {
    const label = newWorkstream.trim();
    if (!label || workstreamSubmitting) return;
    setWorkstreamSubmitting(true);
    try {
      const res = await fetch("/api/crm/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, kind: "workstream", label }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to add workstream");
      }
      const savedLabel = String(body?.item?.label ?? label);
      setWorkstreams((prev) => {
        const exists = prev.some((item) => item.toLowerCase() === savedLabel.toLowerCase());
        if (exists) return prev;
        return [...prev, savedLabel];
      });
      setNewWorkstream("");
      setShowWorkstreamInput(false);
      showSuccess("Workstream added");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to add workstream";
      showError(message);
    } finally {
      setWorkstreamSubmitting(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmed = draftEntries.map((entry) => ({
      ...entry,
      effortDate: entry.effortDate.trim(),
      personId: entry.personId,
      workstream: entry.workstream.trim(),
      unit: entry.unit,
      value: entry.value.trim(),
      comments: entry.comments.trim(),
    }));
    const invalid = trimmed.find(
      (entry) =>
        !entry.effortDate ||
        !entry.personId ||
        !entry.workstream ||
        !entry.value ||
        !Number.isFinite(Number(entry.value)) ||
        Number(entry.value) <= 0,
    );
    if (invalid) {
      showError("Please fill all required fields with valid values.");
      return;
    }

    setSaving(true);
    try {
      if (editRow) {
        const entry = trimmed[0];
        const res = await fetch("/api/crm/manual-efforts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client: clientSlug,
            id: editRow.id,
            effortDate: entry.effortDate,
            personId: entry.personId,
            workstream: entry.workstream,
            unit: entry.unit,
            value: Number(entry.value),
            comments: entry.comments || null,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || "Failed to update entry");
        }
        showSuccess("Entry updated");
      } else {
        const payload = trimmed.map((entry) => ({
          effortDate: entry.effortDate,
          personId: entry.personId,
          workstream: entry.workstream,
          unit: entry.unit,
          value: Number(entry.value),
          comments: entry.comments || null,
        }));
        const res = await fetch("/api/crm/manual-efforts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client: clientSlug, entries: payload }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || "Failed to add entries");
        }
        showSuccess("Entries saved");
      }
      setOpenModal(false);
      await loadRows();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save entries";
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ManualEffortRow) => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`/api/crm/manual-efforts?id=${row.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to delete entry");
      }
      showSuccess("Entry deleted");
      await loadRows();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete entry";
      showError(message);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setOwnerFilters([]);
    setWorkstreamFilters([]);
    setFromDate(`${currentYear}-01-01`);
    setToDate(`${currentYear}-12-31`);
  };

  return (
    <div className="space-y-6" data-page="crm-manual-efforts">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">Manual Efforts</h1>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
              Register non-ticket effort entries for {clientSlug.toUpperCase()}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isEditor || isAdmin ? (
              <button className="btn-primary h-10 px-4" onClick={openAddModal}>
                Add entries
              </button>
            ) : null}
            {isEditor || isAdmin ? (
              <button className="btn-ghost h-10 px-4" onClick={() => setOpenImport(true)}>
                Import CSV
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

        {totals.missingRates > 0 ? (
          <div className="relative z-10 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {totals.missingRates} entries have no rate mapping. Add rates in Manage rates.
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Entries", value: totals.entries.toLocaleString("es-ES"), helper: "Current filters" },
            { label: "Hours", value: formatNumber(totals.hours), helper: "Logged effort" },
            { label: "Days", value: formatNumber(totals.days), helper: "Hours / 7" },
            { label: "Budget (EUR)", value: formatCurrency(totals.budget), helper: "Using yearly rates" },
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
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1.4fr]">
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
          <MultiSelect
            label="Workstream"
            options={workstreamOptions}
            values={workstreamFilters}
            onChange={setWorkstreamFilters}
            placeholder="All workstreams"
          />
          <DateRangeField
            label="Date range"
            from={fromDate}
            to={toDate}
            onChangeFrom={setFromDate}
            onChangeTo={setToDate}
            onClear={() => {
              setFromDate("");
              setToDate("");
            }}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-ghost h-9 px-3 text-xs" type="button" onClick={clearFilters}>
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
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Workstream</th>
                <th className="px-3 py-2 text-right">Logged</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-right">Budget (EUR)</th>
                <th className="px-3 py-2">Comments</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-[color:var(--color-text)]/60" colSpan={9}>
                    No entries match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const loggedLabel = `${formatNumber(row.inputValue, 2)} ${row.inputUnit === "days" ? "d" : "h"}`;
                  const budgetMissing = row.rate <= 0 && row.hours > 0;
                  return (
                    <tr key={row.id} className="border-t border-[color:var(--color-border)]">
                      <td className="px-3 py-3 whitespace-nowrap">{row.effortDate}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.owner}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{row.workstream}</td>
                      <td className="px-3 py-3 text-right">{loggedLabel}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.hours)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.days)}</td>
                      <td className="px-3 py-3 text-right" title={budgetMissing ? "Missing rate" : undefined}>
                        {budgetMissing ? "--" : formatCurrency(row.budget)}
                      </td>
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
          title={editRow ? "Edit manual effort" : "Add manual efforts"}
          widthClass="max-w-4xl"
          bodyClassName="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-[color:var(--color-text)]/70">
              Log non-ticket effort entries for the team.
            </div>
            {isEditor || isAdmin ? (
              <button
                type="button"
                className="btn-ghost h-8 px-3 text-xs"
                onClick={() => setShowWorkstreamInput((prev) => !prev)}
              >
                {showWorkstreamInput ? "Cancel" : "Add workstream"}
              </button>
            ) : null}
          </div>

          {showWorkstreamInput ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2">
              <input
                className="input h-9 min-w-[220px]"
                placeholder="New workstream name"
                value={newWorkstream}
                onChange={(e) => setNewWorkstream(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary h-9 px-3 text-xs"
                disabled={!newWorkstream.trim() || workstreamSubmitting}
                onClick={() => void handleAddWorkstream()}
              >
                {workstreamSubmitting ? "Adding..." : "Add"}
              </button>
            </div>
          ) : null}

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
                    value={entry.personId}
                    onChange={(e) =>
                      setDraftEntries((prev) =>
                        prev.map((item) =>
                          item.id === entry.id ? { ...item, personId: e.target.value } : item,
                        ),
                      )
                    }
                  >
                    <option value="">Select person</option>
                    {people.map((person) => (
                      <option key={person.value} value={person.value}>
                        {person.label}{!person.isActive ? " (inactive)" : ""}
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
                    {workstreams.map((ws) => (
                      <option key={ws} value={ws}>
                        {ws}
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
                    personId: "",
                    workstream: DEFAULT_WORKSTREAM,
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
            <button
              className="btn-primary h-9 px-4 text-xs"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : editRow ? "Save changes" : "Save entries"}
            </button>
          </div>
        </MiniModal>
      ) : null}

      {openImport ? (
        <CrmManualEffortsImportModal
          clientSlug={clientSlug}
          onClose={() => setOpenImport(false)}
          onImported={() => {
            void loadRows();
            void loadWorkstreams();
          }}
        />
      ) : null}
    </div>
  );
}
