'use client';

import { useEffect, useMemo, useState, type SVGProps } from 'react';
import { useRouter } from 'next/navigation';

import { useBusinessUnit } from '@/context/BusinessUnitContext';
import { useCampaignData } from '@/context/CampaignDataContext';
import { CRM_CLIENTS, type CrmClient, type CrmModule } from '@/lib/crm/clients';
import Tooltip from '@/components/ui/Tooltip';

type Unit = 'monetization' | 'crm';

type Shortcut = {
  label: string;
  href: string;
  unit: Unit;
};

const CRM_STORAGE_KEY = 'hub.crm.client';
const HERO_ROTATION_MS = 5000;

const HERO_ICONS = [
  { src: '/animations/bot.gif', alt: 'Bot animation' },
  { src: '/animations/robot.gif', alt: 'Robot animation' },
  { src: '/animations/transhumanism.gif', alt: 'Transhumanism animation' },
];

const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyFormatterPrecise = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const SHORTCUTS_MONETIZATION: Shortcut[] = [
  { label: 'Campaign Reporting', href: '/analytics/campaign-reporting', unit: 'monetization' },
  { label: 'Campaign Planning', href: '/campaign-planning', unit: 'monetization' },
  { label: 'DB Routing', href: '/dbs-routing', unit: 'monetization' },
  { label: 'Global Reports', href: '/analytics/reports', unit: 'monetization' },
];

const resolveClient = (slug?: string | null) =>
  CRM_CLIENTS.find((client) => client.slug === slug) ?? CRM_CLIENTS[0] ?? null;

const moduleHref = (client: CrmClient, module: CrmModule) =>
  `/crm/${client.slug}/${module.slug}`;

const formatPercent = (value: number | null) =>
  value == null ? '--' : percentFormatter.format(value);

const formatCurrency = (value: number | null, loading: boolean) =>
  loading ? '...' : value == null ? '--' : currencyFormatter.format(value);

const formatCount = (value: number | null, loading: boolean) =>
  loading ? '...' : value == null ? '--' : value.toLocaleString('es-ES');

const formatCurrencyPrecise = (value: number | null, loading: boolean) =>
  loading ? '...' : value == null ? '--' : currencyFormatterPrecise.format(value);

const sumBudgetRoles = (roles: Array<{ adjustedPoolAmount?: number | null; poolAmount?: number | null; basePoolAmount?: number | null }>) =>
  roles.reduce(
    (acc, role) =>
      acc +
      Number(
        role?.adjustedPoolAmount ??
          role?.poolAmount ??
          role?.basePoolAmount ??
          0
      ),
    0
  );

