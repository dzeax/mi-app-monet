/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import {
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
} from "date-fns";
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  X,
} from "lucide-react";
import type {
  CrmOwnerRate,
  DataQualityTicket,
  NeedsEffortDismissReason,
} from "@/types/crm";
import { DEFAULT_WORKSTREAM, WORKSTREAM_DEFAULTS } from "@/lib/crm/workstreams";
import { normalizeStr } from "@/lib/strings";
import { useAuth } from "@/context/AuthContext";
import MiniModal from "@/components/ui/MiniModal";
import ColumnPicker from "@/components/ui/ColumnPicker";
import DatePicker from "@/components/ui/DatePicker";
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
  needsEffort: boolean;
  hasWork: boolean;
  workstream: string[];
};

type JiraSyncStatus = {
  available: boolean;
  client: string;
  isRunning: boolean;
  lockedUntil: string | null;
  lastCursorAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastImported: number;
  lastPages: number;
  updatedAt: string | null;
};

const STATUS_OPTIONS = [
  "Backlog",
  "Refining",
  "Ready",
  "In progress",
  "Validation",
  "Done",
];
const OWNER_DEFAULTS = ["Stephane Rabarinala", "Lucas Vialatte"];
const TYPE_DEFAULTS = ["DATA", "LIFECYCLE", "CAMPAIGNS", "GLOBAL", "OPS"];
const NEEDS_EFFORT_STATUSES = new Set(["Validation", "Done"]);
const NEEDS_EFFORT_DISMISS_REASONS: { id: NeedsEffortDismissReason; label: string }[] = [
  { id: "no_effort_needed", label: "No effort needed" },
  { id: "duplicate", label: "Duplicate" },
  { id: "out_of_scope", label: "Out of scope" },
];
// Workstreams are configured per client catalog; defaults live in lib/crm/workstreams.

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

const formatRangeDate = (value?: string | null) => {
  if (!value || !isIsoDate(value)) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "MMM d, yyyy");
};

const formatRangeInputDate = (value?: string | null) => {
  if (!value || !isIsoDate(value)) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "dd/MM/yy");
};

const formatSyncAgo = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return "just now";
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (diffMs < minuteMs) return "just now";
  if (diffMs < hourMs) return `${Math.floor(diffMs / minuteMs)}m ago`;
  if (diffMs < dayMs) return `${Math.floor(diffMs / hourMs)}h ago`;
  return `${Math.floor(diffMs / dayMs)}d ago`;
};

const formatSyncTimestamp = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "dd/MM/yyyy HH:mm");
};

