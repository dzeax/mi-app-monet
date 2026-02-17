/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import DatabaseFlag from '@/components/campaign-planning/DatabaseFlag';

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

function mapDefaultsToForm(defaults: DoctorSenderDefaults | null): FormState {
  const lists = defaults?.lists ?? (defaults?.listName ? [defaults.listName] : []);
  const emails = defaults?.fromEmails ?? (defaults?.fromEmail ? [defaults.fromEmail] : []);
  const primary = emails[0] ?? defaults?.fromEmail ?? '';
  return {
    accountUser: defaults?.accountUser ?? '',
    accountToken: defaults?.accountToken ?? '',
    fromEmailsRaw: formatList(emails),
    replyTo: primary,
    unsubscribeUrl: defaults?.unsubscribeUrl ?? '',
    trackingDomain: defaults?.trackingDomain ?? (primary ? extractDomain(primary) : ''),
    languageId: toSelectValue(defaults?.languageId),
    listsRaw: formatList(lists),
    headerHtml: defaults?.headerHtml ?? '',
    footerHtml: defaults?.footerHtml ?? '',
  };
}

export default function DatabaseRoutingView() {
  const { DATABASES } = useCatalogOverrides();
  const sortedDatabases = useMemo(
    () => [...DATABASES].sort((a, b) => a.name.localeCompare(b.name)),
    [DATABASES]
  );

  const [selectorQuery, setSelectorQuery] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const filteredDatabases = useMemo(() => {
    const term = selectorQuery.trim().toLowerCase();
    if (!term) return sortedDatabases;
    return sortedDatabases.filter(
      (db) => db.name.toLowerCase().includes(term) || db.geo.toLowerCase().includes(term) || db.dbType.toLowerCase().includes(term),
    );
  }, [selectorQuery, sortedDatabases]);

  const [selectedDatabase, setSelectedDatabase] = useState<string>(() => sortedDatabases[0]?.name ?? '');
  const [combinedDefaults, setCombinedDefaults] = useState<DoctorSenderDefaults | null>(null);
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectorOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectorOpen]);

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
        setFormState(mapDefaultsToForm(merged));
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

  const activeDatabase = useMemo(
    () => sortedDatabases.find((db) => db.name === selectedDatabase) ?? null,
    [sortedDatabases, selectedDatabase],
  );

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

  const baselineForm = useMemo(() => mapDefaultsToForm(combinedDefaults ?? staticDefaults), [combinedDefaults, staticDefaults]);
  const isDirty = useMemo(() => {
    return Object.keys(baselineForm).some((key) => baselineForm[key as keyof FormState] !== formState[key as keyof FormState]);
  }, [baselineForm, formState]);

  const handleSave = useCallback(async () => {
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
      setFormState(mapDefaultsToForm(merged));
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to save defaults.');
    } finally {
      setSaving(false);
    }
  }, [selectedDatabase, loadingConfig, saving, isDirty, formState, baselineForm]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!loadingConfig && !saving && isDirty) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [handleSave, loadingConfig, saving, isDirty]);

  const handleResetField = (key: keyof FormState) => {
    const baseline = baselineForm[key] ?? '';
    if (key === 'fromEmailsRaw') {
      handleChange('fromEmailsRaw', baseline);
      return;
    }
    setFormState((prev) => ({ ...prev, [key]: baseline }));
  };

  const renderFieldReset = (key: keyof FormState) =>
    formState[key] !== baselineForm[key] ? (
      <button
        type="button"
        className="text-[0.65rem] font-semibold text-[color:var(--color-primary)]"
        onClick={() => handleResetField(key)}
      >
        Reset
      </button>
    ) : null;

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
      setFormState(mapDefaultsToForm(merged));
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to reset defaults.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-page="dbs-routing">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Database Routing</h1>
          <p className="text-sm text-[color:var(--color-text)]/70">
            Configure default DoctorSender settings for each database used in Campaign Planning.
          </p>
          <div className="flex items-center gap-3 text-xs text-[color:var(--color-text)]/60">
            <span>{updatedAt ? `Last updated ${format(new Date(updatedAt), 'dd MMM yyyy HH:mm')}` : 'Using static defaults'}</span>
            {isDirty ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-accent)]/10 px-2.5 py-0.5 font-semibold text-[color:var(--color-accent)]">
                <span aria-hidden>•</span>
                Unsaved changes
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative w-full max-w-md" ref={selectorRef}>
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">
            Database
          </label>
          <button
            type="button"
            onClick={() => setSelectorOpen((prev) => !prev)}
            className={[
              'mt-1 flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition',
              'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 hover:border-[color:var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)]/40',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-3">
              {activeDatabase ? (
                <DatabaseFlag name={activeDatabase.name} className="h-5 w-5 flex-shrink-0 rounded-full shadow-sm" />
              ) : null}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[color:var(--color-text)]">
                  {activeDatabase?.name ?? 'Select database'}
                </span>
                <span className="block truncate text-xs text-[color:var(--color-text)]/60">
                  {activeDatabase ? `${activeDatabase.geo} / ${activeDatabase.dbType}` : 'Choose a database to edit defaults'}
                </span>
              </span>
            </span>
            <svg className={`h-4 w-4 flex-shrink-0 transition ${selectorOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none">
              <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {selectorOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-full max-w-md rounded-2xl border border-[color:var(--color-border)] bg-white shadow-2xl">
              <div className="sticky top-0 border-b border-[color:var(--color-border)]/70 bg-white p-2">
                <input
                  type="search"
                  value={selectorQuery}
                  onChange={(event) => setSelectorQuery(event.target.value)}
                  placeholder="Search database..."
                  className="w-full rounded-xl border border-[color:var(--color-border)]/70 bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-sm focus:border-[color:var(--color-primary)] focus:outline-none"
                />
              </div>
              <div className="max-h-80 overflow-y-auto p-1">
                {filteredDatabases.map((database) => (
                  <button
                    key={database.id}
                    type="button"
                    onClick={() => {
                      setSelectedDatabase(database.name);
                      setSelectorOpen(false);
                      setSelectorQuery('');
                    }}
                    className={[
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition',
                      database.name === selectedDatabase
                        ? 'bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]'
                        : 'text-[color:var(--color-text)]/80 hover:bg-[color:var(--color-surface-2)]/70',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <DatabaseFlag name={database.name} className="h-4 w-4 flex-shrink-0 rounded-full" />
                      <span className="truncate">{database.name}</span>
                    </span>
                    <span className="text-xs text-[color:var(--color-text)]/60">
                      {database.geo} / {database.dbType}
                    </span>
                  </button>
                ))}
                {filteredDatabases.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-[color:var(--color-text)]/60">No databases match the search.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <section className="space-y-5 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-sm">
        <SectionCard title="Credentials" description="Overrides for DoctorSender account authentication.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="muted flex items-center justify-between">
                <span>DoctorSender user</span>
                {renderFieldReset('accountUser')}
              </span>
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
              <span className="muted flex items-center justify-between">
                <span>DoctorSender token</span>
                {renderFieldReset('accountToken')}
              </span>
              <input
                type="password"
                className="input font-mono text-sm"
                value={formState.accountToken}
                onChange={(event) => handleChange('accountToken', event.target.value)}
                disabled={loadingConfig}
                placeholder="Leave blank to use default credentials"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard
          title="Sender identity & compliance"
          description="Addresses, reply-to handling, unsubscribe links, and tracking domains."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="muted flex items-center justify-between">
                <span>From emails</span>
                {renderFieldReset('fromEmailsRaw')}
              </span>
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
              <span className="muted flex items-center justify-between">
                <span>Unsubscribe URL</span>
                {renderFieldReset('unsubscribeUrl')}
              </span>
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
              <input type="text" className="input bg-[color:var(--color-surface-2)]/60" value={formState.trackingDomain} readOnly />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Lists & localization" description="Default lists and template language suggestions.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="muted flex items-center justify-between">
                <span>Lists (DoctorSender)</span>
                {renderFieldReset('listsRaw')}
              </span>
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

            <label className="grid gap-1 text-sm">
              <span className="muted flex items-center justify-between">
                <span>Language</span>
                {renderFieldReset('languageId')}
              </span>
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
        </SectionCard>

        <SectionCard title="HTML snippets" description="Optional header and footer injected into each routed message.">
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm">
              <span className="muted flex items-center justify-between">
                <span>Header (HTML)</span>
                {renderFieldReset('headerHtml')}
              </span>
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

            <label className="grid gap-1 text-sm">
              <span className="muted flex items-center justify-between">
                <span>Footer (HTML)</span>
                {renderFieldReset('footerHtml')}
              </span>
              <textarea
                rows={6}
                className="input font-mono text-xs"
                value={formState.footerHtml}
                onChange={(event) => handleChange('footerHtml', event.target.value)}
                disabled={loadingConfig}
                placeholder="<footer>...</footer>"
              />
              <span className="text-xs text-[color:var(--color-text)]/55">
                DoctorSender requiere un enlace de baja. Incluya {'__LinkUnsubs__'} o utilice {'{{UNSUBSCRIBE_URL}}'} para insertar el valor configurado aqui.
              </span>
            </label>
          </div>
        </SectionCard>

        <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border)] bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
          <div className="text-xs text-[color:var(--color-text)]/70">
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
              disabled={loadingConfig || saving || !isDirty}
            >
              Reset changes
            </button>
            <button
              type="button"
              className="btn-primary px-4 py-2"
              onClick={handleSave}
              disabled={loadingConfig || saving || !isDirty}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-[color:var(--color-border)]/70 bg-white/70 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[color:var(--color-text)]">{title}</h3>
        {description ? <p className="text-xs text-[color:var(--color-text)]/60">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
