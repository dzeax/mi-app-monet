// utils/geo.ts
export function trimCollapse(s: string) {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}

export function isIsoCountry(code: string): boolean {
  const c = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return false;
  try {
    const dn = new (Intl as any).DisplayNames(['en'], { type: 'region' });
    const name = dn?.of?.(c);
    return typeof name === 'string' && name && name !== c;
  } catch {
    return false;
  }
}

/** Acepta ISO-2 (ES, FR, …) o MULTI. Mapea UK→GB. Devuelve null si no es válido. */
export function normalizeGeoStrict(raw?: string): string | null {
  const g = trimCollapse(raw || '').toUpperCase();
  if (!g) return null;
  if (g === 'MULTI') return 'MULTI';
  const mapped = g === 'UK' ? 'GB' : g;
  return isIsoCountry(mapped) ? mapped : null;
}
