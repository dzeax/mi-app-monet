/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { DayPicker } from "react-day-picker";
import { format, parseISO } from "date-fns";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type BudgetRole = {
  id: string;
  roleName: string;
  poolAmount: number;
  currency: string;
  sortOrder: number;
  year: number;
  isActive: boolean;
};

type BudgetAssignment = {
  id: string;
  roleId: string;
  personId: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

type Person = {
  personId: string;
  displayName: string;
  isActive: boolean;
};

type Props = {
  clientSlug: string;
  year: number;
  roles: BudgetRole[];
  assignments: BudgetAssignment[];
  people: Person[];
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const isTempId = (value: string) => value.startsWith("new-");
const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatPickerDate = (value?: string | null) => {
  if (!value || !isIsoDate(value)) return null;
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "dd/MM/yyyy");
};

function DatePickerField({
  value,
  onChange,
  placeholder = "Select date",
  ariaLabel,
}: {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = value && isIsoDate(value) ? parseISO(value) : undefined;
  const display = formatPickerDate(value) ?? placeholder;
  const hasValue = Boolean(selectedDate);
  const toIso = (date: Date) => format(date, "yyyy-MM-dd");

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <button
          type="button"
          className={`input h-8 w-full min-w-0 text-left text-xs ${
            hasValue ? "text-[color:var(--color-text)]" : "text-[color:var(--color-text)]/50"
          }`}
          onClick={() => setOpen((prev) => !prev)}
          aria-label={ariaLabel}
        >
          {display}
        </button>
        {hasValue ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[color:var(--color-text)]/50 hover:text-[color:var(--color-text)]"
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
            aria-label={`Clear ${ariaLabel ?? "date"}`}
            title="Clear"
          >
            x
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-xl ring-1 ring-black/5">
          <div className="rounded-lg border border-[color:var(--color-border)] bg-white/60 p-2">
            <DayPicker
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate || new Date()}
              onSelect={(date) => {
                onChange(date ? toIso(date) : "");
                setOpen(false);
              }}
              showOutsideDays
              classNames={{
                root: "relative text-sm",
                months: "flex pt-6",
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
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
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

export default function CrmBudgetModal({
  clientSlug,
  year,
  roles,
  assignments,
  people,
  canEdit,
  canDelete,
  onClose,
  onSaved,
}: Props) {
  const buildSignature = (
    roleList: BudgetRole[],
    assignmentList: BudgetAssignment[],
    removedRoles: string[],
    removedAssignments: string[],
  ) => {
    const normalizedRoles = roleList
      .map((role) => ({
        id: String(role.id),
        roleName: (role.roleName ?? "").trim(),
        poolAmount: Number(role.poolAmount ?? 0),
        currency: role.currency || "EUR",
        sortOrder: Number(role.sortOrder ?? 0),
        year: Number(role.year ?? 0),
        isActive: role.isActive !== false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const normalizedAssignments = assignmentList
      .map((assignment) => ({
        id: String(assignment.id),
        roleId: String(assignment.roleId),
        personId: String(assignment.personId),
        startDate: assignment.startDate ?? null,
        endDate: assignment.endDate ?? null,
        isActive: assignment.isActive !== false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return JSON.stringify({
      roles: normalizedRoles,
      assignments: normalizedAssignments,
      deletedRoleIds: [...new Set(removedRoles)].sort(),
      deletedAssignmentIds: [...new Set(removedAssignments)].sort(),
    });
  };

  const [draft, setDraft] = useState<{
    roles: BudgetRole[];
    assignments: BudgetAssignment[];
  }>({ roles: [], assignments: [] });
  const [deletedRoleIds, setDeletedRoleIds] = useState<string[]>([]);
  const [deletedAssignmentIds, setDeletedAssignmentIds] = useState<string[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [copying, setCopying] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>(
    {},
  );
  const hasInitializedExpanded = useRef(false);
  const initialSignatureRef = useRef("");
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPropagation = (event: ReactMouseEvent) => {
    event.stopPropagation();
  };

  useEffect(() => {
    const baseRoles = roles.map((role) => ({
      ...role,
      roleName: role.roleName || "",
      poolAmount: Number(role.poolAmount ?? 0),
      currency: role.currency || "EUR",
    }));
    const baseAssignments = assignments.map((a) => ({
      ...a,
      startDate: a.startDate ?? null,
      endDate: a.endDate ?? null,
    }));
    setDraft({
      roles: baseRoles,
      assignments: baseAssignments,
    });
    setDeletedRoleIds([]);
    setDeletedAssignmentIds([]);
    initialSignatureRef.current = buildSignature(
      baseRoles,
      baseAssignments,
      [],
      [],
    );
    setFeedback(null);
    setExpandedRoles((prev) => {
      if (!roles.length) return {};
      const next: Record<string, boolean> = {};
      if (!hasInitializedExpanded.current) {
        roles.forEach((role, idx) => {
          next[role.id] = idx === 0;
        });
        return next;
      }
      roles.forEach((role) => {
        next[role.id] = prev[role.id] ?? false;
      });
      return next;
    });
    hasInitializedExpanded.current = true;
  }, [roles, assignments]);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    },
    [],
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!initialSignatureRef.current) return false;
    return (
      buildSignature(
        draft.roles,
        draft.assignments,
        deletedRoleIds,
        deletedAssignmentIds,
      ) !== initialSignatureRef.current
    );
  }, [draft.roles, draft.assignments, deletedRoleIds, deletedAssignmentIds]);

  const peopleOptions = useMemo(
    () =>
      [...people].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    [people],
  );

  const handleRoleDelete = (roleId: string) => {
    if (!canDelete && !isTempId(roleId)) return;
    if (!window.confirm("Delete this role?")) return;
    const removedAssignments = draft.assignments.filter(
      (a) => a.roleId === roleId,
    );
    setDraft((prev) => ({
      roles: prev.roles.filter((r) => r.id !== roleId),
      assignments: prev.assignments.filter((a) => a.roleId !== roleId),
    }));
    if (!isTempId(roleId)) {
      setDeletedRoleIds((prev) => Array.from(new Set([...prev, roleId])));
    }
    const removedIds = removedAssignments
      .filter((a) => !isTempId(a.id))
      .map((a) => a.id);
    if (removedIds.length) {
      setDeletedAssignmentIds((prev) =>
        Array.from(new Set([...prev, ...removedIds])),
      );
    }
    setExpandedRoles((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
  };

  const handleAssignmentDelete = (assignmentId: string) => {
    if (!canDelete && !isTempId(assignmentId)) return;
    if (!window.confirm("Delete this assignment?")) return;
    setDraft((prev) => ({
      ...prev,
      assignments: prev.assignments.filter((a) => a.id !== assignmentId),
    }));
    if (!isTempId(assignmentId)) {
      setDeletedAssignmentIds((prev) =>
        Array.from(new Set([...prev, assignmentId])),
      );
    }
  };

  const handleSaveAll = async () => {
    if (!canEdit) return;
    setSavingAll(true);
    setFeedback(null);
    try {
      const rolePayloads = draft.roles.map((role) => ({
        ...role,
        roleName: role.roleName.trim(),
        poolAmount: Number(role.poolAmount ?? 0),
        currency: role.currency || "EUR",
        sortOrder: Number(role.sortOrder ?? 0),
        isActive: role.isActive,
      }));

      if (rolePayloads.some((role) => !role.roleName)) {
        throw new Error("Every role must have a name.");
      }

      const roleIdMap = new Map<string, string>();
      const nextRoles: BudgetRole[] = [];
      for (const role of rolePayloads) {
        const payload: any = {
          client: clientSlug,
          year,
          roleName: role.roleName,
          poolAmount: role.poolAmount,
          currency: role.currency,
          sortOrder: role.sortOrder,
          isActive: role.isActive,
        };
        if (!isTempId(role.id)) payload.id = role.id;
        const res = await fetch("/api/crm/budget-roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
        const saved = body?.role;
        if (!saved?.id) throw new Error("Unable to save roles");
        const savedId = String(saved.id);
        if (isTempId(role.id)) roleIdMap.set(role.id, savedId);
        nextRoles.push({
          ...role,
          id: savedId,
          roleName: saved.role_name ?? role.roleName,
          poolAmount: Number(saved.pool_amount ?? role.poolAmount),
          currency: saved.currency ?? role.currency,
          sortOrder: Number(saved.sort_order ?? role.sortOrder),
          isActive: saved.is_active ?? role.isActive,
        });
      }

      const assignmentPayloads = draft.assignments.map((assignment) => ({
        ...assignment,
        roleId: roleIdMap.get(assignment.roleId) ?? assignment.roleId,
        personId: assignment.personId,
        startDate: assignment.startDate || null,
        endDate: assignment.endDate || null,
        isActive: assignment.isActive,
      }));

      if (assignmentPayloads.some((a) => !a.roleId || !a.personId)) {
        throw new Error("Every member needs a role and a person.");
      }

      const nextAssignments: BudgetAssignment[] = [];
      for (const assignment of assignmentPayloads) {
        const payload: any = {
          client: clientSlug,
          roleId: assignment.roleId,
          personId: assignment.personId,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          isActive: assignment.isActive,
        };
        if (!isTempId(assignment.id)) payload.id = assignment.id;
        const res = await fetch("/api/crm/budget-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
        const saved = body?.assignment;
        if (!saved?.id) throw new Error("Unable to save assignments");
        nextAssignments.push({
          ...assignment,
          id: saved.id,
          roleId: saved.role_id ?? assignment.roleId,
          personId: saved.person_id ?? assignment.personId,
          startDate: saved.start_date ?? assignment.startDate,
          endDate: saved.end_date ?? assignment.endDate,
          isActive: saved.is_active ?? assignment.isActive,
        });
      }

      for (const assignmentId of deletedAssignmentIds) {
        const res = await fetch(
          `/api/crm/budget-assignments?id=${assignmentId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Failed to delete assignment");
        }
      }
      for (const roleId of deletedRoleIds) {
        const res = await fetch(`/api/crm/budget-roles?id=${roleId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Failed to delete role");
        }
      }

      setDraft({ roles: nextRoles, assignments: nextAssignments });
      setDeletedRoleIds([]);
      setDeletedAssignmentIds([]);
      initialSignatureRef.current = buildSignature(
        nextRoles,
        nextAssignments,
        [],
        [],
      );
      setFeedback({ type: "success", message: "Changes saved." });
      onSaved();
      closeTimeoutRef.current = window.setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSavingAll(false);
    }
  };

  const addRole = () => {
    const next: BudgetRole = {
      id: `new-${Date.now()}`,
      roleName: "",
      poolAmount: 0,
      currency: "EUR",
      sortOrder: draft.roles.length + 1,
      year,
      isActive: true,
    };
    setDraft((prev) => ({ ...prev, roles: [...prev.roles, next] }));
    setExpandedRoles((prev) => ({ ...prev, [next.id]: true }));
  };

  const addAssignment = (roleId: string) => {
    const next: BudgetAssignment = {
      id: `new-${Date.now()}-${roleId}`,
      roleId,
      personId: "",
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      isActive: true,
    };
    setDraft((prev) => ({
      ...prev,
      assignments: [...prev.assignments, next],
    }));
  };

  const toggleRoleExpanded = (roleId: string) => {
    setExpandedRoles((prev) => ({
      ...prev,
      [roleId]: !(prev[roleId] ?? false),
    }));
  };

  const mapDateToYear = (dateStr: string | null, targetYear: number) => {
    if (!dateStr) return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isFinite(month) || !Number.isFinite(day)) return dateStr;
    const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
    const safeDay = Math.min(day, lastDay);
    const mm = String(month).padStart(2, "0");
    const dd = String(safeDay).padStart(2, "0");
    return `${targetYear}-${mm}-${dd}`;
  };

  const handleCopyFromPreviousYear = async () => {
    if (!canEdit || copying) return;
    const prevYear = year - 1;
    if (
      !window.confirm(
        `Are you sure? This will replace current roles with data from ${prevYear}.`,
      )
    ) {
      return;
    }
    setCopying(true);
    try {
      const res = await fetch(
        `/api/crm/budget?client=${clientSlug}&year=${prevYear}`,
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `Failed to load budget (${res.status})`);
      }
      const previousRoles = (body?.roles ?? []) as BudgetRole[];
      const previousAssignments = (body?.assignments ?? []) as BudgetAssignment[];
      if (!previousRoles.length) {
        throw new Error(`No roles found for ${prevYear}.`);
      }
      const seed = Date.now();
      const roleIdMap = new Map<string, string>();
      const nextRoles = previousRoles.map((role, idx) => {
        const newId = `new-${seed}-${idx}`;
        roleIdMap.set(role.id, newId);
        return {
          ...role,
          id: newId,
          year,
          roleName: role.roleName || "",
          poolAmount: Number(role.poolAmount ?? 0),
          currency: role.currency || "EUR",
        };
      });
      const nextAssignments = previousAssignments
        .map((assignment, idx) => {
          const mappedRoleId = roleIdMap.get(assignment.roleId);
          if (!mappedRoleId) return null;
          return {
            ...assignment,
            id: `new-${seed}-assign-${idx}`,
            roleId: mappedRoleId,
            startDate: mapDateToYear(assignment.startDate, year),
            endDate: mapDateToYear(assignment.endDate, year),
          };
        })
        .filter(Boolean) as BudgetAssignment[];
      setDraft({ roles: nextRoles, assignments: nextAssignments });
      setDeletedRoleIds([]);
      setDeletedAssignmentIds([]);
      setExpandedRoles(() => {
        const next: Record<string, boolean> = {};
        nextRoles.forEach((role, idx) => {
          next[role.id] = idx === 0;
        });
        return next;
      });
      showSuccess(`Loaded roles from ${prevYear}.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setCopying(false);
    }
  };

  const handleRequestClose = () => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Are you sure you want to close?",
      );
      if (!confirmClose) return;
    }
    onClose();
  };

  return (
    <MiniModal
      title={`Manage budgets (${year})`}
      headerActions={
        <button
          className="btn-ghost h-8 px-3 text-sm"
          type="button"
          onClick={handleCopyFromPreviousYear}
          disabled={!canEdit || savingAll || copying}
        >
          {copying ? "Copying..." : "Copy from previous year"}
        </button>
      }
      onClose={handleRequestClose}
      widthClass="max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button className="btn-ghost h-9 px-4" onClick={handleRequestClose}>
            Cancel
          </button>
          <button
            className={`btn-primary h-9 px-4 ${
              hasUnsavedChanges ? "ring-2 ring-emerald-200/70" : ""
            }`}
            onClick={handleSaveAll}
            disabled={savingAll || !canEdit}
          >
            {savingAll
              ? "Saving..."
              : hasUnsavedChanges
                ? "Save Changes *"
                : "Save Changes"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {feedback ? (
          <div
            className={[
              "rounded-xl border px-3 py-2 text-sm",
              feedback.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
            ].join(" ")}
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[color:var(--color-text)]">
            Roles
          </h3>
          {canEdit ? (
            <button className="btn-ghost h-9 px-3" onClick={addRole}>
              Add role
            </button>
          ) : null}
        </div>

        <div className="space-y-4">
          {draft.roles.length === 0 ? (
            <div className="text-sm text-[color:var(--color-text)]/70">
              No roles yet.
            </div>
          ) : (
            draft.roles.map((role) => {
              const roleAssignments = draft.assignments.filter(
                (a) => a.roleId === role.id,
              );
              const isExpanded = expandedRoles[role.id] ?? false;
              const memberCount = roleAssignments.length;
              const memberLabel =
                memberCount === 1 ? "1 member" : `${memberCount} members`;
              return (
                <div
                  key={role.id}
                  className="space-y-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 p-4 shadow-sm"
                >
                  <div
                    className="flex flex-nowrap items-center gap-3 cursor-pointer"
                    onClick={() => toggleRoleExpanded(role.id)}
                  >
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-text)]/70 transition hover:bg-black/5"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleRoleExpanded(role.id);
                      }}
                      aria-label={isExpanded ? "Collapse role" : "Expand role"}
                      aria-expanded={isExpanded}
                      title={isExpanded ? "Collapse role" : "Expand role"}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <input
                      className={`input h-9 min-w-0 flex-1 font-semibold ${
                        isExpanded ? "" : "opacity-60 pointer-events-none"
                      }`}
                      placeholder="Role name"
                      value={role.roleName}
                      tabIndex={isExpanded ? 0 : -1}
                      onClick={stopPropagation}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          roles: prev.roles.map((r) =>
                            r.id === role.id
                              ? { ...r, roleName: e.target.value }
                              : r,
                          ),
                        }))
                      }
                    />
                    <div className="flex items-center gap-2">
                      <input
                        className={`input h-9 w-[140px] text-right ${
                          isExpanded ? "" : "opacity-60 pointer-events-none"
                        }`}
                        type="number"
                        min="0"
                        step="1"
                        value={role.poolAmount}
                        tabIndex={isExpanded ? 0 : -1}
                        onClick={stopPropagation}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            roles: prev.roles.map((r) =>
                              r.id === role.id
                                ? { ...r, poolAmount: Number(e.target.value) }
                                : r,
                            ),
                          }))
                        }
                      />
                      <input
                        className={`input h-9 w-[80px] text-center uppercase ${
                          isExpanded ? "" : "opacity-60 pointer-events-none"
                        }`}
                        value={role.currency}
                        tabIndex={isExpanded ? 0 : -1}
                        onClick={stopPropagation}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            roles: prev.roles.map((r) =>
                              r.id === role.id
                                ? { ...r, currency: e.target.value }
                                : r,
                            ),
                        }))
                      }
                    />
                      {!isExpanded ? (
                        <span className="rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">
                          {memberLabel}
                        </span>
                      ) : null}
                    </div>
                    <input
                      className={`input h-9 w-[64px] text-center ${
                        isExpanded ? "" : "opacity-60 pointer-events-none"
                      }`}
                      type="number"
                      min="0"
                      step="1"
                      value={role.sortOrder}
                      tabIndex={isExpanded ? 0 : -1}
                      onClick={stopPropagation}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          roles: prev.roles.map((r) =>
                            r.id === role.id
                              ? { ...r, sortOrder: Number(e.target.value) }
                              : r,
                          ),
                        }))
                      }
                    />
                    <div className="flex items-center gap-2">
                      <label
                        className={`flex items-center gap-2 text-xs text-[color:var(--color-text)]/70 ${
                          isExpanded ? "" : "opacity-60 pointer-events-none"
                        }`}
                        onClick={stopPropagation}
                      >
                        <input
                          type="checkbox"
                          checked={role.isActive}
                          tabIndex={isExpanded ? 0 : -1}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              roles: prev.roles.map((r) =>
                                r.id === role.id
                                  ? { ...r, isActive: e.target.checked }
                                  : r,
                              ),
                            }))
                          }
                        />
                        Active
                      </label>
                    </div>
                    {canDelete || isTempId(role.id) ? (
                      <button
                        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-red-600 transition hover:bg-red-50"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRoleDelete(role.id);
                        }}
                        aria-label={isTempId(role.id) ? "Remove role" : "Delete role"}
                        title={isTempId(role.id) ? "Remove role" : "Delete role"}
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
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M6 6l1 14h10l1-14" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Members
                      </p>
                      {roleAssignments.length ? (
                        <>
                          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.4fr)_auto] items-center gap-2 px-2 text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text)]/55 sm:grid">
                            <span>Member</span>
                            <span>Start</span>
                            <span>End</span>
                            <span className="text-center">Active</span>
                            <span className="text-right">Actions</span>
                          </div>
                          <div className="space-y-2">
                            {roleAssignments.map((assignment) => (
                              <div
                                key={assignment.id}
                                className="grid grid-cols-1 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.4fr)_auto] sm:items-center"
                              >
                                <select
                                  className="input h-8 w-full min-w-0 text-sm"
                                  value={assignment.personId}
                                  onChange={(e) =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      assignments: prev.assignments.map((a) =>
                                        a.id === assignment.id
                                          ? { ...a, personId: e.target.value }
                                          : a,
                                      ),
                                    }))
                                  }
                                >
                                  <option value="">Select person</option>
                                  {peopleOptions.map((p) => (
                                    <option key={p.personId} value={p.personId}>
                                      {p.displayName}
                                    </option>
                                  ))}
                                </select>
                                <DatePickerField
                                  value={assignment.startDate ?? ""}
                                  ariaLabel="Start date"
                                  onChange={(value) =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      assignments: prev.assignments.map((a) =>
                                        a.id === assignment.id
                                          ? { ...a, startDate: value || null }
                                          : a,
                                      ),
                                    }))
                                  }
                                />
                                <DatePickerField
                                  value={assignment.endDate ?? ""}
                                  ariaLabel="End date"
                                  onChange={(value) =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      assignments: prev.assignments.map((a) =>
                                        a.id === assignment.id
                                          ? { ...a, endDate: value || null }
                                          : a,
                                      ),
                                    }))
                                  }
                                />
                                <div className="flex items-center justify-center">
                                  <label className="relative inline-flex items-center">
                                    <input
                                      type="checkbox"
                                      className="peer sr-only"
                                      checked={assignment.isActive}
                                      onChange={(e) =>
                                        setDraft((prev) => ({
                                          ...prev,
                                          assignments: prev.assignments.map((a) =>
                                            a.id === assignment.id
                                              ? { ...a, isActive: e.target.checked }
                                              : a,
                                          ),
                                        }))
                                      }
                                    />
                                    <span className="flex h-5 w-9 items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] transition peer-checked:border-emerald-500/80 peer-checked:bg-emerald-500/80">
                                      <span className="h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                                    </span>
                                  </label>
                                </div>
                                <div className="flex items-center justify-end">
                                  {canDelete || isTempId(assignment.id) ? (
                                    <button
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50"
                                      onClick={() => handleAssignmentDelete(assignment.id)}
                                      aria-label={
                                        isTempId(assignment.id)
                                          ? "Remove member"
                                          : "Delete member"
                                      }
                                      title={
                                        isTempId(assignment.id)
                                          ? "Remove member"
                                          : "Delete member"
                                      }
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
                                        <path d="M3 6h18" />
                                        <path d="M8 6V4h8v2" />
                                        <path d="M6 6l1 14h10l1-14" />
                                        <path d="M10 11v6" />
                                        <path d="M14 11v6" />
                                      </svg>
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-[color:var(--color-text)]/60">
                          No members yet.
                        </div>
                      )}
                    {canEdit ? (
                      <button
                        className="btn-ghost h-8 px-2 text-sm text-[color:var(--color-text)]/70 hover:text-[color:var(--color-text)]"
                        onClick={() => addAssignment(role.id)}
                        title="Add member"
                      >
                        + Add member
                      </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </MiniModal>
  );
}
