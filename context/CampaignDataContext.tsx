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

import type { PostgrestError } from '@supabase/supabase-js';

import type { CampaignRow } from '@/types/campaign';
import { useAuth } from '@/context/AuthContext';
import { useRoutingSettings } from '@/context/RoutingSettingsContext';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { applyBusinessRules } from '@/lib/campaigns/business';
import {
  mapFromDb,
  mapToDb,
  type CampaignDbInsert,
  type CampaignDbRow,
} from '@/lib/campaigns/db';
import { DEFAULT_ROUTING_RATE } from '@/lib/campaign-calcs';

type CampaignWithIdx = CampaignRow & { _idx: number };

type CampaignDataContextValue = {
  rows: CampaignWithIdx[];
  loading: boolean;
  refresh: () => Promise<void>;
  addCampaign: (
    input: Omit<CampaignRow, 'id'> & { id?: string }
  ) => Promise<string | null>;
  updateCampaign: (id: string, patch: Partial<CampaignRow>) => Promise<boolean>;
  removeCampaign: (id: string) => Promise<boolean>;
  resetToMock: () => Promise<void>;
  setRoutingRateOverride: (ids: string[], rate: number | null) => Promise<void>;
};

const CampaignDataContext = createContext<CampaignDataContextValue | null>(null);

function generateId() {
  // RFC4122 v4 UUID
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (crypto.getRandomValues) {
      const rnds = new Uint8Array(16);
      crypto.getRandomValues(rnds);
      rnds[6] = (rnds[6] & 0x0f) | 0x40;
      rnds[8] = (rnds[8] & 0x3f) | 0x80;
      const hex: string[] = [];
      for (let i = 0; i < 256; ++i) hex.push((i + 0x100).toString(16).substring(1));
      return (
        hex[rnds[0]] + hex[rnds[1]] + hex[rnds[2]] + hex[rnds[3]] + '-' +
        hex[rnds[4]] + hex[rnds[5]] + '-' +
        hex[rnds[6]] + hex[rnds[7]] + '-' +
        hex[rnds[8]] + hex[rnds[9]] + '-' +
        hex[rnds[10]] + hex[rnds[11]] + hex[rnds[12]] + hex[rnds[13]] + hex[rnds[14]] + hex[rnds[15]]
      );
    }
  }
  // Fallback poco probable (no-crypto): aún generamos un UUID válido
  const s: string[] = [];
  const hex = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  for (let i = 0; i < hex.length; i++) {
    const c = hex[i];
    if (c === 'x' || c === 'y') {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      s.push(v.toString(16));
    } else {
      s.push(c);
    }
  }
  return s.join('');
}

