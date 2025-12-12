"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

type CrmClientCard = {
  name: string;
  slug: string;
  status?: "active" | "onboarding";
  description: string;
  kpis?: { label: string; value: string }[];
  logoSrc?: string;
};

const clients: CrmClientCard[] = [
  {
    name: "EMG · Europcar Mobility Group",
    slug: "emg",
    status: "active",
    description: "Campaign and data quality reporting for EMG.",
    kpis: [
      { label: "Campaigns (month)", value: "—" },
      { label: "Data quality tickets", value: "—" },
    ],
    logoSrc: "/logos/emg-logo.png",
  },
  {
    name: "Bouygues Telecom",
    slug: "bouygues",
    status: "onboarding",
    description: "CRM reporting for Bouygues Telecom.",
    kpis: [
      { label: "Campaigns (month)", value: "—" },
      { label: "Data quality tickets", value: "—" },
    ],
    logoSrc: "/logos/bouygues-logo.png",
  },
  {
    name: "Taittinger",
    slug: "taittinger",
    status: "onboarding",
    description: "CRM reporting for Taittinger.",
    kpis: [
      { label: "Campaigns (month)", value: "—" },
      { label: "Data quality tickets", value: "—" },
    ],
    logoSrc: "/logos/taittinger-logo.png",
  },
  {
    name: "Ponant",
    slug: "ponant",
    status: "onboarding",
    description: "CRM reporting for Ponant.",
    kpis: [
      { label: "Campaigns (month)", value: "—" },
      { label: "Data quality tickets", value: "—" },
    ],
    logoSrc: "/logos/ponant-logo.png",
  },
  {
    name: "Petit Forestier",
    slug: "petit-forestier",
    status: "onboarding",
    description: "CRM reporting for Petit Forestier.",
    kpis: [
      { label: "Campaigns (month)", value: "—" },
      { label: "Data quality tickets", value: "—" },
    ],
    logoSrc: "/logos/petit-forestier.png",
  },
  {
    name: "SFR",
    slug: "sfr",
    status: "onboarding",
    description: "CRM reporting for SFR.",
    kpis: [
      { label: "Campaigns (month)", value: "—" },
      { label: "Data quality tickets", value: "—" },
    ],
    logoSrc: "/logos/sfr-logo.png",
  },
  // Add more clients here as they onboard
];

export default function CrmOperationsOverview() {
  return (
    <div className="space-y-8" data-page="crm-operations-overview">
      <header className="rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM Operations</p>
        <h1 className="mt-2 text-3xl font-semibold text-[color:var(--color-text)]">Clients</h1>
        <p className="mt-3 max-w-3xl text-sm text-[color:var(--color-text)]/75">
          Select a client to access Campaign Reporting and Data Quality. More clients will appear here as they join CRM Ops.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/" className="btn-ghost">
            Back to hub
          </Link>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <article
            key={client.slug}
            className="flex flex-col gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-sm transition hover:border-[color:var(--color-primary)]/70"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {client.logoSrc ? (
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-white">
                    <img src={client.logoSrc} alt={`${client.name} logo`} className="h-full w-full object-contain p-1.5" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]/70">
                    {client.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--color-text)]/65">CRM Client</p>
                  <h2 className="text-xl font-semibold text-[color:var(--color-text)]">{client.name}</h2>
                </div>
              </div>
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
            </div>
            <p className="text-sm text-[color:var(--color-text)]/80">{client.description}</p>
            {client.kpis?.length ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {client.kpis.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-dashed border-[color:var(--color-border)] px-3 py-2"
                  >
                    <p className="text-[color:var(--color-text)]/60">{kpi.label}</p>
                    <p className="text-lg font-semibold text-[color:var(--color-text)]">{kpi.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-2">
              <Link href={`/crm/${client.slug}/campaigns`} className="btn-primary">
                Campaign Reporting
              </Link>
              <Link href={`/crm/${client.slug}/data-quality`} className="btn-ghost">
                Data Quality
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