export default function OperationsHub() {
  const router = useRouter();
  const { setUnit } = useBusinessUnit();
  const { rows, loading: monetLoading } = useCampaignData();

  const nowYear = new Date().getFullYear();
  const yearPrefix = `${nowYear}-`;

  const [activeCrmSlug, setActiveCrmSlug] = useState(CRM_CLIENTS[0]?.slug ?? '');
  const [crmBudgetTotal, setCrmBudgetTotal] = useState<number | null>(null);
  const [crmSpentTotal, setCrmSpentTotal] = useState<number | null>(null);
  const [crmRemainingTotal, setCrmRemainingTotal] = useState<number | null>(null);
  const [crmUtilizationTotal, setCrmUtilizationTotal] = useState<number | null>(null);
  const [crmLoading, setCrmLoading] = useState(true);
  const [heroIconIndex, setHeroIconIndex] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(CRM_STORAGE_KEY);
    if (stored && CRM_CLIENTS.some((client) => client.slug === stored)) {
      setActiveCrmSlug(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeCrmSlug) return;
    window.localStorage.setItem(CRM_STORAGE_KEY, activeCrmSlug);
  }, [activeCrmSlug]);

  useEffect(() => {
    if (HERO_ICONS.length < 2) return;
    const id = window.setInterval(() => {
      setHeroIconIndex((current) => (current + 1) % HERO_ICONS.length);
    }, HERO_ROTATION_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;

    const loadCrmBudgetTotal = async () => {
      setCrmLoading(true);
      try {
        const totals = await Promise.all(
          CRM_CLIENTS.map(async (client) => {
            try {
              const response = await fetch(
                `/api/crm/budget?client=${client.slug}&year=${nowYear}`,
                { credentials: 'same-origin' }
              );
              const payload = await response.json().catch(() => null);
              if (!response.ok) {
                const message =
                  payload && typeof payload === 'object' && typeof payload.error === 'string'
                    ? payload.error
                    : `Failed (${response.status})`;
                throw new Error(message);
              }
              const roles = Array.isArray(payload?.roles) ? payload.roles : [];
              const spendByPerson = payload?.spendByPerson ?? {};
              const budgetTotal = sumBudgetRoles(roles);
              const spentTotal = Object.values(spendByPerson).reduce(
                (acc, value) => acc + Number(value ?? 0),
                0
              );
              return { budgetTotal, spentTotal };
            } catch (error) {
              console.warn('[hub] CRM budget fetch failed', {
                client: client.slug,
                message: error instanceof Error ? error.message : String(error),
              });
              return { budgetTotal: 0, spentTotal: 0 };
            }
          })
        );

        if (!active) return;
        const budgetTotal = totals.reduce((acc, value) => acc + Number(value?.budgetTotal ?? 0), 0);
        const spentTotal = totals.reduce((acc, value) => acc + Number(value?.spentTotal ?? 0), 0);
        const remainingTotal = budgetTotal - spentTotal;
        const utilizationTotal = budgetTotal > 0 ? spentTotal / budgetTotal : null;

        setCrmBudgetTotal(Number.isFinite(budgetTotal) ? budgetTotal : 0);
        setCrmSpentTotal(Number.isFinite(spentTotal) ? spentTotal : 0);
        setCrmRemainingTotal(Number.isFinite(remainingTotal) ? remainingTotal : 0);
        setCrmUtilizationTotal(utilizationTotal);
      } finally {
        if (active) setCrmLoading(false);
      }
    };

    void loadCrmBudgetTotal();

    return () => {
      active = false;
    };
  }, [nowYear]);

  const activeCrmClient = useMemo(() => resolveClient(activeCrmSlug), [activeCrmSlug]);

  const monetStats = useMemo(() => {
    let turnover = 0;
    let margin = 0;
    let count = 0;
    let databases = new Set<string>();
    let vSent = 0;
    let weightedEcpm = 0;

    for (const row of rows) {
      if (!row.date?.startsWith(yearPrefix)) continue;
      turnover += row.turnover;
      margin += row.margin;
      count += 1;
      if (row.database) databases.add(row.database);
      vSent += row.vSent || 0;
      weightedEcpm += (row.ecpm || 0) * (row.vSent || 0);
    }

    const avgEcpm = vSent > 0 ? weightedEcpm / vSent : 0;

    return {
      turnover,
      margin,
      count,
      databasesCount: databases.size,
      vSent,
      weightedEcpm: avgEcpm,
    };
  }, [rows, yearPrefix]);

  const marginPct =
    monetStats.turnover > 0 ? monetStats.margin / monetStats.turnover : null;

  const volumeLoading = monetLoading || crmLoading;
  const totalVolume =
    volumeLoading || crmBudgetTotal == null
      ? null
      : monetStats.turnover + crmBudgetTotal;

  const primaryCrmModule = useMemo(() => {
    if (!activeCrmClient) return null;
    return activeCrmClient.modules.find((module) => !module.comingSoon) ?? activeCrmClient.modules[0] ?? null;
  }, [activeCrmClient]);

  const crmShortcuts = useMemo(() => {
    if (!activeCrmClient) return [];
    return activeCrmClient.modules
      .filter((module) => !module.comingSoon)
      .slice(0, 5)
      .map((module) => ({
        label: module.label,
        href: moduleHref(activeCrmClient, module),
        unit: 'crm' as const,
      }));
  }, [activeCrmClient]);

  const handleNavigate = (href: string, unit: Unit) => {
    setUnit(unit);
    router.push(href);
  };

  return (
    <div className="hub-shell" data-page="operations-hub">
      <section className="hub-hero hub-reveal grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="hub-hero__content space-y-3">
          <div className="hub-kicker-row">
            <span className="hub-kicker">Operations Hub</span>
            <span className="hub-kicker hub-kicker--solid">Data & CRM</span>
          </div>
          <h1 className="hub-title">Run CRM and Monetization from one command center.</h1>
          <p className="hub-lead">
            Plan campaigns, keep routing sharp, and track CRM delivery across every client without jumping between tools.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary hub-btn-primary"
              onClick={() => handleNavigate('/crm/operations', 'crm')}
            >
              Explore CRM
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-ghost hub-btn-ghost"
              onClick={() => handleNavigate('/analytics/campaign-reporting', 'monetization')}
            >
              Enter Monetization
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="hub-hero__panel">
          <div className="hub-glance hub-glance--total">
            <div className="hub-hero-icon" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={HERO_ICONS[heroIconIndex]?.src} alt={HERO_ICONS[heroIconIndex]?.alt ?? ''} />
            </div>
            <div className="hub-glance__label">Total volume {nowYear}</div>
            <div className="hub-glance__value">
              {formatCurrency(totalVolume, volumeLoading)}
            </div>
            <div className="hub-glance__meta">
              CRM Budget Plan {formatCurrency(crmBudgetTotal, crmLoading)} · Monetization Turnover{' '}
              {formatCurrency(monetStats.turnover, monetLoading)}
            </div>
          </div>
          <Tooltip
            side="top"
            className="w-full"
            content={
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span>Spent</span>
                  <strong>
                    {formatCurrency(crmSpentTotal, crmLoading)}{' '}
                    <span className="opacity-70">
                      ({formatPercent(crmLoading ? null : crmUtilizationTotal)})
                    </span>
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Remaining</span>
                  <strong>{formatCurrency(crmRemainingTotal, crmLoading)}</strong>
                </div>
              </div>
            }
          >
            <div className="hub-glance w-full">
            <div className="hub-glance__label">CRM Budget Plan</div>
            <div className="hub-glance__value">
              {formatCurrency(crmBudgetTotal, crmLoading)}
            </div>
            <div className="hub-glance__meta">
              {CRM_CLIENTS.length} clients · {nowYear}
            </div>
            </div>
          </Tooltip>
          <Tooltip
            side="top"
            className="w-full"
            content={
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span>Margin</span>
                  <strong>{formatPercent(monetLoading ? null : marginPct)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>eCPM</span>
                  <strong>{formatCurrencyPrecise(monetStats.weightedEcpm, monetLoading)}</strong>
                </div>
              </div>
            }
          >
            <div className="hub-glance w-full">
            <div className="hub-glance__label">Monet Turnover</div>
            <div className="hub-glance__value">
              {formatCurrency(monetStats.turnover, monetLoading)}
            </div>
            <div className="hub-glance__meta">
              Campaigns {formatCount(monetStats.count, monetLoading)}
            </div>
            </div>
          </Tooltip>
        </div>
      </section>

      <section className="hub-workspace-grid mt-8 grid gap-6 lg:grid-cols-2">
        <article className="hub-card hub-card--crm hub-reveal" style={{ animationDelay: '120ms' }}>
          <header className="hub-card__header">
            <div>
              <p className="hub-card__eyebrow">CRM Operations</p>
              <h2 className="hub-card__title">Client execution layer</h2>
              <p className="hub-card__subtitle">
                Track ticket flow, budgets, and effort per client.
              </p>
            </div>
            <span className="hub-card__badge hub-card__badge--crm">CRM</span>
          </header>

          <div className="hub-client-row" role="tablist" aria-label="CRM clients">
            {CRM_CLIENTS.map((client) => {
              const active = client.slug === activeCrmSlug;
              return (
                <button
                  key={client.slug}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`hub-client-pill ${active ? 'hub-client-pill--active' : ''}`}
                  onClick={() => setActiveCrmSlug(client.slug)}
                >
                  <span className="hub-client-pill__label">
                    {client.label ?? client.name}
                  </span>
                  <span className="hub-client-pill__meta">{client.modules.length} modules</span>
                </button>
              );
            })}
          </div>

          <div className="hub-module-grid">
            {activeCrmClient ? (
              activeCrmClient.modules.map((module) => {
                const disabled = !!module.comingSoon;
                return (
                  <button
                    key={module.slug}
                    type="button"
                    disabled={disabled}
                    aria-disabled={disabled}
                    className={`hub-module ${disabled ? 'hub-module--disabled' : ''}`}
                    onClick={() =>
                      !disabled && handleNavigate(moduleHref(activeCrmClient, module), 'crm')
                    }
                  >
                    <span className="hub-module__icon" aria-hidden>
                      {module.icon ? <ModuleIcon name={module.icon} /> : <DotIcon />}
                    </span>
                    <span className="hub-module__body">
                      <span className="hub-module__title">{module.label}</span>
                      <span className="hub-module__desc">
                        {module.description || 'CRM module'}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="hub-empty">No CRM clients configured.</div>
            )}
          </div>

          <div className="hub-card__actions">
            <button
              type="button"
              className="btn-primary hub-btn-primary"
              onClick={() =>
                primaryCrmModule && activeCrmClient
                  ? handleNavigate(moduleHref(activeCrmClient, primaryCrmModule), 'crm')
                  : handleNavigate('/crm/operations', 'crm')
              }
            >
              {activeCrmClient ? `Open ${activeCrmClient.label ?? activeCrmClient.name}` : 'Open CRM'}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-ghost hub-btn-ghost"
              onClick={() => handleNavigate('/crm/operations', 'crm')}
            >
              All CRM clients
            </button>
          </div>
        </article>

        <article className="hub-card hub-card--monet hub-reveal" style={{ animationDelay: '200ms' }}>
          <header className="hub-card__header">
            <div>
              <p className="hub-card__eyebrow">Monetization</p>
              <h2 className="hub-card__title">Campaign intelligence</h2>
              <p className="hub-card__subtitle">
                Routing, planning and reporting in one operational view.
              </p>
            </div>
            <span className="hub-card__badge hub-card__badge--monet">Live</span>
          </header>

          <div className="hub-kpi-grid">
            <div className="hub-kpi">
              <p className="hub-kpi__label">Turnover {nowYear}</p>
              <p className="hub-kpi__value">
                {formatCurrency(monetStats.turnover, monetLoading)}
              </p>
            </div>
            <div className="hub-kpi">
              <p className="hub-kpi__label">Margin %</p>
              <p className="hub-kpi__value">
                {formatPercent(monetLoading ? null : marginPct)}
              </p>
            </div>
            <div className="hub-kpi">
              <p className="hub-kpi__label">Campaigns</p>
              <p className="hub-kpi__value">
                {formatCount(monetStats.count, monetLoading)}
              </p>
            </div>
            <div className="hub-kpi">
              <p className="hub-kpi__label">Databases</p>
              <p className="hub-kpi__value">
                {formatCount(monetStats.databasesCount, monetLoading)}
              </p>
            </div>
          </div>

          <div className="hub-card__actions">
            <button
              type="button"
              className="btn-primary hub-btn-primary"
              onClick={() => handleNavigate('/analytics/campaign-reporting', 'monetization')}
            >
              Open Monetization
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-ghost hub-btn-ghost"
              onClick={() => handleNavigate('/campaign-planning', 'monetization')}
            >
              Plan campaigns
            </button>
          </div>

          <div className="hub-link-grid">
            {SHORTCUTS_MONETIZATION.map((shortcut) => (
              <button
                key={shortcut.href}
                type="button"
                className="hub-link"
                onClick={() => handleNavigate(shortcut.href, shortcut.unit)}
              >
                <span>{shortcut.label}</span>
                <ArrowUpRightIcon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </article>
      </section>

    </div>
  );
}

function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function ArrowUpRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function DotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function ModuleIcon({ name }: { name: NonNullable<CrmModule['icon']> }) {
  const Icon = name === 'table' ? TableIcon : name === 'runbook' ? RunbookIcon : name === 'insight' ? InsightIcon : ChartIcon;
  return <Icon className="h-4 w-4" />;
}

function TableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5h16v14H4z" />
      <path d="M4 10h16" />
      <path d="M10 5v14" />
    </svg>
  );
}

function ChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-6" />
      <path d="M22 20H2" />
    </svg>
  );
}

function RunbookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6h11a3 3 0 0 1 3 3v9H7a3 3 0 0 0-3 3V6z" />
      <path d="M7 6v12" />
    </svg>
  );
}

function InsightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0z" />
      <path d="M12 7v6" />
      <path d="M12 16h.01" />
    </svg>
  );
}
