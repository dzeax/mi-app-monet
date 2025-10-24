'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

import { useAuth } from '@/context/AuthContext';

type MaybeDate = string | null | undefined;

const randomId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export type RoutingRatePeriod = {
  id: string;
  from: MaybeDate;
  to: MaybeDate;
  rate: number;
  label?: string;
};

export type RoutingSettings = {
  defaultRate: number;
  periods: RoutingRatePeriod[];
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type RoutingSettingsState = {
  settings: RoutingSettings;
  loading: boolean;
  error: string | null;
  resolveRate: (date: MaybeDate) => number;
  updateSettings: (next: RoutingSettings) => Promise<{ ok: true } | { ok: false; message: string }>;
  isAdmin: boolean;
};

const DEFAULT_SETTINGS: RoutingSettings = {
  defaultRate: 0.18,
  periods: [],
};

const RoutingSettingsContext = createContext<RoutingSettingsState | null>(null);

const TABLE = 'routing_settings';
const ROW_KEY = 'global';

type DbRow = {
  key: string;
  data: {
    defaultRate?: number;
    periods?: RoutingRatePeriod[];
  } | null;
  updated_at: string | null;
  updated_by: string | null;
};

function parseSettings(row?: DbRow | null): RoutingSettings {
  if (!row?.data) return { ...DEFAULT_SETTINGS, updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null };
  const raw = row.data;
  const defaultRate =
    typeof raw.defaultRate === 'number' && Number.isFinite(raw.defaultRate)
      ? Number(raw.defaultRate)
      : DEFAULT_SETTINGS.defaultRate;
  const periods = Array.isArray(raw.periods)
    ? raw.periods
        .map((p) => {
          if (!p) return null;
          const rate = Number(p.rate);
          if (!Number.isFinite(rate)) return null;
          return {
            id: p.id || randomId(),
            from: p.from ?? null,
            to: p.to ?? null,
            rate,
            label: p.label,
          } as RoutingRatePeriod;
        })
        .filter(Boolean) as RoutingRatePeriod[]
    : [];
  return {
    defaultRate,
    periods,
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

function inRange(dateIso: string, { from, to }: RoutingRatePeriod) {
  if (!dateIso) return false;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.setHours(0, 0, 0, 0);

  let afterStart = true;
  let beforeEnd = true;

  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      afterStart = day >= start.setHours(0, 0, 0, 0);
    }
  }

  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      beforeEnd = day <= end.setHours(23, 59, 59, 999);
    }
  }

  return afterStart && beforeEnd;
}

export function RoutingSettingsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClientComponentClient<any, 'public'>(), []);
  const { isAdmin, user } = useAuth();

  const [settings, setSettings] = useState<RoutingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from(TABLE)
        .select('key,data,updated_at,updated_by')
        .eq('key', ROW_KEY)
        .maybeSingle();

      if (err) {
        setError(err.message);
        setSettings({ ...DEFAULT_SETTINGS });
        return;
      }

      setSettings(parseSettings(data));
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? 'Unable to fetch routing settings.'));
      setSettings({ ...DEFAULT_SETTINGS });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const channel = supabase
      .channel('routing_settings_global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `key=eq.${ROW_KEY}` },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row) return;
          setSettings(parseSettings(row as DbRow));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [supabase]);

  const resolveRate = useCallback(
    (date: MaybeDate) => {
      if (!date) return settings.defaultRate;
      const ordered = [...settings.periods].sort((a, b) => {
        const aDate = a.from ? new Date(a.from).getTime() : -Infinity;
        const bDate = b.from ? new Date(b.from).getTime() : -Infinity;
        return bDate - aDate;
      });

      const match = ordered.find((p) => inRange(date, p));
      return match?.rate ?? settings.defaultRate;
    },
    [settings.defaultRate, settings.periods]
  );

  const updateSettings = useCallback(
    async (next: RoutingSettings) => {
      if (!isAdmin) return { ok: false as const, message: 'Only administrators can update routing settings.' };

      const cleanPeriods = (next.periods || [])
        .map((p) => ({
          id: p.id || randomId(),
          from: p.from || null,
          to: p.to || null,
          rate: Number.isFinite(p.rate) ? Number(p.rate) : null,
          label: p.label,
        }))
        .filter((p) => p.rate != null) as RoutingRatePeriod[];

      const payload = {
        key: ROW_KEY,
        data: {
          defaultRate: Number.isFinite(next.defaultRate) ? Number(next.defaultRate) : DEFAULT_SETTINGS.defaultRate,
          periods: cleanPeriods,
        },
        updated_by: user?.id ?? null,
      };

      try {
        const { error: upsertError } = await supabase.from(TABLE).upsert(payload, { onConflict: 'key' });
        if (upsertError) {
          return { ok: false as const, message: upsertError.message };
        }
        // state will refresh via realtime; optimistic update meanwhile
        setSettings({
          defaultRate: payload.data.defaultRate,
          periods: cleanPeriods,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email ?? user?.id ?? null,
        });
        setError(null);
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, message: String(e?.message ?? 'Failed to save routing settings.') };
      }
    },
    [isAdmin, supabase, user?.email, user?.id]
  );

  const value = useMemo<RoutingSettingsState>(
    () => ({
      settings,
      loading,
      error,
      resolveRate,
      updateSettings,
      isAdmin,
    }),
    [settings, loading, error, resolveRate, updateSettings, isAdmin]
  );

  return <RoutingSettingsContext.Provider value={value}>{children}</RoutingSettingsContext.Provider>;
}

export function useRoutingSettings() {
  const ctx = useContext(RoutingSettingsContext);
  if (!ctx) throw new Error('useRoutingSettings must be used within RoutingSettingsProvider');
  return ctx;
}
