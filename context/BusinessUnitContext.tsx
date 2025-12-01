'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type BusinessUnit = 'monetization' | 'crm';

type BusinessUnitContextValue = {
  unit: BusinessUnit;
  setUnit: (unit: BusinessUnit) => void;
  setUnitIfDifferent: (unit: BusinessUnit) => void;
};

const DEFAULT_UNIT: BusinessUnit = 'monetization';

const BusinessUnitContext = createContext<BusinessUnitContextValue | null>(null);

export function BusinessUnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnit] = useState<BusinessUnit>(DEFAULT_UNIT);

  const setUnitIfDifferent = useCallback(
    (next: BusinessUnit) => {
      setUnit((current) => {
        if (current === next) return current;
        return next;
      });
    },
    []
  );

  const value = useMemo<BusinessUnitContextValue>(
    () => ({
      unit,
      setUnit,
      setUnitIfDifferent,
    }),
    [unit, setUnitIfDifferent]
  );

  return <BusinessUnitContext.Provider value={value}>{children}</BusinessUnitContext.Provider>;
}

export function useBusinessUnit() {
  const ctx = useContext(BusinessUnitContext);
  if (!ctx) throw new Error('useBusinessUnit must be used within BusinessUnitProvider');
  return ctx;
}
