"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Activity, AlertTriangle, Calendar, Clock, Link2, Pencil, X } from "lucide-react";
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
import DatePicker from "@/components/ui/DatePicker";
import MiniModal from "@/components/ui/MiniModal";
import IfAdmin from "@/components/guards/IfAdmin";
import CrmDqTicketsShareModal from "@/components/crm/CrmDqTicketsShareModal";

type Option = { label: string; value: string };

type DashboardTicket = DataQualityTicket & {
  assigneeLabel?: string | null;
  assigneeKey?: string | null;
};

type DqTicketsViewProps = {
  clientOverride?: string;
  shareToken?: string;
  shareMode?: boolean;
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
  dueLabel: string;
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
const SLA_TIMEZONE = "Europe/Paris";
const SLA_START_HOUR = 9;
const SLA_AFTER_HOUR = 18;
const SLA_AFTER_CUTOFF_HOUR = 11;
const SLA_TYPE_ALLOWLIST = new Set(["data", "lifecycle"]);

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

const APP_STATUS_OPTIONS = [
  { value: "Standby", label: "Standby" },
  { value: "Waiting EMG", label: "Waiting EMG" },
  { value: "Waiting Internal", label: "Waiting Internal" },
  { value: "Blocked", label: "Blocked" },
];

const APP_STATUS_STYLES: Record<string, string> = {
  Standby: "border-amber-200 bg-amber-50 text-amber-700",
  "Waiting EMG": "border-sky-200 bg-sky-50 text-sky-700",
  "Waiting Internal": "border-purple-200 bg-purple-50 text-purple-700",
  Blocked: "border-rose-200 bg-rose-50 text-rose-700",
};

const P1_ACK_STATUS_STYLES: Record<string, string> = {
  on_time: "border-emerald-200 bg-emerald-50 text-emerald-700",
  late: "border-amber-200 bg-amber-50 text-amber-700",
  missing: "border-rose-200 bg-rose-50 text-rose-700",
  pending: "border-slate-200 bg-slate-100 text-slate-600",
};

const P1_ACK_STATUS_LABELS: Record<string, string> = {
  on_time: "On time",
  late: "Late",
  missing: "No ack",
  pending: "Pending Ready",
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

const formatDateTime = (value?: Date | null) => {
  if (!value) return "--";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: SLA_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
};

const formatHours = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(1)}h`;
};

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toIsoDate = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const addDaysToIsoDate = (value: string, days: number) => {
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return value;
  const [year, month, day] = parts;
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
};

const diffDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / DAY_MS);

const toggleFilterValue = (values: string[], value: string) => {
  if (!value) return values;
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : Array.from(new Set([...values, value]));
};

const stripTypePrefix = (value?: string | null) => {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^[A-Z]{2,6}-\d+\s+(.*)$/);
  const cleaned = match?.[1]?.trim();
  return cleaned || trimmed;
};

const parseIsoDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getTimeZoneParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const hour = Number(lookup.hour);
  const minute = Number(lookup.minute);
  const second = Number(lookup.second);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, second, weekday };
};

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string) => {
  const parts = getTimeZoneParts(date, timeZone);
  const utcAsLocal = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (utcAsLocal - date.getTime()) / 60000;
};

const zonedTimeToUtc = (
  value: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
) => {
  let utc = new Date(
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, 0),
  );
  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(utc, timeZone);
    const adjusted = new Date(
      Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, 0) -
        offsetMinutes * 60000,
    );
    if (Math.abs(adjusted.getTime() - utc.getTime()) < 1000) {
      return adjusted;
    }
    utc = adjusted;
  }
  return utc;
};

const addDaysToParts = (
  value: { year: number; month: number; day: number; weekday?: number },
  days: number,
) => {
  const base = new Date(Date.UTC(value.year, value.month - 1, value.day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    weekday: base.getUTCDay(),
  };
};

const nextBusinessDay = (value: { year: number; month: number; day: number; weekday: number }) => {
  let next = addDaysToParts(value, 1);
  while (next.weekday === 0 || next.weekday === 6) {
    next = addDaysToParts(next, 1);
  }
  return next;
};

const computeSlaWindow = (readyAt: Date) => {
  const local = getTimeZoneParts(readyAt, SLA_TIMEZONE);
  const baseDate = {
    year: local.year,
    month: local.month,
    day: local.day,
    weekday: local.weekday,
  };
  if (local.weekday === 0 || local.weekday === 6) {
    const monday = nextBusinessDay(baseDate);
    const startAt = zonedTimeToUtc(
      { year: monday.year, month: monday.month, day: monday.day, hour: SLA_START_HOUR, minute: 0 },
      SLA_TIMEZONE,
    );
    const deadlineAt = zonedTimeToUtc(
      { year: monday.year, month: monday.month, day: monday.day, hour: SLA_START_HOUR + 4, minute: 0 },
      SLA_TIMEZONE,
    );
    return { startAt, deadlineAt, policy: "weekend" as const };
  }
  if (local.hour >= SLA_AFTER_HOUR) {
    const nextDay = nextBusinessDay(baseDate);
    const startAt = zonedTimeToUtc(
      { year: nextDay.year, month: nextDay.month, day: nextDay.day, hour: SLA_START_HOUR, minute: 0 },
      SLA_TIMEZONE,
    );
    const deadlineAt = zonedTimeToUtc(
      {
        year: nextDay.year,
        month: nextDay.month,
        day: nextDay.day,
        hour: SLA_AFTER_CUTOFF_HOUR,
        minute: 0,
      },
      SLA_TIMEZONE,
    );
    return { startAt, deadlineAt, policy: "after_hours" as const };
  }
  return {
    startAt: readyAt,
    deadlineAt: new Date(readyAt.getTime() + 4 * 60 * 60 * 1000),
    policy: "standard" as const,
  };
};

const tooltipContainerClassName =
  "rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-xs text-[color:var(--color-text)] shadow-lg";

const renderStatusOwnerTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((entry: any) => Number(entry.value) > 0);
  if (rows.length === 0) return null;

  return (
    <div className={tooltipContainerClassName}>
      <div className="font-semibold">{label}</div>
      <div className="mt-1 space-y-1">
        {rows.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: entry.color ?? "var(--color-text)" }}
              />
              {entry.name ?? entry.dataKey}
            </span>
            <span className="font-semibold">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const renderPriorityTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className={tooltipContainerClassName}>
      <div className="font-semibold">{entry?.name ?? "Priority"}</div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span>Tickets</span>
        <span className="font-semibold">{entry?.value ?? 0}</span>
      </div>
    </div>
  );
};

const renderEtaTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className={tooltipContainerClassName}>
      <div className="font-semibold">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span>Tickets</span>
        <span className="font-semibold">{value}</span>
      </div>
    </div>
  );
};

function AnchoredPopover({
  open,
  anchorEl,
  onClose,
  width = 320,
  children,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popoverHeight = popoverRef.current?.offsetHeight ?? 180;
    const gap = 8;
    let top = rect.bottom + gap;
    let left = rect.left;
    const maxLeft = window.innerWidth - width - 12;
    left = Math.min(Math.max(left, 12), maxLeft);
    if (top + popoverHeight > window.innerHeight - 12) {
      top = rect.top - popoverHeight - gap;
    }
    if (top < 12) top = 12;
    setStyle({ top, left, width });
  }, [open, anchorEl, width]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onClick = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(event.target as Node)) return;
      if (anchorEl && anchorEl.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl || !style) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="z-[200] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-xl ring-1 ring-black/5"
      style={{ position: "fixed", ...style }}
    >
      {children}
    </div>,
    document.body,
  );
}

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

export default function CrmDqTicketsAnalyticsView({
  clientOverride,
  shareToken,
  shareMode = false,
}: DqTicketsViewProps) {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = clientOverride || segments[1] || "emg";
  const derivedShareToken = useMemo(() => {
    if (!shareMode) return undefined;
    if (segments.length >= 4 && segments[0] === "share") {
      const idx = segments.indexOf("dq-tickets");
      if (idx >= 0 && segments[idx + 1]) return segments[idx + 1];
    }
    return undefined;
  }, [shareMode, segments]);
  const effectiveShareToken = shareToken || derivedShareToken;
  const canEdit = !shareMode;

  const [rows, setRows] = useState<DashboardTicket[]>([]);
  const [meta, setMeta] = useState<DashboardMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<string[]>(DEFAULT_STATUSES);
  const [assigneeFilters, setAssigneeFilters] = useState<string[]>(DEFAULT_ASSIGNEES);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickClearId, setQuickClearId] = useState<string | null>(null);
  const [blockerTicket, setBlockerTicket] = useState<TicketView | null>(null);
  const [blockerStatus, setBlockerStatus] = useState("");
  const [blockerComment, setBlockerComment] = useState("");
  const [blockerSaving, setBlockerSaving] = useState(false);
  const [blockerError, setBlockerError] = useState<string | null>(null);
  const [commentEditor, setCommentEditor] = useState<{
    row: TicketView;
    anchor: HTMLElement;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [etaEditor, setEtaEditor] = useState<{
    row: TicketView;
    anchor: HTMLElement;
  } | null>(null);
  const [etaDraft, setEtaDraft] = useState("");
  const [etaSaving, setEtaSaving] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [p1AckOpen, setP1AckOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
      if (shareMode && !effectiveShareToken) {
        setError("Missing share token.");
        setLoading(false);
        return;
      }
      const endpoint = shareMode
        ? `/api/share/dq-tickets?client=${clientSlug}&token=${encodeURIComponent(
            effectiveShareToken ?? "",
          )}`
        : `/api/crm/dq-tickets-dashboard?client=${clientSlug}`;
      const ticketRes = await fetch(endpoint);
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
  }, [clientSlug, shareMode, effectiveShareToken]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const openBlockerModal = useCallback(
    (ticket: TicketView) => {
      if (shareMode) return;
      setBlockerTicket(ticket);
      setBlockerStatus(ticket.appStatus ?? "");
      setBlockerComment(ticket.comments ?? "");
      setBlockerError(null);
    },
    [shareMode],
  );

  const closeBlockerModal = useCallback(() => {
    setBlockerTicket(null);
    setBlockerStatus("");
    setBlockerComment("");
    setBlockerError(null);
  }, []);

  const saveBlockerStatus = useCallback(async () => {
    if (!blockerTicket) return;
    if (shareMode) return;
    const nextStatus = blockerStatus.trim();
    const requiresComment = nextStatus.length > 0;
    const nextComment = blockerComment.trim() || blockerTicket.comments || "";

    if (requiresComment && !blockerComment.trim()) {
      setBlockerError("Please add a short blocker note before saving.");
      return;
    }

    setBlockerSaving(true);
    setBlockerError(null);
    try {
      const res = await fetch("/api/crm/dq-ticket-app-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: clientSlug,
          ticketId: blockerTicket.ticketId,
          appStatus: nextStatus || null,
          comments: nextComment || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to update blocker status");
      }

      const updated = body?.ticket ?? {};
      setRows((prev) =>
        prev.map((row) =>
          row.id === blockerTicket.id
            ? {
                ...row,
                appStatus: updated.appStatus ?? (nextStatus || null),
                comments: (updated.comments ?? nextComment) || null,
                appStatusUpdatedAt: updated.appStatusUpdatedAt ?? row.appStatusUpdatedAt,
                appStatusUpdatedBy: updated.appStatusUpdatedBy ?? row.appStatusUpdatedBy,
              }
            : row,
        ),
      );

      closeBlockerModal();
    } catch (err) {
      setBlockerError(err instanceof Error ? err.message : "Unable to save blocker status");
    } finally {
      setBlockerSaving(false);
    }
  }, [blockerTicket, blockerStatus, blockerComment, clientSlug, closeBlockerModal, shareMode]);

  const updateTicketInline = useCallback(
    async (
      row: TicketView,
      payload: { appStatus?: string | null; comments?: string | null; etaDate?: string | null },
    ) => {
      if (shareMode) {
        throw new Error("Read-only share link.");
      }
      const res = await fetch("/api/crm/dq-ticket-app-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: clientSlug,
          ticketId: row.ticketId,
          ...payload,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to update ticket");
      }
      const updated = body?.ticket ?? {};
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                appStatus:
                  Object.prototype.hasOwnProperty.call(updated, "appStatus")
                    ? updated.appStatus ?? null
                    : item.appStatus ?? null,
                comments:
                  Object.prototype.hasOwnProperty.call(updated, "comments")
                    ? updated.comments ?? null
                    : item.comments ?? null,
                etaDate:
                  Object.prototype.hasOwnProperty.call(updated, "etaDate")
                    ? updated.etaDate ?? null
                    : item.etaDate ?? null,
                appStatusUpdatedAt: updated.appStatusUpdatedAt ?? item.appStatusUpdatedAt ?? null,
                appStatusUpdatedBy: updated.appStatusUpdatedBy ?? item.appStatusUpdatedBy ?? null,
              }
            : item,
        ),
      );
      return updated;
    },
    [clientSlug, shareMode],
  );

  const openCommentEditor = useCallback(
    (row: TicketView, anchor: HTMLElement) => {
      if (shareMode) return;
      setCommentEditor({ row, anchor });
      setCommentDraft(row.comments ?? "");
      setCommentError(null);
    },
    [shareMode],
  );

  const closeCommentEditor = useCallback(() => {
    setCommentEditor(null);
    setCommentDraft("");
    setCommentError(null);
  }, []);

  const openEtaEditor = useCallback(
    (row: TicketView, anchor: HTMLElement) => {
      if (shareMode) return;
      setEtaEditor({ row, anchor });
      setEtaDraft(row.etaDate ?? "");
      setEtaError(null);
    },
    [shareMode],
  );

  const closeEtaEditor = useCallback(() => {
    setEtaEditor(null);
    setEtaDraft("");
    setEtaError(null);
  }, []);

  const clearBlockerInline = useCallback(
    async (row: TicketView) => {
      if (shareMode) return;
      setQuickClearId(row.id);
      try {
        await updateTicketInline(row, { appStatus: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to clear blocker");
      } finally {
        setQuickClearId(null);
      }
    },
    [updateTicketInline, shareMode],
  );

  const saveCommentInline = useCallback(async () => {
    if (shareMode) return;
    if (!commentEditor) return;
    const row = commentEditor.row;
    const trimmed = commentDraft.trim();
    if (row.appStatus && !trimmed) {
      setCommentError("Comment is required while a blocker is active.");
      return;
    }
    setCommentSaving(true);
    setCommentError(null);
    try {
      await updateTicketInline(row, { comments: trimmed });
      closeCommentEditor();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Unable to save comment");
    } finally {
      setCommentSaving(false);
    }
  }, [commentEditor, commentDraft, updateTicketInline, closeCommentEditor, shareMode]);

  const clearCommentInline = useCallback(async () => {
    if (shareMode) return;
    if (!commentEditor) return;
    if (commentEditor.row.appStatus) return;
    setCommentSaving(true);
    setCommentError(null);
    try {
      await updateTicketInline(commentEditor.row, { comments: null });
      closeCommentEditor();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Unable to clear comment");
    } finally {
      setCommentSaving(false);
    }
  }, [commentEditor, updateTicketInline, closeCommentEditor, shareMode]);

  const saveEtaInline = useCallback(async () => {
    if (shareMode) return;
    if (!etaEditor) return;
    setEtaSaving(true);
    setEtaError(null);
    try {
      await updateTicketInline(etaEditor.row, { etaDate: etaDraft || null });
      closeEtaEditor();
    } catch (err) {
      setEtaError(err instanceof Error ? err.message : "Unable to save ETA");
    } finally {
      setEtaSaving(false);
    }
  }, [etaEditor, etaDraft, updateTicketInline, closeEtaEditor, shareMode]);

  const viewRows = useMemo<TicketView[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows.map((ticket) => {
      const rawAssignee = ticket.assigneeLabel || ticket.jiraAssignee || ticket.owner || "";
      const assigneeLabel = rawAssignee.trim() || "Unassigned";
      const createdDate = parseLocalDate(ticket.assignedDate);
      const etaValue = ticket.etaDate || null;
      const etaDate = parseLocalDate(etaValue);
      const dueLabel = ticket.dueDate ? formatDate(ticket.dueDate) : "--";
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
        ticket.appStatus,
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
        dueLabel,
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
    const stripped = source
      .map((value) => stripTypePrefix(value))
      .filter(Boolean);
    const found = Array.from(new Set(stripped)).sort((a, b) => a.localeCompare(b));
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
        const typeValue = stripTypePrefix(row.type ?? "");
        if (!typeSet.has(normalizePersonKey(typeValue))) return false;
      }
      if (query && !row.searchText.includes(query)) return false;
      return true;
    });
  }, [viewRows, statusFilters, assigneeFilters, priorityFilters, typeFilters, searchQuery]);

  const p1AckMetrics = useMemo(() => {
    const inScope = filteredRows.filter((row) => {
      if (row.priority !== "P1") return false;
      const stripped = stripTypePrefix(row.type ?? "").toLowerCase();
      if (SLA_TYPE_ALLOWLIST.has(stripped)) return true;
      return stripped.includes("lifecycle");
    });

    let total = 0;
    let onTime = 0;
    let missing = 0;
    let pendingReady = 0;

    const details = inScope.map((row) => {
      const readyAt =
        parseIsoDateTime(row.jiraReadyAt) ||
        (["Ready", "In progress", "Validation", "Done"].includes(row.status)
          ? parseIsoDateTime(row.jiraCreatedAt)
          : null);
      if (!readyAt) {
        pendingReady += 1;
        return { row, status: "pending" as const };
      }
      total += 1;
      const ackAt = parseIsoDateTime(row.jiraAckAt);
      const window = computeSlaWindow(readyAt);
      const isOnTime = ackAt != null && ackAt.getTime() <= window.deadlineAt.getTime();
      if (isOnTime) {
        onTime += 1;
      } else {
        if (!ackAt) missing += 1;
      }
      return {
        row,
        status: ackAt ? (isOnTime ? "on_time" : "late") : "missing",
        window,
        ackAt,
      };
    });

    const rate = total > 0 ? Math.round((onTime / total) * 100) : null;
    return {
      total,
      onTime,
      missing,
      pendingReady,
      scopeTotal: inScope.length,
      rate,
      details,
    };
  }, [filteredRows]);

  const p1AckDrilldown = useMemo(() => {
    const order = { missing: 0, late: 1, on_time: 2, pending: 3 } as const;
    const items = p1AckMetrics.details.map((detail) => {
      const row = detail.row;
      const readyAt =
        parseIsoDateTime(row.jiraReadyAt) ||
        (["Ready", "In progress", "Validation", "Done"].includes(row.status)
          ? parseIsoDateTime(row.jiraCreatedAt)
          : null);
      const ackAt = detail.ackAt ?? parseIsoDateTime(row.jiraAckAt);
      const window = detail.window ?? (readyAt ? computeSlaWindow(readyAt) : null);
      const deadlineAt = window?.deadlineAt ?? null;
      const responseHours =
        readyAt && ackAt
          ? (ackAt.getTime() - readyAt.getTime()) / (60 * 60 * 1000)
          : null;
      return {
        row,
        status: detail.status,
        readyAt,
        ackAt,
        deadlineAt,
        window,
        responseHours,
      };
    });

    const sorted = [...items].sort((a, b) => {
      const statusDiff =
        (order[a.status] ?? 99) - (order[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      const aTime = a.readyAt?.getTime() ?? 0;
      const bTime = b.readyAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    return { items: sorted };
  }, [p1AckMetrics]);

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

  const blockerRequiresComment = blockerStatus.trim().length > 0;
  const blockerCommentValid =
    !blockerRequiresComment || blockerComment.trim().length > 0;
  const p1AckLabel = loading
    ? "--"
    : p1AckMetrics.rate != null
    ? `${p1AckMetrics.rate}%`
    : "--";
  const p1AckMeta = !loading
    ? p1AckMetrics.total > 0
      ? `${p1AckMetrics.onTime}/${p1AckMetrics.total} on time${
          p1AckMetrics.missing > 0 ? ` | ${p1AckMetrics.missing} no ack` : ""
        }`
      : p1AckMetrics.scopeTotal > 0
      ? `${p1AckMetrics.pendingReady} pending Ready`
      : "No P1 in scope"
    : "";
  const p1AckLate = Math.max(
    p1AckMetrics.total - p1AckMetrics.onTime - p1AckMetrics.missing,
    0,
  );
  const p1AckTitle =
    !loading && p1AckMetrics.scopeTotal > 0
      ? `P1 in scope: ${p1AckMetrics.scopeTotal} | On time: ${p1AckMetrics.onTime} | Late: ${p1AckLate} | Missing: ${p1AckMetrics.missing}`
      : undefined;

  return (
    <div className="space-y-6" data-page="crm-dq-tickets-analytics">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
              DQ Incident &amp; SLA Tracker
            </h1>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/70">
              Default focus on Stephane Rabarinala and Lucas Vialatte (Ready / In progress).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!shareMode ? (
              <IfAdmin>
                <button
                  className="btn-ghost h-10 px-3"
                  type="button"
                  onClick={() => setShareOpen(true)}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Link2 className="h-4 w-4" />
                    Share
                  </span>
                </button>
              </IfAdmin>
            ) : null}
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
          <button
            type="button"
            className="kpi-frame flex items-center gap-4 text-left transition hover:shadow-md"
            title={p1AckTitle}
            onClick={() => setP1AckOpen(true)}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                P1 &lt;4h Ack
              </div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">
                {p1AckLabel}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text)]/60">
                {p1AckMeta}
              </div>
            </div>
          </button>
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
                    cursor={false}
                    content={renderStatusOwnerTooltip}
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
                      activeBar={{
                        fill: chartTheme.palette[idx % chartTheme.palette.length],
                        stroke: "var(--color-primary)",
                        strokeWidth: 2,
                        fillOpacity: 1,
                      }}
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
                    cursor={false}
                    content={renderPriorityTooltip}
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
                    cursor={false}
                    content={renderEtaTooltip}
                  />
                  <Bar
                    dataKey="count"
                    name="Tickets"
                    fill="var(--chart-3)"
                    radius={[8, 8, 0, 0]}
                    activeBar={{
                      fill: "var(--chart-3)",
                      stroke: "var(--color-primary)",
                      strokeWidth: 2,
                      fillOpacity: 1,
                    }}
                  />
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
          <table className="table min-w-[1040px]">
            <thead>
              <tr>
                <th>Status</th>
                <th>Ticket</th>
                <th>Created</th>
                <th>Priority</th>
                <th>Owner</th>
                <th>Type</th>
                <th>Due (JIRA)</th>
                <th>ETA</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-[color:var(--color-text)]/60">
                    Loading tickets...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-[color:var(--color-text)]/60">
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
                  const appStatusClass = row.appStatus
                    ? APP_STATUS_STYLES[row.appStatus] ||
                      "border-amber-200 bg-amber-50 text-amber-700"
                    : "";
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
                        <div className="flex flex-col gap-1">
                          <span
                            className={`dq-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}
                          >
                            {row.status}
                          </span>
                          {row.appStatus ? (
                            <div className="flex items-center gap-1">
                              {canEdit ? (
                                <button
                                  type="button"
                                  className={[
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition",
                                    appStatusClass,
                                  ].join(" ")}
                                  onClick={() => openBlockerModal(row)}
                                  title="Edit blocker status"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {`Blocker: ${row.appStatus}`}
                                </button>
                              ) : (
                                <span
                                  className={[
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                    appStatusClass,
                                  ].join(" ")}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {`Blocker: ${row.appStatus}`}
                                </span>
                              )}
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text)]/60 transition hover:text-[color:var(--color-text)]"
                                  onClick={() => clearBlockerInline(row)}
                                  title="Clear blocker"
                                  aria-label="Clear blocker"
                                  disabled={quickClearId === row.id}
                                >
                                  {quickClearId === row.id ? (
                                    <Clock className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </button>
                              ) : null}
                            </div>
                          ) : canEdit ? (
                            <button
                              type="button"
                              className={[
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition",
                                "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]/60 hover:text-[color:var(--color-text)]",
                              ].join(" ")}
                              onClick={() => openBlockerModal(row)}
                              title="Add blocker status"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Add blocker
                            </button>
                          ) : null}
                        </div>
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
                          {row.type ? stripTypePrefix(row.type) : "--"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span>{row.dueLabel}</span>
                          {row.dueLabel !== "--" ? (
                            <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[color:var(--color-text)]/60">
                              JIRA
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col">
                            <span className={etaClass}>{row.etaLabel}</span>
                            {etaMeta ? (
                              <span className="text-[10px] text-[color:var(--color-text)]/60">
                                {etaMeta}
                              </span>
                            ) : null}
                          </div>
                          {canEdit ? (
                            <button
                              type="button"
                              className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text)]/60 transition hover:text-[color:var(--color-text)]"
                              onClick={(event) => openEtaEditor(row, event.currentTarget)}
                              title="Edit ETA"
                              aria-label="Edit ETA"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[260px]">
                        <div className="flex items-start gap-2">
                          <span
                            className="block flex-1 truncate text-xs text-[color:var(--color-text)]/70"
                            title={row.comments ?? ""}
                          >
                            {row.comments || "--"}
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text)]/60 transition hover:text-[color:var(--color-text)]"
                              onClick={(event) => openCommentEditor(row, event.currentTarget)}
                              title="Edit comment"
                              aria-label="Edit comment"
                            >
                              <Pencil className="h-3.5 w-3.5" />
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

      {!shareMode ? (
        <CrmDqTicketsShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          clientSlug={clientSlug}
        />
      ) : null}

      {canEdit && commentEditor ? (
        <AnchoredPopover
          open={!!commentEditor}
          anchorEl={commentEditor.anchor}
          onClose={closeCommentEditor}
          width={360}
        >
          <div className="space-y-3 text-xs text-[color:var(--color-text)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Edit comments</p>
                <p className="text-[10px] text-[color:var(--color-text)]/60">
                  {commentEditor.row.ticketId}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text)]/60 transition hover:text-[color:var(--color-text)]"
                onClick={closeCommentEditor}
                aria-label="Close comments editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              className="input min-h-[96px] w-full resize-none"
              placeholder="Add a short blocker note or context..."
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
            />
            <p className="text-[10px] text-[color:var(--color-text)]/60">
              {commentEditor.row.appStatus
                ? "A comment is required while a blocker status is active."
                : "Optional note. You can clear it anytime when no blocker is active."}
            </p>

            {commentError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700">
                {commentError}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              {!commentEditor.row.appStatus ? (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={clearCommentInline}
                  disabled={commentSaving}
                >
                  Clear
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={closeCommentEditor}
                  disabled={commentSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary text-xs"
                  onClick={saveCommentInline}
                  disabled={commentSaving}
                >
                  {commentSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </AnchoredPopover>
      ) : null}

      {canEdit && etaEditor ? (
        <AnchoredPopover
          open={!!etaEditor}
          anchorEl={etaEditor.anchor}
          onClose={closeEtaEditor}
          width={340}
        >
          <div className="space-y-3 text-xs text-[color:var(--color-text)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Edit ETA</p>
                <p className="text-[10px] text-[color:var(--color-text)]/60">
                  {etaEditor.row.ticketId}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text)]/60 transition hover:text-[color:var(--color-text)]"
                onClick={closeEtaEditor}
                aria-label="Close ETA editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-2">
              <label className="text-[11px] font-medium text-[color:var(--color-text)]/70">
                ETA date
              </label>
              <DatePicker
                value={etaDraft}
                ariaLabel="ETA date"
                onChange={(value) => setEtaDraft(value)}
                buttonClassName="h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setEtaDraft(etaEditor.row.dueDate ?? "")}
                disabled={etaSaving || !etaEditor.row.dueDate}
                title={etaEditor.row.dueDate ? "Copy JIRA due date" : "No JIRA due date"}
              >
                Copy Due (JIRA)
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  const base =
                    etaDraft ||
                    etaEditor.row.dueDate ||
                    toIsoDate(new Date());
                  setEtaDraft(addDaysToIsoDate(base, 7));
                }}
                disabled={etaSaving}
              >
                +7d
              </button>
            </div>

            {etaError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-700">
                {etaError}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={closeEtaEditor}
                disabled={etaSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={saveEtaInline}
                disabled={etaSaving}
              >
                {etaSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </AnchoredPopover>
      ) : null}

      {p1AckOpen ? (
        <MiniModal
          title="P1 <4h Acknowledgment"
          onClose={() => setP1AckOpen(false)}
          widthClass="max-w-4xl"
          bodyClassName="space-y-4"
          footer={
            <button className="btn-ghost" type="button" onClick={() => setP1AckOpen(false)}>
              Close
            </button>
          }
        >
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/50 p-4 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
              SLA summary (Europe/Paris)
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div>
                <div className="text-xs text-[color:var(--color-text)]/60">Rate</div>
                <div className="text-xl font-semibold text-[color:var(--color-text)]">
                  {p1AckLabel}
                </div>
              </div>
              <div>
                <div className="text-xs text-[color:var(--color-text)]/60">On time</div>
                <div className="text-lg font-semibold text-emerald-700">
                  {p1AckMetrics.onTime}
                </div>
              </div>
              <div>
                <div className="text-xs text-[color:var(--color-text)]/60">Late</div>
                <div className="text-lg font-semibold text-amber-700">
                  {p1AckLate}
                </div>
              </div>
              <div>
                <div className="text-xs text-[color:var(--color-text)]/60">Missing</div>
                <div className="text-lg font-semibold text-rose-700">
                  {p1AckMetrics.missing}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-text)]/60">
              Clock starts when the ticket enters Ready. Tickets created after 18:00 or during the
              weekend use the next business window.
            </p>
          </div>

          {p1AckDrilldown.items.length === 0 ? (
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 text-center text-sm text-[color:var(--color-text)]/60">
              No P1 tickets in scope for the current filters.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--color-surface-2)]/70 text-xs uppercase tracking-[0.14em] text-[color:var(--color-text)]/65">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Ticket</th>
                    <th className="px-3 py-3 text-left font-semibold">Owner</th>
                    <th className="px-3 py-3 text-left font-semibold">Ready</th>
                    <th className="px-3 py-3 text-left font-semibold">Deadline</th>
                    <th className="px-3 py-3 text-left font-semibold">Ack</th>
                    <th className="px-3 py-3 text-left font-semibold">Result</th>
                    <th className="px-3 py-3 text-left font-semibold">Response</th>
                  </tr>
                </thead>
                <tbody>
                  {p1AckDrilldown.items.map((item) => {
                    const badgeStyle = P1_ACK_STATUS_STYLES[item.status] ?? P1_ACK_STATUS_STYLES.pending;
                    const statusLabel =
                      P1_ACK_STATUS_LABELS[item.status] ?? "Pending";
                    return (
                      <tr key={item.row.id} className="border-t border-[color:var(--color-border)]">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            {item.row.jiraUrl ? (
                              <a
                                href={item.row.jiraUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-[color:var(--color-primary)] hover:underline"
                              >
                                {item.row.ticketId}
                              </a>
                            ) : (
                              <span className="font-semibold text-[color:var(--color-text)]">
                                {item.row.ticketId}
                              </span>
                            )}
                            {item.row.type ? (
                              <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[color:var(--color-text)]/70">
                                {stripTypePrefix(item.row.type)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--color-text)]/70">
                            {item.row.title}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-[color:var(--color-text)]">
                          {item.row.assigneeLabel || "Unassigned"}
                        </td>
                        <td className="px-3 py-3 align-top text-[color:var(--color-text)]">
                          {formatDateTime(item.readyAt)}
                        </td>
                        <td className="px-3 py-3 align-top text-[color:var(--color-text)]">
                          {formatDateTime(item.deadlineAt)}
                        </td>
                        <td className="px-3 py-3 align-top text-[color:var(--color-text)]">
                          {formatDateTime(item.ackAt)}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeStyle}`}
                          >
                            {statusLabel}
                          </span>
                          {item.window?.policy && item.window.policy !== "standard" ? (
                            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-text)]/50">
                              {item.window.policy.replace("_", " ")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top text-[color:var(--color-text)]">
                          {formatHours(item.responseHours)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </MiniModal>
      ) : null}

      {canEdit && blockerTicket ? (
        <MiniModal
          title="Blocker status"
          onClose={closeBlockerModal}
          widthClass="max-w-lg"
          footer={
            <>
              <button className="btn-ghost" type="button" onClick={closeBlockerModal} disabled={blockerSaving}>
                Cancel
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={saveBlockerStatus}
                disabled={blockerSaving || !blockerCommentValid}
              >
                {blockerSaving ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm text-[color:var(--color-text)]">
            <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs">
              <div className="font-semibold">{blockerTicket.ticketId}</div>
              <div className="text-[color:var(--color-text)]/70">{blockerTicket.title}</div>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Blocker status (app-only)
              </label>
              <select
                className="input h-10 w-full"
                value={blockerStatus}
                onChange={(e) => setBlockerStatus(e.target.value)}
              >
                <option value="">None</option>
                {APP_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                Blocker note {blockerRequiresComment ? "(required)" : "(optional)"}
              </label>
              <textarea
                className="input min-h-[96px] w-full resize-none"
                value={blockerComment}
                onChange={(e) => setBlockerComment(e.target.value)}
                placeholder="Describe the blocker or dependency..."
              />
              <p className="text-[10px] text-[color:var(--color-text)]/60">
                This note is required whenever a blocker status is set. It will remain visible even
                if the blocker status is cleared.
              </p>
            </div>

            {blockerError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {blockerError}
              </div>
            ) : null}
          </div>
        </MiniModal>
      ) : null}
    </div>
  );
}
