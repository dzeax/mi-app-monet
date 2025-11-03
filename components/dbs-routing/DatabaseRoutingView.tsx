'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';

import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import {
  DOCTOR_SENDER_LANGUAGES,
  mergeDoctorSenderDefaults,
  resolveDoctorSenderDefaults,
  type DoctorSenderDefaults,
  type DoctorSenderDefaultsUpdate,
} from '@/lib/doctorsender/defaults';
import { showError, showSuccess } from '@/utils/toast';

type ApiDefaultsResponse = {
  database: string;
  defaults: DoctorSenderDefaultsUpdate | null;
  updatedAt?: string | null;
};

type FormState = {
  accountUser: string;
  accountToken: string;
  fromEmailsRaw: string;
  replyTo: string;
  unsubscribeUrl: string;
  trackingDomain: string;
  languageId: string;
  listsRaw: string;
  headerHtml: string;
  footerHtml: string;
};

const EMPTY_FORM: FormState = {
  accountUser: '',
  accountToken: '',
  fromEmailsRaw: '',
  replyTo: '',
  unsubscribeUrl: '',
  trackingDomain: '',
  languageId: '',
  listsRaw: '',
  headerHtml: '',
  footerHtml: '',
};

function formatList(value: string[]): string {
  return value.join(', ');
}

