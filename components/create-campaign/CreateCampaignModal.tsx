'use client';

import { createPortal } from 'react-dom';
import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCampaignData } from '@/context/CampaignDataContext';
import { CampaignRow } from '@/types/campaign';
import Combobox from '@/components/ui/Combobox';
import Tooltip from '@/components/ui/Tooltip';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import QuickAddCampaignModal from '@/components/create-campaign/QuickAddCampaignModal';
import QuickAddPartnerModal from '@/components/create-campaign/QuickAddPartnerModal';
import QuickAddDatabaseModal from '@/components/create-campaign/QuickAddDatabaseModal';
import FieldWithAddon from '@/components/ui/FieldWithAddon';
import type { CampaignRef, PartnerRef, DatabaseRef, DBType, InvoiceOffice } from '@/data/reference';
import { useAuth } from '@/context/AuthContext'; // ðŸ†• roles para quick-add

// ======================= Utils =======================

const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fmtPct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

const SYMBOL_MULTIPLY = '\u00D7';
const SYMBOL_MINUS = '\u2212';

function parseNum(v: unknown): number {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

  let s = String(v).trim().replace(/\s/g, '');
  if (s === '') return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Toast sin dependencias (ajustado a tema claro)
function showToast(message: string, opts?: { variant?: 'success' | 'error'; duration?: number }) {
  if (typeof document === 'undefined') return;
  const { variant = 'success', duration = 2600 } = opts || {};
  const host = document.createElement('div');
  host.className = 'fixed bottom-4 right-4 z-[200]';
  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto select-none rounded-lg border px-3 py-2 shadow-xl text-sm';
  toast.style.borderColor = 'var(--color-border)';
  toast.style.background = 'var(--color-surface)';
  toast.style.color = 'var(--color-text)';
  toast.style.transition = 'transform 180ms ease, opacity 180ms ease';
  toast.style.transform = 'translateY(8px)';
  toast.style.opacity = '0';
  toast.textContent = message;

  if (variant === 'error') {
    toast.style.outline = '1px solid #ff6b6b55';
    toast.style.boxShadow = '0 10px 30px rgba(239,68,68,0.12)';
  } else {
    toast.style.outline = '1px solid rgba(16,185,129,.25)';
    toast.style.boxShadow = '0 10px 30px rgba(16,185,129,.12)';
  }

  host.appendChild(toast);
  document.body.appendChild(host);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0px)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateY(8px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      try { document.body.removeChild(host); } catch {}
    }, 200);
  }, duration);
}

type Mode = 'create' | 'edit';

// ===== Enums fuertes (sin casts) =====
const DEAL_TYPES = ['CPL', 'CPM', 'CPC', 'CPA'] as const;
type DealType = typeof DEAL_TYPES[number];

const DB_TYPES = ['B2B', 'B2C', 'Mixed'] as const;
const INVOICE_OFFICES = ['DAT', 'CAR', 'INT'] as const;

const EMPTY_CAMPAIGNS: CampaignRef[] = [];
const EMPTY_PARTNERS: PartnerRef[] = [];
const EMPTY_DATABASES: DatabaseRef[] = [];

type PickerInput = HTMLInputElement & { showPicker?: () => void };

const isDBType = (value: unknown): value is DBType =>
  typeof value === 'string' && (DB_TYPES as readonly string[]).includes(value);
const isInvoiceOffice = (value: unknown): value is InvoiceOffice =>
  typeof value === 'string' && (INVOICE_OFFICES as readonly string[]).includes(value);

// Zod helpers
const ZDealType = z.enum(DEAL_TYPES);
const ZDBType = z.enum(DB_TYPES);
const ZInvoiceOffice = z.enum(INVOICE_OFFICES);

