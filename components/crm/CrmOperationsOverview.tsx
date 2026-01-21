"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CrmClientCard = {
  name: string;
  slug: string;
  status?: "active" | "onboarding";
  description: string;
  logoSrc?: string;
  ctaLabel: string;
};

type ClientMetrics = {
  budgetTotal: number;
  spentTotal: number;
  remainingTotal: number;
  utilizationTotal: number;
  currency: string;
};

const CLIENTS: CrmClientCard[] = [
  {
    name: "EMG · Europcar Mobility Group",
    slug: "emg",
    status: "active",
    description: "Full CRM suite with budget, execution, campaigns, and ticket reporting.",
    logoSrc: "/logos/emg-logo.png",
    ctaLabel: "Open workspace",
  },
  {
    name: "Bouygues Telecom",
    slug: "bouygues",
    status: "onboarding",
    description: "Effort tracking and budget setup for Bouygues Telecom.",
    logoSrc: "/logos/bouygues-logo.png",
    ctaLabel: "Open workspace",
  },
  {
    name: "Taittinger",
    slug: "taittinger",
    status: "onboarding",
    description: "Effort tracking and budget setup for Taittinger.",
    logoSrc: "/logos/taittinger-logo.png",
    ctaLabel: "Open workspace",
  },
  {
    name: "Ponant",
    slug: "ponant",
    status: "onboarding",
    description: "Effort tracking and budget setup for Ponant.",
    logoSrc: "/logos/ponant-logo.png",
    ctaLabel: "Open workspace",
  },
  {
    name: "Petit Forestier",
    slug: "petit-forestier",
    status: "onboarding",
    description: "Effort tracking and budget setup for Petit Forestier.",
    logoSrc: "/logos/petit-forestier.png",
    ctaLabel: "Open workspace",
  },
  {
    name: "Saveurs et Vie",
    slug: "saveurs-et-vie",
    status: "onboarding",
    description: "Effort tracking and budget setup for Saveurs et Vie.",
    logoSrc: "/logos/logo-saveurs-et-vie.svg",
    ctaLabel: "Open workspace",
  },
  {
    name: "Global PRM",
    slug: "sfr",
    status: "onboarding",
    description: "Effort tracking and budget setup for Global PRM.",
    logoSrc: "/logos/prm.png",
    ctaLabel: "Open workspace",
  },
];

