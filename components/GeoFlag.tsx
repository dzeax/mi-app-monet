'use client';

type GeoFlagProps = {
  geo?: string | null;
};

const REGIONAL_INDICATOR_START = 0x1f1e6;
const GEO_ALIASES: Record<string, string> = {
  UK: 'GB',
};

const SPECIAL_LABELS: Record<string, string> = {
  EU: 'European Union',
  MULTI: 'Multiple geos',
};

const SPECIAL_EMOJIS: Record<string, string> = {
  EU: String.fromCodePoint(0x1f1ea, 0x1f1fa),
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

function regionalFlagEmoji(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return undefined;
  const points = Array.from(code).map((char) => REGIONAL_INDICATOR_START + (char.charCodeAt(0) - 65));
  return String.fromCodePoint(...points);
}

function resolveEmoji(code: string) {
  if (code in SPECIAL_EMOJIS) {
    return SPECIAL_EMOJIS[code];
  }
  const canonical = GEO_ALIASES[code] ?? code;
  return regionalFlagEmoji(canonical);
}

function resolveLabel(code: string) {
  if (!code) return 'Sin GEO';
  if (code in SPECIAL_LABELS) return SPECIAL_LABELS[code];
  const canonical = GEO_ALIASES[code] ?? code;
  if (/^[A-Z]{2}$/.test(canonical)) {
    const label = displayNames?.of(canonical);
    if (label) return label;
  }
  return code;
}

export default function GeoFlag({ geo }: GeoFlagProps) {
  const code = normalizeGeo(geo);

  if (!code) {
    const title = 'Sin GEO definido';
    return (
      <span className="inline-flex items-center gap-2 text-sm opacity-60" title={title} aria-label={title}>
        <span className="text-base leading-none" aria-hidden>
          {EMOJI_UNKNOWN}
        </span>
        <span className="font-medium tracking-wide">--</span>
      </span>
    );
  }

  const emoji = resolveEmoji(code) ?? EMOJI_UNKNOWN;
  const label = resolveLabel(code);
  const title = `${label}${code ? ` (${code})` : ''}`;

  return (
    <span className="inline-flex items-center gap-2 text-sm" title={title} aria-label={title}>
      <span className="text-base leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="font-medium tracking-wide">{code}</span>
    </span>
  );
}
