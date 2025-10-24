// utils/flags.ts
// Utilidades para resolver banderas (emoji, clases CSS) a partir de GEO o nombre de base de datos

import { findDatabaseByName } from '@/data/reference';

export type FlagInfo = {
  emoji: string | null;
  /** Código ISO-3166 alfa-2 en minúsculas para clases `fi fi-xx` (flag-icons). */
  code: string | null;
  /** Texto en mayúsculas que podemos usar como fallback accesible. */
  text: string | null;
};

const EMPTY_FLAG: FlagInfo = { emoji: null, code: null, text: null };

function emptyFlag(): FlagInfo {
  return { ...EMPTY_FLAG };
}

function normalizeGeo(raw?: string | null): string | null {
  const v = (raw ?? '').trim().toUpperCase();
  if (!v) return null;
  if (v === 'UK' || v === 'EN') return 'GB';
  if (v === 'INT' || v === 'INTL' || v === 'MULTI' || v === 'GLOBAL' || v === 'WW') return 'WW';
  return v;
}

function makeEmoji(iso: string): string | null {
  if (iso.length !== 2) return null;
  const base = 'A'.codePointAt(0) ?? 65;
  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  const c1 = iso.charCodeAt(0) - base + A;
  const c2 = iso.charCodeAt(1) - base + A;
  try {
    return String.fromCodePoint(c1, c2);
  } catch {
    return null;
  }
}

function infoFromNormalized(code: string | null): FlagInfo {
  if (!code) return emptyFlag();
  if (code === 'WW') {
    return { emoji: '🌍', code: null, text: 'WW' };
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
