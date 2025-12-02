const REGIONAL_INDICATOR_START = 0x1f1e6;

export const GEO_ALIASES: Record<string, string> = {
  UK: 'GB',
  ALL: 'MULTI',
  COM: 'MULTI',
  BF: 'BE',
  BN: 'BE',
  EN: 'GB',
};

export const SPECIAL_LABELS: Record<string, string> = {
  MULTI: 'Multiple geos',
  EU: 'European Union',
};

export const SPECIAL_SYMBOLS: Record<string, string> = {
  MULTI: String.fromCodePoint(0x1f310),
  EU: String.fromCodePoint(0x1f1ea, 0x1f1fa),
};

export const EMOJI_UNKNOWN = String.fromCodePoint(0x1f3f3, 0xfe0f);

const displayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : undefined;

export function normalizeGeo(geo?: string | null): string {
  return (geo ?? '').trim().toUpperCase();
}

export function canonicalGeo(raw?: string | null): string {
  const norm = normalizeGeo(raw);
  return GEO_ALIASES[norm] ?? norm;
}

function isoToEmoji(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return undefined;
  const points = Array.from(code).map((char) => REGIONAL_INDICATOR_START + (char.charCodeAt(0) - 65));
  return String.fromCodePoint(...points);
}

export function geoEmoji(raw?: string | null) {
  const canonical = canonicalGeo(raw);
  if (!canonical) return EMOJI_UNKNOWN;
  return SPECIAL_SYMBOLS[canonical] ?? isoToEmoji(canonical) ?? EMOJI_UNKNOWN;
}

export function geoLabel(raw?: string | null) {
  const canonical = canonicalGeo(raw);
  if (!canonical) return 'No GEO';
  if (canonical in SPECIAL_LABELS) return SPECIAL_LABELS[canonical];
  if (/^[A-Z]{2}$/.test(canonical)) {
    const label = displayNames?.of(canonical);
    if (label) return label;
  }
  return canonical;
}

export function geoFlagClass(raw?: string | null) {
  const canonical = canonicalGeo(raw);
  if (!canonical) return undefined;
  const candidate = canonical.toLowerCase();
  if (/^[a-z]{2}$/.test(candidate) || /^[a-z]{2,3}-[a-z]{2,3}$/.test(candidate)) {
    return `fi-${candidate}`;
  }
  return undefined;
}
