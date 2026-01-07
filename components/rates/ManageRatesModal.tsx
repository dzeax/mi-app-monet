/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function ManageRatesModal({ clientSlug, onClose }: Props) {
  const currentYear = new Date().getFullYear();
  const [people, setPeople] = useState<Person[]>([]);
  const [ratesByPersonId, setRatesByPersonId] = useState<Record<string, Rate>>({});
  const [orphanRates, setOrphanRates] = useState<Record<string, Rate>>({});
  const [draftRates, setDraftRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
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
      setDraftRates({});
      setLinkTargets({});
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

  const handleSave = async (
    key: string,
    owner: string,
    rate: number,
    personId?: string | null,
  ) => {
    setSavingKey(key);
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
    } catch (err) {
      showError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
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
    setLinkingKey(owner);
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
    } finally {
      setLinkingKey(null);
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
    <MiniModal onClose={onClose} title="Manage rates">
      <div className="space-y-4">
        <p className="text-sm text-[color:var(--color-text)]/80">
          Set the daily rate (EUR) per person. For new people, add them in
          &quot;People &amp; aliases&quot; first.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[color:var(--color-text)]/70">
              Year
            </label>
            <select
              className="input h-9 min-w-[120px]"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
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
          <span className="text-xs text-[color:var(--color-text)]/60">
            Rates apply to {selectedYear}.
          </span>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="text-sm text-[color:var(--color-text)]/70">Loading rates...</div>
          ) : (
            personRows.map((row) => {
              const dailyRate =
                draftRates[row.key] != null ? draftRates[row.key] : Number(row.dailyRate ?? 0);
              return (
                <div
                  key={row.key}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-2"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[color:var(--color-text)]">
                      {row.label}
                    </div>
                    <div className="text-xs text-[color:var(--color-text)]/60">
                      {row.isInactive ? "Inactive" : "Active"}
                      {row.isUnknown ? " - Unlisted person" : ""}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="input h-9 w-24 text-right"
                    value={Number(dailyRate)}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraftRates((prev) => ({ ...prev, [row.key]: val }));
                    }}
                  />
                  <button
                    className="btn-primary h-9 px-3"
                    disabled={savingKey === row.key}
                    onClick={() =>
                      handleSave(
                        row.key,
                        row.ownerForSave,
                        draftRates[row.key] ?? row.dailyRate ?? 0,
                        row.personId,
                      )
                    }
                  >
                    {savingKey === row.key ? "Saving..." : "Save"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {orphanRows.length ? (
          <section className="space-y-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-3">
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
              <div className="space-y-2">
                {orphanRows.map((row) => {
                  const dailyRate =
                    draftRates[row.key] != null ? draftRates[row.key] : Number(row.dailyRate ?? 0);
                  const candidates = linkablePeople();
                  return (
                    <div
                      key={row.key}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2"
                    >
                      <div className="flex-1 min-w-[200px]">
                        <div className="text-sm font-semibold text-[color:var(--color-text)]">
                          {row.label}
                        </div>
                        <div className="text-xs text-[color:var(--color-text)]/60">
                          No person linked
                        </div>
                      </div>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="input h-9 w-24 text-right"
                        value={Number(dailyRate)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setDraftRates((prev) => ({ ...prev, [row.key]: val }));
                        }}
                      />
                      <select
                        className="input h-9 min-w-[200px]"
                        value={linkTargets[row.key] ?? ""}
                        onChange={(e) =>
                          setLinkTargets((prev) => ({ ...prev, [row.key]: e.target.value }))
                        }
                      >
                        <option value="">Link to person...</option>
                        {candidates.map((p) => (
                          <option key={p.personId} value={p.personId}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn-primary h-9 px-3"
                        disabled={!linkTargets[row.key] || linkingKey === row.key}
                        onClick={() => {
                          const target = linkTargets[row.key];
                          if (!target) return;
                          handleLinkOrphan(
                            row.ownerForSave,
                            target,
                            draftRates[row.key] ?? row.dailyRate ?? 0,
                          );
                        }}
                      >
                        {linkingKey === row.key ? "Linking..." : "Link"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="flex justify-end">
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </MiniModal>
  );
}
