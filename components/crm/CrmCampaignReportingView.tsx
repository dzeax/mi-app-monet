/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  FileDown,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import ColumnPicker from "@/components/ui/ColumnPicker";
import DatePicker from "@/components/ui/DatePicker";
import GeoFlag from "@/components/GeoFlag";
import MiniModal from "@/components/ui/MiniModal";
import CrmGenerateUnitsModal from "@/components/crm/CrmGenerateUnitsModal";
import CrmBulkEditUnitsModal, {
  type CampaignUnitsBulkPatch,
} from "@/components/crm/CrmBulkEditUnitsModal";
import { useAuth } from "@/context/AuthContext";
import { showError, showSuccess } from "@/utils/toast";

type Unit = {
  id: string;
  clientSlug: string;
  week: number | null;
  year: number | null;
  campaignName: string;
  variant: string;
  sfmcTracking: string | null;
  brand: string;
  sendDate: string | null;
  market: string;
  scope: string;
  segment: string | null;
  touchpoint: string | null;
  owner: string;
  personId?: string | null;
  jiraTicket: string;
  status: string;
  hoursMasterTemplate: number;
  hoursTranslations: number;
  hoursCopywriting: number;
  hoursAssets: number;
  hoursRevisions: number;
  hoursBuild: number;
  hoursPrep: number;
  hoursTotal: number;
  daysTotal: number;
  budgetEur: number | null;
};

type Filters = {
  search: string;
  brand: string[];
  market: string[];
  scope: string[];
  segment: string[];
  touchpoint: string[];
  owner: string[];
  status: string[];
};

type ComputedUnit = Unit & { budgetValue: number };

type SortKey = "sendDate" | "hoursTotal" | "daysTotal" | "budgetValue";
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  Sent: "bg-blue-100 text-blue-800",
  Done: "bg-emerald-100 text-emerald-800",
  Planned: "bg-slate-100 text-slate-800",
};

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return value;
};

const formatNumber = (val: number) =>
  Number.isFinite(val)
    ? val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0,00";

