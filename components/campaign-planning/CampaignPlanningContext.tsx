'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CampaignPlanningContextValue,
  CampaignPlanningProviderProps,
  PlanningDraft,
  PlanningItem,
} from '@/components/campaign-planning/types';

const CampaignPlanningContext = createContext<CampaignPlanningContextValue | null>(null);

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error?: string }).error ?? 'Request failed.'
        : response.statusText || 'Request failed.';
    throw new Error(message);
  }

  return payload as T;
}

export function CampaignPlanningProvider({ children }: CampaignPlanningProviderProps) {
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<PlanningItem[]>(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await request<{ items: PlanningItem[] }>('/api/campaign-planning');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load planning data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (payload: PlanningDraft) => {
      try {
        setError(null);
        const response = await request<{ item: PlanningItem }>('/api/campaign-planning', {
          method: 'POST',
          body: JSON.stringify({ data: payload }),
        });
        setItems((prev) => [...prev, response.item]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to create planning entry.';
        setError(message);
        throw err;
      }
    },
    []
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<PlanningDraft>) => {
      try {
        setError(null);
        const response = await request<{ item: PlanningItem }>(`/api/campaign-planning/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ data: patch }),
        });
        setItems((prev) => prev.map((item) => (item.id === id ? response.item : item)));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update planning entry.';
        setError(message);
        throw err;
      }
    },
    []
  );

  const removeItem = useCallback(
    async (id: string) => {
      try {
        setError(null);
        await request<{ ok: boolean }>(`/api/campaign-planning/${id}`, { method: 'DELETE' });
        setItems((prev) => prev.filter((item) => item.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to delete planning entry.';
        setError(message);
        throw err;
      }
    },
    []
  );

  const duplicateItem = useCallback(
    async (id: string, dateOverride?: string) => {
      const original = itemsRef.current.find((entry) => entry.id === id);
      if (!original) return;
      const { id: _ignoredId, createdAt: _ignoredCreatedAt, updatedAt: _ignoredUpdatedAt, ...rest } = original;
      void _ignoredId;
      void _ignoredCreatedAt;
      void _ignoredUpdatedAt;
      const draft: PlanningDraft = {
        ...rest,
        status: 'Planning',
        date: dateOverride ?? original.date,
        previewRecipients: rest.previewRecipients ?? [],
        dsCampaignId: null,
        dsStatus: null,
        dsLastSyncAt: null,
        dsError: null,
        reportingCampaignId: null,
      };
      await addItem(draft);
    },
    [addItem]
  );

  const value = useMemo<CampaignPlanningContextValue>(
    () => ({
      items,
      loading,
      error,
      refresh,
      addItem,
      updateItem,
      removeItem,
      duplicateItem,
    }),
    [items, loading, error, refresh, addItem, updateItem, removeItem, duplicateItem]
  );

  return <CampaignPlanningContext.Provider value={value}>{children}</CampaignPlanningContext.Provider>;
}

export function useCampaignPlanning(): CampaignPlanningContextValue {
  const ctx = useContext(CampaignPlanningContext);
  if (!ctx) throw new Error('useCampaignPlanning must be used within CampaignPlanningProvider');
  return ctx;
}
