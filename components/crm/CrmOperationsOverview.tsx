'use client';

import Link from 'next/link';

type PlaceholderInsight = {
  title: string;
  value: string;
  badge?: string;
  description: string;
};

const insights: PlaceholderInsight[] = [
  {
    title: 'Active workflows',
    value: '8',
    badge: '+2 vs yesterday',
    description: 'Automations currently running with priority clients.',
  },
  {
    title: 'Playbooks behind schedule',
    value: '3',
    badge: 'Alert',
    description: 'Need follow-up within the next 24 hours.',
  },
  {
    title: 'CRM → Monetization volume',
    value: '145K',
    description: 'Coordinated sends aligned with ongoing campaigns.',
  },
];

export default function CrmOperationsOverview() {
  return (
    <div className="space-y-8" data-page="crm-operations-overview">
      <header className="rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM Operations</p>
        <h1 className="mt-2 text-3xl font-semibold text-[color:var(--color-text)]">Lifecycle cockpit</h1>
        <p className="mt-3 max-w-3xl text-sm text-[color:var(--color-text)]/75">
          Preview of the CRM module. Monitor active workflows, health alerts and quick links to the playbooks coordinated with Monetization.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/" className="btn-ghost">
            Back to hub
          </Link>
          <Link href="/analytics/campaign-reporting" className="btn-ghost">
            Go to Monetization
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {insights.map((insight) => (
          <article
            key={insight.title}
            className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-4 py-5"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--color-text)]/60">{insight.title}</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-[color:var(--color-text)]">{insight.value}</span>
              {insight.badge ? (
                <span className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs text-[color:var(--color-text)]/80">
                  {insight.badge}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/70">{insight.description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 px-6 py-8 text-sm text-[color:var(--color-text)]/75">
        <h2 className="text-xl font-semibold text-[color:var(--color-text)]">CRM ↔ Monetization integration</h2>
        <p className="mt-2 max-w-3xl">
          This module will ingest CRM operational data (engagements, SLAs, playbooks) and combine it with campaign metrics to spot risks and activation opportunities. Use this preview as a design guide and share feedback while we finalize the integration.
        </p>
      </section>
    </div>
  );
}