function logError(scope: string, error: unknown | PostgrestError) {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[CampaignData] ${scope}`, error);
}

export function CampaignDataProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { user, loading: authLoading } = useAuth();
  const { resolveRate, settings } = useRoutingSettings();
  const fallbackRate = settings.defaultRate ?? DEFAULT_ROUTING_RATE;

  const [rows, setRows] = useState<CampaignWithIdx[]>([]);
  const [loading, setLoading] = useState(true);

  const idxRef = useRef(0);
  const rowsRef = useRef<CampaignWithIdx[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const computeRow = useCallback(
    (row: CampaignRow): CampaignRow =>
      applyBusinessRules(row, { resolveRate, fallbackRate }),
    [fallbackRate, resolveRate]
  );

  const stampRow = useCallback(
    (row: CampaignRow, idx?: number): CampaignWithIdx => ({
      ...row,
      _idx: idx ?? idxRef.current++,
    }),
    []
  );

  const refreshRetryRef = useRef<number | null>(null);

  const refresh = useCallback(async (attempt = 0) => {
    setLoading(true);
    const pageSize = 1000;
    const aggregated: CampaignDbRow[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from<CampaignDbRow>('campaigns')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        const status = (error as any)?.status ?? (error as any)?.code ?? null;
        if (status === 401 || status === '401') {
          if (attempt < 5) {
            if (refreshRetryRef.current) window.clearTimeout(refreshRetryRef.current);
            refreshRetryRef.current = window.setTimeout(() => {
              void refresh(attempt + 1);
            }, 200 * Math.pow(2, attempt));
          }
          setLoading(false);
          return;
        }
        logError('refresh', error);
        setRows([]);
        idxRef.current = 0;
        setLoading(false);
        return;
      }

      if (!data?.length) break;
      aggregated.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const mapped = aggregated.map(mapFromDb).map(computeRow);
    const withIdx = mapped.map((row, index) => stampRow(row, index));
    idxRef.current = withIdx.length;
    setRows(withIdx);
    setLoading(false);
  }, [computeRow, stampRow, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [authLoading, user, refresh]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null;
      if (authUser) {
        void refresh();
      } else {
        setRows([]);
        setLoading(false);
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  useEffect(() => {
    if (!rowsRef.current.length) return;
    setRows((prev) =>
      prev.map((row) => {
        const { _idx, ...rest } = row;
        const recomputed = computeRow(rest as CampaignRow);
        return stampRow(recomputed, _idx);
      })
    );
  }, [computeRow, stampRow]);

  useEffect(() => {
    return () => {
      if (refreshRetryRef.current) {
        window.clearTimeout(refreshRetryRef.current);
        refreshRetryRef.current = null;
      }
    };
  }, []);
  const addCampaign = useCallback(
    async (input: Omit<CampaignRow, 'id'> & { id?: string }) => {
      const id = input.id ?? generateId();
      const base: CampaignRow = computeRow({
        id,
        ...input,
      } as CampaignRow);
      const optimistic = stampRow(base);
      setRows((prev) => [optimistic, ...prev]);

      try {
        const payload = mapToDb(base, user?.id ?? null);
        const response = await fetch('/api/campaigns/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ data: payload }),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.campaign) {
          const message =
            (result && typeof result.error === 'string' && result.error.trim()) ||
            `Insert failed (${response.status})`;
          throw new Error(message);
        }

        const persisted = stampRow(computeRow(result.campaign as CampaignRow), optimistic._idx);
        setRows((prev) => {
          const without = prev.filter((row) => row.id !== id);
          return [persisted, ...without];
        });
        return persisted.id;
      } catch (err) {
        logError('addCampaign', err);
        await refresh();
        return null;
      }
    },
    [computeRow, refresh, stampRow, user?.id]
  );

  const updateCampaign = useCallback(
    async (id: string, patch: Partial<CampaignRow>) => {
      const current = rowsRef.current.find((row) => row.id === id);
      if (!current) return false;

      const { _idx, ...rest } = current;
      const merged = computeRow({
        ...(rest as CampaignRow),
        ...patch,
        id,
      });

      const optimistic = stampRow(merged, _idx);
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...optimistic, _idx } : row))
      );

      try {
        const payload = mapToDb(merged);
        const response = await fetch('/api/campaigns/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id, data: payload }),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.campaign) {
          const message =
            (result && typeof result.error === 'string' && result.error.trim()) ||
            `Update failed (${response.status})`;
          throw new Error(message);
        }

        const persisted = stampRow(computeRow(result.campaign as CampaignRow), _idx);
        setRows((prev) => prev.map((r) => (r.id === id ? persisted : r)));
        return true;
      } catch (err) {
        logError('updateCampaign', err);
        await refresh();
        return false;
      }
    },
    [computeRow, refresh, stampRow]
  );

  const removeCampaign = useCallback(
    async (id: string) => {
      const existed = rowsRef.current.some((row) => row.id === id);
      if (!existed) return false;

      setRows((prev) => prev.filter((row) => row.id !== id));

      try {
        const { error } = await supabase.from('campaigns').delete().eq('id', id);
        if (error) throw error;
        return true;
      } catch (err) {
        logError('removeCampaign', err);
        await refresh();
        return false;
      }
    },
    [refresh, supabase]
  );

  const setRoutingRateOverride = useCallback(
    async (ids: string[], rate: number | null) => {
      if (!Array.isArray(ids) || ids.length === 0) return;

      const cleanRate =
        rate == null || Number.isNaN(Number(rate))
          ? null
          : Number(rate);

      const updates: CampaignDbInsert[] = [];
      setRows((prev) =>
        prev.map((row) => {
          if (!ids.includes(row.id)) return row;
          const { _idx, ...rest } = row;
          const next = computeRow({
            ...(rest as CampaignRow),
            routingRateOverride: cleanRate,
          });
          updates.push(mapToDb(next));
          return stampRow(next, _idx);
        })
      );

      if (!updates.length) return;

      try {
        const { error } = await supabase.from('campaigns').upsert(updates, { onConflict: 'id' });
        if (error) throw error;
      } catch (err) {
        logError('setRoutingRateOverride', err);
        await refresh();
      }
    },
    [computeRow, refresh, stampRow, supabase]
  );

  const resetToMock = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .neq('id', '');
      if (error) throw error;
      await refresh();
    } catch (err) {
      logError('resetToMock', err);
      await refresh();
    }
  }, [refresh, supabase]);

  const value = useMemo<CampaignDataContextValue>(
    () => ({
      rows,
      loading,
      refresh,
      addCampaign,
      updateCampaign,
      removeCampaign,
      resetToMock,
      setRoutingRateOverride,
    }),
    [rows, loading, refresh, addCampaign, updateCampaign, removeCampaign, resetToMock, setRoutingRateOverride]
  );

  return <CampaignDataContext.Provider value={value}>{children}</CampaignDataContext.Provider>;
}

export function useCampaignData() {
  const ctx = useContext(CampaignDataContext);
  if (!ctx) throw new Error('useCampaignData must be used within CampaignDataProvider');
  return ctx;
}
