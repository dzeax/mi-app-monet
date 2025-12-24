/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type Person = { personId: string; displayName: string };
type Rate = {
  owner: string;
  personId?: string | null;
  dailyRate: number;
  currency?: string;
};

type Props = {
  clientSlug: string;
  onClose: () => void;
};

export default function ManageRatesModal({ clientSlug, onClose }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [ratesByPersonId, setRatesByPersonId] = useState<Record<string, Rate>>({});
  const [orphanRates, setOrphanRates] = useState<Record<string, Rate>>({});
  const [draftRates, setDraftRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [newOwner, setNewOwner] = useState("");
  const [newRate, setNewRate] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const resPeople = await fetch(`/api/crm/people?client=${clientSlug}`);
        const bodyPeople = await resPeople.json().catch(() => null);
        if (resPeople.ok && Array.isArray(bodyPeople?.people) && active) {
          setPeople(
            bodyPeople.people
              .map((p: any) => ({
                personId: String(p.personId ?? ""),
                displayName: String(p.displayName ?? ""),
              }))
              .filter((p: Person) => Boolean(p.personId) && Boolean(p.displayName))
              .sort((a: Person, b: Person) => a.displayName.localeCompare(b.displayName)),
          );
        }

        const resRates = await fetch(`/api/crm/rates?client=${clientSlug}`);
        const bodyRates = await resRates.json().catch(() => null);
        if (!resRates.ok) throw new Error(bodyRates?.error || `Failed to load rates (${resRates.status})`);

        const byPersonId: Record<string, Rate> = {};
        const orphans: Record<string, Rate> = {};
        (bodyRates?.rates as Rate[] | undefined)?.forEach((r) => {
          const personId = typeof r.personId === "string" && r.personId.trim() ? r.personId.trim() : null;
          const owner = String(r.owner ?? "").trim();
          const dailyRate = Number(r.dailyRate ?? 0);
          const entry: Rate = { owner, personId, dailyRate, currency: r.currency };
          if (personId) {
            byPersonId[personId] = entry;
          } else if (owner) {
            orphans[owner] = entry;
          }
        });

        if (active) {
          setRatesByPersonId(byPersonId);
          setOrphanRates(orphans);
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : "Unable to load rates");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [clientSlug]);

  const handleSave = async (key: string, owner: string, rate: number) => {
    setSavingKey(key);
    try {
      const res = await fetch("/api/crm/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, owner, dailyRate: rate, currency: "EUR" }),
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
              owner: saved.owner,
              personId,
              dailyRate: Number(saved.dailyRate ?? 0),
              currency: saved.currency,
            },
          }));
        } else {
          setOrphanRates((prev) => ({
            ...prev,
            [saved.owner]: {
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
    const rows: Array<
      | { key: string; label: string; ownerForSave: string; dailyRate: number }
      | { key: string; label: string; ownerForSave: string; dailyRate: number; isOrphan: true }
    > = [];

    people.forEach((p) => {
      const key = p.personId;
      const existing = ratesByPersonId[p.personId];
      const dailyRate = Number(existing?.dailyRate ?? 0);
      rows.push({
        key,
        label: p.displayName,
        ownerForSave: existing?.owner ?? p.displayName,
        dailyRate,
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
        isOrphan: true,
      });
    });

    return rows;
  })();

  return (
    <MiniModal onClose={onClose} title="Manage rates">
      <div className="space-y-4">
        <p className="text-sm text-[color:var(--color-text)]/80">
          Configura la tarifa diaria (EUR) por owner. Budget = dias totales x tarifa diaria.
        </p>

        <div className="space-y-2">
          {loading ? (
            <div className="text-sm text-[color:var(--color-text)]/70">Loading rates...</div>
          ) : (
            displayRows.map((row) => {
                const dailyRate =
                  draftRates[row.key] != null ? draftRates[row.key] : Number(row.dailyRate ?? 0);
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-[color:var(--color-text)]">{row.label}</div>
                      <div className="text-xs text-[color:var(--color-text)]/60">
                        Actual: {Number(dailyRate).toFixed(2)} EUR / dia
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
                      onClick={() => handleSave(row.key, row.ownerForSave, draftRates[row.key] ?? row.dailyRate ?? 0)}
                    >
                      {savingKey === row.key ? "Saving..." : "Save"}
                    </button>
                  </div>
                );
              })
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-3">
          <div className="text-sm font-semibold text-[color:var(--color-text)]">Agregar owner</div>
          <div className="flex items-center gap-2">
            <input
              className="input h-9 flex-1"
              placeholder="Owner name"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
            />
            <input
              className="input h-9 w-24 text-right"
              type="number"
              step="1"
              min="0"
              placeholder="EUR/dia"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
            />
            <button
              className="btn-primary h-9 px-3"
              disabled={!newOwner.trim()}
              onClick={async () => {
                const owner = newOwner.trim();
                const rate = Number(newRate || "0");
                setSavingKey(owner);
                try {
                  const res = await fetch("/api/crm/rates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      client: clientSlug,
                      owner,
                      dailyRate: rate,
                      currency: "EUR",
                    }),
                  });
                  const body = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
                  setOrphanRates((prev) => ({
                    ...prev,
                    [owner]: { owner, personId: null, dailyRate: rate, currency: "EUR" },
                  }));
                  setDraftRates((prev) => ({ ...prev, [owner]: rate }));
                  setNewOwner("");
                  setNewRate("");
                  showSuccess("Rate saved");
                } catch (err) {
                  showError(err instanceof Error ? err.message : "Save failed");
                } finally {
                  setSavingKey(null);
                }
              }}
            >
              {savingKey === newOwner.trim() ? "Saving..." : "Add"}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </MiniModal>
  );
}
