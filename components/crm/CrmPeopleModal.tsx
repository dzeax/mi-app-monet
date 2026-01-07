/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";
import { useAuth } from "@/context/AuthContext";

type Person = {
  personId: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  aliases: string[];
};

type Props = {
  clientSlug: string;
  onClose: () => void;
};

export default function CrmPeopleModal({ clientSlug, onClose }: Props) {
  const { isAdmin, isEditor } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [savingPerson, setSavingPerson] = useState(false);
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [aliasSaving, setAliasSaving] = useState<Record<string, boolean>>({});
  const [toggleSaving, setToggleSaving] = useState<Record<string, boolean>>({});
  const [aliasRemoving, setAliasRemoving] = useState<Record<string, boolean>>({});

  const loadPeople = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/people?client=${clientSlug}&includeInactive=1`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      const rows = Array.isArray(body?.people) ? body.people : [];
      const list = rows
        .map((p: any) => ({
          personId: String(p.personId ?? ""),
          displayName: String(p.displayName ?? "").trim(),
          email: p.email ? String(p.email).trim() : null,
          isActive: p.isActive !== false,
          aliases: Array.isArray(p.aliases)
            ? p.aliases.map((a: any) => String(a ?? "").trim()).filter(Boolean)
            : [],
        }))
        .filter((p: Person) => Boolean(p.personId) && Boolean(p.displayName))
        .sort((a: Person, b: Person) => a.displayName.localeCompare(b.displayName));
      setPeople(list);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to load people");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPeople();
  }, [clientSlug]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      if (p.displayName.toLowerCase().includes(q)) return true;
      if (p.email && p.email.toLowerCase().includes(q)) return true;
      return p.aliases.some((a) => a.toLowerCase().includes(q));
    });
  }, [people, search]);

  const handleAddPerson = async () => {
    const displayName = newName.trim();
    if (!displayName) return;
    setSavingPerson(true);
    try {
      const res = await fetch("/api/crm/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: clientSlug,
          displayName,
          email: newEmail.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      if (body?.person) {
        setPeople((prev) =>
          [...prev, body.person].sort((a, b) => a.displayName.localeCompare(b.displayName)),
        );
      }
      setNewName("");
      setNewEmail("");
      showSuccess("Person added");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to add person");
    } finally {
      setSavingPerson(false);
    }
  };

  const handleToggleActive = async (personId: string, nextActive: boolean) => {
    setToggleSaving((prev) => ({ ...prev, [personId]: true }));
    try {
      const res = await fetch("/api/crm/people", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, personId, isActive: nextActive }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      if (body?.person) {
        setPeople((prev) =>
          prev.map((p) => (p.personId === personId ? { ...p, ...body.person } : p)),
        );
      }
      showSuccess(nextActive ? "Person activated" : "Person deactivated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setToggleSaving((prev) => ({ ...prev, [personId]: false }));
    }
  };

  const handleAddAlias = async (personId: string) => {
    const alias = (aliasDrafts[personId] ?? "").trim();
    if (!alias) return;
    setAliasSaving((prev) => ({ ...prev, [personId]: true }));
    try {
      const res = await fetch("/api/crm/people/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, personId, alias }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      const aliasKey = alias.toLowerCase();
      setPeople((prev) =>
        prev.map((p) => {
          if (p.personId !== personId) return p;
          const hasAlias = p.aliases.some((a) => a.toLowerCase() === aliasKey);
          return hasAlias ? p : { ...p, aliases: [...p.aliases, alias].sort() };
        }),
      );
      setAliasDrafts((prev) => ({ ...prev, [personId]: "" }));
      showSuccess(body?.existed ? "Alias already exists" : "Alias added");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to add alias");
    } finally {
      setAliasSaving((prev) => ({ ...prev, [personId]: false }));
    }
  };

  const handleRemoveAlias = async (personId: string, alias: string) => {
    if (!isAdmin) return;
    setAliasRemoving((prev) => ({ ...prev, [`${personId}:${alias}`]: true }));
    try {
      const res = await fetch(
        `/api/crm/people/aliases?client=${clientSlug}&personId=${encodeURIComponent(
          personId,
        )}&alias=${encodeURIComponent(alias)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setPeople((prev) =>
        prev.map((p) =>
          p.personId === personId
            ? { ...p, aliases: p.aliases.filter((a) => a !== alias) }
            : p,
        ),
      );
      showSuccess("Alias removed");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to remove alias");
    } finally {
      setAliasRemoving((prev) => ({ ...prev, [`${personId}:${alias}`]: false }));
    }
  };

  return (
    <MiniModal onClose={onClose} title="People & aliases">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-[color:var(--color-text)]/60">Add person</label>
            <input
              className="input h-9 w-full"
              placeholder="Display name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={!isEditor}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-[color:var(--color-text)]/60">Email (optional)</label>
            <input
              className="input h-9 w-full"
              placeholder="name@email.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={!isEditor}
            />
          </div>
          <button
            className="btn-primary h-9 px-3"
            type="button"
            disabled={!isEditor || !newName.trim() || savingPerson}
            onClick={handleAddPerson}
          >
            {savingPerson ? "Saving..." : "Add"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            className="input h-9 flex-1"
            placeholder="Search people or aliases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-ghost h-9 px-3" type="button" onClick={() => setSearch("")}>
            Clear
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-[color:var(--color-text)]/70">Loading people...</div>
        ) : (
          <div className="space-y-3">
            {filteredPeople.map((person) => {
              const primaryAlias = person.displayName.trim().toLowerCase();
              return (
                <div
                  key={person.personId}
                  className="space-y-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--color-text)]">
                        {person.displayName}
                      </div>
                      {person.email ? (
                        <div className="text-xs text-[color:var(--color-text)]/60">{person.email}</div>
                      ) : null}
                    </div>
                    <button
                      className="btn-ghost h-8 px-3 text-xs"
                      type="button"
                      disabled={!isEditor || toggleSaving[person.personId]}
                      onClick={() => handleToggleActive(person.personId, !person.isActive)}
                    >
                      {toggleSaving[person.personId]
                        ? "Updating..."
                        : person.isActive
                          ? "Active"
                          : "Inactive"}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {person.aliases.map((alias) => {
                      const isPrimary = alias.trim().toLowerCase() === primaryAlias;
                      const key = `${person.personId}:${alias}`;
                      return (
                        <span
                          key={alias}
                          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs"
                        >
                          {alias}
                          {isAdmin && !isPrimary ? (
                            <button
                              className="text-[color:var(--color-accent)]"
                              type="button"
                              disabled={aliasRemoving[key]}
                              onClick={() => handleRemoveAlias(person.personId, alias)}
                            >
                              {aliasRemoving[key] ? "..." : "x"}
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input h-8 flex-1 min-w-[180px]"
                      placeholder="Add alias"
                      value={aliasDrafts[person.personId] ?? ""}
                      onChange={(e) =>
                        setAliasDrafts((prev) => ({ ...prev, [person.personId]: e.target.value }))
                      }
                      disabled={!isEditor}
                    />
                    <button
                      className="btn-primary h-8 px-3 text-xs"
                      type="button"
                      disabled={!isEditor || !(aliasDrafts[person.personId] ?? "").trim() || aliasSaving[person.personId]}
                      onClick={() => handleAddAlias(person.personId)}
                    >
                      {aliasSaving[person.personId] ? "Saving..." : "Add alias"}
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredPeople.length === 0 ? (
              <div className="text-sm text-[color:var(--color-text)]/60">No matches.</div>
            ) : null}
          </div>
        )}

        <div className="flex justify-end">
          <button className="btn-primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </MiniModal>
  );
}