const formatRangeLabel = (
  label: string,
  from?: string | null,
  to?: string | null,
) => {
  const fromLabel = formatRangeDate(from);
  const toLabel = formatRangeDate(to);
  if (fromLabel && toLabel) return `${label}: ${fromLabel} - ${toLabel}`;
  if (fromLabel) return `${label}: Since ${fromLabel}`;
  if (toLabel) return `${label}: Until ${toLabel}`;
  return null;
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

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const todaysIsoDate = () => new Date().toISOString().slice(0, 10);

const computePrepHours = (workValue: string) => {
  if (workValue === "") return "";
  const workNum = Number(workValue);
  if (!Number.isFinite(workNum) || workNum < 0) return "";
  const rounded = Math.round(workNum * 0.35 * 100) / 100;
  return rounded.toFixed(2);
};

const defaultEffortDateForAssignedDate = (assignedDate: string) => {
  const year = Number(assignedDate.slice(0, 4));
  if (Number.isFinite(year) && year >= 2026) return todaysIsoDate();
  return assignedDate;
};

type Option = { label: string; value: string };
type PersonDirectoryItem = {
  personId: string;
  displayName: string;
  aliases: string[];
};
const STATUS_COLORS: Record<string, string> = {
  "In progress": "bg-amber-100 text-amber-800",
  Ready: "bg-blue-100 text-blue-800",
  Backlog: "bg-slate-100 text-slate-800",
  Refining: "bg-purple-100 text-purple-800",
  Validation: "bg-teal-100 text-teal-800",
  Done: "bg-emerald-50 text-emerald-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-rose-50 text-rose-700",
  P2: "bg-amber-50 text-amber-700",
  P3: "bg-slate-50 text-slate-600",
};

function MultiSelect({
  label,
  options,
  values,
  onChange,
  counts,
  placeholder = "All",
  hideLabel = false,
  containerClassName,
  triggerClassName,
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (vals: string[]) => void;
  counts?: Record<string, number>;
  placeholder?: string;
  hideLabel?: boolean;
  containerClassName?: string;
  triggerClassName?: string;
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
  const triggerClasses = [
    hideLabel
      ? "flex h-9 w-full items-center justify-between gap-2 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-left text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
      : "input flex h-10 w-full items-center justify-between gap-2 text-left truncate",
    hideLabel ? "" : values.length > 0 ? "ring-1 ring-[color:var(--color-accent)]" : "",
    hideLabel ? "focus:outline-none" : "focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]",
    triggerClassName || "",
  ]
    .filter(Boolean)
    .join(" ");

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
    <div className={["relative", containerClassName].filter(Boolean).join(" ")} ref={ref}>
      {!hideLabel ? (
        <label className="text-xs font-medium text-[color:var(--color-text)]/70">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        className={triggerClasses}
        onClick={() => setOpen((v) => !v)}
        title={display}
      >
        <span className="truncate">{display}</span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
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
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
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

function DateRangeField({
  label,
  from,
  to,
  onChangeFrom,
  onChangeTo,
  onClear,
  hideLabel = false,
}: {
  label: string;
  from: string;
  to: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  onClear: () => void;
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fromDate = from && isIsoDate(from) ? parseISO(from) : undefined;
  const toDate = to && isIsoDate(to) ? parseISO(to) : undefined;
  const hasRange = Boolean(fromDate || toDate);
  const display = (() => {
    const fromLabel = formatRangeInputDate(from);
    const toLabel = formatRangeInputDate(to);
    if (fromLabel && toLabel) return `${fromLabel} - ${toLabel}`;
    if (fromLabel) return `Since ${fromLabel}`;
    if (toLabel) return `Until ${toLabel}`;
    return hideLabel ? label : "All time";
  })();
  const selectedRange: DateRange | undefined = hasRange
    ? { from: fromDate, to: toDate }
    : undefined;
  const triggerClassName = hideLabel
    ? "flex h-9 w-full items-center justify-between gap-2 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-left text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
    : "input flex h-10 w-full items-center justify-between gap-2 text-left";
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

  return (
    <div className="relative flex flex-col gap-1" ref={wrapRef}>
      {!hideLabel ? (
        <label className="text-xs font-medium text-[color:var(--color-text)]/70">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <button
          type="button"
          className={triggerClassName}
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={
              `${hasRange
                ? "text-[color:var(--color-text)]"
                : "text-[color:var(--color-text)]/50"} truncate`
            }
          >
            {display}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </button>
        {hasRange ? (
          <button
            type="button"
            className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-[color:var(--color-text)]/50 hover:text-[color:var(--color-text)]"
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
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[560px] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-xl ring-1 ring-black/5">
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
          <div className="mt-3 rounded-lg border border-[color:var(--color-border)] bg-white/60 p-2 overflow-hidden">
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

const renderPlaceholder = (text = "n/a") => (
  <span className="text-[color:var(--color-text)]/55" title="Not available">
    {text}
  </span>
);

const renderStatusBadge = (status: string) => {
  const cls = STATUS_COLORS[status] || "bg-slate-100 text-slate-700";
  return (
    <span
      className={`dq-badge dq-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {status}
    </span>
  );
};

const renderPriorityBadge = (priority: string) => {
  const cls = PRIORITY_COLORS[priority] || "bg-slate-100 text-slate-700";
  return (
    <span
      className={`dq-badge dq-priority-badge inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {priority}
    </span>
  );
};

const TITLE_TAG_LIMIT = 4;

const parseTitleParts = (rawTitle: string) => {
  const trimmed = rawTitle.trim();
  const tags: string[] = [];
  let remainder = trimmed;
  const tagBlock = trimmed.match(/^(\s*\[[^\]]+\]\s*)+/);
  if (tagBlock) {
    const matches = Array.from(tagBlock[0].matchAll(/\[([^\]]+)\]/g));
    matches.forEach((match) => {
      const value = match[1]?.trim();
      if (value) tags.push(value);
    });
    remainder = trimmed.slice(tagBlock[0].length).trim();
  }
  let main = remainder;
  let meta: string | null = null;
  const metaMatch = remainder.match(/^(.*?)(?:\s*-\s*)([^-]+?)\s*-\s*(\d{4})\s*$/);
  if (metaMatch) {
    main = metaMatch[1]?.trim();
    const metaPart = metaMatch[2]?.trim();
    const year = metaMatch[3]?.trim();
    if (metaPart && year) meta = `${metaPart} ${year}`;
  }
  return {
    tags: tags.slice(0, TITLE_TAG_LIMIT),
    main: main || remainder,
    meta,
  };
};

const TitleCell = ({
  title,
  needsEffort,
}: {
  title?: string | null;
  needsEffort?: boolean;
}) => {
  if (!title) return renderPlaceholder();
  const { tags, main, meta } = parseTitleParts(title);
  const showMeta = tags.length > 0 || Boolean(meta) || needsEffort;
  return (
    <div className="title-cell" title={title}>
      <div className="title-main">{main || title}</div>
      {showMeta ? (
        <div className="title-meta">
          {needsEffort ? (
            <span
              className="title-flag"
              title="Changed to Validation/Done on last sync with no effort logged"
            >
              Effort missing
            </span>
          ) : null}
          {tags.map((tag) => (
            <span key={tag} className="title-chip">
              {tag}
            </span>
          ))}
          {meta ? <span className="title-meta-text">{meta}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

type DueSeverity = "done" | "neutral" | "warn" | "critical";

const getDueSeverity = (status: string, daysToDueValue: number | null): DueSeverity => {
  if (status === "Done") return "done";
  if (daysToDueValue == null) return "neutral";
  if (daysToDueValue > 0) return "neutral";
  if (daysToDueValue >= -15) return "warn";
  return "critical";
};

const isZeroValue = (value?: number | string | null) => {
  if (value == null) return false;
  if (typeof value === "number") return value === 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed === 0;
};

const WORKSTREAM_ALIASES: Record<string, string> = {
  "data quality": "Data",
  data: "Data",
  strategy: "Strategy & Governance",
  governance: "Strategy & Governance",
  "strategy & governance": "Strategy & Governance",
  lifecyle: "Lifecycle",
  "prospect lifecyle": "Prospect Lifecycle",
  lifecycle: "Lifecycle",
  "prospect lifecycle": "Prospect Lifecycle",
};

const normalizeWorkstream = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_WORKSTREAM;
  const key = trimmed.toLowerCase();
  return WORKSTREAM_ALIASES[key] ?? trimmed;
};

const normalizePersonKey = (value?: string | null) => normalizeStr(value);

const parseYearFromDate = (value?: string | null) => {
  if (!value || value.length < 4) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const stripTypePrefix = (value?: string | null) => {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^[A-Z]{2,6}-\d+\s+(.*)$/);
  const cleaned = match?.[1]?.trim();
  return cleaned || trimmed;
};

const getTicketContributions = (ticket: DataQualityTicket) => {
  const contribs =
    ticket.contributions && ticket.contributions.length > 0
      ? ticket.contributions
      : [
          {
            owner: ticket.owner,
            personId: null,
            workHours: ticket.workHours,
            prepHours: ticket.prepHours,
            workstream: DEFAULT_WORKSTREAM,
          },
        ];
  return contribs.map((c) => ({
    ...c,
    workHours: c.workHours ?? 0,
    prepHours: c.prepHours ?? null,
    workstream: normalizeWorkstream(c.workstream),
    personId: c.personId ?? null,
    notes: c.notes ?? null,
  }));
};

const getTicketTotalHours = (ticket: DataQualityTicket) => {
  const contribs = getTicketContributions(ticket);
  const totalWork = contribs.reduce((acc, c) => acc + (c.workHours ?? 0), 0);
  const totalPrep = contribs.reduce(
    (acc, c) =>
      acc + (c.prepHours != null ? c.prepHours : (c.workHours ?? 0) * 0.35),
    0,
  );
  return totalWork + totalPrep;
};

const COMPACT_VIEW_STORAGE_KEY = "dq.compactView";

const readBool = (key: string, defaultValue: boolean) => {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return defaultValue;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "boolean") return parsed;
    if (typeof parsed === "string") return parsed === "true";
    return defaultValue;
  } catch {
    return defaultValue;
  }
};

const sanitizeVisibleColumns = (
  ids: string[],
  validIds: Set<string>,
  fallback: string[],
) => {
  const unique = new Set<string>();
  ids.forEach((id) => {
    if (validIds.has(id)) unique.add(id);
  });
  const filtered = Array.from(unique);
  return filtered.length > 0 ? filtered : fallback;
};

const readVisibleColumns = (
  primaryKey: string,
  legacyKey: string | null,
  validIds: Set<string>,
  fallback: string[],
) => {
  if (typeof window === "undefined") return fallback;
  const readKey = (key: string) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : null;
    } catch {
      return null;
    }
  };
  const stored =
    readKey(primaryKey) ??
    (legacyKey ? readKey(legacyKey) : null);
  if (!stored) return fallback;
  return sanitizeVisibleColumns(stored, validIds, fallback);
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
type FloatingStyle = Record<string, string | number>;
export default function CrmDataQualityView() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const { user, isEditor, isAdmin, loading: authLoading } = useAuth();
  const currentYear = new Date().getFullYear();

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
    needsEffort: false,
    hasWork: false,
    workstream: [],
  });
  const [rows, setRows] = useState<DataQualityTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  type ModalStep = "details" | "effort";
  const [modalStep, setModalStep] = useState<ModalStep>("details");
  const [submitting, setSubmitting] = useState(false);
  type CatalogItem = { id: string; label: string; personId?: string | null };
  const [ownerItems, setOwnerItems] = useState<CatalogItem[]>(
    OWNER_DEFAULTS.map((o) => ({ id: `default-owner-${o}`, label: o, personId: null })),
  );
  const [peopleDirectory, setPeopleDirectory] = useState<PersonDirectoryItem[]>([]);
  const [typeItems, setTypeItems] = useState<CatalogItem[]>(
    TYPE_DEFAULTS.map((t) => ({ id: `default-type-${t}`, label: t })),
  );
  const [workstreamItems, setWorkstreamItems] = useState<string[]>(
    WORKSTREAM_DEFAULTS,
  );
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [showWorkstreamInput, setShowWorkstreamInput] = useState(false);
  const [newWorkstream, setNewWorkstream] = useState("");
  const [workstreamSubmitting, setWorkstreamSubmitting] = useState(false);
  const [editRow, setEditRow] = useState<DataQualityTicket | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [syncingJira, setSyncingJira] = useState(false);
  const [syncStatus, setSyncStatus] = useState<JiraSyncStatus | null>(null);
  const [lastSyncDetectedCount, setLastSyncDetectedCount] = useState(0);
  const [showNeedsEffortNudge, setShowNeedsEffortNudge] = useState(false);
  const [needsEffortBusyId, setNeedsEffortBusyId] = useState<string | null>(null);
  const [dismissDialogTicket, setDismissDialogTicket] = useState<DataQualityTicket | null>(null);
  const [deleteDialogTicket, setDeleteDialogTicket] = useState<DataQualityTicket | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionsMenuStyle, setActionsMenuStyle] = useState<FloatingStyle | null>(null);
  const [contributorsPopoverStyle, setContributorsPopoverStyle] = useState<FloatingStyle | null>(null);
  const [jiraTooltipStyle, setJiraTooltipStyle] = useState<FloatingStyle | null>(null);
  const [contributorsPopover, setContributorsPopover] = useState<{
    ticketId: string;
    ownersCount: number;
    rows: {
      ownerLabel: string;
      workHours: number;
      prepHours: number;
      workstream: string;
      key: string;
    }[];
  } | null>(null);
  const [removeContributionDialog, setRemoveContributionDialog] = useState<{
    id: string;
    owner: string;
    effortDate: string;
  } | null>(null);
  const [jiraTooltipTicketId, setJiraTooltipTicketId] = useState<string | null>(null);
  const rowsRef = useRef<DataQualityTicket[]>([]);
  const lastSeenSyncSuccessRef = useRef<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dqActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const dqActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const contributorsPopoverRef = useRef<HTMLDivElement | null>(null);
  const contributorsChipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const jiraTooltipRef = useRef<HTMLDivElement | null>(null);
  const jiraLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [compact, setCompact] = useState(() =>
    readBool(COMPACT_VIEW_STORAGE_KEY, true),
  );
  const [ownerRatesByYear, setOwnerRatesByYear] = useState<
    Record<number, Record<string, { dailyRate: number; currency: string; id?: string }>>
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
    {
      id: string;
      effortDate: string;
      owner: string;
      personId: string | null;
      workHours: string;
      prepHours: string;
      prepIsManual: boolean;
      workstream: string;
    }[]
  >([
    {
      id: "c-0",
      effortDate: todaysIsoDate(),
      owner: "",
      personId: null,
      workHours: "",
      prepHours: "",
      prepIsManual: false,
      workstream: DEFAULT_WORKSTREAM,
    },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const peopleById = useMemo(() => {
    const map = new Map<string, string>();
    peopleDirectory.forEach((person) => {
      if (person.personId) map.set(person.personId, person.displayName);
    });
    return map;
  }, [peopleDirectory]);
  const aliasToPersonId = useMemo(() => {
    const map = new Map<string, string>();
    peopleDirectory.forEach((person) => {
      if (!person.personId) return;
      const aliases = new Set([person.displayName, ...(person.aliases || [])]);
      aliases.forEach((alias) => {
        const key = normalizePersonKey(alias);
        if (key) map.set(key, person.personId);
      });
    });
    return map;
  }, [peopleDirectory]);
  const resolvePersonKey = useCallback(
    (label?: string | null, personId?: string | null) => {
      if (personId) return personId;
      const key = normalizePersonKey(label);
      if (!key) return "";
      return aliasToPersonId.get(key) ?? (label ?? "");
    },
    [aliasToPersonId],
  );
  const labelForPersonKey = useCallback(
    (key: string) => peopleById.get(key) ?? key,
    [peopleById],
  );
  const editorOwnerOption = useMemo(() => {
    if (!isEditor || isAdmin) return null;
    const rawDisplayName = user?.displayName?.trim() || "";
    const personIdFromDisplay = rawDisplayName
      ? aliasToPersonId.get(normalizePersonKey(rawDisplayName)) ?? null
      : null;
    if (personIdFromDisplay) {
      const byPersonId = ownerItems.find((item) => item.personId === personIdFromDisplay);
      if (byPersonId) return byPersonId;
      return {
        id: personIdFromDisplay,
        label: peopleById.get(personIdFromDisplay) ?? rawDisplayName,
        personId: personIdFromDisplay,
      };
    }
    if (!rawDisplayName) return null;
    const byLabel = ownerItems.find(
      (item) => normalizePersonKey(item.label) === normalizePersonKey(rawDisplayName),
    );
    if (byLabel) return byLabel;
    return {
      id: `self-owner-${normalizePersonKey(rawDisplayName) || "current"}`,
      label: rawDisplayName,
      personId: null,
    };
  }, [aliasToPersonId, isAdmin, isEditor, ownerItems, peopleById, user?.displayName]);
  const defaultContributionOwner = useMemo(
    () =>
      isEditor && !isAdmin
        ? {
            owner: editorOwnerOption?.label || user?.displayName?.trim() || "",
            personId: editorOwnerOption?.personId ?? null,
          }
        : null,
    [editorOwnerOption, isAdmin, isEditor, user?.displayName],
  );
  const isContributionOwnedByEditor = useCallback(
    (contrib: { owner: string; personId: string | null }) => {
      if (!isEditor || isAdmin) return true;
      const editorOwner = (defaultContributionOwner?.owner || "").trim();
      const editorPersonId = defaultContributionOwner?.personId ?? null;
      const contribOwner = (contrib.owner || "").trim();
      const contribPersonId =
        contrib.personId ??
        (contribOwner
          ? aliasToPersonId.get(normalizePersonKey(contribOwner)) ?? null
          : null);

      if (editorPersonId && contribPersonId) return editorPersonId === contribPersonId;
      if (editorPersonId && !contribPersonId && contribOwner) {
        const mapped = aliasToPersonId.get(normalizePersonKey(contribOwner));
        if (mapped) return mapped === editorPersonId;
      }
      if (!editorOwner) return false;
      return normalizePersonKey(contribOwner) === normalizePersonKey(editorOwner);
    },
    [
      aliasToPersonId,
      defaultContributionOwner?.owner,
      defaultContributionOwner?.personId,
      isAdmin,
      isEditor,
    ],
  );
  const getRateForContribution = useCallback(
    (
      contrib: { owner: string; personId?: string | null; effortDate?: string | null },
      fallbackDate?: string | null,
    ) => {
      const year =
        parseYearFromDate(contrib.effortDate) ??
        parseYearFromDate(fallbackDate) ??
        currentYear;
      const ratesForYear = ownerRatesByYear[year] ?? {};
      const personKey = resolvePersonKey(contrib.owner, contrib.personId ?? null);
      return (
        (personKey ? ratesForYear[personKey] : undefined) ??
        (contrib.personId ? ratesForYear[contrib.personId] : undefined) ??
        ratesForYear[contrib.owner]
      );
    },
    [currentYear, ownerRatesByYear, resolvePersonKey],
  );
  useEffect(() => {
    if (aliasToPersonId.size === 0) return;
    setFilters((prev) => {
      const mapValues = (vals: string[]) => {
        const next = vals
          .map((val) => aliasToPersonId.get(normalizePersonKey(val)) ?? val)
          .filter(Boolean);
        return Array.from(new Set(next));
      };
      const nextOwner = mapValues(prev.owner);
      const nextAssignee = mapValues(prev.assignee);
      const sameOwner =
        prev.owner.length === nextOwner.length &&
        prev.owner.every((val, idx) => val === nextOwner[idx]);
      const sameAssignee =
        prev.assignee.length === nextAssignee.length &&
        prev.assignee.every((val, idx) => val === nextAssignee[idx]);
      if (sameOwner && sameAssignee) return prev;
      return { ...prev, owner: nextOwner, assignee: nextAssignee };
    });
  }, [aliasToPersonId]);
  const typeOptions = useMemo(() => {
    const existing = new Set(typeItems.map((t) => t.label));
    const list = [...typeItems];
    if (form.type && !existing.has(form.type)) {
      list.unshift({ id: `current-${form.type}`, label: form.type });
    }
    return list;
  }, [typeItems, form.type]);

  /* ===== Column visibility ===== */
  const COLVIS_STORAGE_KEY = "dq.visibleColumns";
  const LEGACY_COLVIS_STORAGE_KEY = "dq_colvis_v2";
  const ACTIONS_HIDDEN_STORAGE_KEY = "dq.actionsHidden";
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
  const validColumnIds = useMemo(
    () => new Set(columnOptions.map((c) => c.id)),
    [columnOptions],
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(defaultVisible),
  );
  const [columnsReady, setColumnsReady] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const stored = readVisibleColumns(
      COLVIS_STORAGE_KEY,
      LEGACY_COLVIS_STORAGE_KEY,
      validColumnIds,
      defaultVisible,
    );
    let next = stored;
    if ((isEditor || isAdmin) && validColumnIds.has("actions")) {
      try {
        const raw = window.localStorage.getItem(ACTIONS_HIDDEN_STORAGE_KEY);
        const hideActions = raw ? JSON.parse(raw) === true : false;
        if (!hideActions && !next.includes("actions")) {
          next = [...next, "actions"];
        }
      } catch {
        /* ignore storage errors */
      }
    }
    setVisibleCols(new Set(next));
    setColumnsReady(true);
    try {
      window.localStorage.setItem(
        COLVIS_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [authLoading, defaultVisible, validColumnIds, isEditor, isAdmin]);

  useEffect(() => {
    if (authLoading || !columnsReady) return;
    const next = sanitizeVisibleColumns(
      Array.from(visibleCols),
      validColumnIds,
      defaultVisible,
    );
    try {
      window.localStorage.setItem(
        COLVIS_STORAGE_KEY,
        JSON.stringify(next),
      );
      if ((isEditor || isAdmin) && validColumnIds.has("actions")) {
        const hideActions = !next.includes("actions");
        window.localStorage.setItem(
          ACTIONS_HIDDEN_STORAGE_KEY,
          JSON.stringify(hideActions),
        );
      }
    } catch {
      /* ignore storage errors */
    }
  }, [authLoading, columnsReady, visibleCols, validColumnIds, defaultVisible, isEditor, isAdmin]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COMPACT_VIEW_STORAGE_KEY,
        JSON.stringify(compact),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [compact]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

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
  const [groupBy] = useState<GroupBy>("none");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const workstreamFilter = useMemo(
    () => new Set(filters.workstream.map((value) => normalizeWorkstream(value))),
    [filters.workstream],
  );
  const filterContributionsByWorkstream = useCallback(
    (contribs: ReturnType<typeof getTicketContributions>) => {
      if (workstreamFilter.size === 0) return contribs;
      return contribs.filter((c) =>
        workstreamFilter.has(normalizeWorkstream(c.workstream)),
      );
    },
    [workstreamFilter],
  );

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

  const isNeedsEffortTicket = useCallback(
    (ticket: DataQualityTicket) => {
      if (ticket.needsEffort?.state !== "open") return false;
      if (!NEEDS_EFFORT_STATUSES.has(ticket.status)) return false;
      return true;
    },
    [],
  );

  const rowMatches = useCallback((t: DataQualityTicket, exclude?: keyof Filters) => {
    if (
      exclude !== "status" &&
      filters.status.length > 0 &&
      !filters.status.includes(t.status)
    )
      return false;
    if (
      exclude !== "owner" &&
      filters.owner.length > 0 &&
      (() => {
        const contribs = filterContributionsByWorkstream(getTicketContributions(t));
        const owners = contribs
          .map((c) => resolvePersonKey(c.owner, c.personId))
          .filter(Boolean);
        return owners.some((owner) => filters.owner.includes(owner));
      })() === false
    ) {
      return false;
    }
    if (
      exclude !== "assignee" &&
      filters.assignee.length > 0 &&
      (() => {
        const key = resolvePersonKey(t.jiraAssignee || "", null);
        return Boolean(key) && filters.assignee.includes(key);
      })() === false
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
    if (exclude !== "workstream" && filters.workstream.length > 0) {
      const selected = new Set(
        filters.workstream.map((value) => normalizeWorkstream(value)),
      );
      const contribStreams = getTicketContributions(t).map((c) =>
        normalizeWorkstream(c.workstream),
      );
      if (!contribStreams.some((stream) => selected.has(stream))) return false;
    }
    if (exclude !== "needsEffort" && filters.needsEffort) {
      if (!isNeedsEffortTicket(t)) return false;
    }
    if (exclude !== "hasWork" && filters.hasWork) {
      const contribs = filterContributionsByWorkstream(getTicketContributions(t));
      const totalWork = contribs.reduce((acc, c) => acc + (c.workHours ?? 0), 0);
      if (totalWork <= 0) return false;
    }
    return true;
  }, [
    filters.assignedFrom,
    filters.assignedTo,
    filters.assignee,
    filters.daysBucket,
    filters.dueFrom,
    filters.dueTo,
    filters.needsEffort,
    filters.hasWork,
    filters.owner,
    filters.priority,
    filters.search,
    filters.status,
    filters.type,
    filters.workstream,
    filterContributionsByWorkstream,
    isNeedsEffortTicket,
    resolvePersonKey,
  ]);

  const needsEffortCount = useMemo(
    () => rows.filter((ticket) => isNeedsEffortTicket(ticket)).length,
    [rows, isNeedsEffortTicket],
  );
  const hasWorkCount = useMemo(
    () =>
      rows.filter((ticket) => {
        const contribs = filterContributionsByWorkstream(getTicketContributions(ticket));
        return contribs.some((c) => (c.workHours ?? 0) > 0);
      }).length,
    [rows, filterContributionsByWorkstream],
  );
  const needsEffortNudgeCount =
    lastSyncDetectedCount > 0 ? lastSyncDetectedCount : needsEffortCount;
  const dismissDialogBusy = dismissDialogTicket
    ? needsEffortBusyId === dismissDialogTicket.id
    : false;

  const activeChips = useMemo(() => {
    const chips: { label: string; onClear: () => void }[] = [];
    if (filters.status.length)
      chips.push({
        label: `Status: ${filters.status.join(", ")}`,
        onClear: () => handleChange("status", []),
      });
    if (filters.owner.length)
      chips.push({
        label: `Contributors: ${filters.owner.map(labelForPersonKey).join(", ")}`,
        onClear: () => handleChange("owner", []),
      });
    if (filters.assignee.length)
      chips.push({
        label: `Assignee (JIRA): ${filters.assignee.map(labelForPersonKey).join(", ")}`,
        onClear: () => handleChange("assignee", []),
      });
    if (filters.priority.length)
      chips.push({
        label: `Priority: ${filters.priority.join(", ")}`,
        onClear: () => handleChange("priority", []),
      });
    if (filters.type.length)
      chips.push({
        label: `Type: ${filters.type.map(stripTypePrefix).join(", ")}`,
        onClear: () => handleChange("type", []),
      });
    if (filters.workstream.length)
      chips.push({
        label: `Workstream: ${filters.workstream.join(", ")}`,
        onClear: () => handleChange("workstream", []),
      });
    if (filters.daysBucket)
      chips.push({
        label: `Days: ${filters.daysBucket}`,
        onClear: () => handleChange("daysBucket", ""),
      });
    if (filters.needsEffort)
      chips.push({
        label: `Needs effort${needsEffortCount ? `: ${needsEffortCount}` : ""}`,
        onClear: () => handleChange("needsEffort", false),
      });
    if (filters.hasWork)
      chips.push({
        label: `Work logged${hasWorkCount ? `: ${hasWorkCount}` : ""}`,
        onClear: () => handleChange("hasWork", false),
      });
    const createdLabel = formatRangeLabel(
      "Created",
      filters.assignedFrom,
      filters.assignedTo,
    );
    if (createdLabel) {
      chips.push({
        label: createdLabel,
        onClear: () => {
          handleChange("assignedFrom", "");
          handleChange("assignedTo", "");
        },
      });
    }
    const dueLabel = formatRangeLabel("Due", filters.dueFrom, filters.dueTo);
    if (dueLabel) {
      chips.push({
        label: dueLabel,
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
  }, [filters, needsEffortCount, labelForPersonKey]);

  const fetchTickets = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoading(true);
      }
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
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [clientSlug],
  );

  const fetchJiraSyncStatus = useCallback(
    async ({
      refreshOnNewSuccess = false,
    }: { refreshOnNewSuccess?: boolean } = {}) => {
      try {
        const res = await fetch(`/api/crm/jira-sync-status?client=${clientSlug}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const status = (body?.status ?? null) as JiraSyncStatus | null;
        setSyncStatus(status);
        const currentSuccess = status?.lastSuccessAt ?? null;
        const previousSuccess = lastSeenSyncSuccessRef.current;
        if (
          refreshOnNewSuccess &&
          currentSuccess &&
          previousSuccess &&
          currentSuccess !== previousSuccess
        ) {
          await fetchTickets({ silent: true });
        }
        lastSeenSyncSuccessRef.current = currentSuccess;
      } catch {
        // ignore status polling failures
      }
    },
    [clientSlug, fetchTickets],
  );

  const triggerJiraSync = useCallback(async () => {
    setSyncingJira(true);
    try {
      const res = await fetch(`/api/admin/jira-sync?client=${clientSlug}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (res.status === 409) {
        showSuccess(body?.message || "JIRA sync is already running");
        await fetchJiraSyncStatus();
        return;
      }
      if (!res.ok) {
        throw new Error(body?.error || `JIRA sync failed (${res.status})`);
      }
      const detectedRaw = Number(body?.needsEffortDetected ?? 0);
      const detectedCount = Number.isFinite(detectedRaw) ? detectedRaw : 0;
      setLastSyncDetectedCount(detectedCount);
      setShowNeedsEffortNudge(detectedCount > 0);
      showSuccess(`JIRA synced: ${body?.imported ?? 0} tickets`);
      await fetchTickets({ silent: true });
      await fetchJiraSyncStatus();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "error" in (err as any)
            ? String((err as any).error)
            : "JIRA sync failed";
      showError(message);
    } finally {
      setSyncingJira(false);
    }
  }, [clientSlug, fetchJiraSyncStatus, fetchTickets]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    void fetchJiraSyncStatus();
    const intervalHandle = window.setInterval(() => {
      void fetchJiraSyncStatus({ refreshOnNewSuccess: true });
    }, 60_000);
    return () => {
      window.clearInterval(intervalHandle);
    };
  }, [fetchJiraSyncStatus]);

  const updateNeedsEffortFlag = useCallback(
    async (
      ticket: DataQualityTicket,
      action: "clear" | "dismiss",
      reason?: NeedsEffortDismissReason,
    ) => {
      if (!isAdmin) return;
      setNeedsEffortBusyId(ticket.id);
      try {
        const res = await fetch("/api/crm/needs-effort", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client: clientSlug,
            ticketId: ticket.id,
            action,
            reason,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || `Needs effort update failed (${res.status})`);
        }
        showSuccess(action === "clear" ? "Needs effort cleared" : "Needs effort dismissed");
        setDismissDialogTicket(null);
        await fetchTickets();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update needs effort";
        showError(message);
      } finally {
        setNeedsEffortBusyId(null);
      }
    },
    [clientSlug, fetchTickets, isAdmin],
  );

  const deleteTicket = useCallback(
    async (ticket: DataQualityTicket) => {
      if (!isAdmin) return;
      setDeleteBusy(true);
      try {
        const res = await fetch(
          `/api/crm/data-quality?client=${clientSlug}&ticketId=${encodeURIComponent(ticket.ticketId)}`,
          { method: "DELETE" },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || `Delete failed (${res.status})`);
        }
        setRows((prev) => prev.filter((row) => row.ticketId !== ticket.ticketId));
        setDeleteDialogTicket(null);
        showSuccess(`Ticket ${ticket.ticketId} deleted`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to delete ticket";
        showError(message);
      } finally {
        setDeleteBusy(false);
      }
    },
    [clientSlug, isAdmin],
  );

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ target?: string; client?: string }>)
        ?.detail;
      if (detail?.client && detail.client !== clientSlug) return;
      if (
        detail?.target &&
        detail.target !== "data-quality" &&
        detail.target !== "ticket-reporting"
      )
        return;
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
        let loadedPeople = false;
        const resPeople = await fetch(`/api/crm/people?client=${clientSlug}`);
        const resTypes = await fetch(
          `/api/crm/catalogs?client=${clientSlug}&kind=type`,
        );
        const resWorkstreams = await fetch(
          `/api/crm/catalogs?client=${clientSlug}&kind=workstream`,
        );
        if (resPeople.ok) {
          const body = await resPeople.json().catch(() => null);
          if (active && Array.isArray(body?.people) && body.people.length > 0) {
            const people = body.people
              .map((p: any) => ({
                personId: String(p.personId ?? ""),
                displayName: String(p.displayName ?? "").trim(),
                aliases: Array.isArray(p.aliases)
                  ? p.aliases.map((alias: any) => String(alias ?? "").trim()).filter(Boolean)
                  : [],
              }))
              .filter((p: PersonDirectoryItem) => Boolean(p.personId) && Boolean(p.displayName));
            setPeopleDirectory(people);
            setOwnerItems(
              people.map((p: PersonDirectoryItem) => ({
                id: p.personId,
                label: p.displayName,
                personId: p.personId,
              })),
            );
            loadedPeople = true;
          }
        }
        if (!loadedPeople) {
          const resOwners = await fetch(
            `/api/crm/catalogs?client=${clientSlug}&kind=owner`,
          );
          if (resOwners.ok) {
            const body = await resOwners.json().catch(() => null);
            if (active && Array.isArray(body?.items) && body.items.length > 0) {
              setOwnerItems(
                body.items.map((i: any) => ({
                  id: i.id,
                  label: i.label,
                  personId: null,
                })),
              );
            }
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
        if (resWorkstreams.ok) {
          const body = await resWorkstreams.json().catch(() => null);
          if (active && Array.isArray(body?.items) && body.items.length > 0) {
            setWorkstreamItems(body.items.map((i: any) => String(i.label ?? "")).filter(Boolean));
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

  const rateYears = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((ticket) => {
      getTicketContributions(ticket).forEach((c) => {
        const year =
          parseYearFromDate(c.effortDate) ??
          parseYearFromDate(ticket.assignedDate);
        if (year) set.add(year);
      });
    });
    if (set.size === 0) set.add(currentYear);
    return Array.from(set).sort((a, b) => a - b);
  }, [rows, currentYear]);

  const rateYearsKey = useMemo(() => rateYears.join(","), [rateYears]);

  // Load owner rates (for budget column)
  useEffect(() => {
    let active = true;
    const loadRates = async () => {
      try {
        const res = await fetch(
          `/api/crm/rates?client=${clientSlug}&years=${rateYearsKey || currentYear}`,
        );
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as {
          rates?: CrmOwnerRate[];
        } | null;
        if (!body || !Array.isArray(body.rates) || !active) return;
        const map: Record<
          number,
          Record<string, { dailyRate: number; currency: string; id?: string }>
        > = {};
        body.rates.forEach((r) => {
          const year = Number(r.year ?? currentYear);
          if (!Number.isFinite(year)) return;
          const entry = {
            dailyRate: r.dailyRate,
            currency: r.currency || "EUR",
            id: r.id,
          };
          if (!map[year]) map[year] = {};
          if (r.personId) {
            map[year][r.personId] = entry;
          }
          map[year][r.owner] = entry;
        });
        setOwnerRatesByYear(map);
      } catch {
        // ignore - budget column will show n/a when no rate
      }
    };
    void loadRates();
    return () => {
      active = false;
    };
  }, [clientSlug, currentYear, rateYearsKey]);

  useEffect(() => {
    setPage(0);
  }, [filters, groupBy, sortKey, sortDir]);

  const options = useMemo(() => {
    const rowsForStatus = rows.filter((t) => rowMatches(t, "status"));
    const rowsForOwner = rows.filter((t) => rowMatches(t, "owner"));
    const rowsForAssignee = rows.filter((t) => rowMatches(t, "assignee"));
    const rowsForPriority = rows.filter((t) => rowMatches(t, "priority"));
    const rowsForType = rows.filter((t) => rowMatches(t, "type"));
    const rowsForWorkstream = rows.filter((t) => rowMatches(t, "workstream"));
    const countBy = (
      list: DataQualityTicket[],
      key: "status" | "priority" | "type",
    ) => {
      const acc: Record<string, number> = {};
      list.forEach((t) => {
        const val = (t as any)[key] as string | null;
        if (!val) return;
        acc[val] = (acc[val] || 0) + 1;
      });
      return acc;
    };
    const countAssignees = (list: DataQualityTicket[]) => {
      const acc: Record<string, number> = {};
      list.forEach((t) => {
        const key = resolvePersonKey(t.jiraAssignee || "", null);
        if (!key) return;
        acc[key] = (acc[key] || 0) + 1;
      });
      return acc;
    };
    const countContributors = (list: DataQualityTicket[]) => {
      const acc: Record<string, number> = {};
      list.forEach((t) => {
        const contribs = filterContributionsByWorkstream(getTicketContributions(t));
        const owners = new Set(
          contribs
            .map((c) => resolvePersonKey(c.owner, c.personId))
            .filter(Boolean),
        );
        owners.forEach((owner) => {
          acc[owner] = (acc[owner] || 0) + 1;
        });
      });
      return acc;
    };
    const countWorkstreams = (list: DataQualityTicket[]) => {
      const acc: Record<string, number> = {};
      list.forEach((t) => {
        const streams = getTicketContributions(t).map((c) =>
          normalizeWorkstream(c.workstream),
        );
        const uniqueStreams = new Set(streams);
        uniqueStreams.forEach((stream) => {
          acc[stream] = (acc[stream] || 0) + 1;
        });
      });
      return acc;
    };
    const workstreamSet = new Set<string>(
      workstreamItems.length > 0 ? workstreamItems : WORKSTREAM_DEFAULTS,
    );
    rowsForWorkstream.forEach((t) => {
      getTicketContributions(t).forEach((c) => {
        workstreamSet.add(normalizeWorkstream(c.workstream));
      });
    });
    const contributorSet = new Set<string>();
    rowsForOwner.forEach((t) => {
      const contribs = filterContributionsByWorkstream(getTicketContributions(t));
      contribs.forEach((c) => {
        const key = resolvePersonKey(c.owner, c.personId);
        if (key) contributorSet.add(key);
      });
    });
    const assigneeSet = new Set<string>();
    rowsForAssignee.forEach((t) => {
      const key = resolvePersonKey(t.jiraAssignee || "", null);
      if (key) assigneeSet.add(key);
    });
    const typeValues = unique(rowsForType.map((t) => t.type));
    const typeOptions = typeValues.map((value) => ({
      value,
      label: stripTypePrefix(value),
    }));
    const ownerOptions = Array.from(contributorSet)
      .map((key) => ({ value: key, label: labelForPersonKey(key) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const assigneeOptions = Array.from(assigneeSet)
      .map((key) => ({ value: key, label: labelForPersonKey(key) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      status: unique(rowsForStatus.map((t) => t.status)),
      owner: ownerOptions,
      assignee: assigneeOptions,
      priority: unique(rowsForPriority.map((t) => t.priority)),
      type: typeOptions,
      workstream: Array.from(workstreamSet),
      statusCounts: countBy(rowsForStatus, "status"),
      ownerCounts: countContributors(rowsForOwner),
      assigneeCounts: countAssignees(rowsForAssignee),
      priorityCounts: countBy(rowsForPriority, "priority"),
      typeCounts: countBy(rowsForType, "type"),
      workstreamCounts: countWorkstreams(rowsForWorkstream),
    };
  }, [
    rows,
    rowMatches,
    filterContributionsByWorkstream,
    resolvePersonKey,
    labelForPersonKey,
    workstreamItems,
  ]);

  const filtered = useMemo(
    () => rows.filter((t) => rowMatches(t)),
    [rows, rowMatches],
  );

  const sortedRows = useMemo(() => {
    const withMeta = filtered.map((t) => {
      const contribs = filterContributionsByWorkstream(getTicketContributions(t));
      const totalWork = contribs.reduce((acc, c) => acc + (c.workHours ?? 0), 0);
      const totalPrep = contribs.reduce(
        (acc, c) => acc + (c.prepHours != null ? c.prepHours : (c.workHours ?? 0) * 0.35),
        0,
      );
      const totalHours = totalWork + totalPrep;
      const totalDays = totalHours / 7;
      const budget = contribs.reduce((acc, c) => {
        const rate = getRateForContribution(c, t.assignedDate)?.dailyRate;
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
  }, [filtered, sortKey, sortDir, getRateForContribution, filterContributionsByWorkstream]);

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
      label: `${groupBy === "owner" ? "Owner" : "Type"}: ${
        groupBy === "owner" ? key : stripTypePrefix(key)
      } (${list.length} tickets)`,
      rows: list,
    }));
  }, [pagedRows, groupBy]);

  const handleChange = (
    key: keyof Filters,
    value: string | string[] | boolean,
  ) => {
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
      needsEffort: false,
      hasWork: false,
      workstream: [],
    });
    setSearchInput("");
    setPage(0);
  };

  const totals = useMemo(() => {
    let totalHours = 0;
    let totalDays = 0;
    let totalBudget = 0;
    filtered.forEach((t) => {
      const contribs = filterContributionsByWorkstream(getTicketContributions(t));
      contribs.forEach((c) => {
        const prep = (c.prepHours ?? c.workHours * 0.35) || 0;
        const hours = c.workHours + prep;
        const days = hours / 7;
        totalHours += hours;
        totalDays += days;
        const rate = getRateForContribution(c, t.assignedDate)?.dailyRate;
        if (rate != null) totalBudget += days * rate;
      });
    });
    return { totalHours, totalDays, totalBudget };
  }, [filtered, getRateForContribution, filterContributionsByWorkstream]);

  const handleChangeForm = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const confirmRemoveContribution = useCallback(() => {
    if (!removeContributionDialog) return;
    setFormContribs((prev) =>
      prev.filter((item) => item.id !== removeContributionDialog.id),
    );
    setRemoveContributionDialog(null);
  }, [removeContributionDialog]);

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
      setWorkstreamItems((prev) => {
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

  const openAddModal = () => {
    setModalStep("details");
    setEditRow(null);
    setRemoveContributionDialog(null);
    setShowWorkstreamInput(false);
    setNewWorkstream("");
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
    setFormContribs([
      {
        id: `c-${Date.now()}`,
        effortDate: todaysIsoDate(),
        owner: defaultContributionOwner?.owner || "",
        personId: defaultContributionOwner?.personId ?? null,
        workHours: "",
        prepHours: "",
        prepIsManual: false,
        workstream: DEFAULT_WORKSTREAM,
      },
    ]);
    setOpenAdd(true);
  };

  const openEditModal = (
    row: DataQualityTicket,
    startStep: ModalStep = "details",
  ) => {
    setModalStep(startStep);
    setEditRow(row);
    setRemoveContributionDialog(null);
    setShowWorkstreamInput(false);
    setNewWorkstream("");
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
    const resolveContributionIdentity = (
      ownerValue?: string | null,
      personIdValue?: string | null,
    ) => {
      const ownerRaw = String(ownerValue ?? "").trim();
      const inferredPersonId =
        personIdValue ??
        (ownerRaw ? aliasToPersonId.get(normalizePersonKey(ownerRaw)) ?? null : null);
      const canonicalOwner = inferredPersonId
        ? (peopleById.get(inferredPersonId) ?? ownerRaw)
        : ownerRaw;
      return {
        owner: canonicalOwner || ownerRaw,
        personId: inferredPersonId,
      };
    };

    const contribs =
      row.contributions && row.contributions.length > 0
        ? row.contributions.map((c, idx) => ({
            ...resolveContributionIdentity(c.owner, c.personId ?? null),
            id: `c-${row.ticketId}-${idx}`,
            effortDate:
              c.effortDate && isIsoDate(c.effortDate)
                ? c.effortDate
                : defaultEffortDateForAssignedDate(row.assignedDate || todaysIsoDate()),
            workHours: String(c.workHours ?? ""),
            prepHours:
              c.prepHours != null ? String(c.prepHours) : computePrepHours(String(c.workHours ?? "")),
            prepIsManual: false,
            workstream: normalizeWorkstream(c.workstream),
          }))
        : [
            {
              ...resolveContributionIdentity(row.owner, null),
              id: `c-${row.ticketId}-0`,
              effortDate: defaultEffortDateForAssignedDate(row.assignedDate || todaysIsoDate()),
              workHours: String(row.workHours ?? ""),
              prepHours:
                row.prepHours != null ? String(row.prepHours) : computePrepHours(String(row.workHours ?? "")),
              prepIsManual: false,
              workstream: DEFAULT_WORKSTREAM,
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

  const jiraPattern = /^https:\/\/europcarmobility\.atlassian\.net\/browse\/[A-Z0-9-]+$/i;

  const canProceedToEffort = useMemo(() => {
    const requiredFields = [
      form.status,
      form.assignedDate,
      form.ticketId,
      form.title,
      form.priority,
      form.type,
      form.jiraUrl,
    ];
    if (requiredFields.some((f) => !String(f || "").trim())) return false;
    if (form.jiraUrl && !jiraPattern.test(form.jiraUrl.trim())) return false;
    return true;
  }, [form.assignedDate, form.jiraUrl, form.priority, form.status, form.ticketId, form.title, form.type]);

  const hasContributionOwner = useMemo(
    () => formContribs.some((c) => c.owner.trim()),
    [formContribs],
  );
  const jiraFieldsReadOnly = Boolean(editRow);

  const goToDetailsStep = () => setModalStep("details");

  const goToEffortStep = () => {
    if (!canProceedToEffort) return;
    setModalStep("effort");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setFormError(null);
    try {
      const fallbackEffortDate = defaultEffortDateForAssignedDate(form.assignedDate);
      const contributions = formContribs
        .map((c) => {
          const rawEffort = (c.effortDate || "").trim();
          const effortDate = rawEffort && isIsoDate(rawEffort) ? rawEffort : fallbackEffortDate;
          const fallbackOwner = defaultContributionOwner?.owner || "";
          const fallbackPersonId = defaultContributionOwner?.personId ?? null;
          const owner = c.owner.trim() || fallbackOwner;
          const w = Number(c.workHours || "0");
          const pRaw = c.prepHours;
          const p =
            pRaw === "" || pRaw == null
              ? w * 0.35
              : Number(pRaw);
          return {
            owner,
            personId: c.personId || fallbackPersonId,
            effortDate,
            workHours: Number.isFinite(w) && w >= 0 ? w : 0,
            prepHours: Number.isFinite(p) && p >= 0 ? p : w * 0.35,
            workstream: normalizeWorkstream(c.workstream),
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
      setModalStep("details");
      setOpenAdd(false);
      setRemoveContributionDialog(null);
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
      setFormContribs([
        {
          id: `c-${Date.now()}`,
          effortDate: todaysIsoDate(),
          owner: defaultContributionOwner?.owner || "",
          personId: defaultContributionOwner?.personId ?? null,
          workHours: "",
          prepHours: "",
          prepIsManual: false,
          workstream: DEFAULT_WORKSTREAM,
        },
      ]);
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
  const openMenuTicket = useMemo(
    () => pagedRows.find((row) => row.ticketId === openMenuId) || null,
    [pagedRows, openMenuId],
  );
  const openMenuNeedsEffort = useMemo(
    () => (openMenuTicket ? isNeedsEffortTicket(openMenuTicket) : false),
    [openMenuTicket, isNeedsEffortTicket],
  );
  const openMenuNeedsEffortBusy = Boolean(
    openMenuTicket && needsEffortBusyId === openMenuTicket.id,
  );
  const canManageOpenMenuNeedsEffort = Boolean(isAdmin && openMenuNeedsEffort);

  const positionActionsMenu = useCallback((ticketId: string) => {
    const trigger = actionsButtonRefs.current[ticketId];
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const EDGE_GAP = 8;
    const FLOAT_GAP = 8;
    const MENU_WIDTH = 176;
    const measuredHeight =
      actionsMenuRef.current?.getBoundingClientRect().height || 220;
    const openTop =
      rect.bottom + FLOAT_GAP + measuredHeight > window.innerHeight - EDGE_GAP &&
      rect.top - FLOAT_GAP - measuredHeight >= EDGE_GAP;
    let top = openTop
      ? rect.top - measuredHeight - FLOAT_GAP
      : rect.bottom + FLOAT_GAP;
    top = Math.min(
      Math.max(EDGE_GAP, top),
      Math.max(EDGE_GAP, window.innerHeight - measuredHeight - EDGE_GAP),
    );
    let left = rect.right - MENU_WIDTH;
    left = Math.min(
      Math.max(EDGE_GAP, left),
      Math.max(EDGE_GAP, window.innerWidth - MENU_WIDTH - EDGE_GAP),
    );
    setActionsMenuStyle({
      position: "fixed",
      top,
      left,
      width: MENU_WIDTH,
      zIndex: 1200,
    });
  }, []);

  const positionContributorsPopover = useCallback((ticketId: string) => {
    const trigger = contributorsChipRefs.current[ticketId];
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const EDGE_GAP = 8;
    const FLOAT_GAP = 8;
    const POPOVER_WIDTH = 260;
    const measuredHeight =
      contributorsPopoverRef.current?.getBoundingClientRect().height || 220;
    const openTop =
      rect.bottom + FLOAT_GAP + measuredHeight > window.innerHeight - EDGE_GAP &&
      rect.top - FLOAT_GAP - measuredHeight >= EDGE_GAP;
    let top = openTop
      ? rect.top - measuredHeight - FLOAT_GAP
      : rect.bottom + FLOAT_GAP;
    top = Math.min(
      Math.max(EDGE_GAP, top),
      Math.max(EDGE_GAP, window.innerHeight - measuredHeight - EDGE_GAP),
    );
    let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    left = Math.min(
      Math.max(EDGE_GAP, left),
      Math.max(EDGE_GAP, window.innerWidth - POPOVER_WIDTH - EDGE_GAP),
    );
    setContributorsPopoverStyle({
      position: "fixed",
      top,
      left,
      width: POPOVER_WIDTH,
      zIndex: 1200,
    });
  }, []);

  const positionJiraTooltip = useCallback((ticketId: string) => {
    const trigger = jiraLinkRefs.current[ticketId];
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const EDGE_GAP = 8;
    const FLOAT_GAP = 8;
    const measured = jiraTooltipRef.current?.getBoundingClientRect();
    const tooltipWidth = measured?.width || 96;
    const tooltipHeight = measured?.height || 32;
    const openTop =
      rect.bottom + FLOAT_GAP + tooltipHeight > window.innerHeight - EDGE_GAP &&
      rect.top - FLOAT_GAP - tooltipHeight >= EDGE_GAP;
    let top = openTop
      ? rect.top - tooltipHeight - FLOAT_GAP
      : rect.bottom + FLOAT_GAP;
    top = Math.min(
      Math.max(EDGE_GAP, top),
      Math.max(EDGE_GAP, window.innerHeight - tooltipHeight - EDGE_GAP),
    );
    let left = rect.right - tooltipWidth;
    left = Math.min(
      Math.max(EDGE_GAP, left),
      Math.max(EDGE_GAP, window.innerWidth - tooltipWidth - EDGE_GAP),
    );
    setJiraTooltipStyle({
      position: "fixed",
      top,
      left,
      zIndex: 1200,
    });
  }, []);

  useEffect(() => {
    if (!openMenuId) {
      setActionsMenuStyle(null);
      return;
    }
    if (openMenuId === "dq-actions") {
      setActionsMenuStyle(null);
      return;
    }
    if (!openMenuTicket) {
      setOpenMenuId(null);
      setActionsMenuStyle(null);
      return;
    }
    const updatePosition = () => {
      positionActionsMenu(openMenuId);
      requestAnimationFrame(() => positionActionsMenu(openMenuId));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [openMenuId, openMenuTicket, positionActionsMenu]);

  useEffect(() => {
    if (!contributorsPopover) {
      setContributorsPopoverStyle(null);
      return;
    }
    const updatePosition = () => {
      positionContributorsPopover(contributorsPopover.ticketId);
      requestAnimationFrame(() =>
        positionContributorsPopover(contributorsPopover.ticketId),
      );
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [contributorsPopover, positionContributorsPopover]);

  useEffect(() => {
    if (!jiraTooltipTicketId) {
      setJiraTooltipStyle(null);
      return;
    }
    const updatePosition = () => {
      positionJiraTooltip(jiraTooltipTicketId);
      requestAnimationFrame(() => positionJiraTooltip(jiraTooltipTicketId));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [jiraTooltipTicketId, positionJiraTooltip]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (openMenuId) {
        if (openMenuId === "dq-actions") {
          if (
            !dqActionsMenuRef.current?.contains(target) &&
            !dqActionsButtonRef.current?.contains(target)
          ) {
            setOpenMenuId(null);
          }
        } else {
          const trigger = actionsButtonRefs.current[openMenuId];
          if (
            !actionsMenuRef.current?.contains(target) &&
            !trigger?.contains(target)
          ) {
            setOpenMenuId(null);
          }
        }
      }
      if (contributorsPopover) {
        const trigger = contributorsChipRefs.current[contributorsPopover.ticketId];
        if (
          !contributorsPopoverRef.current?.contains(target) &&
          !trigger?.contains(target)
        ) {
          setContributorsPopover(null);
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId, contributorsPopover]);

  useEffect(() => {
    if (!contributorsPopover) return;
    const exists = pagedRows.some(
      (row) => row.ticketId === contributorsPopover.ticketId,
    );
    if (!exists) setContributorsPopover(null);
  }, [contributorsPopover, pagedRows]);

  useEffect(() => {
    if (!jiraTooltipTicketId) return;
    const exists = pagedRows.some((row) => row.ticketId === jiraTooltipTicketId);
    if (!exists) setJiraTooltipTicketId(null);
  }, [jiraTooltipTicketId, pagedRows]);

  return (
    <div className="space-y-6">
      <header className="relative flex flex-col gap-8 overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.14),transparent_55%)]" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--color-text)]/65">
              Ticket Reporting
            </p>
            <h1
              className="text-2xl font-semibold text-[color:var(--color-text)]"
              title="JIRA tickets for this client. Track workload, SLAs and priorities in one place."
            >
              Ticket Reporting
            </h1>
            <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[color:var(--color-text)]/80">
              {clientSlug?.toUpperCase()} - CRM Ops
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
            <div
              className={[
                "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                syncStatus?.isRunning
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 text-[color:var(--color-text)]/75",
              ].join(" ")}
              title={
                formatSyncTimestamp(syncStatus?.lastSuccessAt)
                  ? `Last sync: ${formatSyncTimestamp(syncStatus?.lastSuccessAt)}${
                      syncStatus?.lastError ? ` | Last error: ${syncStatus.lastError}` : ""
                    }`
                  : "JIRA sync has not completed yet"
              }
            >
              <Activity
                size={14}
                className={syncStatus?.isRunning ? "animate-pulse text-amber-500" : "text-emerald-500"}
              />
              <span>
                {syncStatus?.isRunning
                  ? "Syncing JIRA..."
                  : syncStatus?.lastSuccessAt
                    ? `Synced ${formatSyncAgo(syncStatus.lastSuccessAt) ?? "recently"}`
                    : "Not synced yet"}
              </span>
            </div>
            {isEditor || isAdmin ? (
              <button
                className="btn-primary flex h-8 items-center gap-2 px-3 text-xs shadow-sm"
                onClick={() => {
                  void triggerJiraSync();
                }}
                disabled={syncingJira}
              >
                <RefreshCw size={14} className={syncingJira ? "animate-spin" : undefined} />
                {syncingJira ? "Syncing..." : "Sync JIRA now"}
              </button>
            ) : null}
            {isEditor || isAdmin ? (
              <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />
            ) : null}
            {isEditor || isAdmin ? (
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text)]/60 transition-colors hover:text-[var(--color-primary)]"
                type="button"
                onClick={openAddModal}
              >
                <Plus size={14} />
                Add ticket
              </button>
            ) : null}
          </div>
        </div>
        <div className="relative z-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="kpi-frame p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)]">
                <Ticket size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
                  Tickets
                </p>
                <p className="text-2xl font-bold leading-tight tracking-tight text-[var(--color-text)]">
                  {filtered.length}
                </p>
              </div>
            </div>
          </div>
          <div className="kpi-frame p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)]">
                <Clock size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
                  Total Work
                </p>
                <p className="text-2xl font-bold leading-tight tracking-tight text-[var(--color-text)]">
                  {totals.totalHours.toFixed(1)} h
                </p>
              </div>
            </div>
          </div>
          <div className="kpi-frame p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)]">
                <Calendar size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
                  Total Days
                </p>
                <p className="text-2xl font-bold leading-tight tracking-tight text-[var(--color-text)]">
                  {totals.totalDays.toFixed(1)} d
                </p>
              </div>
            </div>
          </div>
          <div className="kpi-frame p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)]">
                <Coins size={24} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
                  Budget
                </p>
                <p className="text-2xl font-bold leading-tight tracking-tight text-[var(--color-text)]">
                  {formatCurrency(totals.totalBudget, "EUR")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm ${openAdvanced ? "pb-2" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text)]/45"
            />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-10 w-full rounded-xl border border-transparent bg-transparent pl-9 pr-3 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text)]/45 focus:border-[var(--color-border)] focus:outline-none focus:ring-0"
              placeholder="Search ticket ID or title..."
            />
          </div>
          <div className="h-6 w-px bg-[var(--color-border)]" />
          <MultiSelect
            label="Status"
            options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))}
            values={filters.status}
            counts={options.statusCounts}
            onChange={(vals) => handleChange("status", vals)}
            placeholder="All status"
            hideLabel
            containerClassName="min-w-[160px] flex-1 md:flex-none"
          />
          <MultiSelect
            label="Assignee (JIRA)"
            options={options.assignee}
            values={filters.assignee}
            counts={options.assigneeCounts}
            onChange={(vals) => handleChange("assignee", vals)}
            placeholder="All assignees"
            hideLabel
            containerClassName="min-w-[170px] flex-1 md:flex-none"
          />
          <MultiSelect
            label="Contributors"
            options={options.owner}
            values={filters.owner}
            counts={options.ownerCounts}
            onChange={(vals) => handleChange("owner", vals)}
            placeholder="All contributors"
            hideLabel
            containerClassName="min-w-[170px] flex-1 md:flex-none"
          />
          <div className="h-6 w-px bg-[var(--color-border)]" />
          <button
            className={`btn-ghost relative h-9 w-9 rounded-lg ${openAdvanced ? "bg-[var(--color-surface-2)] text-[var(--color-primary)]" : "text-[var(--color-text)]/60"}`}
            style={{ padding: 0 }}
            type="button"
            onClick={() => setOpenAdvanced((v) => !v)}
            aria-label="More filters"
            title={openAdvanced ? "Hide filters" : "More filters"}
          >
            {openAdvanced ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
            {filters.daysBucket ||
            filters.assignedFrom ||
            filters.assignedTo ||
            filters.dueFrom ||
            filters.dueTo ? (
              <span
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[color:var(--color-primary)]"
                aria-hidden="true"
              />
            ) : null}
          </button>
        </div>

        {openAdvanced ? (
          <div className="w-full px-1 pb-2">
            <hr className="my-2 border-[var(--color-border)]/60" />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <MultiSelect
                label="Priority"
                options={options.priority.map((s) => ({ label: s, value: s }))}
                values={filters.priority}
                counts={options.priorityCounts}
                onChange={(vals) => handleChange("priority", vals)}
                placeholder="Priority"
                hideLabel
              />
              <MultiSelect
                label="Type"
                options={options.type}
                values={filters.type}
                counts={options.typeCounts}
                onChange={(vals) => handleChange("type", vals)}
                placeholder="Type"
                hideLabel
              />
              <MultiSelect
                label="Workstream"
                options={options.workstream.map((s) => ({ label: s, value: s }))}
                values={filters.workstream}
                counts={options.workstreamCounts}
                onChange={(vals) => handleChange("workstream", vals)}
                placeholder="Workstream"
                hideLabel
              />
              <DateRangeField
                label="Created date"
                from={filters.assignedFrom}
                to={filters.assignedTo}
                onChangeFrom={(value) => handleChange("assignedFrom", value)}
                onChangeTo={(value) => handleChange("assignedTo", value)}
                onClear={() => {
                  handleChange("assignedFrom", "");
                  handleChange("assignedTo", "");
                }}
                hideLabel
              />
              <DateRangeField
                label="Due date"
                from={filters.dueFrom}
                to={filters.dueTo}
                onChangeFrom={(value) => handleChange("dueFrom", value)}
                onChangeTo={(value) => handleChange("dueTo", value)}
                onClear={() => {
                  handleChange("dueFrom", "");
                  handleChange("dueTo", "");
                }}
                hideLabel
              />
              <select
                value={filters.daysBucket}
                onChange={(e) => handleChange("daysBucket", e.target.value)}
                className="h-9 w-full rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              >
                <option value="">Days to due</option>
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
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[color:var(--color-text)]/80">
            {activeChips.map((chip, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2.5 py-1"
              >
                {chip.label}
                <button
                  className="rounded-full p-0.5 text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface)]"
                  onClick={chip.onClear}
                  aria-label="Clear filter"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--color-text)]/70 hover:text-[color:var(--color-text)]"
              type="button"
              onClick={clearFilters}
            >
              <X size={12} />
              Clear all
            </button>
          </div>
        ) : null}
        {showNeedsEffortNudge && needsEffortNudgeCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
            <span>
              {needsEffortNudgeCount} ticket
              {needsEffortNudgeCount === 1 ? "" : "s"} moved to Done/Validation
              without effort.
            </span>
            <div className="flex items-center gap-2">
              <button
                className="btn-primary h-8 px-3 text-xs"
                type="button"
                onClick={() => {
                  handleChange("needsEffort", true);
                  setShowNeedsEffortNudge(false);
                  setLastSyncDetectedCount(0);
                }}
              >
                Review
              </button>
              <button
                className="btn-ghost h-8 px-3 text-xs"
                type="button"
                onClick={() => {
                  setShowNeedsEffortNudge(false);
                  setLastSyncDetectedCount(0);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

      <div className="overflow-visible rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        {error ? (
          <div className="px-4 py-3 text-sm text-[color:var(--color-text)]/75">
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-4 py-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-[var(--color-text)]">{totalTickets} tickets</span>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <button
              type="button"
              className={[
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition",
                filters.needsEffort
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/70",
                needsEffortCount === 0
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-[color:var(--color-surface-2)]/80",
              ].join(" ")}
              onClick={() => handleChange("needsEffort", !filters.needsEffort)}
              disabled={needsEffortCount === 0}
              aria-pressed={filters.needsEffort}
              title="Show tickets moved to Validation/Done in the last sync without effort"
            >
              Needs effort: {needsEffortCount}
            </button>
            <button
              type="button"
              className={[
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition",
                filters.hasWork
                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                  : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/70",
                hasWorkCount === 0
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-[color:var(--color-surface-2)]/80",
              ].join(" ")}
              onClick={() => handleChange("hasWork", !filters.hasWork)}
              disabled={hasWorkCount === 0}
              aria-pressed={filters.hasWork}
              title="Show tickets with work hours logged"
            >
              Work logged: {hasWorkCount}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                id="actions-btn-dq-actions"
                ref={dqActionsButtonRef}
                className="btn-ghost h-8 w-8 p-0 text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                type="button"
                onClick={() =>
                  setOpenMenuId((prev) => (prev === "dq-actions" ? null : "dq-actions"))
                }
                aria-label="Actions"
                title="Actions"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ⋯
                </span>
              </button>
              {openMenuId === "dq-actions" ? (
                <div
                  id="actions-menu-dq-actions"
                  ref={dqActionsMenuRef}
                  className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-xl ring-1 ring-black/5"
                >
                  <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-text)]/60">
                    Display
                  </div>
                  <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium hover:bg-[color:var(--color-surface-2)]">
                    <span>Compact view</span>
                    <input
                      type="checkbox"
                      checked={compact}
                      onChange={(e) => setCompact(e.target.checked)}
                      className="h-4 w-4 accent-[color:var(--color-primary)]"
                    />
                  </label>
                  <div
                    className="my-1 h-px bg-[color:var(--color-border)]/70"
                    aria-hidden="true"
                  />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-[color:var(--color-surface-2)]"
                    onClick={() => {
                      setOpenMenuId(null);
                      setShowColumnPicker(true);
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 text-[color:var(--color-text)]/70"
                    >
                      <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h9a1.5 1.5 0 1 1 0 3h-9A1.5 1.5 0 0 1 4 6.5Zm0 7A1.5 1.5 0 0 1 5.5 12h5a1.5 1.5 0 1 1 0 3h-5A1.5 1.5 0 0 1 4 13.5Zm8-1.75a.75.75 0 0 1 1.06 0l2.72 2.72a.75.75 0 1 1-1.06 1.06l-.47-.47-.72.72a.75.75 0 0 1-1.06-1.06l.72-.72-.47-.47a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                    Customize columns
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="relative overflow-x-auto overflow-y-visible">
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
                      const contribs = filterContributionsByWorkstream(
                        getTicketContributions(t),
                      );
                      const contribsWithLabels = contribs.map((c) => {
                        const key = resolvePersonKey(c.owner, c.personId);
                        const label = key ? labelForPersonKey(key) : c.owner;
                        return {
                          ...c,
                          ownerKey: key || c.owner,
                          ownerLabel: label || c.owner,
                        };
                      });
                      const owners = (() => {
                        const uniqueOwners: string[] = [];
                        const seen = new Set<string>();
                        contribsWithLabels.forEach((c) => {
                          const key = c.ownerKey || c.ownerLabel || "";
                          if (!key || seen.has(key)) return;
                          seen.add(key);
                          uniqueOwners.push(c.ownerLabel || key);
                        });
                        return uniqueOwners;
                      })();
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
                      const isZeroWork = isZeroValue(totalWork);
                      const isZeroPrep = isZeroValue(totalPrep);
                      const isZeroTotalHours = isZeroValue(totalHours);
                      const isZeroTotalDays = isZeroValue(totalDays);
                      const budget = contribs.reduce((acc, c) => {
                        const rate = getRateForContribution(c, t.assignedDate)?.dailyRate;
                        if (rate != null) {
                          const work = c.workHours ?? 0;
                          const prep = c.prepHours != null ? c.prepHours : work * 0.35;
                          acc += ((work + prep) / 7) * rate;
                        }
                        return acc;
                      }, 0);
                      const budgetCurrency = (() => {
                        for (const c of contribs) {
                          const currency = getRateForContribution(c, t.assignedDate)?.currency;
                          if (currency) return currency;
                        }
                        return "EUR";
                      })();
                      const typeRaw = t.type || "";
                      const typeLabel = typeRaw ? stripTypePrefix(typeRaw) : "";
                      const daysRemaining = daysToDue(t.dueDate);
                      const isDone = t.status === "Done";
                      const needsEffort = isNeedsEffortTicket(t);
                      const needsEffortBusy = needsEffortBusyId === t.id;
                      const canManageNeedsEffort = isAdmin && needsEffort;
                      const assigneeRaw = t.jiraAssignee || "";
                      const assigneeKey = resolvePersonKey(assigneeRaw, null);
                      const assigneeLabel = assigneeKey
                        ? labelForPersonKey(assigneeKey)
                        : assigneeRaw;
                      const dueSeverity = getDueSeverity(t.status, daysRemaining);
                      const dueSeverityClass =
                        dueSeverity === "critical"
                          ? "due--critical"
                          : dueSeverity === "warn"
                            ? "due--warn"
                            : dueSeverity === "done"
                              ? "due--done"
                              : "due--neutral";
                      const dueDisplay = isDone
                        ? "—"
                        : daysRemaining != null
                          ? String(daysRemaining)
                          : null;
                      const rowClassName = [
                        "dq-row",
                        isDone ? "row--done" : "",
                        needsEffort ? "row--needs-effort" : "",
                      ].join(" ");
                      return (
                        <tr
                          key={t.ticketId}
                          className={rowClassName}
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
                            <td className="px-3 py-3 max-w-[420px]">
                              <TitleCell title={t.title} needsEffort={needsEffort} />
                            </td>
                          ) : null}
                          {showCol("type") ? (
                            <td
                              className="px-3 py-3 font-semibold"
                              title={
                                typeRaw && typeLabel && typeLabel !== typeRaw
                                  ? typeRaw
                                  : undefined
                              }
                            >
                              {typeLabel || renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("assignee") ? (
                            <td
                              className="px-3 py-3 font-semibold"
                              title={
                                assigneeRaw
                                  ? assigneeLabel && assigneeLabel !== assigneeRaw
                                    ? `${assigneeLabel} (${assigneeRaw})`
                                    : assigneeRaw
                                  : undefined
                              }
                            >
                              {assigneeLabel || renderPlaceholder()}
                            </td>
                          ) : null}
                          {showCol("contributors") ? (
                            <td className="px-3 py-3 font-semibold">
                              {ownerLabel ? (
                                owners.length <= 1 ? (
                                  <span>{ownerLabel}</span>
                                ) : (
                                  <div className="inline-flex items-center gap-2">
                                    <span>{owners[0]}</span>
                                    <div className="relative">
                                      <button
                                        type="button"
                                        ref={(node) => {
                                          contributorsChipRefs.current[t.ticketId] = node;
                                        }}
                                        onClick={() => {
                                          if (
                                            contributorsPopover?.ticketId === t.ticketId
                                          ) {
                                            setContributorsPopover(null);
                                            return;
                                          }
                                          setContributorsPopover({
                                            ticketId: t.ticketId,
                                            ownersCount: owners.length,
                                            rows: contribsWithLabels.map((c, idx) => ({
                                              key: `${c.ownerLabel}-${idx}`,
                                              ownerLabel: c.ownerLabel,
                                              workHours: c.workHours ?? 0,
                                              prepHours:
                                                c.prepHours != null
                                                  ? c.prepHours
                                                  : Number(
                                                      ((c.workHours ?? 0) * 0.35).toFixed(2),
                                                    ),
                                              workstream: normalizeWorkstream(c.workstream),
                                            })),
                                          });
                                        }}
                                        className="dq-chip inline-flex items-center rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-text)]/80 ring-1 ring-[color:var(--color-border)]"
                                        tabIndex={0}
                                        aria-haspopup="dialog"
                                        aria-expanded={
                                          contributorsPopover?.ticketId === t.ticketId
                                        }
                                        aria-label={`Show contributors for ${t.ticketId}`}
                                      >
                                        +{owners.length - 1}
                                      </button>
                                    </div>
                                  </div>
                                )
                              ) : (
                                renderPlaceholder()
                              )}
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
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/30"
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
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/30"
                              aria-label={
                                daysRemaining != null
                                  ? `Days to due ${daysRemaining}`
                                  : "Days to due not available"
                              }
                            >
                              {dueDisplay != null ? (
                                <span
                                  className={`due-pill ${dueSeverityClass}`}
                                  title={
                                    isDone && daysRemaining != null
                                      ? `Days to due: ${daysRemaining}`
                                      : undefined
                                  }
                                >
                                  {dueDisplay}
                                </span>
                              ) : (
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                          {showCol("priority") ? (
                            <td className="px-3 py-3">
                              {renderPriorityBadge(t.priority)}
                            </td>
                          ) : null}
                          {showCol("work") ? (
                            <td
                              className="px-3 py-3 border-l border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Work hours ${totalWork.toFixed(2)}`}
                            >
                              <span className={isZeroWork ? "cell--zero" : "cell--nonzero"}>
                                {totalWork.toFixed(2)}
                              </span>
                            </td>
                          ) : null}
                          {showCol("prep") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Prep hours ${totalPrep.toFixed(2)}`}
                            >
                              <span className={isZeroPrep ? "cell--zero" : "cell--nonzero"}>
                                {totalPrep.toFixed(2)}
                              </span>
                            </td>
                          ) : null}
                          {showCol("totalHours") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Total hours ${totalHours.toFixed(2)}`}
                            >
                              <span className={isZeroTotalHours ? "cell--zero" : "cell--nonzero"}>
                                {totalHours.toFixed(2)}
                              </span>
                            </td>
                          ) : null}
                          {showCol("totalDays") ? (
                            <td
                              className="px-3 py-3 bg-[color:var(--color-surface-2)]/40"
                              aria-label={`Total days ${totalDays.toFixed(2)}`}
                            >
                              <span className={isZeroTotalDays ? "cell--zero" : "cell--nonzero"}>
                                {totalDays.toFixed(2)}
                              </span>
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
                            <td className="px-3 py-3 dq-action-cell cell-jira">
                              {t.jiraUrl ? (
                                <Link
                                  href={t.jiraUrl}
                                  ref={(node) => {
                                    jiraLinkRefs.current[t.ticketId] = node;
                                  }}
                                  className="jira-link inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--color-surface-2)]/60"
                                  target="_blank"
                                  aria-label="Open in JIRA"
                                  onMouseEnter={() => setJiraTooltipTicketId(t.ticketId)}
                                  onMouseLeave={() =>
                                    setJiraTooltipTicketId((prev) =>
                                      prev === t.ticketId ? null : prev,
                                    )
                                  }
                                  onFocus={() => setJiraTooltipTicketId(t.ticketId)}
                                  onBlur={() =>
                                    setJiraTooltipTicketId((prev) =>
                                      prev === t.ticketId ? null : prev,
                                    )
                                  }
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src="/icons/ui/jira.png"
                                    alt="Open in JIRA"
                                    className="dq-icon jira-icon h-5 w-auto object-contain opacity-70 transition-opacity hover:opacity-100"
                                  />
                                </Link>
                              ) : (
                                renderPlaceholder()
                              )}
                            </td>
                          ) : null}
                              {isEditor || isAdmin ? (
                            showCol("actions") ? (
                              <td className="relative px-3 py-3 text-right dq-action-cell cell-actions">
                                <button
                                  ref={(node) => {
                                    actionsButtonRefs.current[t.ticketId] = node;
                                  }}
                                  className="row-action-btn rounded-md p-1.5 text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
                                  onClick={() =>
                                    setOpenMenuId((prev) =>
                                      prev === t.ticketId ? null : t.ticketId,
                                    )
                                  }
                                  aria-label={`Actions for ${t.ticketId}`}
                                  aria-haspopup="menu"
                                  aria-expanded={openMenuId === t.ticketId}
                                >
                                  <span className="text-lg leading-none">
                                    ⋯
                                  </span>
                                </button>
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
      {openMenuId && openMenuTicket && actionsMenuStyle
        ? createPortal(
            <div
              ref={actionsMenuRef}
              id={`actions-menu-${openMenuId}`}
              style={actionsMenuStyle}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg ring-1 ring-black/5"
              role="menu"
            >
              <button
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                onClick={() => {
                  setOpenMenuId(null);
                  openEditModal(openMenuTicket, "effort");
                }}
              >
                Log effort
              </button>
              <button
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                onClick={() => {
                  setOpenMenuId(null);
                  openEditModal(openMenuTicket);
                }}
              >
                Edit
              </button>
              {canManageOpenMenuNeedsEffort ? (
                <>
                  <div
                    className="my-1 h-px bg-[color:var(--color-border)]/70"
                    aria-hidden="true"
                  />
                  <button
                    className="block w-full px-3 py-2 text-left text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60"
                    onClick={() => {
                      setOpenMenuId(null);
                      void updateNeedsEffortFlag(openMenuTicket, "clear");
                    }}
                    disabled={openMenuNeedsEffortBusy}
                  >
                    Clear
                  </button>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-60"
                    onClick={() => {
                      setOpenMenuId(null);
                      setDismissDialogTicket(openMenuTicket);
                    }}
                    disabled={openMenuNeedsEffortBusy}
                  >
                    Dismiss…
                  </button>
                </>
              ) : null}
              {isAdmin ? (
                <button
                  className="block w-full px-3 py-2 text-left text-sm text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]"
                  onClick={() => {
                    setOpenMenuId(null);
                    setDeleteDialogTicket(openMenuTicket);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      {contributorsPopover && contributorsPopoverStyle
        ? createPortal(
            <div
              ref={contributorsPopoverRef}
              style={contributorsPopoverStyle}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-xs text-[color:var(--color-text)] shadow-md ring-1 ring-black/5"
              role="dialog"
              aria-label="Contributors details"
            >
              <p className="mb-1 font-semibold text-[color:var(--color-text)]">
                Contributors ({contributorsPopover.ownersCount})
              </p>
              <ul className="space-y-1">
                {contributorsPopover.rows.map((row) => (
                  <li key={row.key} className="flex flex-col">
                    <span className="font-semibold">{row.ownerLabel}</span>
                    <span className="text-[color:var(--color-text)]/70">
                      Work {row.workHours}h · Prep {row.prepHours}h ·{" "}
                      {row.workstream}
                    </span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
      {jiraTooltipTicketId && jiraTooltipStyle
        ? createPortal(
            <div
              ref={jiraTooltipRef}
              style={jiraTooltipStyle}
              className="pointer-events-none whitespace-nowrap rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-text)] shadow-md ring-1 ring-black/5"
              role="tooltip"
            >
              Open in JIRA
            </div>,
            document.body,
          )
        : null}
      {deleteDialogTicket && isAdmin ? (
        <MiniModal
          onClose={() => {
            if (deleteBusy) return;
            setDeleteDialogTicket(null);
          }}
          title={`Delete ticket ${deleteDialogTicket.ticketId}`}
          widthClass="max-w-md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setDeleteDialogTicket(null)}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                type="button"
                onClick={() => {
                  void deleteTicket(deleteDialogTicket);
                }}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting..." : "Delete ticket"}
              </button>
            </div>
          }
        >
          <div className="space-y-2 text-sm text-[color:var(--color-text)]/80">
            <p>
              You are about to permanently delete ticket{" "}
              <strong>{deleteDialogTicket.ticketId}</strong>.
            </p>
            <p>This action cannot be undone. Do you want to continue?</p>
          </div>
        </MiniModal>
      ) : null}
      {dismissDialogTicket && isAdmin ? (
        <MiniModal
          onClose={() => {
            if (dismissDialogBusy) return;
            setDismissDialogTicket(null);
          }}
          title={`Dismiss needs effort · ${dismissDialogTicket.ticketId}`}
          widthClass="max-w-md"
          footer={
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setDismissDialogTicket(null)}
              disabled={dismissDialogBusy}
            >
              Cancel
            </button>
          }
        >
          <div className="space-y-3 text-sm text-[color:var(--color-text)]/85">
            <p>Select a reason. This will remove the ticket from the needs effort queue.</p>
            <div className="grid gap-2">
              {NEEDS_EFFORT_DISMISS_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  type="button"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  onClick={() =>
                    void updateNeedsEffortFlag(dismissDialogTicket, "dismiss", reason.id)
                  }
                  disabled={dismissDialogBusy}
                >
                  {reason.label}
                </button>
              ))}
            </div>
          </div>
        </MiniModal>
      ) : null}
      {openAdd ? (
        <MiniModal
          onClose={() => {
            if (submitting) return;
            setModalStep("details");
            setRemoveContributionDialog(null);
            setOpenAdd(false);
          }}
          title={editRow ? "Edit ticket" : "Add ticket"}
          widthClass="max-w-4xl"
          bodyClassName="max-h-[70vh]"
          footer={
            modalStep === "details" ? (
              <>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    if (submitting) return;
                    setModalStep("details");
                    setRemoveContributionDialog(null);
                    setOpenAdd(false);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={goToEffortStep}
                  disabled={submitting || !canProceedToEffort}
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <button className="btn-ghost" type="button" onClick={goToDetailsStep} disabled={submitting}>
                  Back
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    if (submitting) return;
                    setModalStep("details");
                    setRemoveContributionDialog(null);
                    setOpenAdd(false);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !canProceedToEffort || !hasContributionOwner}
                >
                  {submitting ? "Saving..." : "Save ticket"}
                </button>
              </>
            )
          }
        >
          {formError ? (
            <div className="mb-3 rounded-lg border border-[color:var(--color-border)] bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </div>
          ) : null}
          <div className="space-y-5 text-sm text-[color:var(--color-text)]">
            <div className="rounded-xl bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs text-[color:var(--color-text)]/80">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={[
                      "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-[color:var(--color-surface)]/70",
                      modalStep === "details"
                        ? "text-[color:var(--color-text)]"
                        : "text-[color:var(--color-text)]/70",
                    ].join(" ")}
                    onClick={goToDetailsStep}
                    aria-current={modalStep === "details" ? "step" : undefined}
                  >
                    <span
                      className={[
                        "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                        canProceedToEffort && modalStep === "effort"
                          ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white"
                          : modalStep === "details"
                            ? "border-[color:var(--color-primary)]/60 bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                            : canProceedToEffort
                              ? "border-[color:var(--color-primary)]/35 bg-[color:var(--color-surface)] text-[color:var(--color-primary)]/80"
                              : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/60",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {canProceedToEffort && modalStep === "effort" ? (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-3 w-3"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 0 1 0 1.414l-7.2 7.2a1 1 0 0 1-1.414 0l-3.2-3.2a1 1 0 1 1 1.414-1.414l2.493 2.493 6.493-6.493a1 1 0 0 1 1.414 0Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        "1"
                      )}
                    </span>
                    <span className="font-semibold">Ticket details</span>
                  </button>

                  <div
                    className={[
                      "h-px w-10",
                      canProceedToEffort
                        ? "bg-[color:var(--color-primary)]/25"
                        : "bg-[color:var(--color-border)]/60",
                    ].join(" ")}
                    aria-hidden="true"
                  />

                  <button
                    type="button"
                    className={[
                      "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-[color:var(--color-surface)]/70 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                      modalStep === "effort"
                        ? "text-[color:var(--color-text)]"
                        : "text-[color:var(--color-text)]/70",
                    ].join(" ")}
                    onClick={goToEffortStep}
                    disabled={!canProceedToEffort}
                    aria-current={modalStep === "effort" ? "step" : undefined}
                    title={
                      canProceedToEffort
                        ? "Effort & notes"
                        : "Fill required fields to continue"
                    }
                  >
                    <span
                      className={[
                        "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                        modalStep === "effort"
                          ? "border-[color:var(--color-primary)]/60 bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                          : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/60",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      2
                    </span>
                    <span className="font-semibold">Effort & notes</span>
                  </button>
                </div>

                <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 px-2 py-1 text-[10px] text-[color:var(--color-text)]/70">
                  Client:{" "}
                  <strong className="text-[color:var(--color-text)]">
                    {clientSlug.toUpperCase()}
                  </strong>
                </span>
              </div>

              <div
                className="mt-2 h-px bg-[color:var(--color-border)]/60"
                aria-hidden="true"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modalStep === "details" ? (
                <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Status
                </span>
                {jiraFieldsReadOnly ? (
                  <input
                    className="input h-10"
                    value={form.status}
                    readOnly
                    aria-readonly="true"
                    title="Synced from JIRA (read-only)"
                  />
                ) : (
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
                )}
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
                  disabled={jiraFieldsReadOnly}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="inline-flex items-center gap-2 text-[color:var(--color-text)]/70">
                  Due date
                  <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[color:var(--color-text)]/60">
                    JIRA
                  </span>
                </span>
                <input
                  type="date"
                  className="input input-date h-10"
                  value={form.dueDate}
                  readOnly
                  aria-readonly="true"
                  title="Synced from JIRA (read-only)"
                  disabled
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
                  disabled={jiraFieldsReadOnly}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-[color:var(--color-text)]/70">Title</span>
                <input
                  className="input h-10"
                  value={form.title}
                  onChange={(e) => handleChangeForm("title", e.target.value)}
                  disabled={jiraFieldsReadOnly}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--color-text)]/70">
                  Priority
                </span>
                {jiraFieldsReadOnly ? (
                  <input
                    className="input h-10"
                    value={form.priority}
                    readOnly
                    aria-readonly="true"
                    title="Synced from JIRA (read-only)"
                  />
                ) : (
                  <select
                    className="input h-10"
                    value={form.priority}
                    onChange={(e) => handleChangeForm("priority", e.target.value)}
                  >
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                )}
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
                  disabled
                />
                </label>
                </>
              ) : null}
              {modalStep === "effort" ? (
                <div className="sm:col-span-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Ticket
                      </div>
                      <div className="text-sm font-semibold text-[color:var(--color-text)]">
                        {form.ticketId || "Ticket"}
                      </div>
                      <div className="text-xs text-[color:var(--color-text)]/70">
                        {form.title || "—"}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[color:var(--color-text)]/80">
                      <div>
                        Status:{" "}
                        <strong className="text-[color:var(--color-text)]">
                          {form.status}
                        </strong>
                      </div>
                      <div>
                        Priority:{" "}
                        <strong className="text-[color:var(--color-text)]">
                          {form.priority}
                        </strong>
                      </div>
                      <div>
                        Assigned:{" "}
                        <strong className="text-[color:var(--color-text)]">
                          {form.assignedDate}
                        </strong>
                      </div>
                      <div>
                        Due:{" "}
                        <strong className="text-[color:var(--color-text)]">
                          {form.dueDate || "—"}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {modalStep === "effort" ? (
                <div className="sm:col-span-2 space-y-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[color:var(--color-text)]">Effort log</span>
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
                    <button
                      type="button"
                      className="btn-primary h-8 px-3 text-xs"
                      onClick={() =>
                        setFormContribs((prev) => [
                          ...prev,
                          {
                            id: `c-${Date.now()}`,
                            effortDate: defaultEffortDateForAssignedDate(form.assignedDate),
                            owner: defaultContributionOwner?.owner || "",
                            personId: defaultContributionOwner?.personId ?? null,
                            workHours: "",
                            prepHours: "",
                            prepIsManual: false,
                            workstream: DEFAULT_WORKSTREAM,
                          },
                        ])
                      }
                    >
                      Add entry
                    </button>
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

                <div className="space-y-2">
                  {formContribs.map((c) => (
                    (() => {
                      const isReadOnlyRow =
                        isEditor && !isAdmin && !isContributionOwnedByEditor(c);
                      const readOnlyFieldClass = isReadOnlyRow
                        ? "bg-[color:var(--color-surface-2)]/70 text-[color:var(--color-text)]/55 border-[color:var(--color-border)]/90 cursor-not-allowed disabled:opacity-100"
                        : "";
                      return (
                    <div
                      key={c.id}
                      className={`grid grid-cols-1 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 sm:grid-cols-6 sm:items-end sm:gap-3 ${
                        isReadOnlyRow ? "opacity-50" : ""
                      }`}
                    >
                      <div>
                        <label className="text-xs font-medium text-[color:var(--color-text)]/70">Date</label>
                        <DatePicker
                          value={c.effortDate}
                          onChange={(value) => {
                            setFormContribs((prev) =>
                              prev.map((item) =>
                                item.id === c.id ? { ...item, effortDate: value } : item,
                              ),
                            );
                          }}
                          placeholder="dd/mm/aaaa"
                          ariaLabel="Effort date"
                          buttonClassName={`h-10 ${readOnlyFieldClass}`}
                          placement="top"
                          disabled={isReadOnlyRow}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-[color:var(--color-text)]/70">Owner</label>
                        {isAdmin ? (
                          <select
                            className={`input h-10 w-full ${readOnlyFieldClass}`}
                            value={c.personId ?? c.owner}
                            disabled={isReadOnlyRow}
                            onChange={(e) => {
                              const val = e.target.value;
                              const match =
                                ownerItems.find((o) => o.personId === val) ||
                                ownerItems.find((o) => o.label === val);
                              const personId = match?.personId ?? null;
                              const owner = match?.label ?? val;
                              setFormContribs((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, owner, personId } : item,
                                ),
                              );
                            }}
                          >
                            <option value="">Select owner</option>
                            {ownerItems.map((o) => (
                              <option key={o.personId ?? o.id} value={o.personId ?? o.label}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className={`input h-10 w-full ${readOnlyFieldClass}`}
                            value={
                              isReadOnlyRow
                                ? c.owner || "Unassigned"
                                : defaultContributionOwner?.owner || c.owner || ""
                            }
                            readOnly
                            disabled={isReadOnlyRow}
                            aria-readonly="true"
                            title={
                              isReadOnlyRow
                                ? "Read-only entry from another contributor"
                                : "Owner is restricted to the current user for editors"
                            }
                          />
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[color:var(--color-text)]/70">Workstream</label>
                        {isReadOnlyRow ? (
                          <input
                            className={`input h-10 w-full ${readOnlyFieldClass}`}
                            value={c.workstream || "n/a"}
                            readOnly
                            disabled
                            aria-readonly="true"
                            title="Read-only entry from another contributor"
                          />
                        ) : (
                          <select
                            className="input h-10 w-full"
                            value={c.workstream}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormContribs((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, workstream: val } : item,
                                ),
                              );
                            }}
                          >
                            {options.workstream.map((stream) => (
                              <option key={stream} value={stream}>
                                {stream}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[color:var(--color-text)]/70">Work (hrs)</label>
                        <input
                          className={`input h-10 w-full ${readOnlyFieldClass}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.workHours}
                          disabled={isReadOnlyRow}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormContribs((prev) =>
                              prev.map((item) => {
                                if (item.id !== c.id) return item;
                                const next = { ...item, workHours: val };
                                if (!item.prepIsManual) {
                                  next.prepHours = computePrepHours(val);
                                }
                                return next;
                              }),
                            );
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[color:var(--color-text)]/70">Prep (hrs)</label>
                        <input
                          className={`input h-10 w-full ${readOnlyFieldClass}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.prepHours}
                          placeholder="Auto 35% if blank or 0"
                          disabled={isReadOnlyRow}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormContribs((prev) =>
                              prev.map((item) =>
                                item.id === c.id
                                  ? { ...item, prepHours: val, prepIsManual: true }
                                  : item,
                              ),
                            );
                          }}
                        />
                      </div>

                      <div className="flex justify-end sm:col-span-6">
                        {!isReadOnlyRow && formContribs.length > 1 ? (
                          <button
                            type="button"
                            className="text-xs text-[color:var(--color-accent)]"
                            onClick={() =>
                              setRemoveContributionDialog({
                                id: c.id,
                                owner: c.owner || "Unassigned",
                                effortDate: c.effortDate || "",
                              })
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                      );
                    })()
                  ))}
                </div>
                </div>
              ) : null}
              {modalStep === "details" ? (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[color:var(--color-text)]/70">
                      Reporter
                    </span>
                    <input
                      className="input h-10"
                      value={form.reporter}
                      onChange={(e) =>
                        handleChangeForm("reporter", e.target.value)
                      }
                      placeholder="Reporter name (optional)"
                      disabled={jiraFieldsReadOnly}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[color:var(--color-text)]/70">
                      Type (parent)
                    </span>
                    {jiraFieldsReadOnly ? (
                      <input
                        className="input h-10"
                        value={form.type}
                        readOnly
                        aria-readonly="true"
                        title="Synced from JIRA (read-only)"
                      />
                    ) : (
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
                    )}
                  </label>
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    <span className="text-[color:var(--color-text)]/70">
                      JIRA URL
                    </span>
                    <input
                      className="input h-10"
                      value={form.jiraUrl}
                      onChange={(e) => {
                        if (jiraFieldsReadOnly) return;
                        const url = e.target.value;
                        handleChangeForm("jiraUrl", url);
                        const match = url.match(/browse\/([A-Z0-9-]+)$/i);
                        handleChangeForm("ticketId", match?.[1] ?? "");
                      }}
                      placeholder="https://europcarmobility.atlassian.net/browse/CRM-1234"
                      disabled={jiraFieldsReadOnly}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-[color:var(--color-text)]/70">
                      ETA
                    </span>
                    <DatePicker
                      value={form.etaDate}
                      onChange={(value) => handleChangeForm("etaDate", value)}
                      placeholder="dd/mm/aaaa"
                      ariaLabel="ETA"
                      buttonClassName="h-10"
                      placement="top"
                    />
                  </label>
                </>
              ) : null}

              {modalStep === "effort" ? (
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-[color:var(--color-text)]/70">
                    Comments
                  </span>
                  <textarea
                    className="input min-h-[110px]"
                    value={form.comments}
                    onChange={(e) => handleChangeForm("comments", e.target.value)}
                    placeholder="Optional notes"
                  />
                </label>
              ) : null}
            </div>
          </div>
        </MiniModal>
      ) : null}
      {removeContributionDialog ? (
        <MiniModal
          onClose={() => setRemoveContributionDialog(null)}
          title="Confirm removal"
          widthClass="max-w-md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setRemoveContributionDialog(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                type="button"
                onClick={confirmRemoveContribution}
              >
                Remove entry
              </button>
            </div>
          }
        >
          <div className="space-y-2 text-sm text-[color:var(--color-text)]/80">
            <p>Are you sure you want to remove this effort entry?</p>
            <p>
              Owner: <strong>{removeContributionDialog.owner}</strong>
            </p>
            <p>
              Date:{" "}
              <strong>
                {formatDate(removeContributionDialog.effortDate) ||
                  removeContributionDialog.effortDate ||
                  "n/a"}
              </strong>
            </p>
            <p>This action cannot be undone after saving the ticket.</p>
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
