/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showSuccess } from "@/utils/toast";
import { useAuth } from "@/context/AuthContext";

type Item = { id: string; label: string };

export default function CrmCatalogsModal({ clientSlug, onClose }: { clientSlug: string; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const [owners, setOwners] = useState<Item[]>([]);
  const [types, setTypes] = useState<Item[]>([]);
  const [workstreams, setWorkstreams] = useState<Item[]>([]);
  const [newOwner, setNewOwner] = useState("");
  const [newType, setNewType] = useState("");
  const [newWorkstream, setNewWorkstream] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const resWorkstreams = await fetch(
          `/api/crm/catalogs?client=${clientSlug}&kind=workstream`,
        );
        if (resWorkstreams.ok) {
          const body = await resWorkstreams.json().catch(() => null);
          if (active && Array.isArray(body?.items)) {
            setWorkstreams(body.items.map((i: any) => ({ id: i.id, label: i.label })));
          }
        }

        if (isAdmin && showLegacy) {
          const resOwners = await fetch(
            `/api/crm/catalogs?client=${clientSlug}&kind=owner`,
          );
          const resTypes = await fetch(
            `/api/crm/catalogs?client=${clientSlug}&kind=type`,
          );
          if (resOwners.ok) {
            const body = await resOwners.json().catch(() => null);
            if (active && Array.isArray(body?.items)) {
              setOwners(body.items.map((i: any) => ({ id: i.id, label: i.label })));
            }
          }
          if (resTypes.ok) {
            const body = await resTypes.json().catch(() => null);
            if (active && Array.isArray(body?.items)) {
              setTypes(body.items.map((i: any) => ({ id: i.id, label: i.label })));
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [clientSlug, isAdmin, showLegacy]);

  const addItem = async (kind: "owner" | "type" | "workstream", label: string) => {
    const labelName = kind === "owner" ? "Owner" : kind === "type" ? "Type" : "Workstream";
    try {
      const res = await fetch("/api/crm/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, kind, label }),
      });
      const body = await res.json().catch(() => null);
      const item = body?.item ?? { id: `tmp-${label}`, label };
      if (kind === "owner") setOwners((prev) => [...prev, item]);
      else if (kind === "type") setTypes((prev) => [...prev, item]);
      else setWorkstreams((prev) => [...prev, item]);
      showSuccess(`${labelName} added`);
    } catch {
      const item = { id: `tmp-${label}`, label };
      if (kind === "owner") setOwners((prev) => [...prev, item]);
      else if (kind === "type") setTypes((prev) => [...prev, item]);
      else setWorkstreams((prev) => [...prev, item]);
      showSuccess(`${labelName} added`);
    }
  };

  const removeItem = async (kind: "owner" | "type" | "workstream", id: string) => {
    const labelName = kind === "owner" ? "Owner" : kind === "type" ? "Type" : "Workstream";
    if (kind === "owner") setOwners((prev) => prev.filter((i) => i.id !== id));
    else if (kind === "type") setTypes((prev) => prev.filter((i) => i.id !== id));
    else setWorkstreams((prev) => prev.filter((i) => i.id !== id));
    if (!id.startsWith("tmp-")) {
      await fetch(`/api/crm/catalogs?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    showSuccess(`${labelName} removed`);
  };

  return (
    <MiniModal onClose={onClose} title="Manage catalogs (CRM)">
      <div className="space-y-4">
        {loading ? <div className="text-sm text-[color:var(--color-text)]/70">Loading...</div> : null}

        {isAdmin ? (
          <section className="space-y-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--color-text)]">Legacy catalogs</div>
                <div className="text-xs text-[color:var(--color-text)]/60">
                  Owners and Types are legacy fallbacks. People and JIRA drive these fields.
                </div>
              </div>
              <button
                className="btn-ghost h-9 px-3"
                type="button"
                aria-pressed={showLegacy}
                onClick={() => setShowLegacy((prev) => !prev)}
              >
                {showLegacy ? "Hide" : "Show"}
              </button>
            </div>
          </section>
        ) : null}

        {showLegacy ? (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[color:var(--color-text)]">Owners</h4>
                <div className="flex gap-2">
                  <input
                    className="input h-9"
                    placeholder="Add owner"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={!newOwner.trim()}
                    onClick={() => {
                      const label = newOwner.trim();
                      setNewOwner("");
                      void addItem("owner", label);
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
              <ul className="space-y-1">
                {owners.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-2 text-sm"
                  >
                    <span>{o.label}</span>
                    <button
                      className="text-[color:var(--color-accent)] text-xs"
                      onClick={() => void removeItem("owner", o.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[color:var(--color-text)]">Types (parent)</h4>
                <div className="flex gap-2">
                  <input
                    className="input h-9"
                    placeholder="Add type"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={!newType.trim()}
                    onClick={() => {
                      const label = newType.trim();
                      setNewType("");
                      void addItem("type", label);
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
              <ul className="space-y-1">
                {types.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-2 text-sm"
                  >
                    <span>{t.label}</span>
                    <button
                      className="text-[color:var(--color-accent)] text-xs"
                      onClick={() => void removeItem("type", t.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[color:var(--color-text)]">Workstreams</h4>
            <div className="flex gap-2">
              <input
                className="input h-9"
                placeholder="Add workstream"
                value={newWorkstream}
                onChange={(e) => setNewWorkstream(e.target.value)}
              />
              <button
                className="btn-primary"
                type="button"
                disabled={!newWorkstream.trim()}
                onClick={() => {
                  const label = newWorkstream.trim();
                  setNewWorkstream("");
                  void addItem("workstream", label);
                }}
              >
                Add
              </button>
            </div>
          </div>
          <ul className="space-y-1">
            {workstreams.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-2 text-sm"
              >
                <span>{w.label}</span>
                <button
                  className="text-[color:var(--color-accent)] text-xs"
                  onClick={() => void removeItem("workstream", w.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex justify-end">
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </MiniModal>
  );
}
