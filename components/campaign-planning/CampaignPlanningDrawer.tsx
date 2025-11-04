'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import Combobox from '@/components/ui/Combobox';
import FieldWithAddon from '@/components/ui/FieldWithAddon';
import QuickAddCampaignModal from '@/components/create-campaign/QuickAddCampaignModal';
import QuickAddPartnerModal from '@/components/create-campaign/QuickAddPartnerModal';
import DatabaseFlag from '@/components/campaign-planning/DatabaseFlag';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import { useAuth } from '@/context/AuthContext';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  type CampaignPlanningContextValue,
  type PlanningDraft,
  type PlanningItem,
} from '@/components/campaign-planning/types';
import {
  DOCTOR_SENDER_CATEGORIES,
  DOCTOR_SENDER_LANGUAGES,
  mergeDoctorSenderDefaults,
  resolveStaticDoctorSenderDefaults,
  type DoctorSenderDefaultsUpdate,
} from '@/lib/doctorsender/defaults';
import { composeEmailHtml } from '@/lib/doctorsender/composeHtml';
import { languageIdToIso3 } from '@/lib/doctorsender/defaults';
import MiniModal from '@/components/ui/MiniModal';
import { showError, showSuccess } from '@/utils/toast';

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  item: PlanningItem | null;
  context: CampaignPlanningContextValue;
  onClose: () => void;
  defaultDate?: string;
};

const defaultDraft: PlanningDraft = {
  name: '',
  partner: '',
  database: '',
  geo: '',
  price: 0,
  type: 'CPL',
  status: 'Backlog',
  date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
  subject: '',
  html: '',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  unsubscribeUrl: '',
  categoryId: null,
  languageId: null,
  trackingDomain: '',
  previewRecipients: [],
  dsCampaignId: null,
  dsStatus: null,
  dsLastSyncAt: null,
  dsError: null,
};

const priceFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

type DateInput = HTMLInputElement & { showPicker?: () => void };

type FieldErrors = Partial<Record<'name' | 'partner' | 'database' | 'date', string>>;

type DeliveryStepId = 'doctorSender' | 'emailContent' | 'previewSend';

type DeliveryStepMeta = {
  id: DeliveryStepId;
  title: string;
  description: string;
  status: 'ready' | 'pending' | 'attention';
};

function trackingDomainFromEmail(email: string | null | undefined, fallback?: string | null): string {
  if (!email) return fallback ?? '';
  const at = email.lastIndexOf('@');
  if (at === -1) return fallback ?? '';
  const domain = email.slice(at + 1);
  return domain || (fallback ?? '');
}

