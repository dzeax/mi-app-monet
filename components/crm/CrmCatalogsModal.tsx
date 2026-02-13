/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import MiniModal from "@/components/ui/MiniModal";
import { useAuth } from "@/context/AuthContext";
import { showError, showSuccess } from "@/utils/toast";

type Item = { id: string; label: string };
type TabId = "workstreams" | "legacy";
type CatalogKind = "owner" | "type" | "workstream";

const kindLabel: Record<CatalogKind, string> = {
  owner: "Owner",
  type: "Type",
  workstream: "Workstream",
};

const normalize = (value: string) => value.trim().toLowerCase();

const chipClass =
  "inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-text)] shadow-sm";

const chipContainerClass =
  "flex flex-wrap gap-2 p-4 bg-[var(--color-surface-2)]/30 rounded-xl border border-[var(--color-border)]";

const inputGroupClass = "flex w-full items-stretch gap-1";
const inputClass =
  "input relative flex-1 h-10 rounded-lg border-[var(--color-border)] focus:z-10";
const addButtonClass = "btn-primary relative h-10 rounded-lg px-4 focus:z-10";

export default function CrmCatalogsModal({
  clientSlug,
  onClose,
}: {
  clientSlug: string;
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("workstreams");

  const [owners, setOwners] = useState<Item[]>([]);
  const [types, setTypes] = useState<Item[]>([]);
  const [workstreams, setWorkstreams] = useState<Item[]>([]);

  const [newOwner, setNewOwner] = useState("");
  const [newType, setNewType] = useState("");
  const [newWorkstream, setNewWorkstream] = useState("");

  const [loadingWorkstreams, setLoadingWorkstreams] = useState(true);
  const [loadingLegacy, setLoadingLegacy] = useState(false);
  const [legacyLoaded, setLegacyLoaded] = useState(false);

  useEffect(() => {
    if (!isAdmin && activeTab === "legacy") {
      setActiveTab("workstreams");
    }
  }, [activeTab, isAdmin]);

  const appendUnique = useCallback((prev: Item[], nextItem: Item) => {
    const exists = prev.some(
      (item) => normalize(item.label) === normalize(nextItem.label),
    );
    return exists ? prev : [...prev, nextItem];
  }, []);

  const loadWorkstreams = useCallback(async () => {
    setLoadingWorkstreams(true);
    try {
      const res = await fetch(
        `/api/crm/catalogs?client=${clientSlug}&kind=workstream`,
      );
      if (!res.ok) {
        throw new Error("Failed to load workstreams");
      }
      const body = await res.json().catch(() => null);
      const items = Array.isArray(body?.items)
        ? body.items.map((item: any) => ({
            id: String(item.id),
            label: String(item.label),
          }))
        : [];
      setWorkstreams(items);
    } catch {
      setWorkstreams([]);
      showError("Unable to load workstreams");
    } finally {
      setLoadingWorkstreams(false);
    }
  }, [clientSlug]);

  const loadLegacy = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingLegacy(true);
    try {
      const [ownersRes, typesRes] = await Promise.all([
        fetch(`/api/crm/catalogs?client=${clientSlug}&kind=owner`),
        fetch(`/api/crm/catalogs?client=${clientSlug}&kind=type`),
      ]);
      if (!ownersRes.ok || !typesRes.ok) {
        throw new Error("Failed to load legacy catalogs");
      }
      const ownersBody = await ownersRes.json().catch(() => null);
      const typesBody = await typesRes.json().catch(() => null);
      const ownerItems = Array.isArray(ownersBody?.items)
        ? ownersBody.items.map((item: any) => ({
            id: String(item.id),
            label: String(item.label),
          }))
        : [];
      const typeItems = Array.isArray(typesBody?.items)
        ? typesBody.items.map((item: any) => ({
            id: String(item.id),
            label: String(item.label),
          }))
        : [];
      setOwners(ownerItems);
      setTypes(typeItems);
      setLegacyLoaded(true);
    } catch {
      setOwners([]);
      setTypes([]);
      showError("Unable to load legacy catalogs");
    } finally {
      setLoadingLegacy(false);
    }
  }, [clientSlug, isAdmin]);

  useEffect(() => {
    setOwners([]);
    setTypes([]);
    setLegacyLoaded(false);
    void loadWorkstreams();
  }, [clientSlug, loadWorkstreams]);

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab !== "legacy") return;
    if (legacyLoaded) return;
    void loadLegacy();
  }, [activeTab, isAdmin, legacyLoaded, loadLegacy]);

  const addItem = async (kind: CatalogKind, label: string) => {
    const clean = label.trim();
    if (!clean) return;
    if (!isAdmin && kind !== "workstream") return;

    try {
      const res = await fetch("/api/crm/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, kind, label: clean }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          body?.error || `Failed to add ${kindLabel[kind].toLowerCase()}`,
        );
      }
      const item: Item = body?.item
        ? { id: String(body.item.id), label: String(body.item.label) }
        : { id: `tmp-${clean}`, label: clean };

      if (kind === "owner") setOwners((prev) => appendUnique(prev, item));
      else if (kind === "type") setTypes((prev) => appendUnique(prev, item));
      else setWorkstreams((prev) => appendUnique(prev, item));

      showSuccess(`${kindLabel[kind]} added`);
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : `Unable to add ${kindLabel[kind].toLowerCase()}`,
      );
    }
  };

  const removeItem = async (kind: CatalogKind, id: string) => {
    if (!isAdmin) return;
    if (kind === "workstream") {
      const confirmed = window.confirm(
        "Are you sure you want to remove this workstream?",
      );
      if (!confirmed) return;
    }

    if (kind === "owner") setOwners((prev) => prev.filter((item) => item.id !== id));
    else if (kind === "type")
      setTypes((prev) => prev.filter((item) => item.id !== id));
    else setWorkstreams((prev) => prev.filter((item) => item.id !== id));

    if (!id.startsWith("tmp-")) {
      const res = await fetch(`/api/crm/catalogs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => null);
      if (!res || !res.ok) {
        showError(`Unable to remove ${kindLabel[kind].toLowerCase()}`);
        return;
      }
    }
    showSuccess(`${kindLabel[kind]} removed`);
  };

  const tabButtonClass = useCallback(
    (tab: TabId) =>
      [
        "inline-flex items-center rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        activeTab === tab
          ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
          : "text-[var(--color-text)]/70 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]/60",
      ].join(" "),
    [activeTab],
  );

  const workstreamAddDisabled = useMemo(
    () => newWorkstream.trim().length === 0,
    [newWorkstream],
  );
  const ownerAddDisabled = useMemo(() => newOwner.trim().length === 0, [newOwner]);
  const typeAddDisabled = useMemo(() => newType.trim().length === 0, [newType]);

  return (
    <MiniModal
      onClose={onClose}
      title="Manage catalogs (CRM)"
      footer={
        <button className="btn-ghost" type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-surface-2)] p-1">
          <button
            type="button"
            className={tabButtonClass("workstreams")}
            onClick={() => setActiveTab("workstreams")}
          >
            Workstreams
          </button>
          {isAdmin ? (
            <button
              type="button"
              className={tabButtonClass("legacy")}
              onClick={() => setActiveTab("legacy")}
            >
              Legacy Data
            </button>
          ) : null}
        </div>

        {activeTab === "workstreams" ? (
          <section className="space-y-3">
            {loadingWorkstreams ? (
              <span className="text-xs text-[color:var(--color-text)]/60">Loading...</span>
            ) : null}

            <div className={inputGroupClass}>
              <input
                className={inputClass}
                placeholder="Type new workstream name..."
                value={newWorkstream}
                onChange={(event) => setNewWorkstream(event.target.value)}
              />
              <button
                className={addButtonClass}
                type="button"
                disabled={workstreamAddDisabled}
                onClick={() => {
                  const label = newWorkstream.trim();
                  setNewWorkstream("");
                  void addItem("workstream", label);
                }}
              >
                Add
              </button>
            </div>

            <div className={chipContainerClass}>
              {workstreams.length === 0 ? (
                <span className="text-sm text-[color:var(--color-text)]/60">No items found.</span>
              ) : (
                workstreams.map((item) => (
                  <span key={item.id} className={chipClass}>
                    <span>{item.label}</span>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--color-text)]/45 transition hover:bg-rose-50 hover:text-rose-500"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => void removeItem("workstream", item.id)}
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </span>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "legacy" && isAdmin ? (
          <section className="space-y-4">
            <p className="text-xs text-[color:var(--color-text)]/65">
              Owners and Types are legacy fallbacks. People and JIRA drive these fields.
            </p>
            {loadingLegacy ? (
              <div className="text-sm text-[color:var(--color-text)]/70">Loading...</div>
            ) : null}

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-[color:var(--color-text)]">Owners</h4>
              <div className={inputGroupClass}>
                <input
                  className={inputClass}
                  placeholder="Type new owner name..."
                  value={newOwner}
                  onChange={(event) => setNewOwner(event.target.value)}
                />
                <button
                  className={addButtonClass}
                  type="button"
                  disabled={ownerAddDisabled}
                  onClick={() => {
                    const label = newOwner.trim();
                    setNewOwner("");
                    void addItem("owner", label);
                  }}
                >
                  Add
                </button>
              </div>
              <div className={chipContainerClass}>
                {owners.length === 0 ? (
                  <span className="text-sm text-[color:var(--color-text)]/60">No items found.</span>
                ) : (
                  owners.map((item) => (
                    <span key={item.id} className={chipClass}>
                      <span>{item.label}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--color-text)]/45 transition hover:bg-rose-50 hover:text-rose-500"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => void removeItem("owner", item.id)}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-[color:var(--color-text)]">Types</h4>
              <div className={inputGroupClass}>
                <input
                  className={inputClass}
                  placeholder="Type new type name..."
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                />
                <button
                  className={addButtonClass}
                  type="button"
                  disabled={typeAddDisabled}
                  onClick={() => {
                    const label = newType.trim();
                    setNewType("");
                    void addItem("type", label);
                  }}
                >
                  Add
                </button>
              </div>
              <div className={chipContainerClass}>
                {types.length === 0 ? (
                  <span className="text-sm text-[color:var(--color-text)]/60">No items found.</span>
                ) : (
                  types.map((item) => (
                    <span key={item.id} className={chipClass}>
                      <span>{item.label}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--color-text)]/45 transition hover:bg-rose-50 hover:text-rose-500"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => void removeItem("type", item.id)}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </section>
          </section>
        ) : null}

      </div>
    </MiniModal>
  );
}
