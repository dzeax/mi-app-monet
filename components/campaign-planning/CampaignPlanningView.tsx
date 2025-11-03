'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CampaignPlanningProvider,
  useCampaignPlanning,
} from '@/components/campaign-planning/CampaignPlanningContext';
import CampaignPlanningHeader from '@/components/campaign-planning/CampaignPlanningHeader';
import CampaignPlanningSidebar, { type PlanningFilters } from '@/components/campaign-planning/CampaignPlanningSidebar';
import CampaignPlanningCalendar from '@/components/campaign-planning/CampaignPlanningCalendar';
import CampaignPlanningDrawer from '@/components/campaign-planning/CampaignPlanningDrawer';
import type { CampaignStatus, PlanningItem } from '@/components/campaign-planning/types';
import { CAMPAIGN_STATUSES } from '@/components/campaign-planning/types';
import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks } from 'date-fns';
import { showError, showSuccess } from '@/utils/toast';

const STORAGE_KEY = 'campaign-planning/preferences';

function PlanningViewInner() {
  const planning = useCampaignPlanning();
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [activeDate, setActiveDate] = useState(new Date());
  const [filters, setFilters] = useState<PlanningFilters>({ statuses: [], databases: [] });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState<string | null>(null);

  const activeDateIso = useMemo(() => format(activeDate, 'yyyy-MM-dd'), [activeDate]);

  const availableFilters = useMemo(() => {
    const statuses: CampaignStatus[] = CAMPAIGN_STATUSES;
    const databases = Array.from(new Set(planning.items.map((item) => item.database))).sort();
    return { statuses, databases };
  }, [planning.items]);

  const filteredItems = useMemo(() => {
    return planning.items.filter((item) => {
      if (filters.statuses.length && !filters.statuses.includes(item.status)) return false;
      if (filters.databases.length && !filters.databases.includes(item.database)) return false;
      return true;
    });
  }, [planning.items, filters]);

  const selectedItem: PlanningItem | null = useMemo(() => {
    if (!selectedId) return null;
    return planning.items.find((item) => item.id === selectedId) ?? null;
  }, [planning.items, selectedId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        viewMode?: string;
        activeDate?: string;
        filters?: PlanningFilters;
      } | null;
      if (parsed?.viewMode && ['day', 'week', 'month'].includes(parsed.viewMode)) {
        setViewMode(parsed.viewMode as 'day' | 'week' | 'month');
      }
      if (parsed?.activeDate) {
        const nextDate = new Date(parsed.activeDate);
        if (!Number.isNaN(nextDate.getTime())) {
          setActiveDate(nextDate);
        }
      }
      if (parsed?.filters) {
        setFilters({
          statuses: Array.isArray(parsed.filters.statuses) ? parsed.filters.statuses : [],
          databases: Array.isArray(parsed.filters.databases) ? parsed.filters.databases : [],
        });
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      viewMode,
      activeDate: format(activeDate, 'yyyy-MM-dd'),
      filters,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [viewMode, activeDate, filters]);

  const handleCreate = () => {
    setSelectedId(null);
    setDrawerMode('create');
    setPlannedDate(activeDateIso);
    setDrawerOpen(true);
  };

  const handleSelect = (item: PlanningItem) => {
    setSelectedId(item.id);
    setDrawerMode('edit');
    setPlannedDate(null);
    setDrawerOpen(true);
  };

  const handleDuplicate = async (item: PlanningItem) => {
    try {
      await planning.duplicateItem(item.id);
      showSuccess('Campaign duplicated');
    } catch (err) {
      console.error('Duplicate campaign failed', err);
      showError('Unable to duplicate campaign.');
    }
  };

  const handleDelete = async (item: PlanningItem) => {
    try {
      await planning.removeItem(item.id);
      if (selectedId === item.id) {
        handleCloseDrawer();
      }
      showSuccess('Campaign deleted');
    } catch (err) {
      console.error('Delete campaign failed', err);
      showError('Unable to delete campaign.');
    }
  };

  const handleMove = async (id: string, date: string, duplicate: boolean) => {
    try {
      if (duplicate) {
        await planning.duplicateItem(id, date);
        showSuccess('Campaign duplicated to new day');
      } else {
        await planning.updateItem(id, { date });
        showSuccess('Campaign moved');
      }
    } catch (err) {
      console.error('Move campaign failed', err);
      showError('Unable to update campaign. Please try again.');
    }
  };

  const navigate = (action: 'prev' | 'next' | 'today') => {
    if (action === 'today') {
      setActiveDate(new Date());
      return;
    }
    setActiveDate((prev) => {
      if (viewMode === 'day') return action === 'prev' ? subDays(prev, 1) : addDays(prev, 1);
      if (viewMode === 'week') return action === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1);
      return action === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1);
    });
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedId(null);
    setPlannedDate(null);
  };

  return (
    <div className="space-y-6">
      <CampaignPlanningHeader
        activeDate={activeDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onNavigate={navigate}
        onCreate={handleCreate}
      />

      {planning.error ? (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40 px-4 py-3 text-sm text-[color:var(--color-text)]/75">
          {planning.error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <CampaignPlanningSidebar filters={filters} onChange={setFilters} available={availableFilters} />

        <div className="relative">
          {planning.loading ? (
            <div className="absolute inset-0 z-10 rounded-2xl border border-dashed border-[color:var(--color-border)]/70 bg-white/60 backdrop-blur-sm flex items-center justify-center text-sm text-[color:var(--color-text)]/55">
              Loading planning...
            </div>
          ) : null}
          <CampaignPlanningCalendar
            currentDate={activeDate}
            viewMode={viewMode}
            items={filteredItems}
            onSelectItem={handleSelect}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onMove={handleMove}
          />
        </div>
      </div>

      <CampaignPlanningDrawer
        open={drawerOpen}
        mode={drawerMode}
        item={selectedItem}
        context={planning}
        defaultDate={drawerMode === 'create' ? (plannedDate ?? activeDateIso) : undefined}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}

export default function CampaignPlanningView() {
  return (
    <CampaignPlanningProvider>
      <section className="px-3 md:px-4 lg:px-6 py-8">
        <PlanningViewInner />
      </section>
    </CampaignPlanningProvider>
  );
}