// ======================= Component =======================
export default function CreateCampaignModal({
  mode = 'create',
  initialRow,
  seed,
  onClose,
  onSaved,
}: {
  mode?: Mode;
  initialRow?: CampaignRow;
  seed?: Partial<CampaignRow>;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { addCampaign, updateCampaign } = useCampaignData();

  // ðŸ†• flag de permisos para quick-add
  const { isAdmin, isEditor } = useAuth();
  const canQuickAdd = isAdmin || isEditor;

  // === CatÃƒÂ¡logos dinÃƒÂ¡micos ===
  const catalogs = useCatalogOverrides();
  const CAMPAIGNS = catalogs?.CAMPAIGNS ?? EMPTY_CAMPAIGNS;
  const PARTNERS = catalogs?.PARTNERS ?? EMPTY_PARTNERS;
  const DATABASES = catalogs?.DATABASES ?? EMPTY_DATABASES;
  const THEMES = catalogs?.THEMES ?? [];
  const TYPES = (catalogs?.TYPES ?? DEAL_TYPES.slice()).slice();

  const normalizeKey = useCallback((value: string) => value.trim().toLowerCase(), []);
  const findCampaignByName = useCallback(
    (name: string) => CAMPAIGNS.find((campaign) => normalizeKey(campaign.name) === normalizeKey(name)),
    [CAMPAIGNS, normalizeKey]
  );

  // Resolver de oficina de facturaciÃƒÂ³n tipado y seguro
  const resolveOffice = useCallback(
    (geo?: string, partner?: string): InvoiceOffice => {
      const resolver = catalogs?.resolveInvoiceOfficeMerged;
      const result = resolver ? resolver(geo, partner) : 'DAT';
      return isInvoiceOffice(result) ? result : 'DAT';
    },
    [catalogs]
  );

  // == Scroll lock mientras el modal estÃƒÂ¡ abierto ==
  useEffect(() => {
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    const prevPadRight = html.style.paddingRight;

    const scrollbarW = window.innerWidth - html.clientWidth;
    html.style.overflow = 'hidden';
    if (scrollbarW > 0) html.style.paddingRight = `${scrollbarW}px`;

    return () => {
      html.style.overflow = prevOverflow;
      html.style.paddingRight = prevPadRight;
    };
  }, []);

  const [openAddCampaign, setOpenAddCampaign] = useState(false);
  const [openAddPartner, setOpenAddPartner] = useState(false);
  const [openAddDatabase, setOpenAddDatabase] = useState(false);
  const highContrast = false;

  // ValidaciÃƒÂ³n con campaÃƒÂ±as dinÃƒÂ¡micas
  const allowedCampaigns = useMemo(() => {
    return new Set(CAMPAIGNS.map((campaign) => normalizeKey(campaign.name)));
  }, [CAMPAIGNS, normalizeKey]);

  const schema = z.object({
    date: z.string().min(1, 'Required'),
    campaign: z
      .string()
      .min(1, 'Required')
      .refine((v) => {
        const val = (v ?? '').trim().toLowerCase();
        if (allowedCampaigns.has(val)) return true;
        if (mode === 'edit' && initialRow) return val === initialRow.campaign.trim().toLowerCase();
        return false;
      }, 'Select a campaign from the list'),
    advertiser: z.string().min(1, 'Required'),
    invoiceOffice: ZInvoiceOffice, // <- enum fuerte
    partner: z.string().min(1, 'Required'),
    theme: z.string().min(1, 'Required'),
    price: z.coerce.number().nonnegative(),
    priceCurrency: z.string().default('EUR'),
    type: ZDealType, // <- enum fuerte
    vSent: z.coerce.number().int().nonnegative(),
    routingCosts: z.coerce.number().nonnegative(),
    qty: z.coerce.number().int().nonnegative(),
    turnover: z.coerce.number().nonnegative(),
    margin: z.coerce.number(),
    marginPct: z.number().nullable().default(null),
    ecpm: z.coerce.number().nonnegative(),
    database: z.string().min(1, 'Required'),
    geo: z.string().min(1, 'Required'),
    databaseType: ZDBType, // <- enum fuerte
  });
  type FormValues = z.infer<typeof schema>;
  type FieldName = keyof FormValues;

  // Helpers
  const safeDealType = (value: unknown): DealType =>
    typeof value === 'string' && (DEAL_TYPES as readonly string[]).includes(value) ? (value as DealType) : 'CPL';

  // RHF
  const { register, handleSubmit, formState, reset, watch, setValue, getValues } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      mode: 'onSubmit',
      defaultValues:
        mode === 'edit' && initialRow
          ? {
              date: initialRow.date,
              campaign: initialRow.campaign,
              advertiser: initialRow.advertiser,
              invoiceOffice: isInvoiceOffice(initialRow.invoiceOffice)
                ? initialRow.invoiceOffice
                : resolveOffice(initialRow.geo, initialRow.partner),
              partner: initialRow.partner || '',
              theme: initialRow.theme || '',
              price: initialRow.price,
              priceCurrency: initialRow.priceCurrency || 'EUR',
              type: safeDealType(initialRow.type),
              vSent: initialRow.vSent,
              routingCosts: initialRow.routingCosts,
              qty: initialRow.qty,
              turnover: initialRow.turnover,
              margin: initialRow.margin,
              marginPct:
                initialRow.turnover > 0 ? initialRow.margin / initialRow.turnover : null,
              ecpm: initialRow.ecpm,
              database: initialRow.database,
              geo: initialRow.geo,
              databaseType: isDBType(initialRow.databaseType) ? initialRow.databaseType : 'B2B',
            }
          : {
              date: seed?.date ?? new Date().toISOString().slice(0, 10),
              campaign: seed?.campaign ?? '',
              advertiser: seed?.advertiser ?? '',
              invoiceOffice: isInvoiceOffice(seed?.invoiceOffice)
                ? seed!.invoiceOffice!
                : resolveOffice(undefined, undefined),
              partner: seed?.partner ?? '',
              theme: seed?.theme ?? '',
              price: seed?.price ?? 0,
              priceCurrency: seed?.priceCurrency ?? 'EUR',
              type: safeDealType(seed?.type ?? TYPES[0] ?? 'CPL'),
              vSent: seed?.vSent ?? 0,
              routingCosts: seed?.routingCosts ?? 0,
              qty: seed?.qty ?? 0,
              turnover: seed?.turnover ?? 0,
              margin: seed?.margin ?? 0,
              marginPct: seed?.turnover ? (seed.margin ?? 0) / (seed.turnover ?? 1) : null,
              ecpm: seed?.ecpm ?? 0,
              database: seed?.database ?? '',
              // geo y databaseType se autocompletan tras escoger DB
            } as Partial<FormValues>,
    });
  const { ref: dateInputRef, ...dateField } = register('date');

  const { errors, isSubmitting, isDirty, isSubmitted, touchedFields, dirtyFields } = formState;

  const showErr = (name: FieldName) => {
    const fieldError = errors[name];
    if (!fieldError) return false;
    const touched = touchedFields[name];
    const dirty = dirtyFields[name];
    return isSubmitted || Boolean(touched) || Boolean(dirty);
  };

  const firstRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const trapRef = useRef<HTMLDivElement>(null);
  const submitIntentRef = useRef<'save' | 'save_add'>('save');

  const openDatePicker = (field?: HTMLInputElement | null) => {
    const input = field ?? firstRef.current;
    if (!input) return;

    input.focus({ preventScroll: true });

    const pickerInput = input as PickerInput;
    if (typeof pickerInput.showPicker === 'function') {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        /* browsers can throw if called too quickly; fallback below */
      }
    }

    try {
      input.click();
    } catch {
      /* noop */
    }
  };

  // Watches
  const campaign = watch('campaign');
  const database = watch('database');
  const geo = watch('geo');
  const partner = watch('partner');
  const price = watch('price');
  const qty = watch('qty');
  const vSent = watch('vSent');
  const watchTurnover = watch('turnover');
  const watchMargin = watch('margin');
  const watchEcpm = watch('ecpm');
  const watchMarginPct = watch('marginPct');

  // === Reglas automÃƒÂ¡ticas con catÃƒÂ¡logos dinÃƒÂ¡micos ===

  // (1) Campaign -> Advertiser (aÃƒÂ±ade CAMPAIGNS a deps)
  useEffect(() => {
    const c = findCampaignByName(campaign || '');
    setValue('advertiser', c?.advertiser ?? '', { shouldValidate: !!c });
  }, [campaign, findCampaignByName, setValue]);

  // Database -> GEO + DB Type (idempotente)
  useEffect(() => {
    const db = DATABASES.find((d) => d.name === database);
    const nextGeo = db?.geo ?? '';
    const nextDbType: DBType | undefined = db?.dbType;

    const currGeo = getValues('geo');
    const currDbt = getValues('databaseType');

    if (currGeo !== nextGeo) {
      setValue('geo', nextGeo, { shouldValidate: !!db, shouldDirty: !!db });
    }
    if (nextDbType && currDbt !== nextDbType) {
      setValue('databaseType', nextDbType, { shouldValidate: !!db, shouldDirty: !!db });
    }
  }, [database, DATABASES, getValues, setValue]);

  // (2) GEO + Partner -> Invoice office (no ensuciar si no cambia)
  useEffect(() => {
    const inv = resolveOffice(geo || undefined, partner || undefined);
    const curr = getValues('invoiceOffice');
    if (curr !== inv) {
      setValue('invoiceOffice', inv, { shouldValidate: false, shouldDirty: true });
    }
  }, [geo, partner, setValue, getValues, resolveOffice]);

  // CÃƒÂ¡lculos en vivo
  useEffect(() => {
    const _price = parseNum(price);
    const _qty = parseNum(qty);
    const _vSent = parseNum(vSent);

    const routingCosts = (_vSent / 1000) * 0.18;
    const turnover = _qty * _price;
    const margin = turnover - routingCosts;
    const marginPct = turnover > 0 ? margin / turnover : null;
    const ecpm = _vSent > 0 ? (turnover / _vSent) * 1000 : 0;

    setValue('routingCosts', Number(routingCosts.toFixed(2)));
    setValue('turnover', Number(turnover.toFixed(2)));
    setValue('margin', Number(margin.toFixed(2)));
    setValue('marginPct', marginPct == null ? null : Number(marginPct.toFixed(4)));
    setValue('ecpm', Number(ecpm.toFixed(2)));
  }, [price, qty, vSent, setValue]);

  // EnvÃƒÂ­o
  const persistCampaign = useCallback(
    async (data: FormValues, submitMode: 'save' | 'save_add') => {
      try {
        const _price = parseNum(data.price);
        const _qty = parseNum(data.qty);
        const _vSent = parseNum(data.vSent);
        const routingCosts = Number(((_vSent / 1000) * 0.18).toFixed(2));
        const turnover = Number((_qty * _price).toFixed(2));
        const margin = Number((turnover - routingCosts).toFixed(2));
        const ecpm = Number((_vSent > 0 ? (turnover / _vSent) * 1000 : 0).toFixed(2));

        const payload: Omit<CampaignRow, 'id'> = {
          date: data.date,
          campaign: data.campaign,
          advertiser: data.advertiser,
          invoiceOffice: data.invoiceOffice,
          partner: data.partner,
          theme: data.theme,
          price: _price,
          priceCurrency: data.priceCurrency || 'EUR',
          type: data.type,
          vSent: _vSent,
          routingCosts,
          qty: _qty,
          turnover,
          margin,
          ecpm,
          database: data.database,
          geo: data.geo,
          databaseType: data.databaseType,
        };

        if (mode === 'edit' && initialRow) {
          const ok = await updateCampaign(initialRow.id, payload);
          if (!ok) {
            showToast('Could not update campaign. Please try again.', { variant: 'error' });
            return;
          }
          showToast('Campaign updated successfully');
          onSaved?.(initialRow.id);
          onClose();
          return;
        }

        const newId = await addCampaign(payload);
        if (!newId) {
          showToast('Could not save campaign. Please try again.', { variant: 'error' });
          return;
        }
        showToast(
          submitMode === 'save_add' ? 'Campaign saved. Add another...' : 'Campaign saved successfully'
        );

        if (submitMode === 'save_add') {
          reset();
          setTimeout(() => firstRef.current?.focus(), 0);
        } else {
          reset();
          onSaved?.(newId);
          onClose();
        }
      } catch (e) {
        console.error(e);
        showToast('Something went wrong while saving', { variant: 'error' });
      } finally {
        submitIntentRef.current = 'save';
      }
    },
    [addCampaign, initialRow, mode, onClose, onSaved, reset, updateCampaign]
  );

  const onInvalid = useCallback(() => {
    submitIntentRef.current = 'save';
    showToast('Please fix the highlighted fields', { variant: 'error' });
  }, []);

  const requestClose = useCallback(() => {
    if (mode === 'edit' && isDirty) {
      const ok = confirm('You have unsaved changes. Discard them?');
      if (!ok) return;
    }
    onClose();
  }, [isDirty, mode, onClose]);

  // ESC + foco inicial + atajos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        submitIntentRef.current = 'save';
        formRef.current?.requestSubmit();
        return;
      }
      const target = e.target as HTMLElement | null;
      const role = target?.getAttribute?.('role');
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'Enter' && role !== 'combobox') {
        submitIntentRef.current = 'save';
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener('keydown', onKey);
    setTimeout(() => firstRef.current?.focus(), 0);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // Focus trap
  useEffect(() => {
    const node = trapRef.current;
    if (!node) return;

    const selector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const handle = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (active === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };

    node.addEventListener('keydown', handle);
    return () => node.removeEventListener('keydown', handle);
  }, []);

  const marginTextClass =
    watchMargin > 0
      ? 'text-[--color-primary]'
      : watchMargin < 0
      ? 'text-[--color-accent]'
      : 'opacity-70';

  // Inputs de solo lectura â€” compacto + contraste
  const roInput = 'input h-10 border-dotted bg-[color:var(--color-surface-2)]/70';
  const roErr = (bad?: boolean) => `${roInput} ${bad ? 'input-error' : ''}`;
  const errId = (name: string) => `err-${name}`;

  const routingHint =
    vSent > 0 ? `${fmtNum.format(vSent)}/1000 ${SYMBOL_MULTIPLY} 0.18` : `vSent / 1000 ${SYMBOL_MULTIPLY} 0.18`;
  const turnoverHint =
    qty > 0 || price > 0
      ? `${fmtNum.format(qty || 0)} ${SYMBOL_MULTIPLY} ${fmtNum.format(price || 0)}`
      : `qty ${SYMBOL_MULTIPLY} price`;
  const marginHint =
    watchTurnover > 0 || (watch('routingCosts') ?? 0) > 0
      ? `${fmtEUR.format(watchTurnover || 0)} ${SYMBOL_MINUS} ${fmtEUR.format(watch('routingCosts') || 0)}`
      : `turnover ${SYMBOL_MINUS} routing`;
  const ecpmHint =
    vSent > 0
      ? `(${fmtEUR.format(watchTurnover || 0)} / ${fmtNum.format(vSent)}) ${SYMBOL_MULTIPLY} 1000`
      : `(turnover / vSent) ${SYMBOL_MULTIPLY} 1000`;

  // === UI ===
  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop (oscuro + blur) */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        data-backdrop="true"
        onMouseDown={requestClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        ref={trapRef}
        className="relative card w-full max-w-[76rem] max-h-[90vh] overflow-hidden border border-[--color-border] shadow-xl"
        style={{ background: 'var(--color-surface)' }}
        onMouseDown={(e) => {
          // Evita que el click dentro del card burbujee al backdrop
          e.stopPropagation();
        }}
      >
        {/* Header sticky */}
        <div className="sticky top-0 z-10 modal-chrome modal-header px-5 py-2.5">
          <div className="accent-strip" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">
              {mode === 'edit' ? 'Edit campaign' : 'Create campaign'}
            </h3>
            <button className="btn-ghost h-9 w-9 p-0" onClick={requestClose} aria-label="Close modal">
              <span aria-hidden className="text-xl leading-none">&times;</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body overflow-y-auto px-5 pt-6 pb-5 relative">
          <div className="edge-fade edge-top" aria-hidden />

          <form
            ref={formRef}
            id="create-edit-campaign-form"
            onSubmit={handleSubmit(
              (formData) => persistCampaign(formData, submitIntentRef.current),
              onInvalid
            )}
            className="grid gap-4 xl:grid-cols-12 items-start"
          >
            <div className="col-span-12 xl:col-span-7 flex flex-col gap-4">
              {/* A) Basics */}
            <Section title="Basics" highContrast={highContrast}>
              <div className="grid grid-cols-12 gap-x-4 gap-y-4">
                <div className="col-span-12 md:col-span-4">
                  <Field label="Date">
                    <>
                      <div className="field-with-suffix flex w-full items-stretch">
                        <input
                          ref={(element) => {
                            dateInputRef(element);
                            firstRef.current = element;
                          }}
                          type="date"
                          {...dateField}
                          aria-invalid={showErr('date') || undefined}
                          aria-describedby={showErr('date') ? errId('date') : undefined}
                          className={`input input-date h-10 ${showErr('date') ? 'input-error' : ''}`}
                          onMouseDown={(event) => {
                            const target = event.currentTarget as PickerInput;
                            if (typeof target.showPicker === 'function') {
                              event.preventDefault();
                              openDatePicker(target);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="field-suffix-button shrink-0 h-10 w-[2.75rem]"
                          onClick={() => openDatePicker(firstRef.current)}
                          aria-label="Open date picker"
                        >
                          <CalendarIcon />
                        </button>
                      </div>
                      <Err id={errId('date')} e={showErr('date') ? errors.date : undefined} />
                    </>
                  </Field>
                </div>
                <div className="col-span-12 md:col-span-8">
                  <Field label="Campaign">
                    <FieldWithAddon
                      onAdd={canQuickAdd ? () => setOpenAddCampaign(true) : undefined} // ðŸ†•
                      addAriaLabel="Add campaign"
                      className="w-full"
                    >
                      <div className="w-full min-w-0">
                        <Combobox
                          id="campaign"
                          ariaLabel="Campaign"
                          className="w-full"
                          options={CAMPAIGNS.map((c) => ({ id: c.id, value: c.name }))}
                          value={watch('campaign')}
                          onChange={(v) =>
                            setValue('campaign', v, { shouldValidate: true, shouldDirty: true })
                          }
                          invalid={showErr('campaign')}
                          ariaDescribedby={showErr('campaign') ? errId('campaign') : undefined}
                        />
                      </div>
                    </FieldWithAddon>

                    <Err
                      id={errId('campaign')}
                      e={showErr('campaign') ? errors.campaign : undefined}
                    />
                  </Field>
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Field label="Advertiser" badge="AUTO" hint="Auto-filled from campaign name">
                    <div className="relative">
                      <input
                        type="text"
                        {...register('advertiser')}
                        readOnly
                        aria-invalid={showErr('advertiser') || undefined}
                        aria-describedby={showErr('advertiser') ? errId('advertiser') : undefined}
                        className={roErr(showErr('advertiser'))}
                      />
                      {showErr('advertiser') && (
                        <Tooltip
                          content={errors.advertiser?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err
                      id={errId('advertiser')}
                      e={showErr('advertiser') ? errors.advertiser : undefined}
                    />
                  </Field>
                </div>

                <div className="col-span-12 md:col-span-6">
                  <Field label="Invoice office" badge="AUTO" hint="Auto-selected from partner and geo">
                    <div className="relative">
                      <input
                        type="text"
                        {...register('invoiceOffice')}
                        readOnly
                        aria-invalid={showErr('invoiceOffice') || undefined}
                        aria-describedby={
                          showErr('invoiceOffice') ? errId('invoiceOffice') : undefined
                        }
                        className={roErr(showErr('invoiceOffice'))}
                      />
                      {showErr('invoiceOffice') && (
                        <Tooltip
                          content={errors.invoiceOffice?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err
                      id={errId('invoiceOffice')}
                      e={showErr('invoiceOffice') ? errors.invoiceOffice : undefined}
                    />
                  </Field>
                </div>

                <div className="col-span-12 md:col-span-6">
                  <Field label="Partner">
                    <FieldWithAddon
                      onAdd={canQuickAdd ? () => setOpenAddPartner(true) : undefined} // ðŸ†•
                      addAriaLabel="Add partner"
                    >
                      <select
                        {...register('partner')}
                        className="input h-10"
                        aria-invalid={showErr('partner') || undefined}
                        aria-describedby={showErr('partner') ? errId('partner') : undefined}
                      >
                        <option value="">-- Select --</option>
                        {PARTNERS.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name}
                            {p.isInternal ? ' (INT)' : ''}
                          </option>
                        ))}
                      </select>
                    </FieldWithAddon>
                    <Err id={errId('partner')} e={showErr('partner') ? errors.partner : undefined} />
                  </Field>
                </div>

                <div className="col-span-12 md:col-span-6">
                  <Field label="Theme">
                    <div className="relative">
                      <select
                        {...register('theme')}
                        aria-invalid={showErr('theme') || undefined}
                        aria-describedby={showErr('theme') ? errId('theme') : undefined}
                        className={`input h-10 ${showErr('theme') ? 'input-error' : ''}`}
                      >
                        <option value="">-- Select --</option>
                        {THEMES.map((t: string) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      {showErr('theme') && (
                        <Tooltip
                          content={errors.theme?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err id={errId('theme')} e={showErr('theme') ? errors.theme : undefined} />
                  </Field>
                </div>
              </div>
            </Section>

            {/* B) Commercial */}
            <Section title="Commercial" highContrast={highContrast}>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
              >
                <div className="min-w-0">
                  <Field label="Type">
                    <div className="relative">
                      <select
                        {...register('type')}
                        aria-invalid={showErr('type') || undefined}
                        aria-describedby={showErr('type') ? errId('type') : undefined}
                        className={`input h-10 ${showErr('type') ? 'input-error' : ''}`}
                      >
                        {TYPES.filter((t: string) =>
                          (DEAL_TYPES as readonly string[]).includes(t)
                        ).map((t: string) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      {showErr('type') && (
                        <Tooltip
                          content={errors.type?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err id={errId('type')} e={showErr('type') ? errors.type : undefined} />
                  </Field>
                </div>
                <div className="min-w-0">
                  <Field label="Price (EUR)">
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        {...register('price')}
                        aria-invalid={showErr('price') || undefined}
                        aria-describedby={showErr('price') ? errId('price') : undefined}
                        className={`input h-10 ${showErr('price') ? 'input-error' : ''}`}
                      />
                      {showErr('price') && (
                        <Tooltip
                          content={errors.price?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err id={errId('price')} e={showErr('price') ? errors.price : undefined} />
                  </Field>
                </div>
                <div className="min-w-0">
                  <Field label="QTY">
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        {...register('qty')}
                        aria-invalid={showErr('qty') || undefined}
                        aria-describedby={showErr('qty') ? errId('qty') : undefined}
                        className={`input h-10 ${showErr('qty') ? 'input-error' : ''}`}
                      />
                      {showErr('qty') && (
                        <Tooltip
                          content={errors.qty?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err id={errId('qty')} e={showErr('qty') ? errors.qty : undefined} />
                  </Field>
                </div>
                <div className="min-w-0">
                  <Field label="V Sent">
                    <div className="relative">
                      <input
                        type="number"
                        {...register('vSent')}
                        aria-invalid={showErr('vSent') || undefined}
                        aria-describedby={showErr('vSent') ? errId('vSent') : undefined}
                        className={`input h-10 ${showErr('vSent') ? 'input-error' : ''}`}
                      />
                      {showErr('vSent') && (
                        <Tooltip
                          content={errors.vSent?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err id={errId('vSent')} e={showErr('vSent') ? errors.vSent : undefined} />
                  </Field>
                </div>
              </div>
            </Section>

            {/* C) Data source */}
            <Section title="Data source" highContrast={highContrast}>
              <div className="flex flex-wrap gap-x-5 gap-y-4">
                <div className="w-full xl:flex-[1.25] min-w-[200px]">
                  <Field label="Database">
                    <FieldWithAddon
                      onAdd={canQuickAdd ? () => setOpenAddDatabase(true) : undefined} // ðŸ†•
                      addAriaLabel="Add database"
                    >
                      <select
                        {...register('database')}
                        className="input h-10"
                        aria-invalid={showErr('database') || undefined}
                        aria-describedby={showErr('database') ? errId('database') : undefined}
                      >
                        <option value="">-- Select --</option>
                        {DATABASES.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </FieldWithAddon>
                    <Err
                      id={errId('database')}
                      e={showErr('database') ? errors.database : undefined}
                    />
                  </Field>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <Field label="GEO" badge="AUTO" hint="Auto-filled from database">
                    <div className="relative">
                      <input
                        type="text"
                        {...register('geo')}
                        readOnly
                        aria-invalid={showErr('geo') || undefined}
                        aria-describedby={showErr('geo') ? errId('geo') : undefined}
                        className={roErr(showErr('geo'))}
                      />
                      {showErr('geo') && (
                        <Tooltip
                          content={errors.geo?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err id={errId('geo')} e={showErr('geo') ? errors.geo : undefined} />
                  </Field>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <Field label="DB Type" badge="AUTO" hint="Auto-filled from database">
                    <div className="relative">
                      <input
                        type="text"
                        {...register('databaseType')}
                        readOnly
                        aria-invalid={showErr('databaseType') || undefined}
                        aria-describedby={
                          showErr('databaseType') ? errId('databaseType') : undefined
                        }
                        className={roErr(showErr('databaseType'))}
                      />
                      {showErr('databaseType') && (
                        <Tooltip
                          content={errors.databaseType?.message}
                          className="absolute right-2 inset-y-0 flex items-center"
                        >
                          <span aria-hidden className="text-[--color-accent] text-sm">âš </span>
                        </Tooltip>
                      )}
                    </div>
                    <Err
                      id={errId('databaseType')}
                      e={showErr('databaseType') ? errors.databaseType : undefined}
                    />
                  </Field>
                </div>
              </div>
            </Section>
            </div>

            <aside className="col-span-12 xl:col-span-5 mt-10 xl:mt-6 xl:pl-4">
              <div
                className="flex flex-col gap-5 xl:sticky"
                style={{ top: 'calc(var(--content-sticky-top, 5.5rem) + 4rem)' }}
              >
                {/* KPI BAR */}
                <Section title="Performance Summary" highContrast={highContrast}>
                  <div className="kpi-frame">
                    <KPIBar
                      turnover={watchTurnover || 0}
                      margin={watchMargin || 0}
                      marginPct={watchMarginPct}
                      ecpm={watchEcpm || 0}
                      fmtEUR={fmtEUR}
                      fmtPct={fmtPct}
                      positiveClass="text-[--color-primary]"
                      negativeClass="text-[--color-accent]"
                    />
                  </div>
                </Section>

                {/* D) Results */}
                <Section title="Key Metrics" highContrast={highContrast}>
                  <div className="grid grid-cols-12 gap-x-4 gap-y-4">
                    <div className="col-span-12">
                      <Field label="Routing costs (€)" badge="CALC" hint={`Formula: ${routingHint}`}>
                        <input
                          type="number"
                          step="0.01"
                          {...register('routingCosts')}
                          className={roInput}
                          readOnly
                        />
                        <Err
                          id={errId('routingCosts')}
                          e={showErr('routingCosts') ? errors.routingCosts : undefined}
                        />
                      </Field>
                    </div>
                    <div className="col-span-12 sm:col-span-6">
                      <Field label="Turnover (€)" badge="CALC" hint={`Formula: ${turnoverHint}`}>
                        <div className="relative group">
                          <input
                            type="number"
                            step="0.01"
                            {...register('turnover')}
                            className={`${roInput} pr-16`}
                            readOnly
                          />
                          <span className="absolute inset-y-0 right-2 flex items-center text-xs opacity-0 group-hover:opacity-70 group-focus-within:opacity-70 transition-opacity">
                            {fmtEUR.format(watchTurnover || 0)}
                          </span>
                        </div>
                        <Err
                          id={errId('turnover')}
                          e={showErr('turnover') ? errors.turnover : undefined}
                        />
                      </Field>
                    </div>
                    <div className="col-span-12 sm:col-span-6">
                      <Field label="Margin" badge="CALC" hint={`Formula: ${marginHint}`}>
                        <div className="relative group">
                          <input
                            type="number"
                            step="0.01"
                            {...register('margin')}
                            className={`${roInput} pr-24 ${marginTextClass}`}
                            readOnly
                            aria-live="polite"
                          />
                          <span
                            className={`absolute inset-y-0 right-2 flex items-center text-xs opacity-0 group-hover:opacity-90 group-focus-within:opacity-90 transition-opacity ${marginTextClass}`}
                          >
                            {fmtEUR.format(watchMargin || 0)}
                            {watchMarginPct == null ? '' : ` (${fmtPct.format(watchMarginPct)})`}
                          </span>
                        </div>
                        <Err id={errId('margin')} e={showErr('margin') ? errors.margin : undefined} />
                      </Field>
                    </div>
                    <div className="col-span-12">
                      <Field label="eCPM (€)" badge="CALC" hint={`Formula: ${ecpmHint}`}>
                        <div className="relative group">
                          <input
                            type="number"
                            step="0.01"
                            {...register('ecpm')}
                            className={`${roInput} pr-16`}
                            readOnly
                          />
                          <span className="absolute inset-y-0 right-2 flex items-center text-xs opacity-0 group-hover:opacity-70 group-focus-within:opacity-70 transition-opacity">
                            {fmtEUR.format(watchEcpm || 0)}
                          </span>
                        </div>
                        <Err id={errId('ecpm')} e={showErr('ecpm') ? errors.ecpm : undefined} />
                      </Field>
                    </div>
                  </div>
                </Section>
              </div>
            </aside>
          </form>

          <div className="edge-fade edge-bottom" aria-hidden />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 modal-chrome modal-footer px-5 py-2.5">
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={requestClose} className="btn-ghost">Cancel</button>
            {mode === 'create' && (
              <button
                type="submit"
                form="create-edit-campaign-form"
                disabled={isSubmitting}
                className="btn-ghost"
                onClick={() => { submitIntentRef.current = 'save_add'; }}
              >
                Save & add another
              </button>
            )}
            <button
              type="submit"
              form="create-edit-campaign-form"
              disabled={isSubmitting}
              className="btn-primary"
              onClick={() => { submitIntentRef.current = 'save'; }}
            >
              {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Quick-add modals */}
      {openAddCampaign && (
        <QuickAddCampaignModal
          onClose={() => setOpenAddCampaign(false)}
          onCreated={(newName) => {
            setValue('campaign', newName, { shouldDirty: true, shouldValidate: true });
          }}
        />
      )}
      {openAddPartner && (
        <QuickAddPartnerModal
          onClose={() => setOpenAddPartner(false)}
          onCreated={(newName) => {
            setValue('partner', newName, { shouldDirty: true, shouldValidate: true });
          }}
        />
      )}
      {openAddDatabase && (
        <QuickAddDatabaseModal
          onClose={() => setOpenAddDatabase(false)}
          onCreated={(newName) => {
            setValue('database', newName, { shouldDirty: true, shouldValidate: true });
          }}
        />
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}

// ======================= UI helpers =======================
function Field({
  label,
  children,
  badge,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  badge?: 'AUTO' | 'CALC';
  hint?: string;
}) {
  const nodes = Children.toArray(children);
  let controlNodes = nodes;
  let extraNodes: React.ReactNode[] = [];

  if (nodes.length > 0) {
    const last = nodes[nodes.length - 1];
    if (isValidElement(last) && last.type === Err) {
      controlNodes = nodes.slice(0, -1);
      extraNodes = [last];
    }
  }

  return (
    <label className="form-field">
      <span className="form-field__label">
        {label}
        {badge ? <FieldBadge type={badge} /> : null}
      </span>
      <div className="form-field__control">{controlNodes}</div>
      {extraNodes}
      {hint ? <span className="form-field__hint">{hint}</span> : null}
    </label>
  );
}

function FieldBadge({ type }: { type: 'AUTO' | 'CALC' }) {
  return (
    <span
      className="badge-field"
      data-variant={type === 'CALC' ? 'calc' : undefined}
      aria-label={type === 'AUTO' ? 'Auto-filled' : 'Calculated'}
      title={type === 'AUTO' ? 'Auto-filled' : 'Calculated'}
    >
      {type}
    </span>
  );
}

function Err({ id, e }: { id: string; e?: { message?: string } }) {
  if (!e?.message) return null;
  return (
    <span id={id} role="status" className="text-[--color-accent] text-xs">
      {e.message}
    </span>
  );
}

function Section({ title, children, highContrast }: { title: string; children: React.ReactNode; highContrast: boolean }) {
  return (
    <section className="form-section col-span-12">
      <header className="form-section__header">
        <span className="form-section__title">{title}</span>
        <span className="form-section__accent" aria-hidden />
      </header>
      <div className={`form-section__body ${highContrast ? 'form-section__body--hc' : ''}`}>
        {children}
      </div>
    </section>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17" rx="3" ry="3" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function KPIBar({
  turnover,
  margin,
  marginPct,
  ecpm,
  fmtEUR,
  fmtPct,
  positiveClass,
  negativeClass,
}: {
  turnover: number;
  margin: number;
  marginPct: number | null;
  ecpm: number;
  fmtEUR: Intl.NumberFormat;
  fmtPct: Intl.NumberFormat;
  positiveClass?: string;
  negativeClass?: string;
}) {
  const marginClass =
    margin > 0
      ? (positiveClass || 'text-green-600')
      : margin < 0
      ? (negativeClass || 'text-red-600')
      : 'opacity-80';
  const tileClass =
    'min-w-0 rounded-lg bg-[color:var(--color-surface-2)]/70 px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition-shadow';

  const renderCurrency = (value: number) => {
    const parts = fmtEUR.formatToParts(value || 0);
    const currency = parts.find((part) => part.type === 'currency')?.value ?? '';
    const numericPortion = parts
      .filter((part) => part.type !== 'currency' && part.type !== 'literal')
      .map((part) => part.value)
      .join('');

    return (
      <span
        className="inline-flex items-baseline gap-1 whitespace-nowrap"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <span>{numericPortion}</span>
        <span className="text-base sm:text-lg font-semibold">{currency}</span>
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className={tileClass}>
        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/60">Turnover</div>
        <div
          className="mt-1 flex items-baseline text-lg sm:text-[1.35rem] font-semibold leading-tight text-[color:var(--color-text)]/90"
        >
          {renderCurrency(turnover)}
        </div>
      </div>
      <div className={tileClass}>
        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/60">Margin</div>
        <div
          className={`mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg sm:text-[1.35rem] font-semibold leading-tight ${marginClass}`}
        >
          {renderCurrency(margin)}
          {marginPct == null ? null : (
            <span className="text-sm sm:text-base font-medium opacity-80 whitespace-nowrap">
              ({fmtPct.format(marginPct)})
            </span>
          )}
        </div>
      </div>
      <div className={tileClass}>
        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/60">eCPM</div>
        <div
          className="mt-1 flex items-baseline text-lg sm:text-[1.35rem] font-semibold leading-tight text-[color:var(--color-text)]/90"
        >
          {renderCurrency(ecpm)}
        </div>
      </div>
    </div>
  );
}