const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseYearFromDate = (value?: string | null) => {
  if (!value || value.length < 4) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const normalizePersonKey = (value?: string | null) =>
  value?.trim().toLowerCase() ?? "";

const effortHeaderCls =
  "bg-[color:var(--color-surface-2)]/70 border-l border-[color:var(--color-border)]/70";
const effortCellCls = "bg-[color:var(--color-surface-2)]/40";

type Option = { label: string; value: string };
type PersonDirectoryItem = {
  personId: string;
  displayName: string;
  aliases: string[];
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
      ? "flex h-9 w-full items-center justify-between gap-2 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-left text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
      : "input flex h-10 w-full items-center justify-between gap-2 text-left truncate",
    !hideLabel && values.length > 0 ? "ring-1 ring-[color:var(--color-accent)]" : "",
    hideLabel ? "" : "focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]",
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
      if (!open || options.length === 0) return;
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

const buildJiraUrl = (ticket: string) =>
  ticket.startsWith("http")
    ? ticket
    : `https://europcarmobility.atlassian.net/browse/${ticket}`;

export default function CrmCampaignReportingView() {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const clientSlug = segments[1] || "emg";
  const currentYear = new Date().getFullYear();

  const [units, setUnits] = useState<Unit[]>([]);
  const [ratesByYear, setRatesByYear] = useState<
    Record<number, { byOwner: Record<string, number>; byPerson: Record<string, number> }>
  >({});
  const [peopleDirectory, setPeopleDirectory] = useState<PersonDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openBulkEdit, setOpenBulkEdit] = useState(false);
  const [bulkEditIds, setBulkEditIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    brand: [],
    market: [],
    scope: [],
    segment: [],
    touchpoint: [],
    owner: [],
    status: [],
  });
  const today = new Date();
  const startOfThisMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const endOfThisMonth = formatLocalDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const [dateFrom, setDateFrom] = useState(startOfThisMonth);
  const [dateTo, setDateTo] = useState<string>(endOfThisMonth);
  const [datePreset, setDatePreset] = useState<"this-week" | "last-week" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "last-year" | "all-time" | "">("this-month");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>("sendDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [compact, setCompact] = useState(true);
  const [openGenerate, setOpenGenerate] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
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
  const rateYears = useMemo(() => {
    const set = new Set<number>();
    units.forEach((unit) => {
      const year = parseYearFromDate(unit.sendDate) ?? unit.year ?? currentYear;
      if (year) set.add(year);
    });
    if (set.size === 0) set.add(currentYear);
    return Array.from(set).sort((a, b) => a - b);
  }, [units, currentYear]);
  const rateYearsKey = useMemo(() => rateYears.join(","), [rateYears]);
  const resolveOwnerKey = useCallback(
    (label?: string | null, personId?: string | null) => {
      if (personId) return personId;
      const key = normalizePersonKey(label);
      if (!key) return "";
      return aliasToPersonId.get(key) ?? (label ?? "");
    },
    [aliasToPersonId],
  );
  const labelForOwnerKey = useCallback(
    (key: string) => peopleById.get(key) ?? key,
    [peopleById],
  );
  const getRateForUnit = useCallback(
    (unit: Unit) => {
      const year = parseYearFromDate(unit.sendDate) ?? unit.year ?? currentYear;
      const rates = ratesByYear[year];
      if (!rates) return null;
      return unit.personId ? rates.byPerson[unit.personId] : rates.byOwner[unit.owner];
    },
    [currentYear, ratesByYear],
  );
  useEffect(() => {
    if (aliasToPersonId.size === 0) return;
    setFilters((prev) => {
      const nextOwner = prev.owner
        .map((val) => aliasToPersonId.get(normalizePersonKey(val)) ?? val)
        .filter(Boolean);
      const uniqueOwner = Array.from(new Set(nextOwner));
      const same =
        prev.owner.length === uniqueOwner.length &&
        prev.owner.every((val, idx) => val === uniqueOwner[idx]);
      if (same) return prev;
      return { ...prev, owner: uniqueOwner };
    });
  }, [aliasToPersonId]);
  const COLVIS_STORAGE_KEY = "campaign_colvis_v1";
  const columnOptions = useMemo(
    () =>
      [
        { id: "date", label: "Date" },
        { id: "brand", label: "Brand" },
        { id: "campaign", label: "Campaign" },
        { id: "market", label: "Market" },
        { id: "scope", label: "Scope" },
        { id: "segment", label: "Segment" },
        { id: "touchpoint", label: "Touchpoint" },
        { id: "variant", label: "Variant" },
        { id: "tracking", label: "SFMC Tracking" },
        { id: "owner", label: "Owner" },
        { id: "status", label: "Status" },
        { id: "hours", label: "Hours" },
        { id: "days", label: "Days" },
        { id: "budget", label: "Budget (€)" },
        { id: "jira", label: "JIRA" },
      ] as const,
    [],
  );
  const defaultVisible = useMemo(
    () => columnOptions.map((c) => c.id),
    [columnOptions],
  );
  const defaultVisibleSet = useMemo(
    () => new Set(defaultVisible as readonly string[]),
    [defaultVisible],
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(defaultVisible),
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const headerSelectRef = useRef<HTMLInputElement | null>(null);
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const makeClearAndResetPage = useCallback(
    (fn: () => void) => () => {
      fn();
      setPage(0);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resPeople = await fetch(`/api/crm/people?client=${clientSlug}`);
        const bodyPeople = await resPeople.json().catch(() => null);
        if (resPeople.ok && Array.isArray(bodyPeople?.people) && active) {
          const people = bodyPeople.people
            .map((p: any) => ({
              personId: String(p.personId ?? ""),
              displayName: String(p.displayName ?? "").trim(),
              aliases: Array.isArray(p.aliases)
                ? p.aliases.map((alias: any) => String(alias ?? "").trim()).filter(Boolean)
                : [],
            }))
            .filter((p: PersonDirectoryItem) => Boolean(p.personId) && Boolean(p.displayName));
          setPeopleDirectory(people);
        }

        const params = new URLSearchParams({ client: clientSlug });
        if (dateFrom) params.append("from", dateFrom);
        if (dateTo) params.append("to", dateTo);

        const res = await fetch(`/api/crm/campaign-email-units?${params.toString()}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Failed to load (${res.status})`);
        const rawUnits = Array.isArray(body?.units) ? body.units : [];
        const list: Unit[] = rawUnits.map((r: any) => ({
              id: r.id,
              clientSlug: r.clientSlug,
              week: r.week ?? null,
              year: r.year ?? null,
              campaignName: r.campaignName || r.campaign_name || "",
              variant: r.variant || "",
              sfmcTracking: r.sfmcTracking || null,
              brand: r.brand || "",
              sendDate: r.sendDate || null,
              market: r.market || "",
              scope: r.scope || "",
              segment: r.segment ?? null,
              touchpoint: r.touchpoint ?? null,
              owner: r.owner || "",
              personId: r.personId ?? null,
              jiraTicket: r.jiraTicket || "",
              status: r.status || "",
              hoursMasterTemplate: Number(r.hoursMasterTemplate ?? 0),
              hoursTranslations: Number(r.hoursTranslations ?? 0),
              hoursCopywriting: Number(r.hoursCopywriting ?? 0),
              hoursAssets: Number(r.hoursAssets ?? 0),
              hoursRevisions: Number(r.hoursRevisions ?? 0),
              hoursBuild: Number(r.hoursBuild ?? 0),
              hoursPrep: Number(r.hoursPrep ?? 0),
              hoursTotal: Number(r.hoursTotal ?? 0),
              daysTotal: Number(r.daysTotal ?? 0),
              budgetEur: r.budgetEur != null ? Number(r.budgetEur) : null,
            }))
        if (active) setUnits(list);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load data");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail?.client === clientSlug) void load();
    };
    window.addEventListener("crm:imported", handler);
    return () => {
      active = false;
      window.removeEventListener("crm:imported", handler);
    };
  }, [clientSlug, currentYear, dateFrom, dateTo, refreshTick]);

  useEffect(() => {
    let active = true;
    const loadRates = async () => {
      try {
        const resRates = await fetch(
          `/api/crm/rates?client=${clientSlug}&years=${rateYearsKey || currentYear}`,
        );
        const bodyRates = await resRates.json().catch(() => null);
        if (!active) return;
        if (resRates.ok && Array.isArray(bodyRates?.rates)) {
          const nextByYear: Record<
            number,
            { byOwner: Record<string, number>; byPerson: Record<string, number> }
          > = {};
          bodyRates.rates.forEach((r: any) => {
            const year = Number(r.year ?? currentYear);
            if (!Number.isFinite(year)) return;
            if (!nextByYear[year]) {
              nextByYear[year] = { byOwner: {}, byPerson: {} };
            }
            const rate = Number(r.dailyRate ?? 0);
            if (r.owner) nextByYear[year].byOwner[r.owner] = rate;
            if (r.personId) nextByYear[year].byPerson[r.personId] = rate;
          });
          setRatesByYear(nextByYear);
        } else {
          setRatesByYear({});
        }
      } catch {
        if (active) setRatesByYear({});
      }
    };
    void loadRates();
    return () => {
      active = false;
    };
  }, [clientSlug, currentYear, rateYearsKey]);

  useEffect(() => {
    // Clear any selection if the dataset changes
    setSelectedIds(new Set());
  }, [units]);

  const unitMatchesFilters = useCallback(
    (r: Unit, exclude?: keyof Filters) => {
      if (dateFrom && (!r.sendDate || r.sendDate < dateFrom)) return false;
      if (dateTo && (!r.sendDate || r.sendDate > dateTo)) return false;
      if (exclude !== "brand" && filters.brand.length && !filters.brand.includes(r.brand || "")) return false;
      if (exclude !== "market" && filters.market.length && !filters.market.includes(r.market || "")) return false;
      if (exclude !== "scope" && filters.scope.length && !filters.scope.includes(r.scope || "")) return false;
      if (exclude !== "segment" && filters.segment.length && !filters.segment.includes(r.segment || "")) return false;
      if (exclude !== "touchpoint" && filters.touchpoint.length && !filters.touchpoint.includes(r.touchpoint || "")) return false;
      if (exclude !== "owner" && filters.owner.length) {
        const key = resolveOwnerKey(r.owner, r.personId);
        if (!key || !filters.owner.includes(key)) return false;
      }
      if (exclude !== "status" && filters.status.length && !filters.status.includes(r.status || "")) return false;
      if (exclude !== "search" && filters.search) {
        const term = filters.search.toLowerCase();
        const haystack = [
          r.campaignName,
          r.brand,
          r.jiraTicket,
          r.market,
          r.segment ?? "",
          r.touchpoint ?? "",
          r.sfmcTracking ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    },
    [filters, dateFrom, dateTo, resolveOwnerKey],
  );

  const filterOptions = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.filter((v): v is string => !!v))).sort();
    const countEntries = (vals: (string | null)[]) => {
      const map = new Map<string, number>();
      vals.forEach((v) => {
        if (!v) return;
        map.set(v, (map.get(v) || 0) + 1);
      });
      return Object.fromEntries(map);
    };

    const subset = (exclude: keyof Filters) => units.filter((r) => unitMatchesFilters(r, exclude));
    const ownerValues = uniq(subset("owner").map((r) => resolveOwnerKey(r.owner, r.personId)));
    const ownerCounts = countEntries(subset("owner").map((r) => resolveOwnerKey(r.owner, r.personId)));
    const ownerOptions = ownerValues
      .map((key) => ({ value: key, label: labelForOwnerKey(key) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      brand: {
        values: uniq(subset("brand").map((r) => r.brand)),
        counts: countEntries(subset("brand").map((r) => r.brand)),
      },
      market: {
        values: uniq(subset("market").map((r) => r.market)),
        counts: countEntries(subset("market").map((r) => r.market)),
      },
      scope: {
        values: uniq(subset("scope").map((r) => r.scope)),
        counts: countEntries(subset("scope").map((r) => r.scope)),
      },
      segment: {
        values: uniq(subset("segment").map((r) => r.segment)),
        counts: countEntries(subset("segment").map((r) => r.segment)),
      },
      touchpoint: {
        values: uniq(subset("touchpoint").map((r) => r.touchpoint)),
        counts: countEntries(subset("touchpoint").map((r) => r.touchpoint)),
      },
      owner: {
        options: ownerOptions,
        counts: ownerCounts,
      },
      status: {
        values: uniq(subset("status").map((r) => r.status)),
        counts: countEntries(subset("status").map((r) => r.status)),
      },
    };
  }, [units, unitMatchesFilters, resolveOwnerKey, labelForOwnerKey]);

  const bulkEditOwnerOptions = useMemo(() => {
    const canonicalLabels = peopleDirectory
      .map((person) => String(person.displayName ?? "").trim())
      .filter((label) => label.length > 0);
    if (canonicalLabels.length > 0) {
      return Array.from(new Set(canonicalLabels)).sort((a, b) => a.localeCompare(b));
    }
    const keySet = new Set<string>();
    Object.values(ratesByYear).forEach((bucket) => {
      Object.keys(bucket.byOwner).forEach((owner) => {
        const key = resolveOwnerKey(owner);
        keySet.add(key || owner);
      });
    });
    units.forEach((r) => {
      const key = resolveOwnerKey(r.owner, r.personId);
      if (key) keySet.add(key);
    });
    const labels = Array.from(keySet)
      .map((key) => labelForOwnerKey(key))
      .filter((label) => label.trim().length > 0);
    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
  }, [peopleDirectory, ratesByYear, units, resolveOwnerKey, labelForOwnerKey]);

  const bulkEditStatusOptions = useMemo(() => {
    const set = new Set<string>(["Planned", "Done", "Sent"]);
    units.forEach((r) => {
      if (r.status) set.add(r.status);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [units]);

  const handleFilterChange = useCallback((key: keyof Filters, value: string | string[]) => {
    setFilters((prev) => ({ ...prev, [key]: value as any }));
  }, []);

  const clearFilters = () => {
    setFilters({
      search: "",
      brand: [],
      market: [],
      scope: [],
      segment: [],
      touchpoint: [],
      owner: [],
      status: [],
    });
    setDatePreset("this-month");
    setDateFrom(startOfThisMonth);
    setDateTo(endOfThisMonth);
  };

  const filteredUnits = useMemo(
    () => units.filter((r) => unitMatchesFilters(r)),
    [units, unitMatchesFilters],
  );

  const computedUnits = useMemo<ComputedUnit[]>(() => {
    return filteredUnits.map((r) => {
      const rate = getRateForUnit(r);
      const budgetValue = rate != null ? r.daysTotal * rate : r.budgetEur ?? 0;
      return { ...r, budgetValue };
    });
  }, [filteredUnits, getRateForUnit]);

  const activeChips = useMemo(() => {
    const chips: { label: string; onClear: () => void }[] = [];
    const addChip = (label: string, clearFn: () => void) =>
      chips.push({ label, onClear: makeClearAndResetPage(clearFn) });

    if (filters.brand.length) addChip(`Brand: ${filters.brand.join(", ")}`, () => handleFilterChange("brand", []));
    if (filters.market.length) addChip(`Market: ${filters.market.join(", ")}`, () => handleFilterChange("market", []));
    if (filters.scope.length) addChip(`Scope: ${filters.scope.join(", ")}`, () => handleFilterChange("scope", []));
    if (filters.segment.length) addChip(`Segment: ${filters.segment.join(", ")}`, () => handleFilterChange("segment", []));
    if (filters.touchpoint.length)
      addChip(`Touchpoint: ${filters.touchpoint.join(", ")}`, () => handleFilterChange("touchpoint", []));
    if (filters.owner.length)
      addChip(
        `Owner: ${filters.owner.map(labelForOwnerKey).join(", ")}`,
        () => handleFilterChange("owner", []),
      );
    if (filters.status.length) addChip(`Status: ${filters.status.join(", ")}`, () => handleFilterChange("status", []));
    if (filters.search) addChip(`Search: ${filters.search}`, () => handleFilterChange("search", ""));
    if ((dateFrom && dateFrom !== startOfThisMonth) || dateTo !== endOfThisMonth)
      addChip(
        `Date: ${dateFrom || "--"} -> ${dateTo || "--"}`,
        makeClearAndResetPage(() => {
          setDatePreset("");
          setDateFrom("");
          setDateTo("");
        }),
      );
    return chips;
  }, [
    filters.brand,
    filters.market,
    filters.scope,
    filters.segment,
    filters.touchpoint,
    filters.owner,
    filters.status,
    filters.search,
    dateFrom,
    dateTo,
    startOfThisMonth,
    endOfThisMonth,
    handleFilterChange,
    makeClearAndResetPage,
    labelForOwnerKey,
  ]);

  useEffect(() => {
    const raw = typeof window !== "undefined"
      ? localStorage.getItem(COLVIS_STORAGE_KEY)
      : null;
    if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((id: unknown) =>
            typeof id === "string" && defaultVisibleSet.has(id),
          );
          if (valid.length > 0) setVisibleCols(new Set(valid));
        }
      } catch {
        /* ignore */
      }
  }, [COLVIS_STORAGE_KEY, defaultVisibleSet]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      COLVIS_STORAGE_KEY,
      JSON.stringify(Array.from(visibleCols)),
    );
  }, [COLVIS_STORAGE_KEY, visibleCols]);

  const showCol = useCallback(
    (id: string) => {
      if (id === "jira") return visibleCols.has(id);
      return visibleCols.has(id);
    },
    [visibleCols],
  );

  const columnCount = useMemo(() => {
    let count = 0;
    columnOptions.forEach((c) => {
      if (showCol(c.id)) count += 1;
    });
    const selectionCols = isAdmin ? 1 : 0;
    const actionCols = 1;
    return Math.max(count, 1) + selectionCols + actionCols;
  }, [columnOptions, isAdmin, showCol]);

  const applyDatePreset = useCallback((preset: typeof datePreset) => {
    const today = new Date();
    const startOfWeek = (offsetWeeks: number) => {
      const d = new Date(today);
      const day = d.getDay(); // 0 Sunday
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offsetWeeks * 7;
      d.setDate(diff);
      return d;
    };
    const startOfMonth = (offsetMonths: number) =>
      new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
    const endOfMonth = (offsetMonths: number) =>
      new Date(today.getFullYear(), today.getMonth() + offsetMonths + 1, 0);
    const startOfQuarter = (offsetQuarters: number) => {
      const currentQuarter = Math.floor(today.getMonth() / 3);
      const qStartMonth = (currentQuarter + offsetQuarters) * 3;
      const year = today.getFullYear() + Math.floor(qStartMonth / 12);
      const month = ((qStartMonth % 12) + 12) % 12;
      return new Date(year, month, 1);
    };
    const endOfQuarter = (offsetQuarters: number) => {
      const start = startOfQuarter(offsetQuarters);
      return new Date(start.getFullYear(), start.getMonth() + 3, 0);
    };
    const startOfYear = (offsetYears: number) => new Date(today.getFullYear() + offsetYears, 0, 1);
    const endOfYear = (offsetYears: number) => new Date(today.getFullYear() + offsetYears, 11, 31);

    let from = "";
    let to = "";

    switch (preset) {
      case "this-week":
        from = formatLocalDate(startOfWeek(0));
        to = formatLocalDate(new Date(startOfWeek(0).getFullYear(), startOfWeek(0).getMonth(), startOfWeek(0).getDate() + 6));
        break;
      case "last-week": {
        const start = startOfWeek(-1);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        from = formatLocalDate(start);
        to = formatLocalDate(end);
        break;
      }
      case "this-month":
        from = formatLocalDate(startOfMonth(0));
        to = formatLocalDate(endOfMonth(0));
        break;
      case "last-month":
        from = formatLocalDate(startOfMonth(-1));
        to = formatLocalDate(endOfMonth(-1));
        break;
      case "this-quarter":
        from = formatLocalDate(startOfQuarter(0));
        to = formatLocalDate(endOfQuarter(0));
        break;
      case "last-quarter":
        from = formatLocalDate(startOfQuarter(-1));
        to = formatLocalDate(endOfQuarter(-1));
        break;
      case "this-year":
        from = formatLocalDate(startOfYear(0));
        to = formatLocalDate(endOfYear(0));
        break;
      case "last-year":
        from = formatLocalDate(startOfYear(-1));
        to = formatLocalDate(endOfYear(-1));
        break;
      case "all-time":
        from = "";
        to = "";
        break;
      default:
        // Custom range: don't override manual dates
        setDatePreset(preset);
        return;
    }
    setDateFrom(from);
    setDateTo(to);
    setDatePreset(preset);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [
    filters.search,
    filters.brand,
    filters.market,
    filters.scope,
    filters.segment,
    filters.touchpoint,
    filters.owner,
    filters.status,
  ]);

  useEffect(() => {
    setPage(0);
  }, [units.length]);

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(computedUnits.length / pageSize) - 1, 0);
    if (page > maxPage) setPage(maxPage);
  }, [computedUnits.length, pageSize, page]);

  const totals = useMemo(() => {
    const totalHours = computedUnits.reduce((acc, r) => acc + r.hoursTotal, 0);
    const totalDays = computedUnits.reduce((acc, r) => acc + r.daysTotal, 0);
    const totalBudget = computedUnits.reduce((acc, r) => acc + r.budgetValue, 0);
    return { totalHours, totalDays, totalBudget };
  }, [computedUnits]);

  const sortedUnits = useMemo(() => {
    const list = [...computedUnits];
    const cmp = (a: any, b: any) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "sendDate": {
          const av = a.sendDate || "";
          const bv = b.sendDate || "";
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
        }
        case "hoursTotal": {
          return (a.hoursTotal - b.hoursTotal) * dir;
        }
        case "daysTotal": {
          return (a.daysTotal - b.daysTotal) * dir;
        }
        case "budgetValue": {
          return (a.budgetValue - b.budgetValue) * dir;
        }
        default:
          return 0;
      }
    };
    list.sort(cmp);
    return list;
  }, [computedUnits, sortDir, sortKey]);

  const pagedUnits = useMemo(() => {
    if (sortedUnits.length <= pageSize) return sortedUnits;
    const start = Math.min(page * pageSize, Math.max(sortedUnits.length - 1, 0));
    return sortedUnits.slice(start, start + pageSize);
  }, [sortedUnits, page, pageSize]);

  const pageUnitIds = useMemo(() => pagedUnits.map((r) => r.id), [pagedUnits]);
  const selectedCount = selectedIds.size;
  const allPageUnitsSelected = pageUnitIds.length > 0 && pageUnitIds.every((id) => selectedIds.has(id));
  const somePageUnitsSelected = pageUnitIds.some((id) => selectedIds.has(id)) && !allPageUnitsSelected;

  useEffect(() => {
    if (headerSelectRef.current) {
      headerSelectRef.current.indeterminate = somePageUnitsSelected;
    }
  }, [somePageUnitsSelected, allPageUnitsSelected]);

  useEffect(() => {
    if (selectedCount === 0) {
      setConfirmDeleteOpen(false);
    }
  }, [selectedCount]);

  const toggleUnitSelection = (id: string) => {
    if (!isAdmin) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelection = () => {
    if (!isAdmin) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageUnitsSelected) {
        pageUnitIds.forEach((id) => next.delete(id));
      } else {
        pageUnitIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    if (!isAdmin) return;
    setSelectedIds(new Set());
  };

  const totalPages = Math.max(Math.ceil(sortedUnits.length / pageSize), 1);
  const startIdx = sortedUnits.length === 0 ? 0 : page * pageSize + 1;
  const endIdx = Math.min(sortedUnits.length, (page + 1) * pageSize);
  const tableDensityClass = compact
    ? "text-xs [&_td]:py-2 [&_td]:px-2 [&_th]:py-2 [&_th]:px-2"
    : "";

  const sortHeaderClass = useCallback(
    (key: SortKey) =>
      sortKey === key
        ? "bg-[color:var(--color-surface-2)]/80 text-[color:var(--color-accent)] border-[color:var(--color-accent)]"
        : "",
    [sortKey],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleImportCsv = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch(`/api/crm/campaign-email-units?client=${clientSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `Import failed (${res.status})`);
      }
      showSuccess(`Imported ${body?.imported ?? 0} units`);
      setRefreshTick((prev) => prev + 1);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("crm:imported", {
            detail: { target: "campaigns", client: clientSlug },
          }),
        );
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to import CSV");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };


  const exportCsv = async () => {
    if (sortedUnits.length === 0) return;
    try {
      setExporting(true);
      const header = [
        "send_date",
        "jira_ticket",
        "campaign_name",
        "brand",
        "market",
        "owner",
        "week",
        "year",
        "scope",
        "segment",
        "touchpoint",
        "variant",
        "sfmc_tracking",
        "status",
        "hours_master_template",
        "hours_translations",
        "hours_copywriting",
        "hours_assets",
        "hours_revisions",
        "hours_build",
        "hours_prep",
        "budget_eur",
      ];
      const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
      const lines = sortedUnits.map((r) => {
        return [
          r.sendDate || "",
          r.jiraTicket,
          r.campaignName,
          r.brand,
          r.market,
          r.owner,
          r.week ?? "",
          r.year ?? "",
          r.scope,
          r.segment ?? "",
          r.touchpoint ?? "",
          r.variant ?? "",
          r.sfmcTracking ?? "",
          r.status,
          r.hoursMasterTemplate.toFixed(2),
          r.hoursTranslations.toFixed(2),
          r.hoursCopywriting.toFixed(2),
          r.hoursAssets.toFixed(2),
          r.hoursRevisions.toFixed(2),
          r.hoursBuild.toFixed(2),
          r.hoursPrep.toFixed(2),
          r.budgetValue.toFixed(2),
        ]
          .map((v) => escape(String(v ?? "")))
          .join(",");
      });
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign_reporting_${clientSlug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const deleteSelected = async (): Promise<boolean> => {
    if (!isAdmin) return false;
    if (!selectedIds.size) return false;
    try {
      setDeleting(true);
      const res = await fetch("/api/crm/campaign-email-units", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, ids: Array.from(selectedIds) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || `Failed to delete (${res.status})`);
      }
      setUnits((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      showSuccess("Email units deleted");
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to delete email units");
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!isAdmin) return;
    if (deleting || !selectedIds.size) return;
    const ok = await deleteSelected();
    if (ok) setConfirmDeleteOpen(false);
  };

  useEffect(() => {
    if (isAdmin) return;
    if (selectedIds.size > 0) setSelectedIds(new Set());
    if (openBulkEdit) {
      setOpenBulkEdit(false);
      setBulkEditIds([]);
    }
    if (confirmDeleteOpen) setConfirmDeleteOpen(false);
  }, [isAdmin, selectedIds, openBulkEdit, confirmDeleteOpen]);

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1
                className="text-2xl font-bold tracking-tight text-[var(--color-text)]"
                title="Track email production effort per campaign/market/segment."
              >
                Campaign Reporting · {clientSlug?.toUpperCase()}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Track email production effort per campaign, market, and segment.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm">
              {isAdmin ? (
                <>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void handleImportCsv(file);
                    }}
                  />
                  <button
                    className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                  >
                    <Upload size={14} />
                    {importing ? "Importing..." : "Import CSV"}
                  </button>
                </>
              ) : null}
              <button
                className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                type="button"
                onClick={() => setRefreshTick((prev) => prev + 1)}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
                Refresh
              </button>
              {isAdmin ? (
                <button
                  className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs"
                  type="button"
                  onClick={() => void exportCsv()}
                  disabled={exporting || sortedUnits.length === 0}
                >
                  <FileDown size={14} />
                  {exporting ? "Exporting..." : "Export CSV"}
                </button>
              ) : null}
              <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />
              <button
                className="btn-primary flex h-8 items-center gap-2 px-4 text-xs shadow-sm"
                type="button"
                onClick={() => setOpenGenerate(true)}
              >
                <Plus size={14} />
                Add units
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Total Units",
                value: filteredUnits.length.toLocaleString("es-ES"),
                icon: Layers,
              },
              {
                label: "Total Hours",
                value: `${formatNumber(totals.totalHours)} h`,
                icon: Clock,
              },
              {
                label: "Total Days",
                value: `${formatNumber(totals.totalDays)} d`,
                icon: Calendar,
              },
              {
                label: "Total Budget",
                value: `${formatNumber(totals.totalBudget)} €`,
                icon: Coins,
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
                          {item.value}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <section className={`mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm ${openAdvanced ? "pb-2" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text)]/55" />
            <input
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              className="h-9 w-full rounded-xl border-none bg-transparent pl-9 pr-4 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text)]/55 focus:ring-0"
              placeholder="Campaign, brand, JIRA..."
            />
          </div>

          <div className="h-6 w-px bg-[var(--color-border)]" />

          <MultiSelect
            label="Owner"
            options={filterOptions.owner.options}
            values={filters.owner}
            counts={filterOptions.owner.counts}
            onChange={(vals) => handleFilterChange("owner", vals)}
            placeholder="All owners"
            hideLabel
            containerClassName="min-w-[170px] flex-1 md:flex-none"
          />
          <MultiSelect
            label="Brand"
            options={filterOptions.brand.values.map((s) => ({ label: s, value: s }))}
            values={filters.brand}
            counts={filterOptions.brand.counts}
            onChange={(vals) => handleFilterChange("brand", vals)}
            placeholder="All brands"
            hideLabel
            containerClassName="min-w-[170px] flex-1 md:flex-none"
          />
          <MultiSelect
            label="Segment"
            options={filterOptions.segment.values.map((s) => ({ label: s, value: s }))}
            values={filters.segment}
            counts={filterOptions.segment.counts}
            onChange={(vals) => handleFilterChange("segment", vals)}
            placeholder="All segments"
            hideLabel
            containerClassName="min-w-[170px] flex-1 md:flex-none"
          />
          <MultiSelect
            label="Touchpoint"
            options={filterOptions.touchpoint.values.map((s) => ({ label: s, value: s }))}
            values={filters.touchpoint}
            counts={filterOptions.touchpoint.counts}
            onChange={(vals) => handleFilterChange("touchpoint", vals)}
            placeholder="All touchpoints"
            hideLabel
            containerClassName="min-w-[170px] flex-1 md:flex-none"
          />

          <div className="min-w-[170px] flex-1 md:flex-none">
            <select
              className="h-9 w-full rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              value={datePreset}
              onChange={(e) => applyDatePreset(e.target.value as typeof datePreset)}
              aria-label="Date range preset"
            >
              <option value="all-time">All time</option>
              <option value="this-week">This week</option>
              <option value="last-week">Last week</option>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="this-quarter">This quarter</option>
              <option value="last-quarter">Last quarter</option>
              <option value="this-year">This year</option>
              <option value="last-year">Last year</option>
              <option value="">Custom range</option>
            </select>
          </div>

          <div className="h-6 w-px bg-[var(--color-border)]" />
          <button
            className={[
              "btn-ghost relative h-9 w-9 rounded-lg",
              openAdvanced
                ? "bg-[var(--color-surface-2)] text-[var(--color-primary)]"
                : "text-[var(--color-text)]/60",
            ].join(" ")}
            style={{ padding: 0 }}
            type="button"
            onClick={() => setOpenAdvanced((v) => !v)}
            aria-expanded={openAdvanced}
            aria-label={openAdvanced ? "Hide advanced filters" : "Show advanced filters"}
            title={openAdvanced ? "Hide advanced filters" : "Show advanced filters"}
          >
            {openAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {openAdvanced ? (
          <>
            <hr className="my-2 border-[var(--color-border)]/60" />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <MultiSelect
                label="Market"
                options={filterOptions.market.values.map((s) => ({ label: s, value: s }))}
                values={filters.market}
                counts={filterOptions.market.counts}
                onChange={(vals) => handleFilterChange("market", vals)}
                placeholder="All markets"
                hideLabel
              />
              <MultiSelect
                label="Scope"
                options={filterOptions.scope.values.map((s) => ({ label: s, value: s }))}
                values={filters.scope}
                counts={filterOptions.scope.counts}
                onChange={(vals) => handleFilterChange("scope", vals)}
                placeholder="All scopes"
                hideLabel
              />
              <MultiSelect
                label="Status"
                options={filterOptions.status.values.map((s) => ({ label: s, value: s }))}
                values={filters.status}
                counts={filterOptions.status.counts}
                onChange={(vals) => handleFilterChange("status", vals)}
                placeholder="All statuses"
                hideLabel
              />

              <DatePicker
                value={dateFrom}
                onChange={(value) => {
                  setDatePreset("");
                  setDateFrom(value);
                }}
                placeholder="From"
                ariaLabel="From date"
                displayFormat="dd/MM/yyyy"
                buttonClassName="h-9 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />

              <DatePicker
                value={dateTo}
                onChange={(value) => {
                  setDatePreset("");
                  setDateTo(value);
                }}
                placeholder="To"
                ariaLabel="To date"
                displayFormat="dd/MM/yyyy"
                buttonClassName="h-9 rounded-lg border-none bg-[var(--color-surface-2)]/50 px-3 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="btn-ghost h-9 px-3 text-xs"
                type="button"
                onClick={() => {
                  setDatePreset("all-time");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                <X size={14} />
                Clear dates
              </button>
              <button
                className="btn-ghost h-9 px-3 text-xs"
                type="button"
                onClick={() => {
                  clearFilters();
                  setPage(0);
                }}
              >
                <X size={14} />
                Clear filters
              </button>
            </div>
          </>
        ) : null}
      </section>

      {activeChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs sm:text-sm text-[color:var(--color-text)]/80">
          {activeChips.map((chip, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2.5 py-1"
            >
              {chip.label}
              <button
                className="inline-flex text-[color:var(--color-accent)]"
                onClick={chip.onClear}
                aria-label="Clear filter"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]"
            type="button"
            onClick={() => {
              clearFilters();
              setPage(0);
            }}
          >
            <X size={12} />
            Clear all
          </button>
        </div>
      ) : null}

      {isAdmin && selectedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text)] shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-[color:var(--color-primary)]/15 px-3 py-1 text-xs font-semibold text-[color:var(--color-primary)]">
              {selectedCount.toLocaleString()} selected
            </span>
            <span className="text-xs text-[color:var(--color-text)]/65">
              Applies to selected units (can include other pages).
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-ghost h-9 px-3 border-[color:var(--color-primary)]/30 text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary)]/10"
              type="button"
              onClick={() => {
                setBulkEditIds(Array.from(selectedIds));
                setOpenBulkEdit(true);
              }}
              disabled={deleting}
            >
              Edit units
            </button>
            <button
              className="btn-danger h-9 px-3"
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete units"}
            </button>
            <button
              className="btn-ghost h-9 px-3 text-[color:var(--color-text)]/70"
              type="button"
              onClick={clearSelection}
              disabled={deleting}
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        {error ? (
          <div className="px-4 py-3 text-sm text-[color:var(--color-text)]/75">{error}</div>
        ) : null}
        <div className="overflow-auto">
          <table className={`min-w-full text-sm ${tableDensityClass}`}>
            <thead className="bg-[color:var(--color-surface-2)]/60 text-left text-[color:var(--color-text)]/80">
              <tr>
                {isAdmin ? (
                  <th className="w-10 px-3 py-3 border-l-2 border-transparent">
                    <input
                      ref={headerSelectRef}
                      type="checkbox"
                      className="h-4 w-4"
                      checked={allPageUnitsSelected}
                      onChange={togglePageSelection}
                      aria-label="Select all on page"
                    />
                  </th>
                ) : null}
                {showCol("date") ? (
                  <th className={`px-3 py-3 font-semibold border-b-2 border-transparent ${sortHeaderClass("sendDate")}`}>
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("sendDate");
                        setSortDir((prev) =>
                          sortKey === "sendDate" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Date
                      {sortKey === "sendDate" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("brand") ? (
                  <th className="px-3 py-3 font-semibold">Brand</th>
                ) : null}
                {showCol("campaign") ? (
                  <th className="px-3 py-3 font-semibold w-[340px]">Campaign</th>
                ) : null}
                {showCol("market") ? (
                  <th className="px-3 py-3 font-semibold">Market</th>
                ) : null}
                {showCol("scope") ? (
                  <th className="px-3 py-3 font-semibold">Scope</th>
                ) : null}
                {showCol("segment") ? (
                  <th className="px-3 py-3 font-semibold">Segment</th>
                ) : null}
                {showCol("touchpoint") ? (
                  <th className="px-3 py-3 font-semibold">Touchpoint</th>
                ) : null}
                {showCol("variant") ? (
                  <th className="px-3 py-3 font-semibold">Variant</th>
                ) : null}
                {showCol("tracking") ? (
                  <th className="px-3 py-3 font-semibold min-w-[220px]">SFMC tracking</th>
                ) : null}
                {showCol("owner") ? (
                  <th className="px-3 py-3 font-semibold">Owner</th>
                ) : null}
                {showCol("status") ? (
                  <th className="px-3 py-3 font-semibold">Status</th>
                ) : null}
                {showCol("hours") ? (
                  <th
                    className={`px-3 py-3 font-semibold border-b-2 border-transparent text-right ${effortHeaderCls} ${sortHeaderClass("hoursTotal")}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("hoursTotal");
                        setSortDir((prev) =>
                          sortKey === "hoursTotal" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Hours
                      {sortKey === "hoursTotal" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("days") ? (
                  <th
                    className={`px-3 py-3 font-semibold border-b-2 border-transparent text-right ${effortHeaderCls} ${sortHeaderClass("daysTotal")}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("daysTotal");
                        setSortDir((prev) =>
                          sortKey === "daysTotal" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Days
                      {sortKey === "daysTotal" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("budget") ? (
                  <th
                    className={`px-3 py-3 font-semibold border-b-2 border-transparent text-right ${effortHeaderCls} ${sortHeaderClass("budgetValue")}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      type="button"
                      onClick={() => {
                        setSortKey("budgetValue");
                        setSortDir((prev) =>
                          sortKey === "budgetValue" ? (prev === "asc" ? "desc" : "asc") : "desc",
                        );
                      }}
                    >
                      Budget (€)
                      {sortKey === "budgetValue" ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                ) : null}
                {showCol("jira") ? (
                  <th className="px-3 py-3 font-semibold">JIRA</th>
                ) : null}
                <th className="w-[1%] pr-2 text-right">
                  <div className="relative inline-flex" ref={actionsRef}>
                    <button
                      className="btn-ghost h-8 w-8 !p-0 border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/90 text-[color:var(--color-text)]/70"
                      type="button"
                      onClick={() => setActionsOpen((v) => !v)}
                      aria-label="Table actions"
                    >
                      <MoreHorizontal className="h-4 w-4 shrink-0" />
                    </button>
                    {actionsOpen ? (
                      <div className="absolute right-0 z-30 mt-2 w-44 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
                        <button
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                          onClick={() => setCompact((prev) => !prev)}
                          aria-pressed={compact}
                        >
                          <span>Compact view</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[color:var(--color-primary)]"
                            checked={compact}
                            readOnly
                            tabIndex={-1}
                          />
                        </button>
                        <button
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                          onClick={() => {
                            setShowColumnPicker(true);
                            setActionsOpen(false);
                          }}
                        >
                          Columns
                        </button>
                        {isAdmin ? (
                          <button
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              setActionsOpen(false);
                              void exportCsv();
                            }}
                            disabled={exporting || sortedUnits.length === 0}
                          >
                            {exporting ? "Exporting..." : "Download CSV"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]/70 text-[color:var(--color-text)]">
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={columnCount}>
                    Loading...
                  </td>
                </tr>
              ) : (
                pagedUnits.map((r) => {
                  const ownerKey = resolveOwnerKey(r.owner, r.personId);
                  const ownerLabel = ownerKey ? labelForOwnerKey(ownerKey) : r.owner;
                  const ownerTitle =
                    r.owner && ownerLabel && ownerLabel !== r.owner
                      ? `${ownerLabel} (${r.owner})`
                      : ownerLabel || r.owner;
                  return (
                    <tr
                      key={r.id}
                      aria-selected={selectedIds.has(r.id)}
                      className={[
                        "transition-colors",
                        selectedIds.has(r.id)
                          ? "bg-[color:var(--color-surface-2)]/85 hover:bg-[color:var(--color-surface-2)]/95"
                          : "hover:bg-[color:var(--color-surface-2)]/40",
                      ].join(" ")}
                    >
                    {isAdmin ? (
                      <td
                        className={`px-3 py-3 border-l-2 ${selectedIds.has(r.id) ? "border-[color:var(--color-text)]/20" : "border-transparent"}`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleUnitSelection(r.id)}
                          aria-label="Select unit"
                        />
                      </td>
                    ) : null}
                    {showCol("date") ? (
                      <td className="px-3 py-3 font-semibold">
                        {r.sendDate ? formatDate(r.sendDate) : ""}
                      </td>
                    ) : null}
                    {showCol("brand") ? (
                      <td className="px-3 py-3">
                        {r.brand ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              r.brand === "Europcar + Goldcar"
                                ? "bg-slate-100 text-slate-800"
                                : r.brand === "Europcar"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : r.brand === "Goldcar"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]"
                            }`}
                          >
                            {r.brand}
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-text)]/55">n/a</span>
                        )}
                      </td>
                    ) : null}
                    {showCol("campaign") ? (
                      <td
                        className={`px-3 py-3 max-w-[340px] ${compact ? "truncate whitespace-nowrap" : "line-clamp-2 break-words"}`}
                        title={r.campaignName || undefined}
                      >
                        {r.campaignName || "n/a"}
                      </td>
                    ) : null}
                    {showCol("market") ? (
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2">
                          {r.market ? <GeoFlag geo={r.market} /> : null}
                          <span>{r.market || "n/a"}</span>
                        </span>
                      </td>
                    ) : null}
                    {showCol("scope") ? <td className="px-3 py-3">{r.scope}</td> : null}
                    {showCol("segment") ? (
                      <td className="px-3 py-3">{r.segment || "n/a"}</td>
                    ) : null}
                    {showCol("touchpoint") ? (
                      <td className="px-3 py-3">{r.touchpoint || "n/a"}</td>
                    ) : null}
                    {showCol("variant") ? (
                      <td className="px-3 py-3">{r.variant || "n/a"}</td>
                    ) : null}
                    {showCol("tracking") ? (
                      <td className="px-3 py-3 max-w-[300px] truncate" title={r.sfmcTracking || undefined}>
                        {r.sfmcTracking || <span className="text-[color:var(--color-text)]/55">n/a</span>}
                      </td>
                    ) : null}
                    {showCol("owner") ? (
                      <td className="px-3 py-3">
                        <span
                          className="inline-flex items-center rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-text)]"
                          title={ownerTitle || undefined}
                        >
                          {ownerLabel || "n/a"}
                        </span>
                      </td>
                    ) : null}
                    {showCol("status") ? (
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            STATUS_COLORS[r.status] ||
                            "bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]"
                          }`}
                        >
                          {r.status || "n/a"}
                        </span>
                      </td>
                    ) : null}
                    {showCol("hours") ? (
                      <td className={`px-3 py-3 text-right ${selectedIds.has(r.id) ? "bg-inherit" : effortCellCls}`}>
                        {formatNumber(r.hoursTotal)}
                      </td>
                    ) : null}
                    {showCol("days") ? (
                      <td className={`px-3 py-3 text-right ${selectedIds.has(r.id) ? "bg-inherit" : effortCellCls}`}>
                        {formatNumber(r.daysTotal)}
                      </td>
                    ) : null}
                    {showCol("budget") ? (
                      <td className={`px-3 py-3 text-right ${selectedIds.has(r.id) ? "bg-inherit" : effortCellCls}`}>
                        {formatNumber(r.budgetValue)} €
                      </td>
                    ) : null}
                    {showCol("jira") ? (
                      <td className="px-3 py-3">
                        {r.jiraTicket ? (
                          <Link
                            href={buildJiraUrl(r.jiraTicket)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--color-surface-2)]/60"
                            target="_blank"
                            title="Open in JIRA"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/icons/ui/jira.png"
                              alt="Open in JIRA"
                              className="h-5 w-auto object-contain opacity-80"
                            />
                          </Link>
                        ) : (
                          <span className="text-[color:var(--color-text)]/55">n/a</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-2 py-3" />
                    </tr>
                  );
                })
              )}
              {!loading && units.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={columnCount}>
                    No data yet. Import a CSV to get started.
                  </td>
                </tr>
              ) : !loading && units.length > 0 && filteredUnits.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[color:var(--color-text)]/60" colSpan={columnCount}>
                    No units match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
            </table>
          </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)]/70 px-3 py-3 text-xs text-[color:var(--color-text)]/75">
          <div>
            {filteredUnits.length > 0 ? (
              <span>
                Showing {startIdx.toLocaleString()}-{endIdx.toLocaleString()} of{" "}
                {filteredUnits.length.toLocaleString()} units
              </span>
            ) : (
              <span>0 units</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[color:var(--color-text)]/60">Units per page</label>
            <select
              className="input h-9 w-20"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost h-9 px-2"
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={page === 0}
            >
              Prev
            </button>
            <span className="text-[color:var(--color-text)]/60">
              Page {page + 1} / {totalPages.toLocaleString()}
            </span>
            <button
              className="btn-ghost h-9 px-2"
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
              disabled={page + 1 >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showColumnPicker ? (
        <ColumnPicker
          columns={columnOptions as any}
          visible={visibleCols}
          defaults={defaultVisible}
          onChange={(next) => setVisibleCols(new Set(next))}
          onClose={() => setShowColumnPicker(false)}
        />
      ) : null}

      {isAdmin && openBulkEdit ? (
        <CrmBulkEditUnitsModal
          clientSlug={clientSlug}
          ids={bulkEditIds}
          ownerOptions={bulkEditOwnerOptions}
          statusOptions={bulkEditStatusOptions}
          onApplied={(patch: CampaignUnitsBulkPatch) => {
            const idSet = new Set(bulkEditIds);
            setUnits((prev) =>
              prev.map((r) =>
                idSet.has(r.id)
                  ? {
                      ...r,
                      sendDate: patch.sendDate ?? r.sendDate,
                      owner: patch.owner ?? r.owner,
                      status: patch.status ?? r.status,
                      sfmcTracking:
                        Object.prototype.hasOwnProperty.call(patch, "sfmcTracking")
                          ? patch.sfmcTracking ?? null
                          : r.sfmcTracking,
                    }
                  : r,
              ),
            );
            setSelectedIds(new Set());
            showSuccess("Email units updated");
          }}
          onClose={() => {
            setOpenBulkEdit(false);
            setBulkEditIds([]);
          }}
        />
      ) : null}

      {isAdmin && confirmDeleteOpen ? (
        <MiniModal
          title="Delete selected email units"
          widthClass="max-w-md"
          onClose={() => {
            if (deleting) return;
            setConfirmDeleteOpen(false);
          }}
          footer={
            <>
              <button className="btn-ghost" type="button" onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn-danger" type="button" onClick={handleConfirmDelete} disabled={deleting || selectedCount === 0}>
                {deleting ? "Deleting..." : "Delete units"}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-[color:var(--color-text)]">
            <p>
              You&apos;re about to permanently delete{" "}
              <strong>{selectedCount.toLocaleString()}</strong> email unit(s).
            </p>
            <p className="text-[color:var(--color-text)]/65">This action can&apos;t be undone.</p>
          </div>
        </MiniModal>
      ) : null}

      {openGenerate ? (
        <CrmGenerateUnitsModal
          clientSlug={clientSlug}
          onClose={() => setOpenGenerate(false)}
        />
      ) : null}
    </div>
  );
}
