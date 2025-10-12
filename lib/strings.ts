// lib/strings.ts
'use client';

/**
 * Quita acentos/diacríticos usando NFKD.
 */
export function stripDiacritics(input: string): string {
  return (input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalización base: trim + lowercase + sin diacríticos + colapsa espacios.
 * Útil para: claves de índice, comparaciones de igualdad, etc.
 */
export function normalizeStr(input?: string | null): string {
  const s = String(input ?? '')
    .trim();
  if (!s) return '';
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Alias para compatibilidad: varios módulos importan `normalizeString`.
 * Mantén el mismo comportamiento que `normalizeStr`.
 */
export const normalizeString = normalizeStr;

/**
 * Normalización agresiva para búsqueda libre:
 * - minúsculas, sin diacríticos
 * - reemplaza puntuación por espacios
 * - colapsa espacios
 */
export function normalizeForSearch(input?: string | null): string {
  const s = String(input ?? '').trim();
  if (!s) return '';
  return stripDiacritics(s)
    .toLowerCase()
    // sustituye todo lo no alfanumérico por espacio
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * YYYY-MM a partir de un ISO date (YYYY-MM-DD). Si no viene bien, devuelve ''.
 */
export function toMonthKey(dateISO?: string | null): string {
  const d = String(dateISO ?? '');
  if (d.length >= 7) return d.slice(0, 7);
  return '';
}
