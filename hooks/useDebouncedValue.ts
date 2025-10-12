// hooks/useDebouncedValue.ts
'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Devuelve una versión "debounced" del valor.
 * Útil para búsquedas: evita recomputar en cada tecla.
 *
 * @param value Valor de entrada (cualquier tipo)
 * @param delay Retardo en ms (por defecto 300ms)
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  const firstRun = useRef(true);

  useEffect(() => {
    // Evita el retardo en el primer render para que la UI pinte rápido
    if (firstRun.current) {
      firstRun.current = false;
      setDebounced(value);
      return;
    }

    const id = window.setTimeout(() => setDebounced(value), Math.max(0, delay));
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
