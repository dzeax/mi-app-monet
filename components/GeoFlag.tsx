'use client';

import type { ReactNode } from 'react';
import {
  canonicalGeo,
  EMOJI_UNKNOWN,
  geoEmoji,
  geoFlagClass,
  geoLabel,
  normalizeGeo,
} from '@/lib/geoFlags';

type GeoFlagProps = {
  geo?: string | null;
};

export default function GeoFlag({ geo }: GeoFlagProps) {
  const code = normalizeGeo(geo);

  if (!code) {
    const title = 'No GEO defined';
    return (
      <span className="geo-flag geo-flag--muted" title={title} aria-label={title}>
        <span className="geo-flag__icon geo-flag__icon--fallback" aria-hidden>
          {EMOJI_UNKNOWN}
        </span>
        <span className="sr-only">No GEO</span>
      </span>
    );
  }

  const canonical = canonicalGeo(code);
  if (canonical === "MULTI") {
    const title = "Multiple geos";
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center text-[15px] leading-none"
        title={title}
        aria-label={title}
      >
        <span aria-hidden>🌐</span>
        <span className="sr-only">Multiple geos</span>
      </span>
    );
  }
  const flagClass = geoFlagClass(canonical);
  const label = geoLabel(canonical);
  const title = `${label}${code ? ` (${code})` : ''}`;

  let icon: ReactNode;

  if (flagClass) {
    icon = <span className={`geo-flag__icon fi fis ${flagClass}`} aria-hidden />;
  } else {
    icon = (
      <span className="geo-flag__icon geo-flag__icon--fallback" aria-hidden>
        {geoEmoji(canonical)}
      </span>
    );
  }

  return (
    <span className={`geo-flag${flagClass ? '' : ' geo-flag--muted'}`} title={title} aria-label={title}>
      {icon}
      <span className="sr-only">{code}</span>
    </span>
  );
}
