/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Check, SquarePen, X } from "lucide-react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";
import { useAuth } from "@/context/AuthContext";

type Person = {
  personId: string;
  displayName: string;
  email: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  aliases: string[];
};

type Props = {
  clientSlug: string;
  onClose: () => void;
};

const getPersonInitials = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
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
  const [avatarLoadError, setAvatarLoadError] = useState<Record<string, boolean>>({});
  const [editingAliasPersonId, setEditingAliasPersonId] = useState<string | null>(
    null,
  );
  const canAddPerson = isEditor && !!newName.trim() && !savingPerson;

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
          avatarUrl: p.avatarUrl ? String(p.avatarUrl).trim() : null,
          isActive: p.isActive !== false,
          aliases: Array.isArray(p.aliases)
            ? p.aliases.map((a: any) => String(a ?? "").trim()).filter(Boolean)
            : [],
        }))
        .filter((p: Person) => Boolean(p.personId) && Boolean(p.displayName))
        .sort((a: Person, b: Person) => a.displayName.localeCompare(b.displayName));
      setPeople(list);
      setAvatarLoadError({});
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

  const handleAddPersonKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!canAddPerson) return;
    void handleAddPerson();
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
    <MiniModal
      onClose={onClose}
      title="People & aliases"
      widthClass="max-w-4xl"
      footer={
        <button className="btn-ghost" type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        <div className="border-b border-[color:var(--color-border)] pb-3">
          <div className="flex w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[color:var(--color-surface)] shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-[color:var(--color-primary)]/25">
            <div className="flex-1">
              <label className="sr-only" htmlFor="crm-people-add-name">
                Display name
              </label>
              <input
                id="crm-people-add-name"
                className="h-10 w-full border-none rounded-none bg-transparent px-3 text-sm text-[color:var(--color-text)] outline-none"
                placeholder="Display name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleAddPersonKeyDown}
                disabled={!isEditor}
              />
            </div>
            <div className="h-full w-px bg-[var(--color-border)]" />
            <div className="flex-1">
              <label className="sr-only" htmlFor="crm-people-add-email">
                Email (optional)
              </label>
              <input
                id="crm-people-add-email"
                className="h-10 w-full border-none rounded-none bg-transparent px-3 text-sm text-[color:var(--color-text)] outline-none"
                placeholder="Email (optional)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={handleAddPersonKeyDown}
                disabled={!isEditor}
              />
            </div>
            <button
              className="btn-primary h-10 min-w-[86px] rounded-none border-l border-white/20 px-5 font-medium flex items-center justify-center"
              type="button"
              disabled={!canAddPerson}
              onClick={handleAddPerson}
            >
              {savingPerson ? "Saving..." : "Add"}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1">
              <input
                type="search"
                className="input h-9 w-full"
                placeholder="Search people or aliases..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search.trim() ? (
              <button className="btn-ghost h-9 px-3" type="button" onClick={() => setSearch("")}>
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="py-4 text-sm text-[color:var(--color-text)]/70">Loading people...</div>
        ) : (
          <div className="overflow-y-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-left text-sm">
              <tbody>
                {filteredPeople.map((person) => {
                  const primaryAlias = person.displayName.trim().toLowerCase();
                  const isEditingAliases = editingAliasPersonId === person.personId;
                  const canManageAliases = isEditor || isAdmin;
                  const firstAlias = person.aliases[0];
                  const remainingCount = Math.max(person.aliases.length - 1, 0);
                  const initials = getPersonInitials(person.displayName);
                  const avatarUrl = avatarLoadError[person.personId] ? null : person.avatarUrl;

                  return (
                    <tr
                      key={person.personId}
                      className="border-b border-[var(--color-border)] align-top transition-colors hover:bg-[var(--color-surface-2)]/50"
                    >
                      <td className="py-2 px-4">
                        <div className="flex items-start gap-2.5">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[11px] font-semibold text-[color:var(--color-text)]/75">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={person.displayName}
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setAvatarLoadError((prev) => ({
                                    ...prev,
                                    [person.personId]: true,
                                  }))
                                }
                              />
                            ) : (
                              initials
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[color:var(--color-text)]">
                              {person.displayName}
                            </div>
                            {person.email ? (
                              <div className="truncate text-xs text-[color:var(--color-text)]/60">
                                {person.email}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="py-2 px-4">
                        {!isEditingAliases ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {firstAlias ? (
                                <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs">
                                  {firstAlias}
                                </span>
                              ) : (
                                <span className="text-xs text-[color:var(--color-text)]/55">
                                  No aliases
                                </span>
                              )}
                              {remainingCount > 0 ? (
                                <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs">
                                  +{remainingCount}
                                </span>
                              ) : null}
                            </div>

                            {canManageAliases ? (
                              <button
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent p-0 text-[color:var(--color-text)] opacity-50 transition-colors hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-primary)] hover:opacity-100"
                                type="button"
                                title="Edit aliases"
                                aria-label={`Edit aliases for ${person.displayName}`}
                                onClick={() => setEditingAliasPersonId(person.personId)}
                              >
                                <SquarePen className="h-3.5 w-3.5" strokeWidth={2.2} />
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {person.aliases.length ? (
                                person.aliases.map((alias) => {
                                  const isPrimary = alias.trim().toLowerCase() === primaryAlias;
                                  const key = `${person.personId}:${alias}`;
                                  return (
                                    <span
                                      key={key}
                                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs"
                                    >
                                      {alias}
                                      {isAdmin && !isPrimary ? (
                                        <button
                                          className="inline-flex items-center justify-center rounded-full text-[color:var(--color-accent)]"
                                          type="button"
                                          disabled={aliasRemoving[key]}
                                          onClick={() => handleRemoveAlias(person.personId, alias)}
                                          aria-label={`Remove alias ${alias}`}
                                        >
                                          {aliasRemoving[key] ? "..." : <X size={12} />}
                                        </button>
                                      ) : null}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-xs text-[color:var(--color-text)]/55">
                                  No aliases
                                </span>
                              )}

                              <button
                                className="btn-ghost h-7 px-2 text-xs"
                                type="button"
                                onClick={() => setEditingAliasPersonId(null)}
                              >
                                <Check size={14} className="mr-1" />
                                Done
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                className="input h-8 flex-1 min-w-[180px]"
                                placeholder="Add alias"
                                value={aliasDrafts[person.personId] ?? ""}
                                onChange={(e) =>
                                  setAliasDrafts((prev) => ({
                                    ...prev,
                                    [person.personId]: e.target.value,
                                  }))
                                }
                                disabled={!isEditor}
                              />
                              <button
                                className="btn-primary h-8 px-3 text-xs"
                                type="button"
                                disabled={
                                  !isEditor ||
                                  !(aliasDrafts[person.personId] ?? "").trim() ||
                                  aliasSaving[person.personId]
                                }
                                onClick={() => handleAddAlias(person.personId)}
                              >
                                {aliasSaving[person.personId] ? "Saving..." : "Add"}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-4 text-right">
                        <button
                          className={[
                            "inline-flex h-6 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                            person.isActive
                              ? "bg-emerald-50 text-emerald-700 border-transparent hover:bg-emerald-100 hover:border-emerald-200"
                              : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100 hover:border-slate-200",
                          ].join(" ")}
                          type="button"
                          disabled={!isEditor || toggleSaving[person.personId]}
                          onClick={() =>
                            handleToggleActive(person.personId, !person.isActive)
                          }
                        >
                          {toggleSaving[person.personId]
                            ? "Updating..."
                            : person.isActive
                              ? "Active"
                              : "Inactive"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 px-4 text-sm text-[color:var(--color-text)]/60">
                      No matches.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </MiniModal>
  );
}
