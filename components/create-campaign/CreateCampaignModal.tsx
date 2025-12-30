'use client';

import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCampaignData } from '@/context/CampaignDataContext';
import { CampaignRow } from '@/types/campaign';
import Combobox from '@/components/ui/Combobox';
import Tooltip from '@/components/ui/Tooltip';
import ModalShell from '@/components/ui/ModalShell';
import { useCatalogOverrides } from '@/context/CatalogOverridesContext';
import QuickAddCampaignModal from '@/components/create-campaign/QuickAddCampaignModal';
import QuickAddPartnerModal from '@/components/create-campaign/QuickAddPartnerModal';
import QuickAddDatabaseModal from '@/components/create-campaign/QuickAddDatabaseModal';
import FieldWithAddon from '@/components/ui/FieldWithAddon';
import DatePicker from '@/components/ui/DatePicker';
import { flagInfoForDatabase } from '@/utils/flags';
import type { CampaignRef, PartnerRef, DatabaseRef, DBType, InvoiceOffice } from '@/data/reference';
import { useAuth } from '@/context/AuthContext'; // roles para quick-add

// ======================= Utils =======================

const fmtEUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const CURRENCY_EUR = 'EUR' as const;

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

const isDBType = (value: unknown): value is DBType =>
  typeof value === 'string' && (DB_TYPES as readonly string[]).includes(value);
const isInvoiceOffice = (value: unknown): value is InvoiceOffice =>
  typeof value === 'string' && (INVOICE_OFFICES as readonly string[]).includes(value);
