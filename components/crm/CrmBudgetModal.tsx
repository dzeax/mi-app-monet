/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import DatePicker from "@/components/ui/DatePicker";
import ModalShell from "@/components/ui/ModalShell";
import { ENTITY_OPTIONS } from "@/lib/crm/entities";
import { showError, showSuccess } from "@/utils/toast";

type BudgetRole = {
  id: string;
  roleName: string;
  poolAmount: number;
  basePoolAmount?: number;
  carryoverAmount?: number;
  adjustedPoolAmount?: number;
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
  allocationAmount?: number | null;
  allocationPct?: number | null;
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
  entityByPerson?: Record<string, string>;
  spendByPerson?: Record<string, number>;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const isTempId = (value: string) => value.startsWith("new-");
const DAY_MS = 24 * 60 * 60 * 1000;
const toUtcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const clampDate = (value: Date, min: Date, max: Date) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};
const diffDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
const roundAmount = (value: number) => Math.round(value * 100) / 100;
const getRolePoolAmount = (role: BudgetRole) =>
  Number(
    role.adjustedPoolAmount ??
      (Number(role.poolAmount ?? 0) + Number(role.carryoverAmount ?? 0)),
  );
const getAllocationValue = (rolePool: number, assignment: BudgetAssignment) => {
  if (assignment.allocationAmount != null) return Number(assignment.allocationAmount) || 0;
  if (assignment.allocationPct != null) {
    return rolePool * (Number(assignment.allocationPct) / 100);
  }
  return 0;
};

