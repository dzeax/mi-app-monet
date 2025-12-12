/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type Rate = { owner: string; dailyRate: number; currency?: string };

type Props = {
  clientSlug: string;
  onClose: () => void;
};

export default function ManageRatesModal({ clientSlug, onClose }: Props) {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [catalogOwners, setCatalogOwners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOwner, setSavingOwner] = useState<string | null>(null);
  const [newOwner, setNewOwner] = useState("");
  const [newRate, setNewRate] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const resRates = await fetch(`/api/crm/rates?client=${clientSlug}`);
        const bodyRates = await resRates.json().catch(() => null);
        if (!resRates.ok) throw new Error(bodyRates?.error || `Failed to load rates (${resRates.status})`);
        const loaded: Record<string, number> = {};
        (bodyRates?.rates as Rate[] | undefined)?.forEach((r) => {
          loaded[r.owner] = Number(r.dailyRate ?? 0);
        });
        if (active) setRates(loaded);

        const resOwners = await fetch(`/api/crm/catalogs?client=${clientSlug}&kind=owner`);
        const bodyOwners = await resOwners.json().catch(() => null);
        if (resOwners.ok && Array.isArray(bodyOwners?.items) && active) {
          setCatalogOwners(bodyOwners.items.map((i: any) => i.label as string));
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

  const handleSave = async (owner: string, rate: number) => {
    setSavingOwner(owner);
    try {
      const res = await fetch("/api/crm/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, owner, dailyRate: rate, currency: "EUR" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      showSuccess("Rate saved");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingOwner(null);
    }
  };

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
            Array.from(new Set([...catalogOwners, ...Object.keys(rates)]))
              .sort((a, b) => a.localeCompare(b))
              .map((owner) => {
                const dailyRate = rates[owner] ?? 0;
                return (
                  <div
                    key={owner}
                    className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-[color:var(--color-text)]">{owner}</div>
                      <div className="text-xs text-[color:var(--color-text)]/60">
                        Actual: {Number(dailyRate).toFixed(2)} EUR / dia
                      </div>
                    </div>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="input h-9 w-24 text-right"
                      defaultValue={Number(dailyRate)}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRates((prev) => ({ ...prev, [owner]: val }));
                      }}
                    />
                    <button
                      className="btn-primary h-9 px-3"
                      disabled={savingOwner === owner}
                      onClick={() => handleSave(owner, rates[owner] ?? 0)}
                    >
                      {savingOwner === owner ? "Saving..." : "Save"}
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
                setSavingOwner(owner);
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
                  setRates((prev) => ({ ...prev, [owner]: rate }));
                  setNewOwner("");
                  setNewRate("");
                  showSuccess("Rate saved");
                } catch (err) {
                  showError(err instanceof Error ? err.message : "Save failed");
                } finally {
                  setSavingOwner(null);
                }
              }}
            >
              {savingOwner === newOwner.trim() ? "Saving..." : "Add"}
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