export default function CampaignPlanningDrawer({ open, mode, item, context, onClose, defaultDate }: Props) {
  const [draft, setDraft] = useState<PlanningDraft>(defaultDraft);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [openAddCampaign, setOpenAddCampaign] = useState(false);
  const [openAddPartner, setOpenAddPartner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [selectedList, setSelectedList] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [remoteDefaults, setRemoteDefaults] = useState<DoctorSenderDefaultsUpdate | null>(null);
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [htmlFilename, setHtmlFilename] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState<string>('');
  const autoOpenDelivery = useMemo(
    () =>
      mode === 'edit' &&
      Boolean(
        item &&
          (item.subject ||
            item.html ||
            item.previewRecipients?.length ||
            item.dsStatus ||
            item.dsLastSyncAt)
      ),
    [item, mode]
  );
  const [deliveryOpen, setDeliveryOpen] = useState<boolean>(autoOpenDelivery);
  const [activeDeliveryStep, setActiveDeliveryStep] = useState<DeliveryStepId>('doctorSender');
  const deliveryStorageKey = useMemo(() => `planning-delivery-${item?.id ?? 'new'}`, [item?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.sessionStorage.getItem(deliveryStorageKey);
    if (stored === 'open') {
      setDeliveryOpen(true);
    }
    if (stored === 'closed') {
      setDeliveryOpen(false);
    }
  }, [deliveryStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(deliveryStorageKey, deliveryOpen ? 'open' : 'closed');
  }, [deliveryOpen, deliveryStorageKey]);
  const dateInputRef = useRef<DateInput | null>(null);
  const htmlFileInputRef = useRef<HTMLInputElement | null>(null);

  const { CAMPAIGNS, PARTNERS, DATABASES, TYPES } = useCatalogOverrides();
  const { isAdmin, isEditor } = useAuth();
  const canQuickAdd = isAdmin || isEditor;

  const campaignOptions = useMemo(
    () =>
      CAMPAIGNS.map((campaign) => ({
        id: campaign.id,
        value: campaign.name,
      })),
    [CAMPAIGNS]
  );

  const partnerOptions = useMemo(
    () =>
      PARTNERS.map((partner) => ({
        id: partner.id,
        value: partner.name,
        label: partner.isInternal ? `${partner.name} (INT)` : partner.name,
      })),
    [PARTNERS]
  );

  const databaseOptions = useMemo(
    () =>
      DATABASES.map((database) => ({
        id: database.id,
        name: database.name,
        geo: database.geo,
      })),
    [DATABASES]
  );

  const typeOptions = useMemo(() => (TYPES && TYPES.length ? TYPES : CAMPAIGN_TYPES), [TYPES]);
  const statusOptions = CAMPAIGN_STATUSES;
  const title = mode === 'create' ? 'Create campaign' : 'Edit campaign';
  const staticDefaults = useMemo(
    () => resolveStaticDoctorSenderDefaults(draft.database),
    [draft.database]
  );
  const combinedDefaults = useMemo(
    () => mergeDoctorSenderDefaults(staticDefaults, remoteDefaults ?? undefined),
    [staticDefaults, remoteDefaults]
  );

  const availableFromEmails = useMemo(() => {
    const defaults = combinedDefaults;
    if (!defaults) return [];
    if (defaults.fromEmails && defaults.fromEmails.length) return defaults.fromEmails;
    return defaults.fromEmail ? [defaults.fromEmail] : [];
  }, [combinedDefaults]);

  const availableLists = useMemo(() => {
    const defaults = combinedDefaults;
    if (!defaults) return [];
    if (defaults.lists && defaults.lists.length) return defaults.lists;
    return defaults.listName ? [defaults.listName] : [];
  }, [combinedDefaults]);

  useEffect(() => {
    if (!open) return;
    setSelectedList((prev) => {
      if (prev && availableLists.includes(prev)) return prev;
      return availableLists[0] ?? '';
    });
  }, [open, availableLists]);

  useEffect(() => {
    if (!open || !draft.database) {
      setRemoteDefaults(null);
      setDefaultsLoading(false);
      return;
    }

    let cancelled = false;
    setDefaultsLoading(true);
    setRemoteDefaults(null);

    async function loadDefaults() {
      try {
        const response = await fetch(`/api/doctorsender/defaults/${encodeURIComponent(draft.database)}`);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.ok && payload?.defaults) {
          setRemoteDefaults(payload.defaults);
        } else {
          setRemoteDefaults(null);
        }
      } catch {
        if (!cancelled) {
          setRemoteDefaults(null);
        }
      } finally {
        if (!cancelled) {
          setDefaultsLoading(false);
        }
      }
    }

    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [open, draft.database]);

  useEffect(() => {
    if (!open) return;
    setDeliveryOpen(autoOpenDelivery);
    setActiveDeliveryStep('doctorSender');
    if (item) {
      setDraft({
        name: item.name,
        partner: item.partner,
        database: item.database,
        geo: item.geo ?? '',
        price: item.price,
        type: item.type,
        status: item.status,
        date: item.date,
        notes: item.notes ?? '',
        subject: item.subject ?? '',
        html: item.html ?? '',
        fromName: item.fromName ?? '',
        fromEmail: item.fromEmail ?? '',
        replyTo: item.replyTo ?? '',
        unsubscribeUrl: item.unsubscribeUrl ?? '',
        categoryId: item.categoryId ?? null,
        languageId: item.languageId ?? null,
        trackingDomain: item.trackingDomain ?? '',
        previewRecipients: item.previewRecipients ?? [],
        dsCampaignId: item.dsCampaignId ?? null,
        dsStatus: item.dsStatus ?? null,
        dsLastSyncAt: item.dsLastSyncAt ?? null,
        dsError: item.dsError ?? null,
      });
      setPriceInput(String(item.price ?? 0));
    } else {
      setDraft({
        ...defaultDraft,
        date: defaultDate ?? format(new Date(), 'yyyy-MM-dd'),
      });
      setPriceInput(String(defaultDraft.price));
    }
    setFieldErrors({});
    setSaving(false);
    setRemoving(false);
    setSendingPreview(false);
    setSelectedList('');
    setPreviewOpen(false);
    setDefaultsLoading(false);
    setHtmlFilename(null);
    if (htmlFileInputRef.current) {
      htmlFileInputRef.current.value = '';
    }
  }, [open, item, defaultDate, mode, autoOpenDelivery]);

  useEffect(() => {
    if (!open || item) return;
    if (!draft.database) return;
    const defaults = combinedDefaults;
    if (!defaults) return;
    const primaryFrom = availableFromEmails[0] ?? defaults.fromEmail ?? '';
    const fallbackTracking = trackingDomainFromEmail(primaryFrom, defaults.trackingDomain);
    setDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      if (!next.fromEmail && primaryFrom) {
        next.fromEmail = primaryFrom;
        next.replyTo = primaryFrom;
        next.trackingDomain = fallbackTracking;
        changed = true;
      }
      if (!next.replyTo && (defaults.replyTo || primaryFrom)) {
        next.replyTo = defaults.replyTo || primaryFrom;
        changed = true;
      }
      if (!next.trackingDomain && (defaults.trackingDomain || primaryFrom)) {
        next.trackingDomain = fallbackTracking;
        changed = true;
      }
      if (next.languageId == null && defaults.languageId != null) {
        next.languageId = defaults.languageId;
        changed = true;
      }
      if (!next.unsubscribeUrl && defaults.unsubscribeUrl) {
        next.unsubscribeUrl = defaults.unsubscribeUrl;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [availableFromEmails, combinedDefaults, draft.database, item, open]);

  const clearError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleDeliveryToggle = () => {
    setDeliveryOpen((prev) => {
      const next = !prev;
      if (!next) {
        setActiveDeliveryStep('doctorSender');
      }
      return next;
    });
  };

  const handleCampaignChange = (value: string) => {
    clearError('name');
    setDraft((prev) => ({ ...prev, name: value }));
  };

  const handlePartnerChange = (value: string) => {
    clearError('partner');
    setDraft((prev) => ({ ...prev, partner: value }));
  };

  const handleDatabaseChange = (value: string) => {
    clearError('database');
    const match = databaseOptions.find((option) => option.name === value);
    setDraft((prev) => ({
      ...prev,
      database: value,
      geo: match?.geo ?? '',
    }));
  };

  const handleDateChange = (value: string) => {
    clearError('date');
    setDraft((prev) => ({ ...prev, date: value }));
  };

  const handleFromEmailSelect = (value: string) => {
    setDraft((prev) => ({
      ...prev,
      fromEmail: value,
      replyTo: combinedDefaults.replyTo || value || prev.replyTo,
      trackingDomain: trackingDomainFromEmail(value, combinedDefaults.trackingDomain),
    }));
  };

  const handleListSelect = (value: string) => {
    setSelectedList(value);
  };

  const activeReplyTo = draft.replyTo || combinedDefaults.replyTo || draft.fromEmail || '';
  const activeUnsubscribeUrl = draft.unsubscribeUrl || combinedDefaults.unsubscribeUrl || '';
  const activeTrackingDomain =
    draft.trackingDomain ||
    combinedDefaults.trackingDomain ||
    trackingDomainFromEmail(draft.fromEmail ?? availableFromEmails[0] ?? '', combinedDefaults.trackingDomain);
  const activeLanguageId = draft.languageId ?? combinedDefaults.languageId ?? null;

  const previewData = useMemo(() => {
    if (!combinedDefaults) return null;
    const listToken = selectedList || combinedDefaults.listName || availableLists[0] || '';
    const langIso = languageIdToIso3(activeLanguageId) ?? '';

    return composeEmailHtml({
      headerHtml: combinedDefaults.headerHtml,
      footerHtml: combinedDefaults.footerHtml,
      bodyHtml: draft.html ?? '',
      replacements: {
        '{{UNSUBSCRIBE_URL}}': activeUnsubscribeUrl,
        '{{TRACKING_DOMAIN}}': activeTrackingDomain,
        '{{LIST_NAME}}': listToken,
        '{{LANG_ISO3}}': langIso,
      },
      unsubscribeUrl: activeUnsubscribeUrl,
    });
  }, [
    combinedDefaults,
    draft.html,
    activeUnsubscribeUrl,
    activeTrackingDomain,
    selectedList,
    availableLists,
    activeLanguageId,
  ]);

  const headerPartnerLabel = draft.partner?.trim() || 'Partner pending';
  const headerDatabaseLabel = draft.database?.trim() || 'Database pending';
  const headerStatusLabel = draft.status || 'Status pending';
  const headerDateLabel = draft.date
    ? (() => {
        const parsed = new Date(draft.date);
        return Number.isNaN(parsed.getTime()) ? draft.date : format(parsed, 'dd MMM yyyy');
      })()
    : 'Date pending';
  const formattedPrice = Number.isFinite(Number(draft.price))
    ? priceFormatter.format(Number(draft.price))
    : priceFormatter.format(0);
  const headerPricingLabel = draft.type ? `${formattedPrice} / ${draft.type}` : formattedPrice;

  const headerChips = [
    { key: 'partner', label: headerPartnerLabel, type: 'text' as const },
    { key: 'database', label: headerDatabaseLabel, type: 'database' as const },
    { key: 'pricing', label: headerPricingLabel, type: 'text' as const },
    { key: 'date', label: headerDateLabel, type: 'text' as const },
    { key: 'status', label: headerStatusLabel, type: 'status' as const },
  ];

  const previewRequirements = [
    { id: 'subject', label: 'Subject', ok: Boolean(draft.subject?.trim()) },
    { id: 'html', label: 'HTML content', ok: Boolean(draft.html?.trim()) },
    { id: 'unsubscribe', label: 'Unsubscribe URL', ok: Boolean(draft.unsubscribeUrl?.trim()) },
    { id: 'recipients', label: 'Preview recipients', ok: draft.previewRecipients.length > 0 },
    { id: 'fromEmail', label: 'From email', ok: Boolean(draft.fromEmail?.trim()) },
    { id: 'replyTo', label: 'Reply-to', ok: Boolean(draft.replyTo?.trim()) },
  ];

  const missingPreviewRequirements = previewRequirements.filter((item) => !item.ok).map((item) => item.label);
  const isPreviewReady = missingPreviewRequirements.length === 0;
  const previewButtonTooltip = !item
    ? 'Save the campaign before sending the BAT.'
    : isPreviewReady
      ? undefined
      : `Complete before sending: ${missingPreviewRequirements.join(', ')}`;
  const htmlFileInputId = 'planning-html-upload';
  const htmlFileStatus = htmlFilename
    ? `Selected: ${htmlFilename}`
    : draft.html?.trim()
      ? 'Content inserted manually'
      : 'No file selected';
  const stepStatusTone: Record<DeliveryStepMeta['status'], string> = {
    ready: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    pending: 'border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 text-[color:var(--color-text)]/70',
    attention: 'border border-amber-200 bg-amber-50 text-amber-800',
  };
  const lastSyncLabel = draft.dsLastSyncAt
    ? format(new Date(draft.dsLastSyncAt), 'dd MMM yyyy HH:mm')
    : 'Not synced yet';
  const dsStatusLabel = draft.dsStatus ?? 'Not sent';

  const doctorSenderReady =
    Boolean(draft.fromEmail?.trim()) &&
    Boolean(activeReplyTo?.trim()) &&
    Boolean(activeUnsubscribeUrl?.trim()) &&
    Boolean(draft.trackingDomain?.trim());
  const emailContentReady =
    Boolean(draft.fromName?.trim()) &&
    Boolean(draft.subject?.trim()) &&
    Boolean(draft.html?.trim()) &&
    draft.previewRecipients.length > 0;
  const previewStepReady = isPreviewReady && Boolean(item);

  const deliverySteps: DeliveryStepMeta[] = [
    {
      id: 'doctorSender',
      title: 'DoctorSender setup',
      description: 'Sender identity, routing defaults, compliance links.',
      status: doctorSenderReady ? 'ready' : 'pending',
    },
    {
      id: 'emailContent',
      title: 'Email content',
      description: 'Upload the HTML and define preview recipients.',
      status: emailContentReady ? 'ready' : 'pending',
    },
    {
      id: 'previewSend',
      title: 'Preview & send',
      description: draft.dsError
        ? 'Preview failed. Review the error log before resending.'
        : 'Send the BAT once all requirements are met.',
      status: draft.dsError ? 'attention' : previewStepReady ? 'ready' : 'pending',
    },
  ];

  const handlePreviewRecipientsChange = (value: string) => {
    const entries = value
      .split(/[,;\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    setDraft((prev) => ({ ...prev, previewRecipients: entries }));
  };

  const handleHtmlFileUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setHtmlFilename(null);
      return;
    }
    try {
      const text = await file.text();
      setDraft((prev) => ({ ...prev, html: text }));
      setHtmlFilename(file.name);
    } catch {
      showError('Unable to read HTML file.');
      setHtmlFilename(null);
    } finally {
      event.target.value = '';
    }
  };

  const buildPayload = (): PlanningDraft => ({
    ...draft,
    name: draft.name.trim(),
    partner: draft.partner.trim(),
    database: draft.database.trim(),
    geo: draft.geo?.trim() || '',
    notes: (draft.notes ?? '').trim(),
    previewRecipients: draft.previewRecipients.map((email) => email.trim()).filter(Boolean),
  });

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!draft.name.trim()) errors.name = 'Campaign name is required.';
    if (!draft.partner.trim()) errors.partner = 'Partner is required.';
    if (!draft.database.trim()) errors.database = 'Database is required.';
    if (!draft.date.trim()) errors.date = 'Date is required.';
    return errors;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    const payload = buildPayload();
  try {
      setSaving(true);
      if (mode === 'create') {
        await context.addItem(payload);
        showSuccess('Campaign scheduled');
      } else if (item) {
        await context.updateItem(item.id, payload);
        showSuccess('Campaign updated');
      }
      onClose();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to save campaign. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item || removing) return;
    try {
      setRemoving(true);
      await context.removeItem(item.id);
      showSuccess('Campaign removed');
      onClose();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to delete campaign. Please try again.');
    } finally {
      setRemoving(false);
    }
  };

  const handleSendPreview = async () => {
    if (!item) {
      showError('Save the campaign before sending the BAT.');
      return;
    }
    if (!draft.subject?.trim() || !draft.html?.trim()) {
      showError('Subject and HTML are required before sending the BAT.');
      return;
    }
    if (!draft.unsubscribeUrl?.trim()) {
      showError('Please provide the unsubscribe URL before sending the BAT.');
      return;
    }
    if (!draft.previewRecipients.length) {
      showError('Add at least one preview recipient before sending the BAT.');
      return;
    }
    if (!draft.fromEmail?.trim() || !draft.replyTo?.trim()) {
      showError('From email and reply-to are required before sending the BAT.');
      return;
    }
    try {
      setSendingPreview(true);
      await context.updateItem(item.id, buildPayload());
      const response = await fetch(`/api/campaign-planning/${item.id}/send-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: { listName: selectedList || null } }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.error ?? response.statusText ?? 'Unable to send preview.';
        throw new Error(message);
      }
      showSuccess('Preview sent');
      await context.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to send preview.');
    } finally {
      setSendingPreview(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-stretch justify-end bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-[color:var(--color-surface)] shadow-2xl">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto">
            <header className="sticky top-0 z-20 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/97 px-6 pb-4 pt-6 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">Global activation</p>
                  <h2 className="text-2xl font-semibold text-[color:var(--color-text)]">{title}</h2>
                </div>
                <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close drawer">
                  Close
                </button>
              </div>
              <p className="mt-2 text-sm text-[color:var(--color-text)]/60">
                {mode === 'create'
                  ? 'Fill in the details to programme a new activation.'
                  : 'Update any field, adjust the status or move the campaign to another day.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {headerChips.map((chip) => {
                  if (chip.type === 'database') {
                    return (
                      <span
                        key={chip.key}
                        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-1 text-xs font-medium text-[color:var(--color-text)]/70"
                      >
                        {draft.database ? (
                          <DatabaseFlag
                            name={draft.database}
                            className="h-4 w-4 rounded-[3px] shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"
                          />
                        ) : (
                          <span className="inline-block h-4 w-4 rounded-full bg-[color:var(--color-border)]/80" aria-hidden="true" />
                        )}
                        <span className="truncate text-[color:var(--color-text)]/80" style={{ maxWidth: '140px' }}>
                          {chip.label}
                        </span>
                      </span>
                    );
                  }
                  if (chip.type === 'status') {
                    return (
                      <span
                        key={chip.key}
                        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-primary)]/18 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-primary)]/80"
                      >
                        {chip.label}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={chip.key}
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-3 py-1 text-xs font-medium text-[color:var(--color-text)]/70"
                    >
                      {chip.label}
                    </span>
                  );
                })}
              </div>
            </header>

            <div className="space-y-8 px-6 pb-28 pt-6">
              <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">Campaign details</p>
                    <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Create or refine the activation</h3>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-text)]/70">
                    {draft.status || 'Backlog'}
                  </span>
                </div>
                <div className="mt-6 space-y-5">
                  <FieldWithAddon
                    onAdd={canQuickAdd ? () => setOpenAddCampaign(true) : undefined}
                    addAriaLabel="Quick add campaign"
                    className="w-full items-end"
                    buttonDisabled={!canQuickAdd}
                  >
                    <label className="grid w-full gap-2 text-sm">
                      <span className="muted">Campaign name</span>
                      <Combobox
                        options={campaignOptions}
                        value={draft.name}
                        onChange={handleCampaignChange}
                        ariaLabel="Campaign name"
                        className="w-full"
                        invalid={Boolean(fieldErrors.name)}
                      />
                      {fieldErrors.name ? (
                        <span className="text-xs text-[color:var(--color-accent)]">{fieldErrors.name}</span>
                      ) : null}
                    </label>
                  </FieldWithAddon>

                  <FieldWithAddon
                    onAdd={canQuickAdd ? () => setOpenAddPartner(true) : undefined}
                    addAriaLabel="Quick add partner"
                    className="w-full items-end"
                    buttonDisabled={!canQuickAdd}
                  >
                    <label className="grid w-full gap-2 text-sm">
                      <span className="muted">Partner</span>
                      <Combobox
                        options={partnerOptions}
                        value={draft.partner}
                        onChange={handlePartnerChange}
                        ariaLabel="Partner"
                        className="w-full"
                        invalid={Boolean(fieldErrors.partner)}
                      />
                      {fieldErrors.partner ? (
                        <span className="text-xs text-[color:var(--color-accent)]">{fieldErrors.partner}</span>
                      ) : null}
                    </label>
                  </FieldWithAddon>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm">
                      <span className="muted">Database</span>
                      <Combobox
                        options={databaseOptions.map((database) => ({
                          id: database.id,
                          value: database.name,
                          label: database.name,
                        }))}
                        value={draft.database}
                        onChange={handleDatabaseChange}
                        ariaLabel="Database"
                        className="w-full"
                        invalid={Boolean(fieldErrors.database)}
                      />
                      {fieldErrors.database ? (
                        <span className="text-xs text-[color:var(--color-accent)]">{fieldErrors.database}</span>
                      ) : null}
                    </label>
                    <label className="grid gap-2 text-sm">
                      <span className="muted">Date</span>
                      <div className="relative w-full">
                        <input
                          ref={(node) => {
                            dateInputRef.current = node;
                          }}
                          type="date"
                          className="input h-10 w-full pr-10"
                          value={draft.date}
                          onChange={(event) => handleDateChange(event.target.value)}
                          aria-invalid={Boolean(fieldErrors.date) || undefined}
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-[color:var(--color-text)]/60 transition hover:text-[color:var(--color-text)]"
                          onClick={() => {
                            const el = dateInputRef.current;
                            if (!el) return;
                            if (typeof el.showPicker === 'function') {
                              el.showPicker();
                            } else {
                              el.focus();
                            }
                          }}
                          aria-label="Open date picker"
                        >
                          <CalendarIcon className="h-4 w-4" />
                        </button>
                      </div>
                      {fieldErrors.date ? (
                        <span className="text-xs text-[color:var(--color-accent)]">{fieldErrors.date}</span>
                      ) : null}
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm">
                      <span className="muted">Price (€)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input h-10"
                        value={priceInput}
                        onChange={(event) => {
                          const { value } = event.target;
                          setPriceInput(value);
                          const normalized = value.replace(',', '.');
                          const parsed = Number.parseFloat(normalized);
                          if (!Number.isNaN(parsed)) {
                            setDraft((prev) => ({ ...prev, price: parsed }));
                          } else if (!value.trim()) {
                            setDraft((prev) => ({ ...prev, price: 0 }));
                          }
                        }}
                        placeholder="0.00"
                      />
                    </label>
                    <label className="grid gap-2 text-sm">
                      <span className="muted">Model</span>
                      <select
                        className="input h-10"
                        value={draft.type}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, type: event.target.value as (typeof CAMPAIGN_TYPES)[number] }))
                        }
                      >
                        {typeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm">
                      <span className="muted">Status</span>
                      <select
                        className="input h-10"
                        value={draft.status}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, status: event.target.value as (typeof CAMPAIGN_STATUSES)[number] }))
                        }
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="muted">Geo</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          Auto
                        </span>
                      </span>
                      <input type="text" className="input h-10" value={draft.geo || 'Not assigned'} readOnly />
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm">
                    <span className="muted">Planning notes</span>
                    <textarea
                      className="input min-h-[100px] resize-y"
                      value={draft.notes ?? ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                      placeholder="Add useful context, routing preferences, or blockers."
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text)]/55">Delivery setup</p>
                    <h3 className="text-lg font-semibold text-[color:var(--color-text)]">DoctorSender, HTML, and BAT preview</h3>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-primary)]/40 bg-[color:var(--color-primary)]/12 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-primary)] shadow-[0_4px_12px_rgba(15,23,42,0.08)] transition-all hover:bg-[color:var(--color-primary)]/18 hover:border-[color:var(--color-primary)]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)]/50"
                    onClick={handleDeliveryToggle}
                    aria-expanded={deliveryOpen}
                  >
                    {deliveryOpen ? 'Collapse delivery' : 'Open delivery'}
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-primary)]/20 text-[color:var(--color-primary)] transition-transform ${deliveryOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    >
                      <ChevronIcon className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>

                {deliveryOpen ? (
                  <>
                    <div className="mt-6 grid gap-2 md:grid-cols-3">
                      {deliverySteps.map((step) => {
                        const isActive = activeDeliveryStep === step.id;
                        return (
                          <button
                            key={step.id}
                            type="button"
                            className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                              isActive
                                ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/5 text-[color:var(--color-text)]'
                                : 'border-[color:var(--color-border)] text-[color:var(--color-text)]/70 hover:text-[color:var(--color-text)]'
                            }`}
                            onClick={() => setActiveDeliveryStep(step.id)}
                            aria-pressed={isActive}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                              <span>{step.title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${stepStatusTone[step.status]}`}>
                                {step.status === 'ready' ? 'Ready' : step.status === 'pending' ? 'Pending' : 'Review'}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-[color:var(--color-text)]/60">{step.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-6 space-y-6">
                      {activeDeliveryStep === 'doctorSender' ? (
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text)]/60">
                            <span>{defaultsLoading ? 'Syncing DoctorSender defaults...' : draft.database ? 'Defaults loaded from database routing' : 'Select a database to load defaults.'}</span>
                            <span className="font-semibold text-[color:var(--color-text)]">{doctorSenderReady ? 'Ready' : 'Incomplete'}</span>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-2 text-sm">
                              <span className="muted">From email</span>
                              <select
                                className="input h-10"
                                value={draft.fromEmail ?? ''}
                                onChange={(event) => handleFromEmailSelect(event.target.value)}
                                disabled={!availableFromEmails.length && !draft.fromEmail}
                              >
                                <option value="">{availableFromEmails.length ? '-- Select --' : 'No senders available'}</option>
                                {availableFromEmails.map((email) => (
                                  <option key={email} value={email}>
                                    {email}
                                  </option>
                                ))}
                                {draft.fromEmail && !availableFromEmails.includes(draft.fromEmail) ? (
                                  <option value={draft.fromEmail}>{draft.fromEmail}</option>
                                ) : null}
                              </select>
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="muted">Preview list</span>
                              <select
                                className="input h-10 w-full"
                                value={selectedList}
                                onChange={(event) => handleListSelect(event.target.value)}
                                disabled={!availableLists.length}
                              >
                                <option value="">
                                  {availableLists.length ? `Default routing (${availableLists[0]})` : 'No lists available'}
                                </option>
                                {availableLists.map((list) => (
                                  <option key={list} value={list}>
                                    {list}
                                  </option>
                                ))}
                              </select>
                              <span className="text-xs text-[color:var(--color-text)]/55">Only used for the BAT preview.</span>
                            </label>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-2 text-sm">
                              <span className="muted">Reply-to</span>
                              <input type="email" className="input h-10" value={activeReplyTo} disabled readOnly />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="muted">Unsubscribe URL</span>
                              <input type="url" className="input h-10" value={draft.unsubscribeUrl ?? ''} disabled readOnly />
                            </label>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-2 text-sm">
                              <span className="muted">Tracking domain</span>
                              <input type="text" className="input h-10" value={draft.trackingDomain ?? ''} disabled readOnly />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="muted">Language</span>
                              <select
                                className="input h-10"
                                value={draft.languageId ?? ''}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    languageId: event.target.value ? Number(event.target.value) : null,
                                  }))
                                }
                              >
                                <option value="">-- Select --</option>
                                {DOCTOR_SENDER_LANGUAGES.map((language) => (
                                  <option key={language.id} value={language.id}>
                                    {language.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--color-border)] pt-3 text-sm">
                          <button
                            type="button"
                            className="btn-primary inline-flex items-center gap-2"
                            onClick={() => setActiveDeliveryStep('emailContent')}
                          >
                            Continue to Content
                            <span className="inline-flex h-4 w-4 items-center justify-center rotate-90">
                              <ChevronIcon />
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}

                      {activeDeliveryStep === 'emailContent' ? (
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text)]/60">
                            <span>Upload or paste the HTML template and define preview recipients.</span>
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text)] transition hover:text-[color:var(--color-primary)] disabled:opacity-50"
                              onClick={() => setPreviewOpen(true)}
                              disabled={!previewData?.html}
                              aria-label="View compiled HTML"
                            >
                              <PreviewIcon className="h-5 w-5" />
                            </button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-2 text-sm">
                              <span className="muted">Sender</span>
                              <input
                                type="text"
                                className="input h-10"
                                value={draft.fromName ?? ''}
                                onChange={(event) => setDraft((prev) => ({ ...prev, fromName: event.target.value }))}
                                placeholder="Brand or partner"
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="muted">Subject line</span>
                              <input
                                type="text"
                                className="input h-10"
                                value={draft.subject ?? ''}
                                onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))}
                                placeholder="Add the BAT subject"
                              />
                            </label>
                          </div>
                          <label className="grid gap-2 text-sm">
                            <span className="muted">Category</span>
                            <select
                              className="input h-10"
                              value={draft.categoryId ?? ''}
                              onChange={(event) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  categoryId: event.target.value ? Number(event.target.value) : null,
                                }))
                              }
                            >
                              <option value="">-- Select --</option>
                              {DOCTOR_SENDER_CATEGORIES.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-2 text-sm">
                            <span className="muted">HTML content</span>
                            <textarea
                              className="input min-h-[200px] resize-y"
                              value={draft.html ?? ''}
                              onChange={(event) => setDraft((prev) => ({ ...prev, html: event.target.value }))}
                              placeholder="Paste the HTML or use the upload option below."
                            />
                          </label>
                          <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/70 px-4 py-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-[color:var(--color-text)]">Upload HTML file</p>
                                <p className="text-xs text-[color:var(--color-text)]/60">Drop a file or browse your computer. .html and .htm are supported.</p>
                                <p className="mt-1 text-xs font-semibold text-[color:var(--color-text)]">{htmlFileStatus}</p>
                              </div>
                              <label htmlFor={htmlFileInputId} className="btn-secondary cursor-pointer text-xs">
                                Browse files
                                <input
                                  ref={htmlFileInputRef}
                                  id={htmlFileInputId}
                                  type="file"
                                  accept=".html,.htm,text/html"
                                  className="sr-only"
                                  onChange={handleHtmlFileUpload}
                                />
                              </label>
                            </div>
                          </div>
                          <label className="grid gap-2 text-sm">
                            <span className="muted">Preview recipients</span>
                            <textarea
                              className="input min-h-[120px] resize-y"
                              value={draft.previewRecipients.join(', ')}
                              onChange={(event) => handlePreviewRecipientsChange(event.target.value)}
                              placeholder="Add emails separated by commas or spaces."
                            />
                            <span className="text-xs text-[color:var(--color-text)]/55">These contacts receive the BAT preview only.</span>
                          </label>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-3 text-sm">
                          <div className="flex items-center gap-2 text-xs text-[color:var(--color-text)]/60">
                            {missingPreviewRequirements.length ? (
                              <>
                                <span className="inline-flex h-2 w-2 rounded-full bg-[color:var(--color-accent)]" aria-hidden />
                                <span>
                                  Complete before continuing:&nbsp;
                                  <strong>{missingPreviewRequirements.join(', ')}</strong>
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                                <span>All requirements met. Ready to preview.</span>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="btn-ghost inline-flex items-center gap-2"
                              onClick={() => setActiveDeliveryStep('doctorSender')}
                            >
                              <span className="inline-flex h-4 w-4 items-center justify-center -rotate-90">
                                <ChevronIcon />
                              </span>
                              Back to DS Setup
                            </button>
                            <button
                              type="button"
                              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                              onClick={() => setActiveDeliveryStep('previewSend')}
                              disabled={!isPreviewReady}
                              title={
                                isPreviewReady
                                  ? undefined
                                  : `Complete before continuing: ${missingPreviewRequirements.join(', ')}`
                              }
                            >
                              Continue to preview
                              <span className="inline-flex h-4 w-4 items-center justify-center rotate-90">
                                <ChevronIcon />
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                      ) : null}

                      {activeDeliveryStep === 'previewSend' ? (
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text)]/60">
                            <span>Review the requirements and send the BAT preview.</span>
                            <span className="font-semibold text-[color:var(--color-text)]">{dsStatusLabel}</span>
                          </div>
                          {missingPreviewRequirements.length ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                              <p className="font-semibold">Complete before sending:</p>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                                {missingPreviewRequirements.map((label) => (
                                  <li key={label}>{label}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                              All requirements met. Ready to send the BAT preview.
                            </div>
                          )}
                          {draft.dsError ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                              <p className="font-semibold">DoctorSender error</p>
                              <p className="mt-1 text-xs">{draft.dsError}</p>
                            </div>
                          ) : null}
                          <div className="grid gap-1 text-xs text-[color:var(--color-text)]/60">
                            <div className="flex justify-between">
                              <span>Preview list</span>
                              <span className="font-semibold text-[color:var(--color-text)]">{selectedList || availableLists[0] || 'Default routing'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Last DoctorSender sync</span>
                              <span className="font-semibold text-[color:var(--color-text)]">{lastSyncLabel}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-between gap-2 pt-2 text-sm">
                            <button type="button" className="btn-ghost" onClick={() => setActiveDeliveryStep('emailContent')}>
                              Back to email content
                            </button>
                            <button
                              type="button"
                              className="btn-primary disabled:opacity-50"
                              onClick={handleSendPreview}
                              disabled={!isPreviewReady || sendingPreview}
                              title={previewButtonTooltip}
                            >
                              {sendingPreview ? 'Sending...' : 'Send BAT preview'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 px-6 py-4">
            <div className="flex items-center gap-2">
              {mode === 'edit' ? (
                <button
                  type="button"
                  className="btn-ghost text-[color:var(--color-accent)]"
                  onClick={handleDelete}
                  disabled={removing || saving}
                >
                  {removing ? 'Deleting...' : 'Delete'}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary disabled:opacity-50" disabled={saving}>
                {saving ? 'Saving...' : mode === 'create' ? 'Create campaign' : 'Save changes'}
              </button>
            </div>
          </footer>
        </form>
      </div>

      {openAddCampaign ? (
        <QuickAddCampaignModal
          onClose={() => setOpenAddCampaign(false)}
          onCreated={(name) => handleCampaignChange(name)}
        />
      ) : null}

      {openAddPartner ? (
        <QuickAddPartnerModal
          onClose={() => setOpenAddPartner(false)}
          onCreated={(partner) => handlePartnerChange(partner)}
        />
      ) : null}

      {previewOpen ? (
        <MiniModal
          title="HTML preview"
          onClose={() => setPreviewOpen(false)}
          widthClass="max-w-4xl"
          bodyClassName="max-h-[70vh]"
        >
          {previewData?.html ? (
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewData.html }} />
            </div>
          ) : (
            <p className="text-sm text-[color:var(--color-text)]/70">No preview available. Add HTML content first.</p>
          )}
        </MiniModal>
      ) : null}
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="4"
        width="14"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <path d="M12 5C7.455 5 3.667 8.022 2 12c1.667 3.978 5.455 7 10 7s8.333-3.022 10-7c-1.667-3.978-5.455-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6a2 2 0 1 0 .001 4.001A2 2 0 0 0 12 10Z" />
    </svg>
  );
}