const formatCurrency = (value: number, currency: string, fallback = "--") => {
  if (!Number.isFinite(value)) return fallback;
  try {
    return value.toLocaleString("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
};

export default function CrmOperationsOverview() {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [metricsByClient, setMetricsByClient] = useState<Record<string, ClientMetrics>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const set = new Set<number>([nowYear, nowYear - 1]);
    return Array.from(set).filter((y) => Number.isFinite(y) && y > 1900).sort((a, b) => b - a);
  }, [nowYear]);

  useEffect(() => {
    let active = true;
    const loadMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          CLIENTS.map(async (client) => {
            try {
              const res = await fetch(`/api/crm/budget?client=${client.slug}&year=${year}`);
              const body = await res.json().catch(() => null);
              if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);

              const roles = Array.isArray(body?.roles) ? body.roles : [];
              const spendByPerson = body?.spendByPerson ?? {};
              const budgetTotal = roles.reduce(
                (acc: number, role: any) =>
                  acc +
                  Number(
                    role?.adjustedPoolAmount ??
                      role?.poolAmount ??
                      role?.basePoolAmount ??
                      0,
                  ),
                0,
              );
              const spentTotal = Object.values(spendByPerson).reduce(
                (acc: number, value: any) => acc + Number(value ?? 0),
                0,
              );
              const remainingTotal = budgetTotal - spentTotal;
              const utilizationTotal = budgetTotal > 0 ? spentTotal / budgetTotal : 0;
              const currency = roles[0]?.currency || body?.spendCurrency || "EUR";
              return {
                slug: client.slug,
                metrics: {
                  budgetTotal,
                  spentTotal,
                  remainingTotal,
                  utilizationTotal,
                  currency,
                },
              };
            } catch {
              return { slug: client.slug, metrics: null };
            }
          }),
        );

        if (!active) return;
        const next: Record<string, ClientMetrics> = {};
        results.forEach((result) => {
          if (result.metrics) {
            next[result.slug] = result.metrics;
          }
        });
        setMetricsByClient(next);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load client metrics");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadMetrics();
    return () => {
      active = false;
    };
  }, [year]);

  const totals = useMemo(() => {
    let budgetTotal = 0;
    let spentTotal = 0;
    let currency = "EUR";
    Object.values(metricsByClient).forEach((metric) => {
      budgetTotal += metric.budgetTotal || 0;
      spentTotal += metric.spentTotal || 0;
      if (metric.currency) currency = metric.currency;
    });
    const remainingTotal = budgetTotal - spentTotal;
    const utilizationTotal = budgetTotal > 0 ? spentTotal / budgetTotal : 0;
    return {
      budgetTotal,
      spentTotal,
      remainingTotal,
      utilizationTotal,
      currency,
    };
  }, [metricsByClient]);

  return (
    <div className="space-y-8" data-page="crm-operations-overview">
      <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-5 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.16),transparent_60%),radial-gradient(120%_120%_at_90%_0%,rgba(99,102,241,0.12),transparent_55%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">
              CRM Operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[color:var(--color-text)]">Clients</h1>
            <p className="mt-2 max-w-3xl text-sm text-[color:var(--color-text)]/75">
              Monitor budget health and effort activity per client.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                Year
              </div>
              <select
                className="input h-9 min-w-[110px] bg-[color:var(--color-surface-2)]"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                  Total budget
                </p>
                <p className="text-sm font-semibold text-[color:var(--color-text)]">
                  {loading ? "..." : formatCurrency(totals.budgetTotal, totals.currency)}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-text)]/55">
                  Total spent
                </p>
                <p className="text-sm font-semibold text-[color:var(--color-text)]">
                  {loading ? "..." : formatCurrency(totals.spentTotal, totals.currency)}
                </p>
              </div>
              <div
                className="flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs font-semibold text-[color:var(--color-text)]"
                title="Total utilization (spent / budget)"
              >
                {loading ? "..." : formatPercent(totals.utilizationTotal)}
              </div>
            </div>
          </div>
        </div>
        {error ? (
          <div className="relative z-10 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
            {error}
          </div>
        ) : null}
      </header>

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {CLIENTS.map((client) => {
          const metrics = metricsByClient[client.slug];
          const currency = metrics?.currency || "EUR";
          const placeholder = loading ? "..." : "--";
          const share =
            metrics && totals.budgetTotal > 0 && metrics.budgetTotal > 0
              ? metrics.budgetTotal / totals.budgetTotal
              : null;
          const budgetValue = metrics
            ? formatCurrency(metrics.budgetTotal, currency)
            : placeholder;
          const spentValue = metrics
            ? formatCurrency(metrics.spentTotal, currency)
            : placeholder;
          const remainingValue = metrics
            ? formatCurrency(metrics.remainingTotal, currency)
            : placeholder;
          const utilizationValue = metrics
            ? formatPercent(metrics.utilizationTotal)
            : placeholder;

          return (
            <article
              key={client.slug}
              className="group flex h-full flex-col gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-sm transition hover:border-[color:var(--color-primary)]/70"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {client.logoSrc ? (
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-white shadow-sm">
                      <img
                        src={client.logoSrc}
                        alt={`${client.name} logo`}
                        className="h-full w-full object-contain p-2"
                      />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--color-surface-2)] text-lg font-semibold text-[color:var(--color-text)]/70">
                      {client.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--color-text)]/65">
                      CRM Client
                    </p>
                    <h2 className="text-xl font-semibold text-[color:var(--color-text)]">
                      {client.name}
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {client.status ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        client.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {client.status === "active" ? "Active" : "Onboarding"}
                    </span>
                  ) : null}
                  {share ? (
                    <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-1 text-[11px] font-semibold text-[color:var(--color-text)]/70">
                      {formatPercent(share)} share
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="text-sm text-[color:var(--color-text)]/80">{client.description}</p>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Budget", value: budgetValue },
                  { label: "Spent", value: spentValue },
                  { label: "Remaining", value: remainingValue },
                  { label: "Utilization", value: utilizationValue },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-dashed border-[color:var(--color-border)] px-3 py-2"
                  >
                    <p className="text-[color:var(--color-text)]/60">{kpi.label}</p>
                    <p className="text-lg font-semibold text-[color:var(--color-text)]">{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex items-center justify-between">
                <span className="text-xs text-[color:var(--color-text)]/50">
                  Snapshot · {year}
                </span>
                <Link href={`/crm/${client.slug}/budget`} className="btn-primary">
                  {client.ctaLabel}
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
