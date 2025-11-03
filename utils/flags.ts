import { findDatabaseByName } from '@/data/reference';

export type FlagInfo = {
  emoji: string | null;
  /** Lowercase ISO-3166 alpha-2 code for `flag-icons` (fi fi-xx). */
  code: string | null;
  /** Uppercase fallback text when no emoji/class is available. */
  text: string | null;
};

const EMPTY_FLAG: FlagInfo = { emoji: null, code: null, text: null };

function emptyFlag(): FlagInfo {
  return { ...EMPTY_FLAG };
}

function normalizeGeo(raw?: string | null): string | null {
  const value = (raw ?? '').trim().toUpperCase();
  if (!value) return null;
  if (value === 'UK' || value === 'EN') return 'GB';
  if (['INT', 'INTL', 'MULTI', 'GLOBAL', 'WW'].includes(value)) return 'WW';
  return value;
}

function makeEmoji(iso: string): string | null {
  if (iso.length !== 2) return null;
  const base = 'A'.codePointAt(0) ?? 65;
  const start = 0x1f1e6; // Regional Indicator Symbol Letter A
  const first = iso.charCodeAt(0) - base + start;
  const second = iso.charCodeAt(1) - base + start;
  try {
    return String.fromCodePoint(first, second);
  } catch {
    return null;
  }
}

function infoFromNormalized(code: string | null): FlagInfo {
  if (!code) return emptyFlag();
  if (code === 'WW') {
    return { emoji: null, code: null, text: 'WW' };
  }

  const upper = code.toUpperCase();
  if (upper.length !== 2) {
    return { emoji: null, code: null, text: upper };
  }

  const emoji = makeEmoji(upper);
  return {
    emoji,
    code: upper.toLowerCase(),
    text: upper,
  };
}

export function flagInfoFromGeo(geo?: string | null): FlagInfo {
  return infoFromNormalized(normalizeGeo(geo));
}

export function flagInfoForDatabase(dbName?: string | null): FlagInfo {
  const name = (dbName ?? '').trim();
  if (!name) return emptyFlag();

  const db = findDatabaseByName(name);
  if (db) {
    return flagInfoFromGeo(db.geo);
  }

  const match = /^([A-Z]{2})\b/.exec(name.toUpperCase());
  if (match) {
    return flagInfoFromGeo(match[1]);
  }

  return emptyFlag();
}

export function flagEmojiFromGeo(geo?: string | null): string | null {
  return flagInfoFromGeo(geo).emoji;
}

export function flagEmojiForDatabase(dbName?: string | null): string | null {
  return flagInfoForDatabase(dbName).emoji;
}

export function withFlag(label: string, emoji: string | null | undefined): string {
  return emoji ? `${emoji} ${label}` : label;
}