export default function CrmBudgetModal({
  clientSlug,
  year,
  roles,
  assignments,
  people,
  entityByPerson,
  spendByPerson,
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
    entitySnapshot: Record<string, string>,
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
        allocationAmount:
          assignment.allocationAmount != null ? Number(assignment.allocationAmount) : null,
        allocationPct:
          assignment.allocationPct != null ? Number(assignment.allocationPct) : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return JSON.stringify({
      roles: normalizedRoles,
      assignments: normalizedAssignments,
      deletedRoleIds: [...new Set(removedRoles)].sort(),
      deletedAssignmentIds: [...new Set(removedAssignments)].sort(),
      entities: Object.entries(entitySnapshot)
        .filter(([, entity]) => entity)
        .map(([personId, entity]) => ({
          personId,
          entity: entity.trim(),
        }))
        .sort((a, b) => a.personId.localeCompare(b.personId)),
    });
  };

  const [draft, setDraft] = useState<{
    roles: BudgetRole[];
    assignments: BudgetAssignment[];
  }>({ roles: [], assignments: [] });
  const [entityMap, setEntityMap] = useState<Record<string, string>>({});
  const [allocationModeByRole, setAllocationModeByRole] = useState<Record<string, "auto" | "manual">>({});
  const [deletedRoleIds, setDeletedRoleIds] = useState<string[]>([]);
  const [deletedAssignmentIds, setDeletedAssignmentIds] = useState<string[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [copying, setCopying] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [carryoverTotal, setCarryoverTotal] = useState<number | null>(null);
  const [carryoverLoading, setCarryoverLoading] = useState(false);
  const [carryoverError, setCarryoverError] = useState<string | null>(null);
  const [carryoverDraft, setCarryoverDraft] = useState<Record<string, number>>({});
  const [carryoverSaving, setCarryoverSaving] = useState(false);
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>(
    {},
  );
  const [activeTab, setActiveTab] = useState<"roles" | "entities" | "carryover">("roles");
  const [entitySearch, setEntitySearch] = useState("");
  const [showMissingEntities, setShowMissingEntities] = useState(true);
  const [roleSearch, setRoleSearch] = useState("");
  const hasInitializedExpanded = useRef(false);
  const initialSignatureRef = useRef("");
  const carryoverSnapshotRef = useRef<Record<string, number>>({});
  const closeTimeoutRef = useRef<number | null>(null);

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
      allocationAmount:
        a.allocationAmount != null ? Number(a.allocationAmount) : null,
      allocationPct:
        a.allocationPct != null ? Number(a.allocationPct) : null,
    }));
    const baseEntities = entityByPerson ?? {};
    setDraft({
      roles: baseRoles,
      assignments: baseAssignments,
    });
    setEntityMap(baseEntities);
    const carryoverMap: Record<string, number> = {};
    baseRoles.forEach((role) => {
      carryoverMap[role.id] = Number(role.carryoverAmount ?? 0);
    });
    setCarryoverDraft(carryoverMap);
    carryoverSnapshotRef.current = { ...carryoverMap };
    const nextModes: Record<string, "auto" | "manual"> = {};
    baseRoles.forEach((role) => {
      const hasManual = baseAssignments.some(
        (assignment) =>
          assignment.roleId === role.id &&
          (assignment.allocationAmount != null || assignment.allocationPct != null),
      );
      nextModes[role.id] = hasManual ? "manual" : "auto";
    });
    setAllocationModeByRole(nextModes);
    setDeletedRoleIds([]);
    setDeletedAssignmentIds([]);
    initialSignatureRef.current = buildSignature(
      baseRoles,
      baseAssignments,
      [],
      [],
      baseEntities,
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
  }, [roles, assignments, entityByPerson]);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const fromYear = year - 1;
    if (!Number.isFinite(fromYear) || fromYear < 1900) {
      setCarryoverTotal(null);
      return;
    }
    const loadCarryover = async () => {
      setCarryoverLoading(true);
      setCarryoverError(null);
      try {
        const res = await fetch(`/api/crm/budget?client=${clientSlug}&year=${fromYear}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || `Failed to load ${fromYear} budget`);
        }
        const prevRoles = (body?.roles ?? []) as BudgetRole[];
        if (!prevRoles.length) {
          if (active) setCarryoverTotal(null);
          return;
        }
        const totalBudget = prevRoles.reduce(
          (acc, role) => acc + getRolePoolAmount(role),
          0,
        );
        const totalSpent = Object.values(
          (body?.spendByPerson ?? {}) as Record<string, number | null>,
        ).reduce<number>((acc, value) => acc + Number(value ?? 0), 0);
        if (active) setCarryoverTotal(roundAmount(totalBudget - totalSpent));
      } catch (err) {
        if (active) {
          setCarryoverError(err instanceof Error ? err.message : "Unable to load carry-over");
          setCarryoverTotal(null);
        }
      } finally {
        if (active) setCarryoverLoading(false);
      }
    };
    void loadCarryover();
    return () => {
      active = false;
    };
  }, [clientSlug, year]);

  const hasUnsavedChanges = useMemo(() => {
    if (!initialSignatureRef.current) return false;
    return (
      buildSignature(
        draft.roles,
        draft.assignments,
        deletedRoleIds,
        deletedAssignmentIds,
        entityMap,
      ) !== initialSignatureRef.current
    );
  }, [draft.roles, draft.assignments, deletedRoleIds, deletedAssignmentIds, entityMap]);

  const hasCarryoverChanges = useMemo(() => {
    const snapshot = carryoverSnapshotRef.current;
    return draft.roles.some((role) => {
      const draftValue = Number(carryoverDraft[role.id] ?? 0);
      const savedValue = Number(snapshot[role.id] ?? 0);
      return roundAmount(draftValue) !== roundAmount(savedValue);
    });
  }, [draft.roles, carryoverDraft]);

  const hasChanges = hasUnsavedChanges || hasCarryoverChanges;

  const getRoleMode = useCallback(
    (roleId: string) => allocationModeByRole[roleId] ?? "auto",
    [allocationModeByRole],
  );

  const getRoleAdjustedPool = useCallback(
    (role: BudgetRole) => {
      const base = Number(role.poolAmount ?? 0);
      const draftCarry = carryoverDraft[role.id];
      const carry = Number.isFinite(draftCarry)
        ? Number(draftCarry)
        : Number(role.carryoverAmount ?? 0);
      return base + carry;
    },
    [carryoverDraft],
  );

  const computeAutoAllocationsForRole = useCallback(
    (role: BudgetRole, roleAssignments: BudgetAssignment[]) => {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31));
      const activeAssignments = roleAssignments.filter((a) => a.isActive !== false);
      const daysByAssignment = new Map<string, number>();
      let totalDays = 0;

      activeAssignments.forEach((assignment) => {
        const rawStart = assignment.startDate ? toUtcDate(assignment.startDate) : yearStart;
        const rawEnd = assignment.endDate ? toUtcDate(assignment.endDate) : yearEnd;
        const start = clampDate(rawStart, yearStart, yearEnd);
        const end = clampDate(rawEnd, yearStart, yearEnd);
        if (start > end) return;
        const days = diffDays(start, end);
        if (!Number.isFinite(days) || days <= 0) return;
        totalDays += days;
        daysByAssignment.set(assignment.id, days);
      });

      const allocations = new Map<string, number>();
      if (totalDays <= 0) {
        activeAssignments.forEach((assignment) => {
          allocations.set(assignment.id, 0);
        });
        return allocations;
      }

      const rolePool = getRoleAdjustedPool(role);
      const raw = activeAssignments.map((assignment) => ({
        id: assignment.id,
        amount: rolePool * ((daysByAssignment.get(assignment.id) ?? 0) / totalDays),
      }));
      const rounded = raw.map((item) => ({
        id: item.id,
        amount: roundAmount(item.amount),
      }));
      const totalRounded = rounded.reduce((acc, item) => acc + item.amount, 0);
      const diff = roundAmount(rolePool - totalRounded);
      if (rounded.length > 0 && Math.abs(diff) > 0) {
        rounded[rounded.length - 1] = {
          id: rounded[rounded.length - 1].id,
          amount: roundAmount(rounded[rounded.length - 1].amount + diff),
        };
      }
      rounded.forEach((item) => allocations.set(item.id, item.amount));
      return allocations;
    },
    [year, getRoleAdjustedPool],
  );

  const handleAllocationModeChange = useCallback(
    (role: BudgetRole, mode: "auto" | "manual") => {
      setAllocationModeByRole((prev) => ({ ...prev, [role.id]: mode }));
      setDraft((prev) => {
        const nextAssignments = prev.assignments.map((assignment) => {
          if (assignment.roleId !== role.id) return assignment;
          if (mode === "manual") {
            return assignment;
          }
          return {
            ...assignment,
            allocationAmount: null,
            allocationPct: null,
          };
        });
        return { ...prev, assignments: nextAssignments };
      });
      if (mode === "manual") {
        const roleAssignments = draft.assignments.filter(
          (assignment) => assignment.roleId === role.id,
        );
        const allocations = computeAutoAllocationsForRole(role, roleAssignments);
        const rolePool = getRoleAdjustedPool(role);
        setDraft((prev) => ({
          ...prev,
          assignments: prev.assignments.map((assignment) => {
            if (assignment.roleId !== role.id) return assignment;
            const amount = allocations.get(assignment.id);
            const allocationAmount = amount != null ? amount : 0;
            const allocationPct =
              rolePool > 0
                ? roundAmount((allocationAmount / rolePool) * 100)
                : null;
            return {
              ...assignment,
              allocationAmount,
              allocationPct,
            };
          }),
        }));
      }
    },
    [computeAutoAllocationsForRole, draft.assignments, getRoleAdjustedPool],
  );

  const allocationStatus = useMemo(() => {
    const byRole: Record<string, { total: number; diff: number }> = {};
    let hasMismatch = false;
    draft.roles.forEach((role) => {
      if (getRoleMode(role.id) !== "manual") return;
      const roleAssignments = draft.assignments.filter(
        (assignment) => assignment.roleId === role.id && assignment.isActive !== false,
      );
      const rolePool = getRoleAdjustedPool(role);
      const total = roleAssignments.reduce((acc, assignment) => {
        return acc + getAllocationValue(rolePool, assignment);
      }, 0);
      const diff = roundAmount(rolePool - total);
      if (Math.abs(diff) > 0.01) {
        byRole[role.id] = { total, diff };
        hasMismatch = true;
      }
    });
    return { byRole, hasMismatch };
  }, [draft.roles, draft.assignments, getRoleMode, getRoleAdjustedPool]);

  const carryoverAllocated = useMemo(
    () =>
      draft.roles.reduce(
        (acc, role) => acc + Number(carryoverDraft[role.id] ?? 0),
        0,
      ),
    [draft.roles, carryoverDraft],
  );

  const carryoverDiff = useMemo(() => {
    if (carryoverTotal == null) return null;
    return roundAmount(carryoverTotal - carryoverAllocated);
  }, [carryoverTotal, carryoverAllocated]);

  const carryoverHasMismatch =
    carryoverTotal != null && Math.abs(carryoverDiff ?? 0) > 0.01;

  const allocationMismatchLabels = useMemo(() => {
    if (!allocationStatus.hasMismatch) return [];
    return draft.roles
      .filter((role) => allocationStatus.byRole[role.id])
      .map((role) => role.roleName || "Unnamed role");
  }, [allocationStatus, draft.roles]);

  const peopleOptions = useMemo(
    () =>
      [...people].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    [people],
  );

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    people.forEach((person) => {
      map.set(person.personId, person);
    });
    return map;
  }, [people]);

  const requiredPersonIds = useMemo(() => {
    const ids = new Set<string>();
    draft.assignments.forEach((assignment) => {
      if (assignment.personId) ids.add(assignment.personId);
    });
    if (spendByPerson) {
      Object.entries(spendByPerson).forEach(([personId, spent]) => {
        if ((spent ?? 0) > 0) ids.add(personId);
      });
    }
    return Array.from(ids);
  }, [draft.assignments, spendByPerson]);

  const requiredPeople = useMemo(
    () =>
      requiredPersonIds
        .map((personId) => ({
          personId,
          displayName: peopleById.get(personId)?.displayName || "Unknown",
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [requiredPersonIds, peopleById],
  );

  const missingEntityIds = useMemo(
    () => requiredPersonIds.filter((personId) => !entityMap[personId]),
    [requiredPersonIds, entityMap],
  );

  useEffect(() => {
    if (missingEntityIds.length === 0 && showMissingEntities) {
      setShowMissingEntities(false);
    }
  }, [missingEntityIds.length, showMissingEntities]);

  const missingEntityLabels = useMemo(
    () =>
      missingEntityIds
        .map((personId) => peopleById.get(personId)?.displayName || "Unknown")
        .sort((a, b) => a.localeCompare(b)),
    [missingEntityIds, peopleById],
  );

  const filteredPeople = useMemo(() => {
    const term = entitySearch.trim().toLowerCase();
    return requiredPeople.filter((person) => {
      if (showMissingEntities && entityMap[person.personId]) return false;
      if (!term) return true;
      return person.displayName.toLowerCase().includes(term);
    });
  }, [requiredPeople, showMissingEntities, entityMap, entitySearch]);

  const hasMissingEntities = missingEntityIds.length > 0;
  const hasFilteredPeople = filteredPeople.length > 0;

  const filteredRoles = useMemo(() => {
    const term = roleSearch.trim().toLowerCase();
    return draft.roles
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((role) =>
        term ? (role.roleName || "").toLowerCase().includes(term) : true,
      );
  }, [draft.roles, roleSearch]);

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
    setCarryoverDraft((prev) => {
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
      if (allocationStatus.hasMismatch) {
        throw new Error("Manual allocations must match the role pool before saving.");
      }
      if (carryoverLoading) {
        throw new Error("Carry-over is still loading. Please try again.");
      }
      if (carryoverTotal != null && carryoverHasMismatch) {
        throw new Error("Carry-over allocations must match the total before saving.");
      }
      if (missingEntityIds.length > 0) {
        const preview = missingEntityLabels.slice(0, 5).join(", ");
        const suffix =
          missingEntityLabels.length > 5
            ? ` +${missingEntityLabels.length - 5} more`
            : "";
        throw new Error(`Assign an entity for: ${preview}${suffix}.`);
      }
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
        const carryoverAmount = Number(carryoverDraft[role.id] ?? 0);
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
          carryoverAmount,
          adjustedPoolAmount: Number(saved.pool_amount ?? role.poolAmount) + carryoverAmount,
          currency: saved.currency ?? role.currency,
          sortOrder: Number(saved.sort_order ?? role.sortOrder),
          isActive: saved.is_active ?? role.isActive,
        });
      }

      if (carryoverTotal != null) {
        setCarryoverSaving(true);
        try {
          const nextCarryoverDraft: Record<string, number> = {};
          draft.roles.forEach((role) => {
            const mappedId = roleIdMap.get(role.id) ?? role.id;
            if (!mappedId) return;
            nextCarryoverDraft[mappedId] = roundAmount(
              Number(carryoverDraft[role.id] ?? 0),
            );
          });
          const allocations = Object.entries(nextCarryoverDraft)
            .map(([roleId, amount]) => ({ roleId, amount }))
            .filter((entry) => entry.roleId && !isTempId(entry.roleId));
          const fromYear = year - 1;
          if (Number.isFinite(fromYear) && fromYear > 1900) {
            const resCarry = await fetch("/api/crm/budget-adjustments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client: clientSlug,
                fromYear,
                toYear: year,
                type: "carryover",
                allocations,
              }),
            });
            const bodyCarry = await resCarry.json().catch(() => null);
            if (!resCarry.ok) {
              throw new Error(bodyCarry?.error || `Failed (${resCarry.status})`);
            }
            setCarryoverDraft(nextCarryoverDraft);
            carryoverSnapshotRef.current = { ...nextCarryoverDraft };
          }
        } finally {
          setCarryoverSaving(false);
        }
      }

      const assignmentPayloads = draft.assignments.map((assignment) => ({
        ...assignment,
        roleId: roleIdMap.get(assignment.roleId) ?? assignment.roleId,
        personId: assignment.personId,
        startDate: assignment.startDate || null,
        endDate: assignment.endDate || null,
        isActive: assignment.isActive,
        allocationAmount:
          assignment.allocationAmount != null ? Number(assignment.allocationAmount) : null,
        allocationPct:
          assignment.allocationPct != null ? Number(assignment.allocationPct) : null,
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
          allocationAmount: assignment.allocationAmount,
          allocationPct: assignment.allocationPct,
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
          allocationAmount:
            saved.allocation_amount != null
              ? Number(saved.allocation_amount)
              : assignment.allocationAmount ?? null,
          allocationPct:
            saved.allocation_pct != null
              ? Number(saved.allocation_pct)
              : assignment.allocationPct ?? null,
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

      const entityEntries = Object.entries(entityMap)
        .filter(([, entity]) => entity && entity.trim())
        .map(([personId, entity]) => ({
          personId,
          entity: entity.trim(),
        }));
      if (entityEntries.length > 0) {
        const res = await fetch("/api/crm/people-entities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client: clientSlug, year, entries: entityEntries }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Failed to save entities");
      }

      setDraft({ roles: nextRoles, assignments: nextAssignments });
      setDeletedRoleIds([]);
      setDeletedAssignmentIds([]);
      initialSignatureRef.current = buildSignature(
        nextRoles,
        nextAssignments,
        [],
        [],
        entityMap,
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
      carryoverAmount: 0,
      currency: "EUR",
      sortOrder: draft.roles.length + 1,
      year,
      isActive: true,
    };
    setDraft((prev) => ({ ...prev, roles: [...prev.roles, next] }));
    setExpandedRoles((prev) => ({ ...prev, [next.id]: true }));
    setCarryoverDraft((prev) => ({ ...prev, [next.id]: 0 }));
  };

  const addAssignment = (roleId: string) => {
    const next: BudgetAssignment = {
      id: `new-${Date.now()}-${roleId}`,
      roleId,
      personId: "",
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      isActive: true,
      allocationAmount: null,
      allocationPct: null,
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
          carryoverAmount: 0,
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
            allocationAmount:
              assignment.allocationAmount != null
                ? Number(assignment.allocationAmount)
                : null,
            allocationPct:
              assignment.allocationPct != null
                ? Number(assignment.allocationPct)
                : null,
          };
        })
        .filter(Boolean) as BudgetAssignment[];
      setDraft({ roles: nextRoles, assignments: nextAssignments });
      const nextCarryover: Record<string, number> = {};
      nextRoles.forEach((role) => {
        nextCarryover[role.id] = 0;
      });
      setCarryoverDraft(nextCarryover);
      setDeletedRoleIds([]);
      setDeletedAssignmentIds([]);
      setExpandedRoles(() => {
        const next: Record<string, boolean> = {};
        nextRoles.forEach((role, idx) => {
          next[role.id] = idx === 0;
        });
        return next;
      });
      try {
        const copyRes = await fetch("/api/crm/people-entities/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client: clientSlug,
            fromYear: prevYear,
            toYear: year,
            overwrite: false,
          }),
        });
        const copyBody = await copyRes.json().catch(() => null);
        if (!copyRes.ok && copyRes.status !== 404) {
          throw new Error(copyBody?.error || "Failed to copy entities");
        }
        const res = await fetch(
          `/api/crm/people-entities?client=${clientSlug}&year=${year}`,
        );
        const body = await res.json().catch(() => null);
        if (res.ok) {
          const nextMap: Record<string, string> = {};
          (body?.entries ?? []).forEach((entry: any) => {
            if (entry?.personId && entry?.entity) {
              nextMap[entry.personId] = entry.entity;
            }
          });
          setEntityMap(nextMap);
        }
      } catch (entityErr) {
        showError(entityErr instanceof Error ? entityErr.message : "Failed to copy entities");
      }
      showSuccess(`Loaded roles from ${prevYear}.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setCopying(false);
    }
  };

  const handleRequestClose = () => {
    if (hasChanges) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Are you sure you want to close?",
      );
      if (!confirmClose) return;
    }
    onClose();
  };

  return (
    <ModalShell
      title={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate">{`Manage budgets (${year})`}</span>
          <button
            className="btn-ghost h-8 px-3 text-sm font-medium shrink-0"
            type="button"
            onClick={handleCopyFromPreviousYear}
            disabled={!canEdit || savingAll || copying}
          >
            {copying ? "Copying..." : "Copy from previous year"}
          </button>
        </div>
      }
      onClose={handleRequestClose}
      widthClass="max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button className="btn-ghost h-9 px-4" onClick={handleRequestClose}>
            Cancel
          </button>
          <button
            className={`btn-primary h-9 px-4 ${
              hasChanges ? "ring-2 ring-emerald-200/70" : ""
            }`}
            onClick={handleSaveAll}
            disabled={
              savingAll ||
              !canEdit ||
              missingEntityIds.length > 0 ||
              allocationStatus.hasMismatch ||
              carryoverLoading ||
              carryoverSaving ||
              (carryoverTotal != null && carryoverHasMismatch)
            }
          >
            {savingAll
              ? "Saving..."
              : hasChanges
                ? "Save Changes *"
                : "Save Changes"}
          </button>
        </div>
      }
    >
      <form
        className="space-y-5"
        data-variant="clean-tech"
        onSubmit={(event) => event.preventDefault()}
      >
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
        {allocationStatus.hasMismatch ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Manual allocations must match the role pool. Check:{" "}
            {allocationMismatchLabels.join(", ")}.
          </div>
        ) : null}
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2">
          <div className="segmented">
            {[
              { key: "roles", label: `Roles (${draft.roles.length})` },
              {
                key: "entities",
                label: `Entities (${requiredPeople.length})`,
                meta: `Missing: ${missingEntityIds.length}`,
                metaTone: missingEntityIds.length > 0 ? "warn" : "muted",
              },
              {
                key: "carryover",
                label: "Carry-over",
                badge: carryoverHasMismatch ? "!" : null,
              },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className="segmented-tab"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
              >
                <span>{tab.label}</span>
                {tab.meta ? (
                  <span
                    className={[
                      "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      tab.metaTone === "warn"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]/60",
                    ].join(" ")}
                  >
                    {tab.meta}
                  </span>
                ) : null}
                {tab.badge ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        {activeTab === "entities" ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--color-text)]">Entities</h3>
                <span className="text-xs text-[color:var(--color-text)]/60">
                  Required for budget and execution splits.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`btn-ghost h-9 px-3 ${
                    showMissingEntities
                      ? "border-[color:var(--color-primary)] text-[color:var(--color-primary)]"
                      : ""
                  } ${!hasMissingEntities ? "opacity-50" : ""}`}
                  aria-pressed={showMissingEntities}
                  disabled={!hasMissingEntities}
                  title={hasMissingEntities ? "Show missing entities only" : "No missing entities"}
                  onClick={() => setShowMissingEntities((prev) => !prev)}
                >
                  Missing only
                </button>
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className={`btn-ghost h-9 px-3 ${!hasFilteredPeople ? "opacity-50" : ""}`}
                      disabled={!hasFilteredPeople}
                      title={
                        hasFilteredPeople
                          ? "Set all visible to Dataventure"
                          : "No people in the current filter"
                      }
                      onClick={() =>
                        setEntityMap((prev) => {
                          const next = { ...prev };
                          filteredPeople.forEach((person) => {
                            next[person.personId] = "Dataventure";
                          });
                          return next;
                        })
                      }
                    >
                      Set to Dataventure
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost h-9 px-3 ${!hasFilteredPeople ? "opacity-50" : ""}`}
                      disabled={!hasFilteredPeople}
                      title={
                        hasFilteredPeople
                          ? "Set all visible to Equancy"
                          : "No people in the current filter"
                      }
                      onClick={() =>
                        setEntityMap((prev) => {
                          const next = { ...prev };
                          filteredPeople.forEach((person) => {
                            next[person.personId] = "Equancy";
                          });
                          return next;
                        })
                      }
                    >
                      Set to Equancy
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="input h-9 min-w-[220px]"
                placeholder="Search person..."
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
              />
              <span className="text-xs text-[color:var(--color-text)]/60">
                {filteredPeople.length} shown
              </span>
            </div>
            {requiredPeople.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text)]/70">
                Add members to assign entities.
              </div>
            ) : filteredPeople.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text)]/70">
                No people match the current filter.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPeople.map((person) => {
                  const value = entityMap[person.personId] ?? "";
                  const isMissing = !value;
                  return (
                    <div
                      key={person.personId}
                      className={[
                        "flex flex-wrap items-center gap-3 rounded-xl border bg-[color:var(--color-surface)]/90 p-2",
                        isMissing ? "border-red-200" : "border-[color:var(--color-border)]",
                      ].join(" ")}
                    >
                      <div className="min-w-[180px] flex-1">
                        <div className="text-sm font-semibold text-[color:var(--color-text)]">
                          {person.displayName}
                        </div>
                        {isMissing ? (
                          <div className="text-xs text-red-600">Entity required</div>
                        ) : null}
                      </div>
                      <select
                        className={[
                          "input h-9 min-w-[180px]",
                          isMissing ? "border-red-300" : "",
                        ].join(" ")}
                        value={value}
                        onChange={(e) =>
                          setEntityMap((prev) => ({
                            ...prev,
                            [person.personId]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select entity</option>
                        {ENTITY_OPTIONS.map((entity) => (
                          <option key={entity} value={entity}>
                            {entity}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
            {missingEntityLabels.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Missing entities: {missingEntityLabels.join(", ")}.
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "carryover" ? (
          <section className="space-y-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                  Carry-over
                </p>
                <h3 className="mt-1 text-sm font-semibold text-[color:var(--color-text)]">
                  Allocate remaining {year - 1} budget
                </h3>
                <p className="mt-1 text-xs text-[color:var(--color-text)]/60">
                  Distribute remaining or overspend across {year} role pools.
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                  Total
                </p>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    carryoverTotal != null && carryoverTotal < 0
                      ? "text-red-600"
                      : "text-emerald-600"
                  }`}
                >
                  {carryoverTotal == null
                    ? "--"
                    : `${carryoverTotal.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                </p>
                <p className="text-xs text-[color:var(--color-text)]/60">
                  {carryoverTotal == null
                    ? "No prior-year data"
                    : carryoverTotal < 0
                      ? "Overspend"
                      : "Remaining"}
                </p>
              </div>
            </div>

            {carryoverLoading ? (
              <div className="text-sm text-[color:var(--color-text)]/70">
                Loading carry-over...
              </div>
            ) : carryoverError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {carryoverError}
              </div>
            ) : carryoverTotal == null ? (
              <div className="text-sm text-[color:var(--color-text)]/70">
                No carry-over available for {year - 1}.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_160px] gap-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                  <span>Role</span>
                  <span className="text-right">Carry-over (€)</span>
                </div>
                <div className="space-y-2">
                  {draft.roles
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((role) => (
                      <div
                        key={`carryover-${role.id}`}
                        className="grid grid-cols-[1fr_160px] items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2"
                      >
                        <span className="text-sm font-medium text-[color:var(--color-text)]">
                          {role.roleName || "Untitled role"}
                        </span>
                        <input
                          className="input h-8 w-full text-right"
                          type="number"
                          step="1"
                          value={Number(carryoverDraft[role.id] ?? 0)}
                          disabled={!canEdit || carryoverSaving}
                          onChange={(e) =>
                            setCarryoverDraft((prev) => ({
                              ...prev,
                              [role.id]: Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs">
                  <div className="text-[color:var(--color-text)]/70">
                    Allocated:{" "}
                    <span className="font-semibold text-[color:var(--color-text)]">
                      {carryoverAllocated.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <div
                    className={`text-[color:var(--color-text)]/70 ${
                      carryoverHasMismatch ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    Remaining:{" "}
                    <span className="font-semibold">
                      {carryoverDiff?.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  </div>
                </div>
                {carryoverHasMismatch ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Allocate the full carry-over total before saving.
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {activeTab === "roles" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--color-text)]">
                  Roles
                </h3>
                <span className="text-xs text-[color:var(--color-text)]/60">
                  Manage role pools and assignments.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input h-9 min-w-[220px]"
                  placeholder="Search role..."
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                />
                {canEdit ? (
                  <button className="btn-ghost h-9 px-3" onClick={addRole}>
                    Add role
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              {filteredRoles.length === 0 ? (
                <div className="text-sm text-[color:var(--color-text)]/70">
                  No roles match the current search.
                </div>
              ) : (
                filteredRoles.map((role) => {
                  const rolePool = getRoleAdjustedPool(role);
                  const roleAssignments = draft.assignments.filter(
                    (a) => a.roleId === role.id,
                  );
                  const isExpanded = expandedRoles[role.id] ?? false;
                  const memberCount = roleAssignments.length;
                  const memberLabel =
                    memberCount === 1 ? "1 member" : `${memberCount} members`;
                  const roleMode = getRoleMode(role.id);
                  const isManual = roleMode === "manual";
                  const roleMismatch = allocationStatus.byRole[role.id];
                  const memberGridCols = isManual
                    ? "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.4fr)_auto]"
                    : "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.4fr)_auto]";
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
                      className={`input h-9 min-w-0 flex-1 text-base font-semibold ${
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
                      <div className="flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 p-0.5 text-xs">
                        <button
                          type="button"
                          className={`px-2 py-1 rounded-full ${
                            roleMode === "auto"
                              ? "bg-white text-[color:var(--color-text)] shadow-sm"
                              : "text-[color:var(--color-text)]/60"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (roleMode === "auto") return;
                            handleAllocationModeChange(role, "auto");
                          }}
                        >
                          Auto
                        </button>
                        <button
                          type="button"
                          className={`px-2 py-1 rounded-full ${
                            roleMode === "manual"
                              ? "bg-white text-[color:var(--color-text)] shadow-sm"
                              : "text-[color:var(--color-text)]/60"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (roleMode === "manual") return;
                            handleAllocationModeChange(role, "manual");
                          }}
                        >
                          Manual
                        </button>
                      </div>
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
                      {isManual ? (
                        <div
                          className={[
                            "rounded-lg border px-3 py-2 text-xs",
                            roleMismatch
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700",
                          ].join(" ")}
                        >
                          {roleMismatch
                            ? `Manual allocation off by ${roleMismatch.diff > 0 ? "+" : ""}${roleMismatch.diff.toFixed(2)}.`
                            : "Manual allocations match the pool."}
                        </div>
                      ) : null}
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Members
                      </p>
                      {roleAssignments.length ? (
                        <>
                          <div
                            className={`hidden ${memberGridCols} items-center gap-2 px-2 text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text)]/55 sm:grid`}
                          >
                            <span>Member</span>
                            <span>Start</span>
                            <span>End</span>
                            {isManual ? <span>Allocation</span> : null}
                            <span className="text-center">Active</span>
                            <span className="text-right">Actions</span>
                          </div>
                          <div className="space-y-2">
                            {roleAssignments.map((assignment) => (
                              <div
                                key={assignment.id}
                                className={`grid grid-cols-1 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 ${memberGridCols} sm:items-center`}
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
                                <DatePicker
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
                                <DatePicker
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
                                {isManual ? (
                                  <div>
                                    <input
                                      className="input h-8 w-full text-right text-sm"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={
                                        assignment.allocationAmount != null
                                          ? assignment.allocationAmount
                                          : ""
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const amount =
                                          raw === "" ? null : Number.parseFloat(raw);
                                        const allocationPct =
                                          amount != null && rolePool > 0
                                            ? roundAmount((amount / rolePool) * 100)
                                            : null;
                                        setDraft((prev) => ({
                                          ...prev,
                                          assignments: prev.assignments.map((a) =>
                                            a.id === assignment.id
                                              ? {
                                                  ...a,
                                                  allocationAmount: amount,
                                                  allocationPct,
                                                }
                                              : a,
                                          ),
                                        }));
                                      }}
                                    />
                                    <div className="mt-1 text-[10px] text-[color:var(--color-text)]/60 text-right">
                                      {rolePool > 0
                                        ? `${roundAmount(
                                            ((assignment.allocationAmount ?? 0) /
                                              rolePool) *
                                              100,
                                          )}%`
                                        : "0%"}
                                    </div>
                                  </div>
                                ) : null}
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
          </>
        ) : null}
      </form>
    </ModalShell>
  );
}
