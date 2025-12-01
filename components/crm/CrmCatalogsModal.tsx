"use client";

import { useEffect, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type Item = { id: string; label: string };

export default function CrmCatalogsModal({ clientSlug, onClose }: { clientSlug: string; onClose: () => void }) {
  const [owners, setOwners] = useState<Item[]>([]);
  const [types, setTypes] = useState<Item[]>([]);
  const [newOwner, setNewOwner] = useState("");
  const [newType, setNewType] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const resOwners = await fetch(`/api/crm/catalogs?client=${clientSlug}&kind=owner`);
        const resTypes = await fetch(`/api/crm/catalogs?client=${clientSlug}&kind=type`);
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
  }, [clientSlug]);

  const addItem = async (kind: "owner" | "type", label: string) => {
    try {
      const res = await fetch("/api/crm/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, kind, label }),
      });
      const body = await res.json().catch(() => null);
      const item = body?.item ?? { id: `tmp-${label}`, label };
      if (kind === "owner") setOwners((prev) => [...prev, item]);
      else setTypes((prev) => [...prev, item]);
      showSuccess(`${kind === "owner" ? "Owner" : "Type"} added`);
    } catch {
      const item = { id: `tmp-${label}`, label };
      if (kind === "owner") setOwners((prev) => [...prev, item]);
      else setTypes((prev) => [...prev, item]);
      showSuccess(`${kind === "owner" ? "Owner" : "Type"} added`);
    }
  };

  const removeItem = async (kind: "owner" | "type", id: string) => {
    if (kind === "owner") setOwners((prev) => prev.filter((i) => i.id !== id));
    else setTypes((prev) => prev.filter((i) => i.id !== id));
    if (!id.startsWith("tmp-")) {
      await fetch(`/api/crm/catalogs?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    showSuccess(`${kind === "owner" ? "Owner" : "Type"} removed`);
  };

  return (
    <MiniModal onClose={onClose} title="Manage catalogs (CRM)">
      <div className="space-y-4">
        {loading ? <div className="text-sm text-[color:var(--color-text)]/70">Loading...</div> : null}

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

        <div className="flex justify-end">
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </MiniModal>
  );
}
