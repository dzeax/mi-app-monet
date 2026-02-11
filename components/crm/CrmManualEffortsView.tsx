"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { endOfMonth, format, parseISO, startOfMonth, startOfYear } from "date-fns";
import {
  Calendar,
  Clock,
  Edit2,
  Euro,
  FileDown,
  Filter,
  List,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
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
  ownerAvatarUrl?: string | null;
  workstream: string;
  inputUnit: "hours" | "days";
  inputValue: number;
  hours: number;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
};

type ManualEffortScope = {
  role: "admin" | "editor";
  allowedPersonIds: string[] | null;
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

type Option = { label: string; value: string; count?: number };

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
    <div className={`relative ${containerClassName ?? ""}`} data-ms={`manual-efforts-${label}`} ref={wrapRef}>
      {!hideLabel ? <label className="text-xs font-medium text-[color:var(--color-text)]/70">{label}</label> : null}
      <button
        ref={triggerRef}
        type="button"
        className={[
          "w-full flex items-center justify-between gap-2",
          hideLabel
            ? "h-9 rounded-lg border border-transparent bg-[var(--color-surface-2)]/50 px-3 text-sm"
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
                  {opt.count != null ? (
                    <span className="text-xs text-[var(--color-muted)]">{opt.count}</span>
                  ) : null}
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
  compact = false,
}: {
  label: string;
  from: string;
  to: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  onClear: () => void;
  compact?: boolean;
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
    <div className={compact ? "relative" : "relative flex flex-col gap-1"} ref={wrapRef}>
      {!compact ? (
        <label className="text-xs font-medium text-[color:var(--color-text)]/70">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <button
          type="button"
          className={
            compact
              ? "flex h-9 min-w-[180px] items-center gap-2 rounded-lg border border-transparent bg-[var(--color-surface-2)]/50 px-3 text-left text-xs font-medium"
              : "input h-10 w-full text-left"
          }
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
        >
          {compact ? <Calendar className="h-3.5 w-3.5 text-[var(--color-muted)]" /> : null}
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

const formatEffortDate = (value: string) => {
  if (!isIsoDate(value)) return value;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "dd-MM-yyyy");
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0])
    .join("")
    .toUpperCase();

const parseYearFromDate = (value?: string | null) => {
  if (!value || value.length < 4) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const buildKey = () => `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getBadgeColor = (text: string) => {
  const colors = [
    "bg-blue-50 text-blue-700 border-blue-100",
    "bg-purple-50 text-purple-700 border-purple-100",
    "bg-emerald-50 text-emerald-700 border-emerald-100",
    "bg-amber-50 text-amber-700 border-amber-100",
    "bg-rose-50 text-rose-700 border-rose-100",
    "bg-indigo-50 text-indigo-700 border-indigo-100",
  ];
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = text.charCodeAt(index) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function CrmManualEffortsView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const { isAdmin, isEditor, user } = useAuth();
  const currentYear = new Date().getFullYear();

  const [rows, setRows] = useState<ManualEffortRow[]>([]);
  const [scope, setScope] = useState<ManualEffortScope | null>(null);
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
  const [removeDraftDialogId, setRemoveDraftDialogId] = useState<string | null>(null);
  const [deleteDialogRow, setDeleteDialogRow] = useState<ManualEffortRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState(false);

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
      const responseScope = body?.scope as Partial<ManualEffortScope> | undefined;
      const nextScope: ManualEffortScope = {
        role: responseScope?.role === "admin" ? "admin" : "editor",
        allowedPersonIds: Array.isArray(responseScope?.allowedPersonIds)
          ? responseScope.allowedPersonIds.map((value) => String(value))
          : null,
      };
      setScope(nextScope);
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

  const scopedPeople = useMemo(() => {
    const activePeople = people.filter((person) => person.isActive);
    if (isAdmin) return activePeople;

    const allowedIds = new Set<string>(
      Array.isArray(scope?.allowedPersonIds) && scope.allowedPersonIds.length > 0
        ? scope.allowedPersonIds
        : rows.map((row) => row.personId),
    );
    if (allowedIds.size > 0) {
      return activePeople.filter((person) => allowedIds.has(person.value));
    }

    const userDisplayName = user?.displayName?.trim().toLowerCase() ?? "";
    if (!userDisplayName) return [];
    return activePeople.filter((person) => person.label.trim().toLowerCase() === userDisplayName);
  }, [isAdmin, people, rows, scope?.allowedPersonIds, user?.displayName]);

  const ownerOptions = useMemo(
    () => scopedPeople.map((p) => ({ label: p.label, value: p.value })),
    [scopedPeople],
  );

  const defaultDraftPersonId = useMemo(() => {
    if (isAdmin) return "";
    if (scopedPeople.length === 1) return scopedPeople[0].value;
    const userDisplayName = user?.displayName?.trim().toLowerCase() ?? "";
    if (!userDisplayName) return "";
    return (
      scopedPeople.find((person) => person.label.trim().toLowerCase() === userDisplayName)?.value ??
      ""
    );
  }, [isAdmin, scopedPeople, user?.displayName]);

  const createDefaultDraftEntry = useCallback(
    (): DraftEntry => ({
      id: buildKey(),
      effortDate: new Date().toISOString().slice(0, 10),
      personId: defaultDraftPersonId,
      workstream: DEFAULT_WORKSTREAM,
      unit: "hours",
      value: "",
      comments: "",
    }),
    [defaultDraftPersonId],
  );

  useEffect(() => {
    const allowed = new Set(ownerOptions.map((option) => option.value));
    setOwnerFilters((prev) => prev.filter((value) => allowed.has(value)));
  }, [ownerOptions]);

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

  const rowsForWorkstreamOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return computedRows.filter((row) => {
      if (term) {
        const hay = `${row.owner} ${row.workstream} ${row.comments || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (ownerFilters.length > 0 && !ownerFilters.includes(row.personId)) return false;
      if (fromDate && row.effortDate < fromDate) return false;
      if (toDate && row.effortDate > toDate) return false;
      return true;
    });
  }, [computedRows, fromDate, ownerFilters, search, toDate]);

  const workstreamOptions = useMemo(() => {
    const byWorkstream = new Map<string, number>();
    rowsForWorkstreamOptions.forEach((row) => {
      byWorkstream.set(row.workstream, (byWorkstream.get(row.workstream) ?? 0) + 1);
    });
    return Array.from(byWorkstream.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, value: label, count }));
  }, [rowsForWorkstreamOptions]);

  useEffect(() => {
    const allowed = new Set(workstreamOptions.map((option) => option.value));
    setWorkstreamFilters((prev) => prev.filter((value) => allowed.has(value)));
  }, [workstreamOptions]);

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
    setRemoveDraftDialogId(null);
    setDraftEntries([createDefaultDraftEntry()]);
    setOpenModal(true);
  };

  const openEditModal = (row: ManualEffortRow) => {
    setEditRow(row);
    setShowWorkstreamInput(false);
    setNewWorkstream("");
    setRemoveDraftDialogId(null);
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
      setRemoveDraftDialogId(null);
      await loadRows();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save entries";
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (row: ManualEffortRow) => {
    if (!(isAdmin || isEditor)) return;
    if (isEditor && Array.isArray(scope?.allowedPersonIds) && scope.allowedPersonIds.length > 0) {
      if (!scope.allowedPersonIds.includes(row.personId)) {
        showError("You can only delete your own entries.");
        return;
      }
    }
    setDeleteDialogRow(row);
  };

  const confirmDeleteEntry = async () => {
    if (deletingEntry || !deleteDialogRow) return;
    const row = deleteDialogRow;
    setDeletingEntry(true);
    try {
      const res = await fetch(
        `/api/crm/manual-efforts?id=${encodeURIComponent(row.id)}&client=${encodeURIComponent(clientSlug)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to delete entry");
      }
      showSuccess("Entry deleted");
      setDeleteDialogRow(null);
      await loadRows();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete entry";
      showError(message);
    } finally {
      setDeletingEntry(false);
    }
  };

  const handleAddDraftEntry = useCallback(() => {
    setDraftEntries((prev) => [...prev, createDefaultDraftEntry()]);
  }, [createDefaultDraftEntry]);

  const requestRemoveDraftEntry = useCallback(
    (entryId: string) => {
      if (draftEntries.length <= 1) return;
      setRemoveDraftDialogId(entryId);
    },
    [draftEntries.length],
  );

  const confirmRemoveDraftEntry = useCallback(() => {
    if (!removeDraftDialogId) return;
    setDraftEntries((prev) => prev.filter((item) => item.id !== removeDraftDialogId));
    setRemoveDraftDialogId(null);
  }, [removeDraftDialogId]);

  const clearFilters = () => {
    setSearch("");
    setOwnerFilters([]);
    setWorkstreamFilters([]);
    setFromDate(`${currentYear}-01-01`);
    setToDate(`${currentYear}-12-31`);
  };
  const hasActiveFilters =
    search.trim().length > 0 ||
    ownerFilters.length > 0 ||
    workstreamFilters.length > 0 ||
    fromDate !== `${currentYear}-01-01` ||
    toDate !== `${currentYear}-12-31`;

  const handleExportCsv = () => {
    if (filteredRows.length === 0) return;

    const escapeCsv = (value: string) => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
      return value;
    };

    const headers = [
      "Date",
      "Owner",
      "Workstream",
      "Input unit",
      "Input value",
      "Hours",
      "Days",
      "Budget EUR",
      "Comments",
    ];

    const dataRows = filteredRows.map((row) => [
      row.effortDate,
      row.owner,
      row.workstream,
      row.inputUnit,
      String(row.inputValue),
      String(row.hours),
      String(row.days),
      String(row.budget),
      row.comments ?? "",
    ]);

    const csv = [headers, ...dataRows]
      .map((line) => line.map((value) => escapeCsv(String(value))).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${clientSlug}-manual-efforts-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" data-page="crm-manual-efforts">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Manual Efforts</h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Register non-ticket effort entries for reporting.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
              {isAdmin ? (
                <button
                  className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                  onClick={() => setOpenImport(true)}
                >
                  <Upload size={14} />
                  Import CSV
                </button>
              ) : null}
              <button
                className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                onClick={loadRows}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
                Refresh
              </button>
              {isAdmin ? (
                <button
                  className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                  onClick={handleExportCsv}
                  disabled={filteredRows.length === 0}
                >
                  <FileDown size={14} />
                  Export CSV
                </button>
              ) : null}
              {isEditor || isAdmin ? <div className="mx-1 h-5 w-px bg-[var(--color-border)]" /> : null}
              {isEditor || isAdmin ? (
                <button className="btn-primary flex h-8 items-center gap-2 px-4 text-xs shadow-sm" onClick={openAddModal}>
                  <Plus size={14} />
                  Add entries
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {totals.missingRates > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {totals.missingRates} entries have no rate mapping. Add rates in Manage rates.
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Total Entries",
                primary: totals.entries.toLocaleString("es-ES"),
                secondary: null,
                icon: List,
                valueClassName: "tabular-nums",
              },
              {
                label: "Total Hours",
                primary: `${formatNumber(totals.hours)} h`,
                secondary: `(${formatNumber(totals.days, 1)} d)`,
                icon: Clock,
                valueClassName: "tabular-nums",
              },
              {
                label: "Total Days",
                primary: `${formatNumber(totals.days)} d`,
                secondary: null,
                icon: Calendar,
                valueClassName: "tabular-nums",
              },
              {
                label: "Total Budget",
                primary: formatCurrency(totals.budget),
                secondary: null,
                icon: Euro,
                valueClassName: "font-mono tabular-nums",
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
                        <span className={`text-2xl font-bold tracking-tight text-[var(--color-text)] ${item.valueClassName}`}>
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
          <div className="relative min-w-[200px] flex-1">
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
            compact
          />

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              title="Clear filters"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </section>

      <section className="card px-6 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Entries</h3>
          {loading ? (
            <span className="text-xs text-[color:var(--color-text)]/60">Loading...</span>
          ) : null}
        </div>
        <div className="table-wrap mt-6">
          <table className="table min-w-[980px] w-full table-fixed text-sm font-sans">
            <colgroup>
              <col className="w-[110px]" />
              <col className="w-[240px]" />
              <col className="w-[160px]" />
              <col className="w-[170px]" />
              <col className="w-[130px]" />
              <col />
              <col className="w-[96px]" />
            </colgroup>
            <thead>
              <tr className="bg-[var(--color-surface-2)] text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Workstream</th>
                <th className="px-3 py-2 text-right">Hours / Days</th>
                <th className="px-3 py-2 text-right">Budget</th>
                <th className="px-3 py-2 text-left">Comment</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="py-12 text-center text-sm text-[var(--color-muted)] font-sans" colSpan={7}>
                    No effort entries found
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const budgetMissing = row.rate <= 0 && row.hours > 0;
                  const canManageRow =
                    isAdmin ||
                    (isEditor &&
                      (Array.isArray(scope?.allowedPersonIds) && scope.allowedPersonIds.length > 0
                        ? scope.allowedPersonIds.includes(row.personId)
                        : true));
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
                            {row.ownerAvatarUrl ? (
                              <img
                                src={row.ownerAvatarUrl}
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
                        <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${getBadgeColor(row.workstream)}`}>
                          {row.workstream}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-sans">
                        <span className="font-semibold text-[var(--color-text)] font-sans">{formatNumber(row.hours)} h</span>
                        <span className="ml-1.5 text-xs text-[var(--color-muted)] font-normal font-sans">({formatNumber(row.days, 1)} d)</span>
                      </td>
                      <td
                        className="px-3 py-3 text-right text-[var(--color-text)] font-sans"
                        title={budgetMissing ? "Missing rate" : undefined}
                      >
                        {budgetMissing ? "--" : formatCurrency(row.budget)}
                      </td>
                      <td className="truncate px-3 py-3 text-[color:var(--color-text)]/80 font-sans" title={row.comments || ""}>
                        {row.comments || "--"}
                      </td>
                      <td className="px-3 py-3 font-sans">
                        <div className="flex items-center justify-end gap-2">
                          {canManageRow ? (
                            <button
                              className="btn-ghost p-1.5 hover:text-blue-600"
                              type="button"
                              onClick={() => openEditModal(row)}
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                          ) : null}
                          {canManageRow ? (
                            <button
                              className="btn-ghost p-1.5 hover:text-red-600"
                              type="button"
                              onClick={() => void handleDelete(row)}
                              title="Remove"
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
          onClose={() => {
            setOpenModal(false);
            setRemoveDraftDialogId(null);
          }}
          title={editRow ? "Edit manual effort" : "Add manual efforts"}
          widthClass="max-w-4xl"
          bodyClassName="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-[color:var(--color-text)]/70">
              Log non-ticket effort entries for the team.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isEditor || isAdmin ? (
                <button
                  type="button"
                  className="btn-ghost h-8 px-3 text-xs"
                  onClick={() => setShowWorkstreamInput((prev) => !prev)}
                >
                  {showWorkstreamInput ? "Cancel" : "Add workstream"}
                </button>
              ) : null}
              {!editRow && (isEditor || isAdmin) ? (
                <button
                  type="button"
                  className="btn-primary h-8 px-3 text-xs"
                  onClick={handleAddDraftEntry}
                >
                  Add entry
                </button>
              ) : null}
            </div>
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
                    {scopedPeople.map((person) => (
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
                    className="h-10 rounded-lg border border-red-200 bg-red-50/60 px-3 text-xs font-medium text-red-600 transition hover:bg-red-100"
                    onClick={() => requestRemoveDraftEntry(entry.id)}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              className="btn-ghost h-9 px-3 text-xs"
              onClick={() => {
                setOpenModal(false);
                setRemoveDraftDialogId(null);
              }}
            >
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
      {removeDraftDialogId ? (
        <MiniModal
          onClose={() => setRemoveDraftDialogId(null)}
          title="Confirm removal"
          widthClass="max-w-md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setRemoveDraftDialogId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={confirmRemoveDraftEntry}
              >
                Remove
              </button>
            </div>
          }
        >
          <div className="text-sm text-[color:var(--color-text)]/80">
            Remove this entry from the draft list?
          </div>
        </MiniModal>
      ) : null}
      {deleteDialogRow ? (
        <MiniModal
          onClose={() => {
            if (deletingEntry) return;
            setDeleteDialogRow(null);
          }}
          title="Confirm deletion"
          widthClass="max-w-md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={deletingEntry}
                onClick={() => setDeleteDialogRow(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={deletingEntry}
                onClick={() => void confirmDeleteEntry()}
              >
                {deletingEntry ? "Removing..." : "Remove"}
              </button>
            </div>
          }
        >
          <div className="text-sm text-[color:var(--color-text)]/80">
            Delete entry for {deleteDialogRow.owner} on {formatEffortDate(deleteDialogRow.effortDate)}?
          </div>
        </MiniModal>
      ) : null}

      {isAdmin && openImport ? (
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