const getEcpmStatusIcon = (value: number) => {
  if (value >= 0.6) return '/animations/profit.gif';
  if (value <= 0.25) return '/animations/devaluation.gif';
  return '/animations/resilience.gif';
};
const renderDatabaseOption = (option: { value: string; label?: string }) => {
  const dbName = option.label || option.value;
  const flag = flagInfoForDatabase(dbName);

  return (
    <div className="flex items-center gap-3">
      <span
        className={`fi fi-${flag.code} h-5 w-5 rounded-sm shadow-sm flex-shrink-0`}
        style={{ backgroundSize: 'cover' }}
        aria-hidden="true"
      />
      <span className="truncate">{dbName}</span>
    </div>
  );
};

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

  // flag de permisos para quick-add
  const { isAdmin, isEditor } = useAuth();
  const canQuickAdd = isAdmin || isEditor;

  // === Catalogos dinamicos ===
  const catalogs = useCatalogOverrides();
  const CAMPAIGNS = catalogs?.CAMPAIGNS ?? EMPTY_CAMPAIGNS;
  const PARTNERS = catalogs?.PARTNERS ?? EMPTY_PARTNERS;
  const DATABASES = catalogs?.DATABASES ?? EMPTY_DATABASES;
  const THEMES = useMemo(() => catalogs?.THEMES ?? [], [catalogs?.THEMES]);
  const TYPES = (catalogs?.TYPES ?? DEAL_TYPES.slice()).slice();

  const normalizeKey = useCallback((value: string) => value.trim().toLowerCase(), []);
  const findCampaignByName = useCallback(
    (name: string) => CAMPAIGNS.find((campaign) => normalizeKey(campaign.name) === normalizeKey(name)),
    [CAMPAIGNS, normalizeKey]
  );

  // Resolver de oficina de facturacion tipado y seguro
  const resolveOffice = useCallback(
    (geo?: string, partner?: string): InvoiceOffice => {
      const resolver = catalogs?.resolveInvoiceOfficeMerged;
      const result = resolver ? resolver(geo, partner) : 'DAT';
      return isInvoiceOffice(result) ? result : 'DAT';
    },
    [catalogs]
  );

  const [openAddCampaign, setOpenAddCampaign] = useState(false);
  const [openAddPartner, setOpenAddPartner] = useState(false);
  const [openAddDatabase, setOpenAddDatabase] = useState(false);
  const highContrast = false;

  // Validacion con campanas dinamicas
  const allowedCampaigns = useMemo(() => {
    return new Set(CAMPAIGNS.map((campaign) => normalizeKey(campaign.name)));
  }, [CAMPAIGNS, normalizeKey]);
  const allowedPartners = useMemo(() => {
    return new Set(PARTNERS.map((partner) => normalizeKey(partner.name)));
  }, [PARTNERS, normalizeKey]);
  const allowedThemes = useMemo(() => {
    return new Set(THEMES.map((theme) => normalizeKey(theme)));
  }, [THEMES, normalizeKey]);

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
    partner: z
      .string()
      .min(1, 'Required')
      .refine((v) => {
        const val = (v ?? '').trim().toLowerCase();
        if (!val) return false;
        if (allowedPartners.has(val)) return true;
        if (mode === 'edit' && initialRow) {
          return val === normalizeKey(initialRow.partner || '');
        }
        return false;
      }, 'Select a partner from the list'),
    theme: z
      .string()
      .min(1, 'Required')
      .refine((v) => {
        const val = (v ?? '').trim().toLowerCase();
        if (!val) return false;
        if (allowedThemes.has(val)) return true;
        if (mode === 'edit' && initialRow) {
          return val === normalizeKey(initialRow.theme || '');
        }
        return false;
      }, 'Select a theme from the list'),
    price: z.coerce.number().nonnegative(),
    priceCurrency: z.literal(CURRENCY_EUR),
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
  const defaultValues: FormValues = useMemo(() => {
    if (mode === 'edit' && initialRow) {
      return {
        date: initialRow.date,
        campaign: initialRow.campaign,
        advertiser: initialRow.advertiser,
        invoiceOffice: isInvoiceOffice(initialRow.invoiceOffice)
          ? initialRow.invoiceOffice
          : resolveOffice(initialRow.geo, initialRow.partner),
        partner: initialRow.partner || '',
        theme: initialRow.theme || '',
        price: initialRow.price,
        priceCurrency: CURRENCY_EUR,
        type: safeDealType(initialRow.type),
        vSent: initialRow.vSent,
        routingCosts: initialRow.routingCosts,
        qty: initialRow.qty,
        turnover: initialRow.turnover,
        margin: initialRow.margin,
        marginPct: initialRow.turnover > 0 ? initialRow.margin / initialRow.turnover : null,
        ecpm: initialRow.ecpm,
        database: initialRow.database ?? '',
        geo: initialRow.geo ?? '',
        databaseType: isDBType(initialRow.databaseType) ? initialRow.databaseType : 'B2B',
      };
    }

    const seedInvoice = isInvoiceOffice(seed?.invoiceOffice) ? seed?.invoiceOffice : null;
    const seedDbType = isDBType(seed?.databaseType) ? seed?.databaseType : 'B2B';

    return {
      date: seed?.date ?? new Date().toISOString().slice(0, 10),
      campaign: seed?.campaign ?? '',
      advertiser: seed?.advertiser ?? '',
      invoiceOffice: seedInvoice ?? resolveOffice(undefined, undefined),
      partner: seed?.partner ?? '',
      theme: seed?.theme ?? '',
      price: seed?.price ?? 0,
      priceCurrency: CURRENCY_EUR,
      type: safeDealType(seed?.type ?? TYPES[0] ?? 'CPL'),
      vSent: seed?.vSent ?? 0,
      routingCosts: seed?.routingCosts ?? 0,
      qty: seed?.qty ?? 0,
      turnover: seed?.turnover ?? 0,
      margin: seed?.margin ?? 0,
      marginPct:
        seed?.turnover && seed.turnover > 0
          ? (seed.margin ?? 0) / seed.turnover
          : null,
      ecpm: seed?.ecpm ?? 0,
      database: seed?.database ?? '',
      geo: seed?.geo ?? '',
      databaseType: seedDbType,
    };
  }, [initialRow, mode, resolveOffice, seed, TYPES]);

  const { register, handleSubmit, formState, reset, watch, setValue, getValues } =
    useForm<FormValues, undefined, FormValues>({
      resolver: zodResolver(schema) as Resolver<FormValues>,
      mode: 'onSubmit',
      defaultValues,
    });

  const { errors, isSubmitting, isDirty, isSubmitted, touchedFields, dirtyFields } = formState;

  const showErr = (name: FieldName) => {
    const fieldError = errors[name];
    if (!fieldError) return false;
    const touched = touchedFields[name];
    const dirty = dirtyFields[name];
    return isSubmitted || Boolean(touched) || Boolean(dirty);
  };

  const campaignError =
    showErr('campaign') ? errors.campaign : showErr('advertiser') ? errors.advertiser : undefined;
  const partnerError =
    showErr('partner') ? errors.partner : showErr('invoiceOffice') ? errors.invoiceOffice : undefined;
  const databaseError =
    showErr('database')
      ? errors.database
      : showErr('geo')
      ? errors.geo
      : showErr('databaseType')
      ? errors.databaseType
      : undefined;

  const firstRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitIntentRef = useRef<'save' | 'save_add'>('save');

  // Watches
  const dateValue = watch('date');
  const campaign = watch('campaign');
  const advertiser = watch('advertiser');
  const database = watch('database');
  const geo = watch('geo');
  const databaseType = watch('databaseType');
  const partner = watch('partner');
  const invoiceOffice = watch('invoiceOffice');
  const themeValue = watch('theme');
  const price = watch('price');
  const qty = watch('qty');
  const vSent = watch('vSent');
  const watchTurnover = watch('turnover');
  const watchMargin = watch('margin');
  const watchMarginPct = watch('marginPct');
  const watchEcpm = watch('ecpm');
  const marginPctValue = Number.isFinite(watchMarginPct)
    ? watchMarginPct
    : Number(watchMarginPct) || 0;
  const marginBadgeClass =
    marginPctValue >= 0.6
      ? 'bg-emerald-100 text-emerald-700'
      : marginPctValue <= 0.25
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';
  const ecpmValue = Number.isFinite(watchEcpm) ? watchEcpm : Number(watchEcpm) || 0;
  const ecpmStatusIcon = getEcpmStatusIcon(ecpmValue);

  // === Reglas automaticas con catalogos dinamicos ===

  // (1) Campaign -> Advertiser (add CAMPAIGNS to deps)
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

  // Calculos en vivo
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

  // Envio
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
          priceCurrency: CURRENCY_EUR,
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

  // Atajos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // Foco inicial (solo al montar)
  useEffect(() => {
    const timer = window.setTimeout(() => firstRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const errId = (name: string) => `err-${name}`;

  // === UI ===
  return (
    <>
      <ModalShell
        title={mode === 'edit' ? 'Edit campaign' : 'Create campaign'}
        onClose={requestClose}
        widthClass="max-w-4xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="btn-ghost border border-slate-200 hover:bg-white"
            >
              Cancel
            </button>
            {mode === 'create' && (
              <button
                type="submit"
                form="create-edit-campaign-form"
                disabled={isSubmitting}
                className="btn-ghost border border-slate-200 hover:bg-white"
                onClick={() => {
                  submitIntentRef.current = 'save_add';
                }}
              >
                Save & add another
              </button>
            )}
            <button
              type="submit"
              form="create-edit-campaign-form"
              disabled={isSubmitting}
              className="btn-primary"
              onClick={() => {
                submitIntentRef.current = 'save';
              }}
            >
              {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Save'}
            </button>
          </div>
        }
      >
        <form
                    ref={formRef}
                    id="create-edit-campaign-form"
                    data-variant="clean-tech"
                    onSubmit={handleSubmit(
                      (formData) => persistCampaign(formData, submitIntentRef.current),
                      onInvalid
                    )}
                    className="flex flex-col"
                  >
                    <div className="mx-auto flex w-full max-w-4xl flex-col">
                      {/* A) Basics */}
                    <Section title="Basics" highContrast={highContrast}>
                      <div className="grid grid-cols-12 gap-x-4 gap-y-4">
                        <div className="col-span-12 md:col-span-4">
                          <Field label="Date">
                            <DatePicker
                              value={dateValue}
                              onChange={(next) =>
                                setValue('date', next, {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                  shouldTouch: true,
                                })
                              }
                              ariaLabel="Date"
                              invalid={showErr('date')}
                              ariaDescribedby={showErr('date') ? errId('date') : undefined}
                              buttonRef={(node) => {
                                firstRef.current = node;
                              }}
                            />
                            <input type="hidden" {...register('date')} />
                            <Err id={errId('date')} e={showErr('date') ? errors.date : undefined} />
                          </Field>
                        </div>
                        <div className="col-span-12 md:col-span-8">
                          <Field label="Campaign">
                            <FieldWithAddon
                              onAdd={canQuickAdd ? () => setOpenAddCampaign(true) : undefined}
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

                            {advertiser ? (
                              <div className="mt-1 flex items-center gap-2 text-xs font-medium text-gray-500">
                                <span
                                  aria-hidden
                                  className="h-1.5 w-1.5 rounded-full bg-gray-400"
                                />
                                <span>Advertiser: {advertiser}</span>
                              </div>
                            ) : null}
                            <input type="hidden" {...register('advertiser')} />
                            <Err id={errId('campaign')} e={campaignError} />
                          </Field>
                        </div>



                        <div className="col-span-12 md:col-span-6">
                          <Field label="Partner">
                            <FieldWithAddon
                              onAdd={canQuickAdd ? () => setOpenAddPartner(true) : undefined}
                              addAriaLabel="Add partner"
                              className="w-full"
                            >
                              <div className="w-full min-w-0">
                                <Combobox
                                  ariaLabel="Partner"
                                  className="w-full"
                                  placeholder="Select partner"
                                  options={PARTNERS.map((p) => ({
                                    id: p.id,
                                    value: p.name,
                                    label: p.isInternal ? `${p.name} (INT)` : p.name,
                                  }))}
                                  value={partner}
                                  onChange={(v) =>
                                    setValue('partner', v, { shouldValidate: true, shouldDirty: true })
                                  }
                                  invalid={showErr('partner')}
                                  ariaDescribedby={showErr('partner') ? errId('partner') : undefined}
                                />
                              </div>
                            </FieldWithAddon>
                            {invoiceOffice && (partner || geo) ? (
                              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                <span>Invoice office</span>
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                  {invoiceOffice}
                                </span>
                              </div>
                            ) : null}
                            <input type="hidden" {...register('invoiceOffice')} />
                            <Err id={errId('partner')} e={partnerError} />
                          </Field>
                        </div>



                        <div className="col-span-12 md:col-span-6">
                          <Field label="Theme">
                            <Combobox
                              ariaLabel="Theme"
                              className="w-full"
                              placeholder="Select theme"
                              options={THEMES.map((t: string) => ({ id: t, value: t }))}
                              value={themeValue}
                              onChange={(v) =>
                                setValue('theme', v, { shouldValidate: true, shouldDirty: true })
                              }
                              invalid={showErr('theme')}
                              ariaDescribedby={showErr('theme') ? errId('theme') : undefined}
                            />
                            <Err id={errId('theme')} e={showErr('theme') ? errors.theme : undefined} />
                          </Field>
                        </div>
                      </div>
                    </Section>

                    {/* B) Commercial */}
                    <Section
                      title="Commercial"
                      highContrast={highContrast}
                      className="commercial-section border-l-4 border-l-indigo-500 bg-slate-50"
                    >
                      <div className="grid w-full grid-cols-4 gap-4 mb-6">
                        <div className="min-w-0 col-span-1">
                          <Field label="Type">
                            <div className="relative">
                              <select
                                {...register('type')}
                                aria-invalid={showErr('type') || undefined}
                                aria-describedby={showErr('type') ? errId('type') : undefined}
                                className={`input w-full ${showErr('type') ? 'input-error' : ''}`}
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
                                  <span aria-hidden className="text-[--color-accent] text-sm">!</span>
                                </Tooltip>
                              )}
                            </div>
                            <Err id={errId('type')} e={showErr('type') ? errors.type : undefined} />
                          </Field>
                        </div>
                        <div className="min-w-0 col-span-1">
                          <Field label="Price (EUR)">
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                {...register('price')}
                                aria-invalid={showErr('price') || undefined}
                                aria-describedby={showErr('price') ? errId('price') : undefined}
                                className={`input w-full ${showErr('price') ? 'input-error' : ''}`}
                              />
                              {showErr('price') && (
                                <Tooltip
                                  content={errors.price?.message}
                                  className="absolute right-2 inset-y-0 flex items-center"
                                >
                                  <span aria-hidden className="text-[--color-accent] text-sm">!</span>
                                </Tooltip>
                              )}
                            </div>
                            <Err id={errId('price')} e={showErr('price') ? errors.price : undefined} />
                          </Field>
                        </div>
                        <div className="min-w-0 col-span-1">
                          <Field label="QTY">
                            <div className="relative">
                              <input
                                type="number"
                                step="1"
                                {...register('qty')}
                                aria-invalid={showErr('qty') || undefined}
                                aria-describedby={showErr('qty') ? errId('qty') : undefined}
                                className={`input w-full ${showErr('qty') ? 'input-error' : ''}`}
                              />
                              {showErr('qty') && (
                                <Tooltip
                                  content={errors.qty?.message}
                                  className="absolute right-2 inset-y-0 flex items-center"
                                >
                                  <span aria-hidden className="text-[--color-accent] text-sm">!</span>
                                </Tooltip>
                              )}
                            </div>
                            <Err id={errId('qty')} e={showErr('qty') ? errors.qty : undefined} />
                          </Field>
                        </div>
                        <div className="min-w-0 col-span-1">
                          <Field label="V Sent">
                            <div className="relative">
                              <input
                                type="number"
                                {...register('vSent')}
                                aria-invalid={showErr('vSent') || undefined}
                                aria-describedby={showErr('vSent') ? errId('vSent') : undefined}
                                className={`input w-full ${showErr('vSent') ? 'input-error' : ''}`}
                              />
                              {showErr('vSent') && (
                                <Tooltip
                                  content={errors.vSent?.message}
                                  className="absolute right-2 inset-y-0 flex items-center"
                                >
                                  <span aria-hidden className="text-[--color-accent] text-sm">!</span>
                                </Tooltip>
                              )}
                            </div>
                            <Err id={errId('vSent')} e={showErr('vSent') ? errors.vSent : undefined} />
                          </Field>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                          Performance Summary
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <KPICard
                            label="Turnover"
                            value={fmtEUR.format(watchTurnover || 0)}
                            tone="indigo"
                            icon={<KPIIcon type="turnover" />}
                          />
                          <KPICard
                            label="Margin"
                            value={fmtEUR.format(watchMargin || 0)}
                            helper="(Turnover - Routing Costs)"
                            tone="emerald"
                            icon={<KPIIcon type="margin" />}
                            badge={
                              watchMarginPct != null
                                ? `${(watchMarginPct * 100).toFixed(1)}%`
                                : null
                            }
                            badgeClassName={marginBadgeClass}
                          />
                          <KPICard
                            label="eCPM"
                            value={fmtEUR.format(ecpmValue)}
                            tone="violet"
                            icon={<KPIIcon type="ecpm" />}
                            statusIcon={ecpmStatusIcon}
                          />
                        </div>
                      </div>
                    </Section>

                    {/* C) Data source */}
                    <Section title="Data source" highContrast={highContrast} className="mb-0">
                      <div className="flex flex-wrap gap-x-5 gap-y-4">
                        <div className="w-full xl:flex-[1.25] min-w-[200px]">
                          <Field label="Database">
                            <FieldWithAddon
                              onAdd={canQuickAdd ? () => setOpenAddDatabase(true) : undefined}
                              addAriaLabel="Add database"
                              className="w-full"
                            >
                              <div className="w-full min-w-0">
                                <Combobox
                                  ariaLabel="Database"
                                  className="w-full"
                                  placeholder="Select database"
                                  direction="up"
                                  options={DATABASES.map((d) => ({ id: d.id, value: d.name }))}
                                  renderOption={renderDatabaseOption}
                                  value={database}
                                  onChange={(v) =>
                                    setValue('database', v, { shouldValidate: true, shouldDirty: true })
                                  }
                                  invalid={showErr('database')}
                                  ariaDescribedby={showErr('database') ? errId('database') : undefined}
                                />
                              </div>
                            </FieldWithAddon>
                            {database ? (
                              <div className="mt-1 text-xs text-gray-500">
                                {geo || 'N/A'}
                                {databaseType ? ` / ${databaseType}` : ''}
                              </div>
                            ) : null}
                            <input type="hidden" {...register('geo')} />
                            <input type="hidden" {...register('databaseType')} />
                            <Err id={errId('database')} e={databaseError} />
                          </Field>
                        </div>
                      </div>
                    </Section>
                    <input type="hidden" {...register('routingCosts')} />
                    <input type="hidden" {...register('turnover')} />
                    <input type="hidden" {...register('margin')} />
                    <input type="hidden" {...register('ecpm')} />
                    </div>
                  </form>
      </ModalShell>

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
    </>
  );

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

function Section({
  title,
  children,
  highContrast,
  className,
}: {
  title: string;
  children: React.ReactNode;
  highContrast: boolean;
  className?: string;
}) {
  return (
    <section
      className={[
        'mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
        highContrast ? 'shadow-md' : '',
        className ?? '',
      ].join(' ')}
    >
      <div className="mb-4 flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span
          className="h-1 w-16 rounded-full bg-gradient-to-r from-[--color-primary] to-indigo-500"
          aria-hidden
        />
      </div>
      {children}
    </section>
  );
}

type KPITone = 'indigo' | 'emerald' | 'violet';

const KPI_TONE_CLASSES: Record<KPITone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
};

