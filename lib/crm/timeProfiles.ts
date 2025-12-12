export type TimeHours = {
  hours_master_template: number;
  hours_translations: number;
  hours_copywriting: number;
  hours_assets: number;
  hours_revisions: number;
  hours_build: number;
  hours_prep: number;
};

type Multipliers = {
  touchpoint?: Record<string, number>;
  variant?: Record<string, number>;
};

export type TimeProfileConfig = {
  key: string;
  label: string;
  description?: string;
  base: TimeHours;
  multipliers?: Multipliers;
};

export const TIME_PROFILES: Record<string, TimeProfileConfig> = {
  standard: {
    key: "standard",
    label: "Standard EMG campaign",
    description: "Balanced effort for multi-market, multi-segment campaigns.",
    base: {
      hours_master_template: 0.5,
      hours_translations: 0.3,
      hours_copywriting: 0.2,
      hours_assets: 0.2,
      hours_revisions: 0.3,
      hours_build: 0.6,
      hours_prep: 0.3,
    },
    multipliers: {
      touchpoint: {
        LAUNCH: 1,
        Launch: 1,
        "LAUNCH ": 1,
        REPUSH: 0.4,
        Repush: 0.4,
        "LAST CALL": 0.5,
        "Last call": 0.5,
      },
      variant: {
        A: 1,
        B: 0.4,
        C: 0.4,
      },
    },
  },
  simple: {
    key: "simple",
    label: "Simple / BAU",
    description: "Simpler BAU-style emails with lower effort.",
    base: {
      hours_master_template: 0.3,
      hours_translations: 0.2,
      hours_copywriting: 0.15,
      hours_assets: 0.15,
      hours_revisions: 0.2,
      hours_build: 0.4,
      hours_prep: 0.2,
    },
    multipliers: {
      touchpoint: {
        LAUNCH: 1,
        Launch: 1,
        REPUSH: 0.5,
        Repush: 0.5,
        "LAST CALL": 0.6,
        "Last call": 0.6,
      },
      variant: {
        A: 1,
        B: 0.5,
      },
    },
  },
  complex: {
    key: "complex",
    label: "Complex / heavy build",
    description: "More complex builds (many segments/variants, journeys).",
    base: {
      hours_master_template: 0.8,
      hours_translations: 0.5,
      hours_copywriting: 0.4,
      hours_assets: 0.4,
      hours_revisions: 0.6,
      hours_build: 1.2,
      hours_prep: 0.5,
    },
    multipliers: {
      touchpoint: {
        LAUNCH: 1,
        Launch: 1,
        REPUSH: 0.35,
        Repush: 0.35,
        "LAST CALL": 0.4,
        "Last call": 0.4,
      },
      variant: {
        A: 1,
        B: 0.4,
        C: 0.4,
      },
    },
  },
};

const HOURS_KEYS: (keyof TimeHours)[] = [
  "hours_master_template",
  "hours_translations",
  "hours_copywriting",
  "hours_assets",
  "hours_revisions",
  "hours_build",
  "hours_prep",
];

export function computeHoursForUnit(
  profileKey: string,
  touchpoint: string,
  variant: string,
): TimeHours {
  const profile = TIME_PROFILES[profileKey] ?? TIME_PROFILES.standard;
  const base = profile.base;
  const mTouch =
    profile.multipliers?.touchpoint?.[touchpoint] ??
    profile.multipliers?.touchpoint?.[touchpoint.trim()] ??
    1;
  const mVariant =
    profile.multipliers?.variant?.[variant] ??
    profile.multipliers?.variant?.[variant.trim()] ??
    1;
  const multiplier = mTouch * mVariant;

  const out: TimeHours = {
    hours_master_template: 0,
    hours_translations: 0,
    hours_copywriting: 0,
    hours_assets: 0,
    hours_revisions: 0,
    hours_build: 0,
    hours_prep: 0,
  };
  HOURS_KEYS.forEach((key) => {
    const val = base[key] ?? 0;
    out[key] = Number.isFinite(val * multiplier)
      ? Number((val * multiplier).toFixed(2))
      : 0;
  });
  return out;
}

export function totalHoursForUnit(hours: TimeHours): number {
  return HOURS_KEYS.reduce((acc, key) => acc + (hours[key] ?? 0), 0);
}

