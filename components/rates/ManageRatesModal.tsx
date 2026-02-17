/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type Person = { personId: string; displayName: string; isActive: boolean; aliases: string[] };
type Rate = {
  id?: string;
  owner: string;
  personId?: string | null;
  dailyRate: number;
  currency?: string;
  year?: number;
};

type PersonRow = {
  key: string;
  label: string;
  ownerForSave: string;
  dailyRate: number;
  personId: string;
  isInactive?: boolean;
  isUnknown?: boolean;
};

type OrphanRow = {
  key: string;
  label: string;
  ownerForSave: string;
  dailyRate: number;
  personId: null;
  isOrphan: true;
  currency?: string;
};

type DisplayRow = PersonRow | OrphanRow;

type Props = {
  clientSlug: string;
  onClose: () => void;
};

type RateRowProps = {
  label: string;
  initialRate: number;
  personId: string;
  isInactive: boolean;
  onSave: (nextRate: number) => Promise<void>;
};

type OrphanRateRowProps = {
  row: OrphanRow;
  candidates: Person[];
  onLink: (owner: string, personId: string, rate: number) => Promise<void>;
};

const getInitials = (label: string) => {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

function RateRow({ label, initialRate, personId, isInactive, onSave }: RateRowProps) {
  const [value, setValue] = useState<number>(Number(initialRate ?? 0));
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  useEffect(() => {
    setValue(Number(initialRate ?? 0));
  }, [initialRate]);

  useEffect(() => {
    if (status !== "success") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleCommit = async () => {
    const nextValue = Number.isFinite(value) ? value : 0;
    if (Number(nextValue) === Number(initialRate ?? 0)) return;
    setStatus("saving");
    try {
      await onSave(nextValue);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_160px_40px] items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 hover:bg-[var(--color-surface-2)]/60">
      <div className={`flex items-center gap-3 ${isInactive ? "opacity-60" : ""}`}>
        <span className="user-button__avatar">
          <span className="user-button__initials">{getInitials(label)}</span>
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[color:var(--color-text)]">{label}</div>
          {isInactive ? <span className="badge-field mt-1 inline-flex">INACTIVE</span> : null}
        </div>
      </div>
      <div>
        <div className="relative w-full">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--color-text)]/50">
            €
          </span>
          <input
            type="number"
            step="1"
            min="0"
            className="input h-9 w-full pl-8 text-right"
            value={Number.isFinite(value) ? value : 0}
            onChange={(e) => setValue(Number(e.target.value))}
            onBlur={handleCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCommit();
              }
            }}
            data-person-id={personId}
          />
        </div>
      </div>
      <div className="flex items-center justify-center">
        {status === "saving" ? (
          <div className="spinner-dot text-[var(--color-primary)]" />
        ) : status === "success" ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : status === "error" ? (
          <span className="text-xs font-semibold text-red-500">!</span>
        ) : null}
      </div>
    </div>
  );
}

