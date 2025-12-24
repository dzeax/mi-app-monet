'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useBusinessUnit } from "@/context/BusinessUnitContext";

type HubCard = {
  unit: "monetization" | "crm";
  title: string;
  description: string;
  href: string;
  highlightLabel: string;
  highlightValue: string;
  actions: { label: string; href: string; primary?: boolean }[];
};

const cards: HubCard[] = [
  {
    unit: "monetization",
    title: "Monetization",
    description: "Planning, routing and reporting for campaigns.",
    href: "/analytics/campaign-reporting",
    highlightLabel: "Active campaigns",
    highlightValue: "Jump into the Monetization workspace.",
    actions: [
      { label: "Open Monetization", href: "/analytics/campaign-reporting", primary: true },
    ],
  },
  {
    unit: "crm",
    title: "CRM Operations",
    description: "Track CRM effort and ticket reporting per client.",
    href: "/crm/operations",
    highlightLabel: "Clients",
    highlightValue: "Start with EMG (more coming soon).",
    actions: [
      { label: "Go to CRM Operations", href: "/crm/operations", primary: true },
    ],
  },
];

export default function OperationsHub() {
  const router = useRouter();
  const { setUnit } = useBusinessUnit();

  const quickLinks = useMemo(
    () => [
      { label: "Campaign Reporting", href: "/analytics/campaign-reporting", unit: "monetization" as const },
      { label: "Campaign Planning", href: "/campaign-planning", unit: "monetization" as const },
      { label: "CRM Operations", href: "/crm/operations", unit: "crm" as const },
      { label: "CRM Campaigns (EMG)", href: "/crm/emg/campaigns", unit: "crm" as const },
      { label: "CRM Ticket Reporting (EMG)", href: "/crm/emg/ticket-reporting", unit: "crm" as const },
      { label: "Import CSV (CRM)", href: "/crm/emg/campaigns#import", unit: "crm" as const },
    ],
    [],
  );

  const handleNavigate = (card: HubCard, href: string) => {
    setUnit(card.unit);
    router.push(href);
  };

  return (
    <div className="space-y-8" data-page="operations-hub">
      <header className="rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-7 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.35)] text-[color:var(--color-text)]">
        <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--color-text)]/70">Operations Hub</p>
        <h1 className="mt-2 text-3xl font-semibold text-[color:var(--color-text)]">
          Access Monetization and CRM from one place
        </h1>
        <p className="mt-2 max-w-3xl text-base text-[color:var(--color-text)]/80">
          Choose a business unit to jump into its dashboards and workflows.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-[color:var(--color-text)]/80">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setUnit(link.unit)}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] px-4 py-2 text-[color:var(--color-text)]/80 transition hover:border-[color:var(--color-primary)]/70 hover:text-[color:var(--color-text)]"
            >
              <span>{link.label}</span>
              <span aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        {cards.map((card) => (
          <article
            key={card.unit}
            className="card group flex flex-col gap-4 border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/90 p-6 transition hover:border-[color:var(--color-primary)]/60"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--color-text)]/65">
                  {card.unit === "crm" ? "CRM" : "Monetization"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">{card.title}</h2>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  card.unit === "crm"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {card.unit === "crm" ? "CRM Ops" : "Monetization"}
              </span>
            </div>
            <p className="text-sm text-[color:var(--color-text)]/85">{card.description}</p>
            <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] px-4 py-3 text-sm text-[color:var(--color-text)]/75">
              <span className="font-semibold text-[color:var(--color-text)]">{card.highlightLabel}</span>
              <span className="ml-2 opacity-70">{card.highlightValue}</span>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-3">
              {card.actions.map((action) => (
                <button
                  key={action.href}
                  type="button"
                  onClick={() => handleNavigate(card, action.href)}
                  className={action.primary ? "btn-primary" : "btn-ghost"}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--color-text)]/90">Quick actions</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {quickLinks.map((link) => (
            <Link
              key={`qa-${link.href}`}
              href={link.href}
              onClick={() => setUnit(link.unit)}
              className="rounded-full bg-[color:var(--color-surface)] px-3 py-2 text-[color:var(--color-text)] transition hover:bg-[color:var(--color-surface-2)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
