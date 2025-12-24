"use client";

import { useMemo, useRef, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";
import { useAuth } from "@/context/AuthContext";

export type StrategyEffortDraft = {
  id?: string;
  effortDate: string;
  owner: string;
  hoursText: string;
  notes: string;
};

export type StrategyTicketDraft = {
  id?: string;
  jiraTicket: string;
  jiraUrl: string;
  title: string;
  status: string;
  category: string;
  createdDate: string;
  dueDate: string;
  jiraAssignee: string;
  brand: string;
  segment: string;
  notes: string;
  efforts: StrategyEffortDraft[];
};

type Props = {
  clientSlug: string;
  ownerOptions: string[];
  categoryOptions: string[];
  initial?: StrategyTicketDraft;
  onSaved: () => void;
  onClose: () => void;
};

const STATUS_OPTIONS = ["Backlog", "Refining", "Ready", "In progress", "Validation", "Done"];

const BRAND_OPTIONS = ["Europcar", "Goldcar"];
const SEGMENTS_BY_BRAND: Record<string, string[]> = {
  Europcar: ["Publics", "Privilege"],
  Goldcar: ["Users", "Clubbers"],
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeStatus = (value: string) => {
  const raw = value.trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  const mapping: Record<string, string> = {
    "in progress": "In progress",
    "in_progress": "In progress",
    "todo": "Backlog",
    "to do": "Backlog",
  };
  return mapping[lower] || raw;
};

const sanitizeDecimal = (value: string) => {
  const cleaned = value.replace(/[^\d.,-]/g, "");
  // keep only first minus sign at start
  const minus = cleaned.startsWith("-") ? "-" : "";
  const noMinus = cleaned.replace(/-/g, "");
  return minus + noMinus;
};

const parseDecimal = (value: string) => {
  if (!value.trim()) return 0;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const todayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function CrmStrategyTicketModal({
  clientSlug,
  ownerOptions,
  categoryOptions,
  initial,
  onSaved,
  onClose,
}: Props) {
  const { isAdmin, isEditor } = useAuth();
  const canEdit = isEditor || isAdmin;
  const [activeStep, setActiveStep] = useState<"details" | "effort">("details");

  const [ticket, setTicket] = useState<StrategyTicketDraft>(() => {
    if (initial) return initial;
    return {
      jiraTicket: "",
      jiraUrl: "",
      title: "",
      status: "Backlog",
      category: categoryOptions[0] || "Weekly Preparation",
      createdDate: todayIso(),
      dueDate: "",
      jiraAssignee: "",
      brand: "",
      segment: "",
      notes: "",
      efforts: [],
    };
  });

  const [fetchingJira, setFetchingJira] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createdDateInputRef = useRef<HTMLInputElement | null>(null);
  const dueDateInputRef = useRef<HTMLInputElement | null>(null);
  const effortDateInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const segmentOptions = useMemo(() => {
    if (!ticket.brand) return [];
    if (ticket.brand === "All") return ["All"];
    return ["All", ...(SEGMENTS_BY_BRAND[ticket.brand] ?? [])];
  }, [ticket.brand]);

  const totals = useMemo(() => {
    const hours = ticket.efforts.reduce((acc, e) => {
      const n = parseDecimal(e.hoursText);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { hours, days: hours / 7 };
  }, [ticket.efforts]);

  const canProceedToEffort = useMemo(() => {
    const jiraTicket = ticket.jiraTicket.trim();
    const title = ticket.title.trim();
    const status = ticket.status.trim();
    const category = ticket.category.trim();
    const createdDate = ticket.createdDate.trim();
    return !!jiraTicket && !!title && !!status && !!category && isIsoDate(createdDate);
  }, [ticket.jiraTicket, ticket.title, ticket.status, ticket.category, ticket.createdDate]);

  const goToEffortStep = () => {
    if (!canProceedToEffort) {
      setError("Fill required fields (JIRA ticket, title, status, category and created date) to continue.");
      return;
    }
    setError(null);
    setActiveStep("effort");
  };

  const goToDetailsStep = () => {
    setError(null);
    setActiveStep("details");
  };

  const openCreatedPicker = () => {
    const el = createdDateInputRef.current;
    if (!el) return;
    el.focus();
    // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
    if (typeof el.showPicker === "function") {
      try {
        // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
        el.showPicker();
      } catch {
        el.click();
      }
    } else {
      el.click();
    }
  };

  const openDuePicker = () => {
    const el = dueDateInputRef.current;
    if (!el) return;
    el.focus();
    // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
    if (typeof el.showPicker === "function") {
      try {
        // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
        el.showPicker();
      } catch {
        el.click();
      }
    } else {
      el.click();
    }
  };

  const openEffortPicker = (idx: number, fromInputClick = false) => {
    const el = effortDateInputRefs.current[idx];
    if (!el) return;
    el.focus();
    // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
    if (typeof el.showPicker === "function") {
      try {
        // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
        el.showPicker();
      } catch {
        if (!fromInputClick) el.click();
      }
    } else {
      if (!fromInputClick) el.click();
    }
  };

  const fetchFromJira = async () => {
    const key = ticket.jiraTicket.trim();
    if (!key) return;
    try {
      setFetchingJira(true);
      setError(null);
      const res = await fetch(`/api/crm/jira-campaign?client=${clientSlug}&ticket=${encodeURIComponent(key)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `JIRA fetch failed (${res.status})`);

      const nextStatus = body?.status ? normalizeStatus(String(body.status)) : ticket.status;
      setTicket((prev) => ({
        ...prev,
        jiraTicket: String(body?.key || key),
        jiraUrl: String(body?.url || prev.jiraUrl || ""),
        title: String(body?.title || prev.title || ""),
        status: nextStatus,
        createdDate:
          body?.createdDate && isIsoDate(String(body.createdDate)) ? String(body.createdDate) : prev.createdDate,
        dueDate: body?.dueDate && isIsoDate(String(body.dueDate)) ? String(body.dueDate) : prev.dueDate,
        jiraAssignee: String(body?.assignee || prev.jiraAssignee || ""),
      }));
      showSuccess("Fetched from JIRA");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to fetch from JIRA";
      setError(msg);
      showError(msg);
    } finally {
      setFetchingJira(false);
    }
  };

  const addEffort = () => {
    setTicket((prev) => ({
      ...prev,
      efforts: [
        ...prev.efforts,
        { effortDate: todayIso(), owner: "", hoursText: "", notes: "" },
      ],
    }));
  };

  const removeEffort = (idx: number) => {
    setTicket((prev) => ({
      ...prev,
      efforts: prev.efforts.filter((_, i) => i !== idx),
    }));
  };

  const save = async () => {
    if (!canEdit) return;

    const jiraTicket = ticket.jiraTicket.trim();
    const title = ticket.title.trim();
    const status = ticket.status.trim();
    const category = ticket.category.trim();

    if (!jiraTicket) return setError("JIRA ticket is required.");
    if (!title) return setError("Title is required.");
    if (!status) return setError("Status is required.");
    if (!category) return setError("Category is required.");
    if (!ticket.createdDate) return setError("Created date is required.");
    if (!isIsoDate(ticket.createdDate)) return setError("Created date must be yyyy-mm-dd.");
    if (ticket.dueDate && !isIsoDate(ticket.dueDate)) return setError("Due date must be yyyy-mm-dd.");

    const efforts = ticket.efforts.map((e, idx) => {
      const hours = parseDecimal(e.hoursText);
      if (!e.owner.trim()) throw new Error(`Effort row ${idx + 1}: owner is required.`);
      if (!Number.isFinite(hours) || hours < 0) throw new Error(`Effort row ${idx + 1}: invalid hours.`);
      if (e.effortDate && !isIsoDate(e.effortDate))
        throw new Error(`Effort row ${idx + 1}: date must be yyyy-mm-dd.`);
      return {
        id: e.id,
        effortDate: e.effortDate || null,
        owner: e.owner.trim(),
        hours,
        notes: e.notes.trim() || null,
      };
    });

    try {
      setSaving(true);
      setError(null);

      const payload = {
        client: clientSlug,
        ticket: {
          id: ticket.id,
          jiraTicket,
          jiraUrl: ticket.jiraUrl.trim() || null,
          title,
          status,
          category,
          createdDate: ticket.createdDate,
          dueDate: ticket.dueDate ? ticket.dueDate : null,
          jiraAssignee: ticket.jiraAssignee.trim() || null,
          brand: ticket.brand.trim() || null,
          segment: ticket.segment.trim() || null,
          notes: ticket.notes.trim() || null,
        },
        efforts,
      };

      const res = await fetch("/api/crm/strategy-reporting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = body?.error || `Save failed (${res.status})`;
        console.error("Strategy save failed", { status: res.status, message: msg, payload });
        throw new Error(msg);
      }

      showSuccess("Strategy ticket saved");
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  const deleteTicket = async () => {
    if (!isAdmin || !ticket.id) return;
    const ok = window.confirm("Delete this strategy ticket? This cannot be undone.");
    if (!ok) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/crm/strategy-reporting", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, id: ticket.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = body?.error || `Delete failed (${res.status})`;
        throw new Error(msg);
      }
      showSuccess("Strategy ticket deleted");
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MiniModal
      title={ticket.id ? "Edit strategy ticket" : "New strategy ticket"}
      onClose={() => {
        if (saving) return;
        onClose();
      }}
      widthClass="max-w-4xl"
      footer={
        activeStep === "details" ? (
          <>
            <button className="btn-ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={goToEffortStep}
              disabled={!canEdit || saving || !canProceedToEffort}
              title={canProceedToEffort ? "Continue" : "Fill required fields to continue"}
            >
              Next
            </button>
          </>
        ) : (
          <>
            {isAdmin && ticket.id ? (
              <button className="btn-ghost" type="button" onClick={deleteTicket} disabled={saving}>
                Delete
              </button>
            ) : null}
            <button className="btn-ghost" type="button" onClick={goToDetailsStep} disabled={saving}>
              Back
            </button>
            <button className="btn-ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" type="button" onClick={save} disabled={!canEdit || saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        )
      }
    >
      <div className="space-y-5 text-sm text-[color:var(--color-text)]">
        <div className="rounded-xl bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs text-[color:var(--color-text)]/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-[color:var(--color-surface)]/70",
                  activeStep === "details" ? "text-[color:var(--color-text)]" : "text-[color:var(--color-text)]/70",
                ].join(" ")}
                onClick={goToDetailsStep}
                aria-current={activeStep === "details" ? "step" : undefined}
              >
                <span
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                    canProceedToEffort && activeStep === "effort"
                      ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white"
                      : activeStep === "details"
                        ? "border-[color:var(--color-primary)]/60 bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                        : canProceedToEffort
                          ? "border-[color:var(--color-primary)]/35 bg-[color:var(--color-surface)] text-[color:var(--color-primary)]/80"
                          : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/60",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {canProceedToEffort && activeStep === "effort" ? (
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
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
                  canProceedToEffort ? "bg-[color:var(--color-primary)]/25" : "bg-[color:var(--color-border)]/60",
                ].join(" ")}
                aria-hidden="true"
              />

              <button
                type="button"
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-[color:var(--color-surface)]/70 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                  activeStep === "effort" ? "text-[color:var(--color-text)]" : "text-[color:var(--color-text)]/70",
                ].join(" ")}
                onClick={goToEffortStep}
                disabled={!canProceedToEffort}
                aria-current={activeStep === "effort" ? "step" : undefined}
                title={canProceedToEffort ? "Effort & notes" : "Fill required fields to continue"}
              >
                <span
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                    activeStep === "effort"
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
              Client: <strong className="text-[color:var(--color-text)]">{clientSlug.toUpperCase()}</strong>
            </span>
          </div>

          <div className="mt-2 h-px bg-[color:var(--color-border)]/60" aria-hidden="true" />
        </div>

        {activeStep === "details" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">JIRA ticket</label>
            <div className="relative">
              <input
                className="input h-10 w-full pr-10"
                value={ticket.jiraTicket}
                onChange={(e) => setTicket((p) => ({ ...p, jiraTicket: e.target.value }))}
                placeholder="CRM-1234"
                disabled={!canEdit || saving}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                title="Fetch from JIRA"
                onClick={fetchFromJira}
                disabled={!canEdit || saving || fetchingJira || !ticket.jiraTicket.trim()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/ui/jira.png" alt="Fetch from JIRA" className="h-4 w-auto opacity-80" />
              </button>
            </div>
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Title</label>
            <input
              className="input h-10 w-full"
              value={ticket.title}
              onChange={(e) => setTicket((p) => ({ ...p, title: e.target.value }))}
              placeholder="Ticket title"
              disabled={!canEdit || saving}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Status</label>
            <select
              className="input h-10 w-full"
              value={ticket.status}
              onChange={(e) => setTicket((p) => ({ ...p, status: e.target.value }))}
              disabled={!canEdit || saving}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Category</label>
            <select
              className="input h-10 w-full"
              value={ticket.category}
              onChange={(e) => setTicket((p) => ({ ...p, category: e.target.value }))}
              disabled={!canEdit || saving}
            >
              <option value="">Select category</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Created date</label>
            <div className="relative">
              <input
                ref={createdDateInputRef}
                type="date"
                className="input input-date h-10 w-full pr-10"
                value={ticket.createdDate}
                onChange={(e) => setTicket((p) => ({ ...p, createdDate: e.target.value }))}
                onClick={openCreatedPicker}
                disabled={!canEdit || saving}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Open calendar"
                onClick={openCreatedPicker}
                disabled={!canEdit || saving}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <path d="M3 10h18" />
                  <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Due date</label>
            <div className="relative">
              <input
                ref={dueDateInputRef}
                type="date"
                className="input input-date h-10 w-full pr-10"
                value={ticket.dueDate}
                onChange={(e) => setTicket((p) => ({ ...p, dueDate: e.target.value }))}
                onClick={openDuePicker}
                disabled={!canEdit || saving}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Open calendar"
                onClick={openDuePicker}
                disabled={!canEdit || saving}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <path d="M3 10h18" />
                  <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">JIRA assignee</label>
            <input
              className="input h-10 w-full"
              value={ticket.jiraAssignee}
              onChange={(e) => setTicket((p) => ({ ...p, jiraAssignee: e.target.value }))}
              placeholder="Assignee (from JIRA)"
              disabled={!canEdit || saving}
              list="strategy-owner-list"
            />
            <datalist id="strategy-owner-list">
              {ownerOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Brand</label>
            <select
              className="input h-10 w-full"
              value={ticket.brand}
              onChange={(e) =>
                setTicket((p) => ({
                  ...p,
                  brand: e.target.value,
                  segment: (() => {
                    const brand = e.target.value;
                    if (!brand) return "";
                    const options =
                      brand === "All" ? ["All"] : ["All", ...(SEGMENTS_BY_BRAND[brand] ?? [])];
                    if (p.segment && options.includes(p.segment)) return p.segment;
                    return brand === "All" ? "All" : "";
                  })(),
                }))
              }
              disabled={!canEdit || saving}
            >
              <option value="">Select brand</option>
              <option value="All">All</option>
              {BRAND_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">Segment</label>
            <select
              className="input h-10 w-full"
              value={ticket.segment}
              onChange={(e) => setTicket((p) => ({ ...p, segment: e.target.value }))}
              disabled={!canEdit || saving || !ticket.brand}
            >
              <option value="">{ticket.brand ? "Select segment" : "Select brand first"}</option>
              {segmentOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

        </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/50 px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-[color:var(--color-text)]/70">Ticket</div>
                  <div className="text-sm font-semibold text-[color:var(--color-text)]">
                    {ticket.jiraTicket.trim() || "New ticket"}
                  </div>
                  <div className="text-xs text-[color:var(--color-text)]/70">{ticket.title.trim() || "Untitled"}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[color:var(--color-text)]/70">
                  <div>
                    Status: <span className="font-semibold text-[color:var(--color-text)]">{ticket.status || "-"}</span>
                  </div>
                  <div>
                    Category:{" "}
                    <span className="font-semibold text-[color:var(--color-text)]">{ticket.category || "-"}</span>
                  </div>
                  <div>
                    Created:{" "}
                    <span className="font-semibold text-[color:var(--color-text)]">{ticket.createdDate || "-"}</span>
                  </div>
                  <div>
                    Due: <span className="font-semibold text-[color:var(--color-text)]">{ticket.dueDate || "-"}</span>
                  </div>
                </div>
              </div>

              {ticket.jiraUrl ? (
                <div className="mt-2 text-xs text-[color:var(--color-text)]/70">
                  JIRA:{" "}
                  <a
                    className="text-[color:var(--color-primary)] underline"
                    href={ticket.jiraUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {ticket.jiraTicket}
                  </a>
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[color:var(--color-text)]/70">Notes</label>
              <textarea
                className="input min-h-[84px] w-full resize-y"
                value={ticket.notes}
                onChange={(e) => setTicket((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes"
                disabled={!canEdit || saving}
              />
            </div>

            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold">Effort log</h4>
                  <p className="text-xs text-[color:var(--color-text)]/70">
                    Add one or more effort entries (owner + hours). Days are computed as hours/7.
                  </p>
                </div>
                <button
                  className="btn-ghost h-9 px-3"
                  type="button"
                  onClick={addEffort}
                  disabled={!canEdit || saving}
                >
                  Add entry
                </button>
              </div>

              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs text-[color:var(--color-text)]/70">
                    <tr>
                      <th className="px-2 py-2 w-[140px]">Date</th>
                      <th className="px-2 py-2 w-[220px]">Owner</th>
                      <th className="px-2 py-2 w-[140px] text-right">Hours</th>
                      <th className="px-2 py-2 min-w-[220px]">Notes</th>
                      <th className="px-2 py-2 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-border)]/70">
                    {ticket.efforts.length === 0 ? (
                      <tr>
                        <td className="px-2 py-3 text-xs text-[color:var(--color-text)]/60" colSpan={5}>
                          No effort entries yet.
                        </td>
                      </tr>
                    ) : (
                      ticket.efforts.map((e, idx) => (
                        <tr key={e.id || `new-${idx}`}>
                          <td className="px-2 py-2">
                            <div className="relative">
                              <input
                                ref={(el) => {
                                  effortDateInputRefs.current[idx] = el;
                                }}
                                type="date"
                                className="input input-date h-9 w-full pr-10"
                                value={e.effortDate}
                                onChange={(ev) =>
                                  setTicket((p) => {
                                    const next = [...p.efforts];
                                    next[idx] = { ...next[idx], effortDate: ev.target.value };
                                    return { ...p, efforts: next };
                                  })
                                }
                                onClick={() => openEffortPicker(idx, true)}
                                disabled={!canEdit || saving}
                              />
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Open calendar"
                                onClick={() => openEffortPicker(idx)}
                                disabled={!canEdit || saving}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-4 w-4"
                                >
                                  <path d="M8 2v4" />
                                  <path d="M16 2v4" />
                                  <path d="M3 10h18" />
                                  <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                </svg>
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              className="input h-9 w-full"
                              value={e.owner}
                              onChange={(ev) =>
                                setTicket((p) => {
                                  const next = [...p.efforts];
                                  next[idx] = { ...next[idx], owner: ev.target.value };
                                  return { ...p, efforts: next };
                                })
                              }
                              disabled={!canEdit || saving}
                            >
                              <option value="">Select owner</option>
                              {ownerOptions.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              className="input h-9 w-full text-right"
                              inputMode="decimal"
                              value={e.hoursText}
                              onChange={(ev) => {
                                const v = sanitizeDecimal(ev.target.value);
                                setTicket((p) => {
                                  const next = [...p.efforts];
                                  next[idx] = { ...next[idx], hoursText: v };
                                  return { ...p, efforts: next };
                                });
                              }}
                              placeholder="0"
                              disabled={!canEdit || saving}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="input h-9 w-full"
                              value={e.notes}
                              onChange={(ev) =>
                                setTicket((p) => {
                                  const next = [...p.efforts];
                                  next[idx] = { ...next[idx], notes: ev.target.value };
                                  return { ...p, efforts: next };
                                })
                              }
                              placeholder="Optional"
                              disabled={!canEdit || saving}
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              className="btn-ghost h-9 w-9 px-0"
                              type="button"
                              onClick={() => removeEffort(idx)}
                              disabled={!canEdit || saving}
                              aria-label="Remove effort"
                            >
                              x
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--color-text)]/70">
                <span>Total hours: {totals.hours.toFixed(2)}</span>
                <span>Days (@7h): {totals.days.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {error ? (
          <div className="rounded-xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 px-4 py-3 text-sm text-[color:var(--color-accent)]">
            {error}
          </div>
        ) : null}
      </div>
    </MiniModal>
  );
}
