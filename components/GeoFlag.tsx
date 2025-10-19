'use client';

import type { ReactNode } from 'react';

type GeoFlagProps = {
  geo?: string | null;
};

const GEO_ALIASES: Record<string, string> = {
  UK: 'GB',
};

const SPECIAL_LABELS: Record<string, string> = {
  MULTI: 'Multiple geos',
  EU: 'European Union',
};

const FALLBACK_SYMBOLS: Record<string, string> = {
  MULTI: String.fromCodePoint(0x1f310),
};

const EMOJI_UNKNOWN = String.fromCodePoint(0x1f3f3, 0xfe0f);

const displayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['es', 'en'], { type: 'region' })
    : undefined;

function normalizeGeo(geo?: string | null) {
  return (geo ?? '').trim().toUpperCase();
}

function canonicalGeo(code: string) {
  if (!code) return '';
  const normalized = GEO_ALIASES[code] ?? code;
  return normalized;
}

function flagClassName(code: string) {
  if (!code) return undefined;
  const canonical = canonicalGeo(code);
  const candidate = canonical.toLowerCase();
  if (/^[a-z]{2}$/.test(candidate) || /^[a-z]{2,3}-[a-z]{2,3}$/.test(candidate)) {
    return `fi-${candidate}`;
  }
  return undefined;
}

function resolveLabel(rawCode: string, canonical: string) {
  if (!rawCode) return 'Sin GEO';
  if (canonical in SPECIAL_LABELS) return SPECIAL_LABELS[canonical];
  if (/^[A-Z]{2}$/.test(canonical)) {
    const label = displayNames?.of(canonical);
    if (label) return label;
  }
  return canonical || rawCode;
}

export default function GeoFlag({ geo }: GeoFlagProps) {
  const code = normalizeGeo(geo);
  const canonical = canonicalGeo(code);

  if (!code) {
    const title = 'Sin GEO definido';
    return (
      <span className="geo-flag geo-flag--muted" title={title} aria-label={title}>
        <span className="geo-flag__icon geo-flag__icon--fallback" aria-hidden>
          {EMOJI_UNKNOWN}
        </span>
        <span className="geo-flag__code">--</span>
      </span>
    );
  }

  const flagClass = flagClassName(canonical);
  const label = resolveLabel(code, canonical);
  const title = `${label}${code ? ` (${code})` : ''}`;

  let icon: ReactNode;

  if (flagClass) {
    icon = <span className={`geo-flag__icon fi fis ${flagClass}`} aria-hidden />;
  } else {
    const symbol = FALLBACK_SYMBOLS[canonical] ?? FALLBACK_SYMBOLS[code] ?? EMOJI_UNKNOWN;
    icon = (
      <span className="geo-flag__icon geo-flag__icon--fallback" aria-hidden>
        {symbol}
      </span>
    );
  }

  return (
    <span className="geo-flag" title={title} aria-label={title}>
      {icon}
      <span className="geo-flag__code">{code}</span>
    </span>
  );
}
