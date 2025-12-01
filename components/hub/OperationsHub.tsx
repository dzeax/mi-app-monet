'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useBusinessUnit } from '@/context/BusinessUnitContext';

type HubCard = {
  unit: 'monetization' | 'crm';
  title: string;
  description: string;
  href: string;
  highlight: string;
  meta: string;
  comingSoon?: boolean;
};

const cards: HubCard[] = [
  {
    unit: 'monetization',
    title: 'Monetization',
    description: 'Planning, routing and reporting for campaigns.',
    href: '/analytics/campaign-reporting',
    highlight: 'Active campaigns',
    meta: 'Reporting + Planning',
  },
  {
    unit: 'crm',
    title: 'CRM Operations',
    description: 'Track workflows, customer health and SLAs.',
    href: '/crm/emg/data-quality',
    highlight: 'Daily workflows',
    meta: 'Operational cockpit',
    comingSoon: true,
  },
];

export default function OperationsHub() {
  const router = useRouter();
  const { setUnit } = useBusinessUnit();

  const quickLinks = useMemo(
    () => [
          {
            label: 'Campaign Reporting',
            href: '/analytics/campaign-reporting',
            unit: 'monetization' as const,
          },
          {
            label: 'Campaign Planning',
            href: '/campaign-planning',
            unit: 'monetization' as const,
          },
      {
        label: 'CRM Operations',
        href: '/crm/emg/data-quality',
        unit: 'crm' as const,
      },
    ],
    []
  );

  const handleNavigate = (card: HubCard) => {
    setUnit(card.unit);
    router.push(card.href);
  };

  return (
    <div className="space-y-10" data-page="operations-hub">
      <header className="rounded-3xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-8 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.35)] text-[color:var(--color-text)]">
        <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--color-text)]/70">Operations Hub</p>
        <h1 className="mt-3 text-3xl font-semibold text-[color:var(--color-text)]">Centralize Monetization and CRM in one place</h1>
        <p className="mt-3 max-w-3xl text-base text-[color:var(--color-text)]/80">
          Jump into the Monetization dashboards or the CRM cockpit to coordinate campaigns, workflows and reporting without switching apps.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm text-[color:var(--color-text)]/80">
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
                  {card.unit === 'crm' ? 'CRM' : 'Monetization'}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">{card.title}</h2>
              </div>
              <span className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs font-semibold text-[color:var(--color-text)]/75">
                {card.meta}
              </span>
            </div>
            <p className="text-sm text-[color:var(--color-text)]/85">{card.description}</p>
            <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] px-4 py-3 text-sm text-[color:var(--color-text)]/75">
              <span className="font-semibold text-[color:var(--color-text)]">{card.highlight}</span>
              <span className="ml-2 opacity-70">{card.comingSoon ? 'Roadmap Q1' : 'Available now'}</span>
            </div>

            <div className="mt-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleNavigate(card)}
                disabled={card.comingSoon}
                className="btn-primary"
              >
                {card.comingSoon ? 'In progress' : 'Open'}
              </button>
              <Link
                href={card.href}
                onClick={() => handleNavigate(card)}
                className="btn-ghost"
                aria-disabled={card.comingSoon}
              >
                {card.comingSoon ? 'View preview' : 'Go to dashboard'}
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