function KPICard({
  label,
  value,
  helper,
  tone,
  icon,
  statusIcon,
  badge,
  badgeClassName,
}: {
  label: string;
  value: string;
  helper?: string;
  tone: KPITone;
  icon: React.ReactNode;
  statusIcon?: string;
  badge?: string | null;
  badgeClassName?: string;
}) {
  return (
    <div className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full ${KPI_TONE_CLASSES[tone]}`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div
            className="text-2xl font-bold text-slate-900"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {value}
          </div>
          {badge ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                badgeClassName
                  ? badgeClassName
                  : tone === 'emerald'
                  ? 'bg-emerald-100 text-emerald-700'
                  : tone === 'indigo'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-violet-100 text-violet-700'
              }`}
            >
              {badge}
            </span>
          ) : null}
        </div>
        {helper ? <div className="text-xs text-gray-500">{helper}</div> : null}
      </div>
      {statusIcon ? (
        <img
          src={statusIcon}
          alt=""
          aria-hidden="true"
          className="h-12 w-12 shrink-0 self-center object-contain"
        />
      ) : null}
    </div>
  );
}

function KPIIcon({ type }: { type: 'turnover' | 'margin' | 'ecpm' }) {
  const baseProps = {
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    viewBox: '0 0 24 24',
  };

  if (type === 'turnover') {
    return (
      <svg {...baseProps}>
        <path d="M3 17l6-6 4 4 7-7" />
        <path d="M14 8h6v6" />
      </svg>
    );
  }

  if (type === 'margin') {
    return (
      <svg {...baseProps}>
        <circle cx="12" cy="12" r="7" />
        <path d="M9.5 10.5h5" />
        <path d="M9.5 13.5h5" />
      </svg>
    );
  }

  return (
    <svg {...baseProps}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}