function OrphanRateRow({ row, candidates, onLink }: OrphanRateRowProps) {
  const [rate, setRate] = useState(Number(row.dailyRate ?? 0));
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<"idle" | "linking" | "error">("idle");

  useEffect(() => {
    setRate(Number(row.dailyRate ?? 0));
  }, [row.dailyRate]);

  const handleLink = async () => {
    if (!target) return;
    setStatus("linking");
    try {
      await onLink(row.ownerForSave, target, Number(rate ?? 0));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="grid gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 md:grid-cols-[1.2fr_140px_1fr_auto] md:items-center">
      <div>
        <div className="text-sm font-semibold text-[color:var(--color-text)]">{row.label}</div>
        <div className="text-xs text-[color:var(--color-text)]/60">No person linked</div>
      </div>
      <div className="relative w-full">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--color-text)]/50">
          €
        </span>
        <input
          type="number"
          step="1"
          min="0"
          className="input h-9 w-full pl-8 text-right"
          value={Number.isFinite(rate) ? rate : 0}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </div>
      <select
        className="input h-9 w-full"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">Link to person...</option>
        {candidates.map((p) => (
          <option key={p.personId} value={p.personId}>
            {p.displayName}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button
          className="btn-primary h-9 px-3"
          disabled={!target || status === "linking"}
          onClick={handleLink}
        >
          {status === "linking" ? "Linking..." : "Link"}
        </button>
        {status === "error" ? <span className="text-xs text-red-500">Failed</span> : null}
      </div>
    </div>
  );
}

export default function ManageRatesModal({ clientSlug, onClose }: Props) {
  const currentYear = new Date().getFullYear();
  const [people, setPeople] = useState<Person[]>([]);
  const [ratesByPersonId, setRatesByPersonId] = useState<Record<string, Rate>>({});
  const [orphanRates, setOrphanRates] = useState<Record<string, Rate>>({});
  const [loading, setLoading] = useState(true);
  const [showLegacy, setShowLegacy] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [ratesReloadToken, setRatesReloadToken] = useState(0);
  const [copying, setCopying] = useState(false);

  const yearOptions = useMemo(() => {
    const set = new Set<number>([selectedYear, currentYear, ...availableYears]);
    return Array.from(set)
      .filter((year) => Number.isFinite(year) && year > 1900)
      .sort((a, b) => b - a);
  }, [availableYears, currentYear, selectedYear]);

  const previousYear = useMemo(() => {
    const candidates = availableYears.filter((year) => year < selectedYear);
    candidates.sort((a, b) => b - a);
    return candidates.length > 0 ? candidates[0] : null;
  }, [availableYears, selectedYear]);

  useEffect(() => {
    let active = true;
    const loadPeople = async () => {
      try {
        const resPeople = await fetch(`/api/crm/people?client=${clientSlug}&includeInactive=1`);
        const bodyPeople = await resPeople.json().catch(() => null);
        if (resPeople.ok && Array.isArray(bodyPeople?.people) && active) {
          setPeople(
            bodyPeople.people
              .map((p: any) => ({
                personId: String(p.personId ?? ""),
                displayName: String(p.displayName ?? ""),
                isActive: p.isActive !== false,
                aliases: Array.isArray(p.aliases)
                  ? p.aliases.map((alias: any) => String(alias ?? "").trim()).filter(Boolean)
                  : [],
              }))
              .filter((p: Person) => Boolean(p.personId) && Boolean(p.displayName))
              .sort((a: Person, b: Person) => a.displayName.localeCompare(b.displayName)),
          );
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : "Unable to load people");
      }
    };
    void loadPeople();
    return () => {
      active = false;
    };
  }, [clientSlug]);

  useEffect(() => {
    let active = true;
    const loadRates = async () => {
      setLoading(true);
      setShowLegacy(false);
      setRatesByPersonId({});
      setOrphanRates({});
      try {
        const resRates = await fetch(
          `/api/crm/rates?client=${clientSlug}&year=${selectedYear}&listYears=1`,
        );
        const bodyRates = await resRates.json().catch(() => null);
        if (!resRates.ok) {
          throw new Error(bodyRates?.error || `Failed to load rates (${resRates.status})`);
        }

        const byPersonId: Record<string, Rate> = {};
        const orphans: Record<string, Rate> = {};
        (bodyRates?.rates as Rate[] | undefined)?.forEach((r) => {
          const personId = typeof r.personId === "string" && r.personId.trim() ? r.personId.trim() : null;
          const owner = String(r.owner ?? "").trim();
          const dailyRate = Number(r.dailyRate ?? 0);
          const entry: Rate = {
            id: r.id,
            owner,
            personId,
            dailyRate,
            currency: r.currency,
            year: r.year,
          };
          if (personId) {
            byPersonId[personId] = entry;
          } else if (owner) {
            orphans[owner] = entry;
          }
        });

        const years = Array.isArray(bodyRates?.years)
          ? (bodyRates.years as number[])
              .map((year) => Number(year))
              .filter((year) => Number.isFinite(year) && year > 1900)
          : [];

        if (active) {
          setRatesByPersonId(byPersonId);
          setOrphanRates(orphans);
          setAvailableYears(years);
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : "Unable to load rates");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadRates();
    return () => {
      active = false;
    };
  }, [clientSlug, selectedYear, ratesReloadToken]);

  const handleSave = async (owner: string, rate: number, personId?: string | null) => {
    try {
      const res = await fetch("/api/crm/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: clientSlug,
          owner,
          dailyRate: rate,
          currency: "EUR",
          personId: personId ?? null,
          year: selectedYear,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);

      const saved = body?.rate as Rate | undefined;
      if (saved && typeof saved.owner === "string") {
        const personId =
          typeof saved.personId === "string" && saved.personId.trim() ? saved.personId.trim() : null;
        if (personId) {
          setRatesByPersonId((prev) => ({
            ...prev,
            [personId]: {
              id: saved.id,
              owner: saved.owner,
              personId,
              dailyRate: Number(saved.dailyRate ?? 0),
              currency: saved.currency,
            },
          }));
          setOrphanRates((prev) => {
            if (!prev[saved.owner]) return prev;
            const next = { ...prev };
            delete next[saved.owner];
            return next;
          });
        } else {
          setOrphanRates((prev) => ({
            ...prev,
            [saved.owner]: {
              id: saved.id,
              owner: saved.owner,
              personId: null,
              dailyRate: Number(saved.dailyRate ?? 0),
              currency: saved.currency,
            },
          }));
        }
      }
      showSuccess("Rate saved");
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : "Save failed");
      throw err;
    } finally {
    }
  };

  const displayRows = (() => {
    const seen = new Set<string>();
    const rows: DisplayRow[] = [];

    people.forEach((p) => {
      const key = p.personId;
      const existing = ratesByPersonId[p.personId];
      const dailyRate = Number(existing?.dailyRate ?? 0);
      rows.push({
        key,
        label: p.displayName,
        ownerForSave: existing?.owner ?? p.displayName,
        dailyRate,
        personId: p.personId,
        isInactive: !p.isActive,
      });
      seen.add(p.personId);
    });

    Object.values(ratesByPersonId).forEach((r) => {
      const personId = typeof r.personId === "string" && r.personId.trim() ? r.personId.trim() : null;
      if (!personId) return;
      if (seen.has(personId)) return;
      seen.add(personId);
      rows.push({
        key: personId,
        label: r.owner,
        ownerForSave: r.owner,
        dailyRate: Number(r.dailyRate ?? 0),
        personId,
        isUnknown: true,
      });
    });

    Object.values(orphanRates).forEach((r) => {
      if (!r.owner) return;
      if (seen.has(r.owner)) return;
      seen.add(r.owner);
      rows.push({
        key: r.owner,
        label: r.owner,
        ownerForSave: r.owner,
        dailyRate: Number(r.dailyRate ?? 0),
        personId: null,
        isOrphan: true,
        currency: r.currency,
      });
    });

    return rows;
  })();

  const isOrphanRow = (row: DisplayRow): row is OrphanRow =>
    "isOrphan" in row && row.isOrphan;
  const orphanRows = displayRows.filter(isOrphanRow);
  const personRows = displayRows.filter((row): row is PersonRow => !("isOrphan" in row));

  const linkablePeople = () => people.filter((p) => !ratesByPersonId[p.personId]);

  const handleLinkOrphan = async (owner: string, personId: string, rate: number) => {
    try {
      const resAlias = await fetch("/api/crm/people/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, personId, alias: owner }),
      });
      if (!resAlias.ok) {
        const body = await resAlias.json().catch(() => null);
        throw new Error(body?.error || "Alias insert failed");
      }

      const resRate = await fetch("/api/crm/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: clientSlug,
          owner,
          dailyRate: rate,
          currency: "EUR",
          personId,
          year: selectedYear,
        }),
      });
      const body = await resRate.json().catch(() => null);
      if (!resRate.ok) throw new Error(body?.error || `Failed (${resRate.status})`);

      const saved = body?.rate as Rate | undefined;
      if (saved && saved.personId) {
        setOrphanRates((prev) => {
          const next = { ...prev };
          delete next[owner];
          return next;
        });
        setRatesByPersonId((prev) => ({
          ...prev,
          [saved.personId as string]: {
            id: saved.id,
            owner: saved.owner,
            personId: saved.personId,
            dailyRate: Number(saved.dailyRate ?? 0),
            currency: saved.currency,
          },
        }));
        showSuccess("Orphan rate linked");
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Link failed");
      throw err;
    } finally {
    }
  };

  const handleCopyRates = async () => {
    if (!previousYear || copying) return;
    setCopying(true);
    try {
      const res = await fetch("/api/crm/rates/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: clientSlug,
          fromYear: previousYear,
          toYear: selectedYear,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      const copied = Number(body?.copied ?? 0);
      if (copied > 0) {
        showSuccess(
          `Copied ${copied} rate${copied === 1 ? "" : "s"} from ${previousYear}.`,
        );
      } else {
        showSuccess("No rates copied.");
      }
      setRatesReloadToken((prev) => prev + 1);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setCopying(false);
    }
  };

  return (
    <MiniModal
      onClose={onClose}
      title="Manage rates"
      widthClass="max-w-xl"
      bodyClassName="modal-body px-0 py-0"
      footer={
        <button className="btn-primary" type="button" onClick={onClose}>
          Close
        </button>
      }
      footerClassName="bg-[#101828] border-t border-white/10"
    >
      <div className="min-h-full flex flex-col">
        <div className="px-4 py-4">
          <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            <div className="sticky top-0 z-30 border-b border-[color:var(--color-border)] bg-[var(--color-surface)]">
              <div className="px-4 pt-4 pb-3">
                <p className="text-sm text-[color:var(--color-text)]/80">
                  Set the daily rate (EUR) per person. For new people, add them in
                  &quot;People &amp; aliases&quot; first.
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text)]/60">
                  Changes are saved automatically on blur.
                </p>
              </div>

              <div className="px-4 pb-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                      Year
                    </label>
                    <select
                      className="input h-9 min-w-[120px] bg-[color:var(--color-surface-2)]"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-[color:var(--color-text)]/55">
                      Applies to {selectedYear}
                    </span>
                  </div>
                  <button
                    className="btn-ghost h-9 px-3 text-xs"
                    type="button"
                    disabled={!previousYear || copying}
                    onClick={handleCopyRates}
                    title={
                      previousYear
                        ? `Copy missing rates from ${previousYear}`
                        : "No previous year rates found"
                    }
                  >
                    {copying
                      ? "Copying..."
                      : previousYear
                        ? `Copy from ${previousYear}`
                        : "Copy from previous year"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_160px_40px] gap-4 px-4 pb-2 text-xs font-semibold uppercase text-[color:var(--color-muted)]">
                <div>Team Member</div>
                <div className="text-right">Daily Rate</div>
                <div></div>
              </div>
            </div>

            {loading ? (
              <div className="px-4 py-6 text-sm text-[color:var(--color-text)]/70">
                Loading rates...
              </div>
            ) : (
              personRows.map((row) => (
                <RateRow
                  key={row.key}
                  label={row.label}
                  initialRate={Number(row.dailyRate ?? 0)}
                  personId={row.personId}
                  isInactive={Boolean(row.isInactive)}
                  onSave={async (nextRate) => {
                    await handleSave(row.ownerForSave, nextRate, row.personId);
                  }}
                />
              ))
            )}
          </div>

          {orphanRows.length ? (
            <section className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--color-text)]">
                    Legacy/orphan rates ({orphanRows.length})
                  </div>
                  <div className="text-xs text-[color:var(--color-text)]/60">
                    Link these rates to a person to avoid duplicates.
                  </div>
                </div>
                <button
                  className="btn-ghost h-8 px-3 text-xs"
                  type="button"
                  aria-pressed={showLegacy}
                  onClick={() => setShowLegacy((prev) => !prev)}
                >
                  {showLegacy ? "Hide" : "Show"}
                </button>
              </div>

              {showLegacy ? (
                <div className="space-y-3">
                  {orphanRows.map((row) => (
                    <OrphanRateRow
                      key={row.key}
                      row={row}
                      candidates={linkablePeople()}
                      onLink={handleLinkOrphan}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </MiniModal>
  );
}