function parseList(value: string): string[] {
  return value
    .split(/[,;\n\r\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at === -1) return '';
  return email.slice(at + 1).trim();
}

function toSelectValue(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

export default function DatabaseRoutingView() {
  const { DATABASES } = useCatalogOverrides();
  const sortedDatabases = useMemo(
    () => [...DATABASES].sort((a, b) => a.name.localeCompare(b.name)),
    [DATABASES]
  );

  const [search, setSearch] = useState('');
  const filteredDatabases = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sortedDatabases;
    return sortedDatabases.filter((db) => db.name.toLowerCase().includes(term) || db.geo.toLowerCase().includes(term));
  }, [search, sortedDatabases]);

  const [selectedDatabase, setSelectedDatabase] = useState<string>(() => sortedDatabases[0]?.name ?? '');
  const [combinedDefaults, setCombinedDefaults] = useState<DoctorSenderDefaults | null>(null);
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load defaults when database changes
  useEffect(() => {
    if (!selectedDatabase) return;

    let cancelled = false;
    async function loadDefaults() {
      setLoadingConfig(true);
      try {
        const response = await fetch(`/api/doctorsender/defaults/${encodeURIComponent(selectedDatabase)}`);
        const payload = (await response.json().catch(() => null)) as
          | (ApiDefaultsResponse & { error?: string })
          | { error?: string }
          | null;
        if (!response.ok) {
          const message =
            payload && typeof payload === 'object' && typeof payload.error === 'string'
              ? payload.error
              : response.statusText || 'Unable to load defaults.';
          throw new Error(message);
        }
        if (cancelled) return;
        const data = (payload ?? { database: selectedDatabase, defaults: null }) as ApiDefaultsResponse;
        const staticDefaults = resolveDoctorSenderDefaults(selectedDatabase);
        const overrides = data.defaults ?? null;
        const merged = mergeDoctorSenderDefaults(staticDefaults, overrides);

        setCombinedDefaults(merged);
        setUpdatedAt(data.updatedAt ?? null);
        setFormState({
          accountUser: merged.accountUser ?? '',
          accountToken: merged.accountToken ?? '',
          fromEmailsRaw: formatList(merged.fromEmails ?? []),
          replyTo: merged.fromEmail ?? '',
          unsubscribeUrl: merged.unsubscribeUrl ?? '',
          trackingDomain: merged.trackingDomain ?? '',
          languageId: toSelectValue(merged.languageId),
          listsRaw: formatList(merged.lists ?? (merged.listName ? [merged.listName] : [])),
          headerHtml: merged.headerHtml ?? '',
          footerHtml: merged.footerHtml ?? '',
        });
      } catch (error) {
        console.error(error);
        showError(error instanceof Error ? error.message : 'Unable to load defaults.');
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    }

    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [selectedDatabase]);

  const staticDefaults = useMemo(
    () => resolveDoctorSenderDefaults(selectedDatabase || ''),
    [selectedDatabase]
  );

  const appliedDefaults = combinedDefaults ?? staticDefaults;

  const handleChange = (key: keyof FormState, value: string) => {
    if (key === 'fromEmailsRaw') {
      const emails = parseList(value);
      const primary = emails[0] ?? '';
      setFormState((prev) => ({
        ...prev,
        fromEmailsRaw: value,
        replyTo: primary,
        trackingDomain: primary ? extractDomain(primary) : '',
      }));
      return;
    }
    if (key === 'listsRaw') {
      setFormState((prev) => ({ ...prev, listsRaw: value }));
      return;
    }
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!selectedDatabase) return;
    setSaving(true);
    try {
      const fromEmails = parseList(formState.fromEmailsRaw);
      const lists = parseList(formState.listsRaw);
      const primaryFrom = fromEmails[0] ?? '';
      const payload: DoctorSenderDefaultsUpdate = {
        accountUser: formState.accountUser.trim(),
        accountToken: formState.accountToken.trim(),
        fromEmail: primaryFrom,
        fromEmails,
        replyTo: primaryFrom,
        unsubscribeUrl: formState.unsubscribeUrl.trim(),
        trackingDomain: formState.trackingDomain.trim(),
        listName: lists[0] ?? '',
        lists,
        languageId: formState.languageId ? Number(formState.languageId) : null,
        headerHtml: formState.headerHtml.trim(),
        footerHtml: formState.footerHtml.trim(),
      };

      const response = await fetch(`/api/doctorsender/defaults/${encodeURIComponent(selectedDatabase)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: payload }),
      });

      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw && typeof raw === 'object' && 'error' in raw && typeof (raw as { error?: unknown }).error === 'string'
            ? (raw as { error: string }).error
            : response.statusText || 'Unable to save defaults.';
        throw new Error(message);
      }

      showSuccess('Routing defaults saved.');
      // Refresh to ensure we display sanitized values
      const refreshed = raw as (ApiDefaultsResponse & { defaults?: DoctorSenderDefaultsUpdate | null }) | null;
      const staticDefaultsRefresh = resolveDoctorSenderDefaults(selectedDatabase);
      const overrides =
        refreshed && typeof refreshed === 'object' && 'defaults' in refreshed ? refreshed.defaults ?? null : null;
      const merged = mergeDoctorSenderDefaults(staticDefaultsRefresh, overrides);
      setCombinedDefaults(merged);
      setUpdatedAt(new Date().toISOString());
      setFormState({
        accountUser: merged.accountUser ?? '',
        accountToken: merged.accountToken ?? '',
        fromEmailsRaw: formatList(merged.fromEmails ?? []),
        replyTo: merged.fromEmail ?? '',
        unsubscribeUrl: merged.unsubscribeUrl ?? '',
        trackingDomain: merged.trackingDomain ?? '',
        languageId: toSelectValue(merged.languageId),
        listsRaw: formatList(merged.lists ?? (merged.listName ? [merged.listName] : [])),
        headerHtml: merged.headerHtml ?? '',
        footerHtml: merged.footerHtml ?? '',
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to save defaults.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedDatabase) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/doctorsender/defaults/${encodeURIComponent(selectedDatabase)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: {} }),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw && typeof raw === 'object' && 'error' in raw && typeof (raw as { error?: unknown }).error === 'string'
            ? (raw as { error: string }).error
            : response.statusText || 'Unable to reset defaults.';
        throw new Error(message);
      }
      showSuccess('Routing defaults reset to static values.');
      const merged = resolveDoctorSenderDefaults(selectedDatabase);
      setCombinedDefaults(merged);
      setUpdatedAt(null);
      setFormState({
        accountUser: merged.accountUser ?? '',
        accountToken: merged.accountToken ?? '',
        fromEmailsRaw: formatList(merged.fromEmails ?? []),
        replyTo: merged.fromEmail ?? '',
        unsubscribeUrl: merged.unsubscribeUrl ?? '',
        trackingDomain: merged.trackingDomain ?? '',
        languageId: toSelectValue(merged.languageId),
        listsRaw: formatList(merged.lists ?? (merged.listName ? [merged.listName] : [])),
        headerHtml: merged.headerHtml ?? '',
        footerHtml: merged.footerHtml ?? '',
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to reset defaults.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-page="dbs-routing">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Database Routing</h1>
        <p className="text-sm text-[color:var(--color-text)]/70">
          Configure default DoctorSender settings for each database used in Campaign Planning.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="db-search" className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text)]/55">
                Databases
              </label>
              <input
                id="db-search"
                type="search"
                className="input mt-1 h-9 text-sm"
                placeholder="Search database..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="max-h-[420px] space-y-1 overflow-auto pr-1">
              {filteredDatabases.map((database) => {
                const active = database.name === selectedDatabase;
                return (
                  <button
                    key={database.id}
                    type="button"
                    onClick={() => setSelectedDatabase(database.name)}
                    className={[
                      'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      active
                        ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-text)]'
                        : 'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 text-[color:var(--color-text)]/75 hover:border-[color:var(--color-primary)]/60',
                    ].join(' ')}
                  >
                    <div className="font-semibold text-[color:var(--color-text)]">{database.name}</div>
                    <div className="text-xs text-[color:var(--color-text)]/60">
                      {database.geo} / {database.dbType}
                    </div>
                  </button>
                );
              })}
              {filteredDatabases.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[color:var(--color-border)] px-3 py-4 text-center text-xs text-[color:var(--color-text)]/60">
                  No databases match the search.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="space-y-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text)]">{selectedDatabase}</h2>
              <p className="text-xs text-[color:var(--color-text)]/60">
                Country: {appliedDefaults.country || staticDefaults.country || 'Not configured'}
              </p>
            </div>
            <div className="text-xs text-[color:var(--color-text)]/55">
              {updatedAt ? `Updated ${format(new Date(updatedAt), 'dd MMM yyyy HH:mm')}` : 'Using static defaults'}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="muted">DoctorSender user</span>
              <input
                type="text"
                className="input"
                value={formState.accountUser}
                onChange={(event) => handleChange('accountUser', event.target.value)}
                disabled={loadingConfig}
                placeholder="Leave blank to use default credentials"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="muted">DoctorSender token</span>
              <input
                type="password"
                className="input font-mono text-sm"
                value={formState.accountToken}
                onChange={(event) => handleChange('accountToken', event.target.value)}
                disabled={loadingConfig}
                placeholder="Leave blank to use default credentials"
              />
            </label>

            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="muted">From emails</span>
              <textarea
                rows={3}
                className="input font-mono text-xs"
                value={formState.fromEmailsRaw}
                onChange={(event) => handleChange('fromEmailsRaw', event.target.value)}
                disabled={loadingConfig}
                placeholder="info@domain.com, marketing@domain.com"
              />
              <span className="text-xs text-[color:var(--color-text)]/55">
                Separate with commas, spaces, or new lines. The first address will be used as default.
              </span>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="muted">Reply-to (mirrors default from)</span>
              <input type="email" className="input bg-[color:var(--color-surface-2)]/60" value={formState.replyTo} readOnly />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="muted">Unsubscribe URL</span>
              <input
                type="url"
                className="input"
                value={formState.unsubscribeUrl}
                onChange={(event) => handleChange('unsubscribeUrl', event.target.value)}
                disabled={loadingConfig}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="muted">Tracking domain (auto)</span>
              <input
                type="text"
                className="input bg-[color:var(--color-surface-2)]/60"
                value={formState.trackingDomain}
                readOnly
              />
            </label>

            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="muted">Lists (DoctorSender)</span>
              <textarea
                rows={2}
                className="input font-mono text-xs"
                value={formState.listsRaw}
                onChange={(event) => handleChange('listsRaw', event.target.value)}
                disabled={loadingConfig}
                placeholder="LIST_A, LIST_B"
              />
              <span className="text-xs text-[color:var(--color-text)]/55">
                Provide one or more list identifiers. The first one will be suggested as default inside Campaign Planning.
              </span>
            </label>

            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="muted">Header (HTML)</span>
              <textarea
                rows={6}
                className="input font-mono text-xs"
                value={formState.headerHtml}
                onChange={(event) => handleChange('headerHtml', event.target.value)}
                disabled={loadingConfig}
                placeholder="<header>...</header>"
              />
              <span className="text-xs text-[color:var(--color-text)]/55">
                Available tokens: {'{{UNSUBSCRIBE_URL}}'}, {'{{TRACKING_DOMAIN}}'}, {'{{LIST_NAME}}'}, {'{{LANG_ISO3}}'}. Avoid scripts; content is injected just after {'<body>'}.
              </span>
            </label>

            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="muted">Footer (HTML)</span>
              <textarea
                rows={6}
                className="input font-mono text-xs"
                value={formState.footerHtml}
                onChange={(event) => handleChange('footerHtml', event.target.value)}
                disabled={loadingConfig}
                placeholder="<footer>...</footer>"
              />
              <span className="text-xs text-[color:var(--color-text)]/55">
                DoctorSender requiere un enlace de baja. Incluya {'__LinkUnsubs__'} o utilice {'{{UNSUBSCRIBE_URL}}'} para insertar el valor configurado aquí.
              </span>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="muted">Language</span>
              <select
                className="input"
                value={formState.languageId}
                onChange={(event) => handleChange('languageId', event.target.value)}
                disabled={loadingConfig}
              >
                <option value="">- Use default -</option>
                {DOCTOR_SENDER_LANGUAGES.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[color:var(--color-border)] pt-4">
            <div className="text-xs text-[color:var(--color-text)]/60">
              Static defaults:{' '}
              <span className="font-semibold text-[color:var(--color-text)]">
                From: {staticDefaults.fromEmail || '-'} | Lists: {staticDefaults.lists?.join(', ') || staticDefaults.listName || '-'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost px-3 py-1.5"
                onClick={handleReset}
                disabled={loadingConfig || saving}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn-primary px-4 py-2"
                onClick={handleSave}
                disabled={loadingConfig || saving}
              >
                {saving ? 'Saving...' : 'Save defaults'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
