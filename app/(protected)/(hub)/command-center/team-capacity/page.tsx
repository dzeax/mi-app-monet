'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import DatePicker from '@/components/ui/DatePicker';

type CapacityMember = {
  userId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  inTeamCapacity: boolean;
  isActive: boolean;
  weeklyHours: number | null;
  contractCountryCode: 'ES' | 'FR' | null;
  calendarCode: 'ES' | 'FR' | null;
  annualVacationDays: number | null;
  vacationUsedDays: number;
  vacationRemainingDays: number | null;
  vacationByMonth: number[];
  contractStart: string | null;
  contractEnd: string | null;
  capacityHours: number | null;
  workloadHours: number;
  utilization: number | null;
  holidayDays: number;
  timeOffByType: {
    vacation: number;
    sick: number;
    other: number;
    total: number;
  };
};

type CapacityResponse = {
  start: string;
  end: string;
  members: CapacityMember[];
  unmappedHours: number;
};

type EditingState = {
  member: CapacityMember;
  weeklyHours: string;
  contractCountryCode: 'ES' | 'FR';
  calendarCode: 'ES' | 'FR';
  annualVacationDays: string;
  startDate: string;
  endDate: string;
};

type HolidayEntry = {
  id: string;
  countryCode: 'ES' | 'FR';
  date: string;
  label: string | null;
};

type TimeOffEntry = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: 'vacation' | 'sick' | 'other';
  startDayFraction: number;
  endDayFraction: number;
  reason: string | null;
};

type HolidayFormState = {
  id: string | null;
  countryCode: 'ES' | 'FR';
  date: string;
  label: string;
};

type TimeOffFormState = {
  id: string | null;
  userId: string;
  startDate: string;
  endDate: string;
  type: 'vacation' | 'sick' | 'other';
  startDayFraction: number;
  endDayFraction: number;
  reason: string;
};

const today = new Date();
const defaultStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
const defaultEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const numberFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dayFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const formatHours = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return '--';
  return `${numberFormatter.format(value)} h`;
};

const formatDays = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return '--';
  return `${dayFormatter.format(value)} d`;
};

const timeOffTypeLabels: Record<TimeOffEntry['type'], string> = {
  vacation: 'Vacation',
  sick: 'Sick',
  other: 'Other',
};

const formatFraction = (value: number) => dayFormatter.format(value);

const getUtilizationStyles = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return {
      bar: 'bg-[color:var(--color-border)]',
      text: 'text-[color:var(--color-text)]/60',
    };
  }
  if (value >= 1) {
    return { bar: 'bg-rose-500', text: 'text-rose-600' };
  }
  if (value >= 0.85) {
    return { bar: 'bg-amber-500', text: 'text-amber-600' };
  }
  if (value >= 0.6) {
    return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
  }
  return { bar: 'bg-sky-500', text: 'text-sky-600' };
};

export default function TeamCapacityPage() {
  const { isAdmin } = useAuth();
  const [startDate, setStartDate] = useState(toDateInput(defaultStart));
  const [endDate, setEndDate] = useState(toDateInput(defaultEnd));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CapacityResponse | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffEntry[]>([]);
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [timeOffBusy, setTimeOffBusy] = useState(false);
  const [holidayForm, setHolidayForm] = useState<HolidayFormState>({
    id: null,
    countryCode: 'FR',
    date: toDateInput(defaultStart),
    label: '',
  });
  const [timeOffForm, setTimeOffForm] = useState<TimeOffFormState>({
    id: null,
    userId: '',
    startDate: toDateInput(defaultStart),
    endDate: toDateInput(defaultStart),
    type: 'vacation',
    startDayFraction: 1,
    endDayFraction: 1,
    reason: '',
  });
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendarTab, setCalendarTab] = useState<'holidays' | 'timeoff'>('holidays');
  const [vacationOpen, setVacationOpen] = useState(false);

  const selectedYear = useMemo(() => {
    const year = Number(startDate.slice(0, 4));
    return Number.isFinite(year) ? year : new Date().getUTCFullYear();
  }, [startDate]);

  const monthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('es-ES', { month: 'short' });
    return Array.from({ length: 12 }, (_, idx) =>
      formatter.format(new Date(Date.UTC(selectedYear, idx, 1))),
    );
  }, [selectedYear]);

  const activeMembers = useMemo(() => {
    if (!data) return [];
    return data.members.filter((member) => member.inTeamCapacity);
  }, [data]);

  const totalWorkload = useMemo(() => {
    if (!data) return 0;
    return activeMembers.reduce((acc, member) => acc + (member.workloadHours || 0), 0);
  }, [activeMembers, data]);

  const totalCapacity = useMemo(() => {
    if (!data) return 0;
    return activeMembers.reduce((acc, member) => acc + (member.capacityHours || 0), 0);
  }, [activeMembers, data]);

  const memberLookup = useMemo(() => {
    const map = new Map<string, CapacityMember>();
    data?.members.forEach((member) => {
      map.set(member.userId, member);
    });
    return map;
  }, [data]);

  const orderedMembers = useMemo(() => activeMembers, [activeMembers]);

  const activeMemberIds = useMemo(() => new Set(activeMembers.map((member) => member.userId)), [activeMembers]);

  const visibleTimeOff = useMemo(
    () => timeOff.filter((entry) => activeMemberIds.has(entry.userId)),
    [timeOff, activeMemberIds],
  );

  const fetchHolidays = async () => {
    setHolidayBusy(true);
    try {
      const params = new URLSearchParams({ start: startDate, end: endDate });
      const response = await fetch(`/api/admin/team-capacity/holidays?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Failed to load holidays';
        throw new Error(message);
      }
      const items = Array.isArray(payload?.items) ? (payload.items as HolidayEntry[]) : [];
      setHolidays(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load holidays');
    } finally {
      setHolidayBusy(false);
    }
  };

  const fetchTimeOff = async () => {
    setTimeOffBusy(true);
    try {
      const params = new URLSearchParams({ start: startDate, end: endDate });
      const response = await fetch(`/api/admin/team-capacity/time-off?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Failed to load time off';
        throw new Error(message);
      }
      const items = Array.isArray(payload?.items) ? (payload.items as TimeOffEntry[]) : [];
      setTimeOff(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load time off');
    } finally {
      setTimeOffBusy(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: startDate, end: endDate });
      const response = await fetch(`/api/admin/team-capacity?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Failed to load capacity';
        throw new Error(message);
      }
      setData(payload as CapacityResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load capacity');
    } finally {
      setLoading(false);
    }

    await Promise.all([fetchHolidays(), fetchTimeOff()]);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setHolidayForm((prev) => (prev.id ? prev : { ...prev, date: startDate }));
    setTimeOffForm((prev) =>
      prev.id ? prev : { ...prev, startDate, endDate: startDate }
    );
  }, [startDate]);

  useEffect(() => {
    if (!activeMembers.length) return;
    setTimeOffForm((prev) => {
      if (prev.userId) return prev;
      return { ...prev, userId: activeMembers[0].userId };
    });
  }, [activeMembers]);

  useEffect(() => {
    setTimeOffForm((prev) => {
      if (prev.startDate !== prev.endDate) return prev;
      if (prev.endDayFraction === prev.startDayFraction) return prev;
      return { ...prev, endDayFraction: prev.startDayFraction };
    });
  }, [timeOffForm.startDate, timeOffForm.endDate, timeOffForm.startDayFraction]);

  const openEditor = (member: CapacityMember) => {
    const fallbackContract = member.contractCountryCode ?? 'FR';
    const fallbackCalendar = member.calendarCode ?? fallbackContract;
    const defaultVacation =
      member.annualVacationDays != null
        ? String(member.annualVacationDays)
        : fallbackContract === 'ES'
          ? '22'
          : '30';
    setEditing({
      member,
      weeklyHours: member.weeklyHours != null ? String(member.weeklyHours) : '',
      contractCountryCode: fallbackContract,
      calendarCode: fallbackCalendar,
      annualVacationDays: defaultVacation,
      startDate: member.contractStart ?? startDate,
      endDate: member.contractEnd ?? '',
    });
  };

  const closeEditor = () => {
    setEditing(null);
  };

  const saveContract = async () => {
    if (!editing) return;
    const weekly = Number(editing.weeklyHours);
    if (!Number.isFinite(weekly) || weekly < 0) {
      setError('Weekly hours must be a valid number.');
      return;
    }
    const annualVacationDays = Number(editing.annualVacationDays);
    if (!Number.isFinite(annualVacationDays) || annualVacationDays < 0) {
      setError('Annual vacation days must be a valid number.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/team-capacity/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editing.member.userId,
          weeklyHours: weekly,
          contractCountryCode: editing.contractCountryCode,
          calendarCode: editing.calendarCode,
          annualVacationDays,
          startDate: editing.startDate,
          endDate: editing.endDate || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Unable to save contract';
        throw new Error(message);
      }
      closeEditor();
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save contract');
    } finally {
      setLoading(false);
    }
  };

  const resetHolidayForm = () => {
    setHolidayForm({
      id: null,
      countryCode: holidayForm.countryCode,
      date: startDate,
      label: '',
    });
  };

  const editHoliday = (entry: HolidayEntry) => {
    setHolidayForm({
      id: entry.id,
      countryCode: entry.countryCode,
      date: entry.date,
      label: entry.label ?? '',
    });
  };

  const saveHoliday = async () => {
    if (!holidayForm.date) {
      setError('Holiday date is required.');
      return;
    }
    setHolidayBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/team-capacity/holidays', {
        method: holidayForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: holidayForm.id,
          countryCode: holidayForm.countryCode,
          date: holidayForm.date,
          label: holidayForm.label.trim() ? holidayForm.label.trim() : null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Unable to save holiday';
        throw new Error(message);
      }
      resetHolidayForm();
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save holiday');
    } finally {
      setHolidayBusy(false);
    }
  };

  const deleteHoliday = async (entry: HolidayEntry) => {
    if (!window.confirm(`Delete holiday on ${entry.date}?`)) return;
    setHolidayBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/team-capacity/holidays', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Unable to delete holiday';
        throw new Error(message);
      }
      if (holidayForm.id === entry.id) {
        resetHolidayForm();
      }
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete holiday');
    } finally {
      setHolidayBusy(false);
    }
  };

  const resetTimeOffForm = () => {
    const defaultUserId = activeMembers[0]?.userId ?? '';
    setTimeOffForm({
      id: null,
      userId: defaultUserId,
      startDate,
      endDate: startDate,
      type: 'vacation',
      startDayFraction: 1,
      endDayFraction: 1,
      reason: '',
    });
  };

  const editTimeOff = (entry: TimeOffEntry) => {
    setTimeOffForm({
      id: entry.id,
      userId: entry.userId,
      startDate: entry.startDate,
      endDate: entry.endDate,
      type: entry.type,
      startDayFraction: entry.startDayFraction,
      endDayFraction: entry.endDayFraction,
      reason: entry.reason ?? '',
    });
  };

  const saveTimeOff = async () => {
    if (!timeOffForm.userId) {
      setError('Select a team member.');
      return;
    }
    if (!timeOffForm.startDate || !timeOffForm.endDate) {
      setError('Start and end dates are required.');
      return;
    }
    if (timeOffForm.startDate > timeOffForm.endDate) {
      setError('End date must be after the start date.');
      return;
    }
    const isSingleDay = timeOffForm.startDate === timeOffForm.endDate;
    const endFraction = isSingleDay ? timeOffForm.startDayFraction : timeOffForm.endDayFraction;

    setTimeOffBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/team-capacity/time-off', {
        method: timeOffForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: timeOffForm.id,
          userId: timeOffForm.userId,
          startDate: timeOffForm.startDate,
          endDate: timeOffForm.endDate,
          type: timeOffForm.type,
          startDayFraction: timeOffForm.startDayFraction,
          endDayFraction: endFraction,
          reason: timeOffForm.reason.trim() ? timeOffForm.reason.trim() : null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Unable to save time off';
        throw new Error(message);
      }
      resetTimeOffForm();
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save time off');
    } finally {
      setTimeOffBusy(false);
    }
  };

  const deleteTimeOff = async (entry: TimeOffEntry) => {
    if (!window.confirm('Delete this time off entry?')) return;
    setTimeOffBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/team-capacity/time-off', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Unable to delete time off';
        throw new Error(message);
      }
      if (timeOffForm.id === entry.id) {
        resetTimeOffForm();
      }
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete time off');
    } finally {
      setTimeOffBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <section className="card p-6">
        <h1 className="text-xl font-semibold">Team Capacity</h1>
        <p className="mt-2 text-sm muted">
          This dashboard is available to administrators only.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="card p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.3em] muted">Command Center</p>
            <h1 className="text-2xl font-semibold">Team Capacity</h1>
            <p className="text-sm muted">
              Workload from CRM only (DQ, manual, strategy, and campaign production units). Capacity uses hours/week,
              weekdays, holidays, and time off.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs uppercase muted">
                Start
                <div className="mt-1 w-[150px]">
                  <DatePicker
                    value={startDate}
                    onChange={(value) => value && setStartDate(value)}
                    ariaLabel="Start date"
                  />
                </div>
              </label>
              <label className="text-xs uppercase muted">
                End
                <div className="mt-1 w-[150px]">
                  <DatePicker
                    value={endDate}
                    onChange={(value) => value && setEndDate(value)}
                    ariaLabel="End date"
                  />
                </div>
              </label>
            </div>
            <button
              className="btn-ghost border border-[--color-border] px-4 py-2 text-sm"
              onClick={() => {
                setCalendarTab('holidays');
                setCalendarModalOpen(true);
              }}
            >
              Manage calendars
            </button>
            <button className="btn-primary" onClick={fetchData} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface-2)]/60 p-4">
            <p className="text-xs uppercase muted">Total capacity</p>
            <p className="mt-1 text-2xl font-semibold">{formatHours(totalCapacity)}</p>
          </div>
          <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface-2)]/60 p-4">
            <p className="text-xs uppercase muted">Total workload</p>
            <p className="mt-1 text-2xl font-semibold">{formatHours(totalWorkload)}</p>
          </div>
          <div className="rounded-xl border border-[--color-border] bg-[color:var(--color-surface-2)]/60 p-4">
            <p className="text-xs uppercase muted">Unmapped workload</p>
            <p className="mt-1 text-2xl font-semibold">{formatHours(data?.unmappedHours ?? 0)}</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="card border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[--color-border] px-4 py-3">
          <h2 className="text-base font-semibold">Capacity by member</h2>
          <span className="text-xs muted">{activeMembers.length} members</span>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedMembers.map((member) => {
            const name = member.displayName || member.email || 'Unnamed';
            const contractCountry = member.contractCountryCode ?? '--';
            const calendarCode = member.calendarCode ?? '--';
            const contractLabel =
              member.weeklyHours != null ? `${member.weeklyHours}h/week` : 'Missing contract';
            const vacationRemaining = formatDays(member.vacationRemainingDays);
            const utilizationValue = member.utilization ?? null;
            const utilizationLabel =
              utilizationValue == null ? '--' : percentFormatter.format(utilizationValue);
            const utilizationStyles = getUtilizationStyles(utilizationValue);
            const capacity = member.capacityHours ?? 0;
            const remaining = capacity ? Math.max(capacity - member.workloadHours, 0) : null;
            const progressValue =
              utilizationValue != null && Number.isFinite(utilizationValue)
                ? Math.min(utilizationValue, 1) * 100
                : 0;
            const hasContract = member.weeklyHours != null;
            return (
              <div
                key={member.userId}
                className={`rounded-2xl border border-[--color-border] bg-white/70 p-4 shadow-sm ${
                  hasContract ? '' : 'border-amber-200 bg-amber-50/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[--color-border] bg-[color:var(--color-surface-2)]">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={name}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--color-text)]/60">
                        {name
                          .split(' ')
                          .slice(0, 2)
                          .map((chunk) => chunk[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-base font-semibold">{name}</div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                          hasContract
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-100 text-amber-700'
                        }`}
                      >
                        {hasContract ? 'Active' : 'Missing contract'}
                      </span>
                    </div>
                    <div className="truncate text-xs muted">{member.email}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="muted">Utilization</span>
                    <span className={`font-semibold ${utilizationStyles.text}`}>{utilizationLabel}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-border)]/60">
                    <div
                      className={`h-full ${utilizationStyles.bar}`}
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="muted">Capacity</div>
                      <div className="font-semibold">{formatHours(member.capacityHours)}</div>
                    </div>
                    <div>
                      <div className="muted">Workload</div>
                      <div className="font-semibold">{formatHours(member.workloadHours)}</div>
                    </div>
                    <div>
                      <div className="muted">Remaining</div>
                      <div className="font-semibold">{formatHours(remaining)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center rounded-full border border-[--color-border] bg-white/80 px-2 py-1">
                    Holidays: {formatDays(member.holidayDays)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[--color-border] bg-white/80 px-2 py-1">
                    Time off: {formatDays(member.timeOffByType.total)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[--color-border] bg-white/80 px-2 py-1">
                    Vacation left: {vacationRemaining}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                  <div className="text-[color:var(--color-text)]/70">
                    <div className="font-semibold">{contractLabel}</div>
                    {hasContract ? (
                      <div className="muted">
                        Contract {contractCountry} / Calendar {calendarCode}
                      </div>
                    ) : null}
                  </div>
                  <button className="btn-ghost" onClick={() => openEditor(member)}>
                    {hasContract ? 'Edit' : 'Set contract'}
                  </button>
                </div>
              </div>
            );
          })}
          {data && data.members.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-[--color-border] p-6 text-center text-sm muted">
              No team members found.
            </div>
          ) : null}
        </div>
      </div>

      <div className="card overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between border-b border-[--color-border] px-4 py-3 text-left"
          onClick={() => setVacationOpen((prev) => !prev)}
          aria-expanded={vacationOpen}
        >
          <div>
            <h2 className="text-base font-semibold">Vacation calendar {selectedYear}</h2>
            <p className="text-xs muted">Days per month</p>
          </div>
          <span className="text-xs font-semibold text-[color:var(--color-text)]/70">
            {vacationOpen ? 'Hide' : 'Show'}
          </span>
        </button>
        {vacationOpen ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--color-surface)] text-left text-xs uppercase muted">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  {monthLabels.map((label) => (
                    <th key={label} className="px-3 py-3 text-center">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((member) => {
                  const name = member.displayName || member.email || 'Unnamed';
                  return (
                    <tr key={`vac-${member.userId}`} className="border-t border-[--color-border]">
                      <td className="px-4 py-3">
                        <div className="font-medium">{name}</div>
                        <div className="text-xs muted">{member.email}</div>
                      </td>
                      {monthLabels.map((_, idx) => {
                        const value = member.vacationByMonth?.[idx] ?? 0;
                        return (
                          <td key={`${member.userId}-${idx}`} className="px-3 py-3 text-center text-sm">
                            {value > 0 ? dayFormatter.format(value) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {data && data.members.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm muted" colSpan={monthLabels.length + 1}>
                      No team members found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {calendarModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCalendarModalOpen(false);
          }}
        >
          <div className="card w-full max-w-5xl overflow-hidden">
            <div className="flex items-start justify-between border-b border-[--color-border] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Manage calendars</h2>
                <p className="text-sm muted">
                  Update holidays and time off without leaving the dashboard.
                </p>
              </div>
              <button className="btn-ghost" onClick={() => setCalendarModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-[--color-border] px-6 py-3">
              <button
                className="btn-ghost px-3 py-1.5 text-sm"
                aria-pressed={calendarTab === 'holidays'}
                onClick={() => setCalendarTab('holidays')}
              >
                Holidays
              </button>
              <button
                className="btn-ghost px-3 py-1.5 text-sm"
                aria-pressed={calendarTab === 'timeoff'}
                onClick={() => setCalendarTab('timeoff')}
              >
                Time off
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              {calendarTab === 'holidays' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="text-sm">
                      Calendar
                      <select
                        className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                        value={holidayForm.countryCode}
                        onChange={(event) =>
                          setHolidayForm((prev) => ({ ...prev, countryCode: event.target.value as 'ES' | 'FR' }))
                        }
                      >
                        <option value="FR">FR adjusted</option>
                        <option value="ES">ES Catalonia</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      Date
                      <div className="mt-1">
                        <DatePicker
                          value={holidayForm.date}
                          onChange={(value) =>
                            value && setHolidayForm((prev) => ({ ...prev, date: value }))
                          }
                          ariaLabel="Holiday date"
                        />
                      </div>
                    </label>
                    <label className="text-sm md:col-span-2">
                      Label (optional)
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                        value={holidayForm.label}
                        onChange={(event) => setHolidayForm((prev) => ({ ...prev, label: event.target.value }))}
                        placeholder="e.g. Company day"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {holidayForm.id ? (
                      <button className="btn-ghost" onClick={resetHolidayForm} disabled={holidayBusy}>
                        Cancel
                      </button>
                    ) : null}
                    <button className="btn-primary" onClick={saveHoliday} disabled={holidayBusy}>
                      {holidayForm.id ? 'Update holiday' : 'Add holiday'}
                    </button>
                  </div>

                  <div className="rounded-xl border border-[--color-border]">
                    <div className="flex items-center justify-between border-b border-[--color-border] px-4 py-3">
                      <span className="text-sm font-semibold">Holidays</span>
                      <span className="text-xs muted">{holidays.length} items</span>
                    </div>
                    <div className="max-h-[340px] overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-[color:var(--color-surface)] text-left text-xs uppercase muted">
                          <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Calendar</th>
                            <th className="px-4 py-3">Label</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holidays.map((holiday) => (
                            <tr key={holiday.id} className="border-t border-[--color-border]">
                              <td className="px-4 py-3">{holiday.date}</td>
                              <td className="px-4 py-3">{holiday.countryCode}</td>
                              <td className="px-4 py-3">{holiday.label || '-'}</td>
                              <td className="px-4 py-3 text-right space-x-2">
                                <button
                                  className="btn-ghost text-xs border border-[--color-border] px-2 py-1"
                                  onClick={() => editHoliday(holiday)}
                                  disabled={holidayBusy}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn-ghost text-xs border border-[--color-border] px-2 py-1 text-red-600"
                                  onClick={() => deleteHoliday(holiday)}
                                  disabled={holidayBusy}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {!holidays.length ? (
                            <tr>
                              <td className="px-4 py-6 text-center text-sm muted" colSpan={4}>
                                No holidays found for this period.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-6">
                    <label className="text-sm md:col-span-2">
                      Member
                      <select
                        className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                        value={timeOffForm.userId}
                        onChange={(event) => setTimeOffForm((prev) => ({ ...prev, userId: event.target.value }))}
                      >
                        <option value="">Select member</option>
                        {activeMembers.map((member) => {
                          const name = member.displayName || member.email || member.userId;
                          return (
                            <option key={member.userId} value={member.userId}>
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <label className="text-sm">
                      Type
                      <select
                        className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                        value={timeOffForm.type}
                        onChange={(event) =>
                          setTimeOffForm((prev) => ({ ...prev, type: event.target.value as TimeOffEntry['type'] }))
                        }
                      >
                        <option value="vacation">Vacation</option>
                        <option value="sick">Sick</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      Start date
                      <div className="mt-1">
                        <DatePicker
                          value={timeOffForm.startDate}
                          onChange={(value) =>
                            value && setTimeOffForm((prev) => ({ ...prev, startDate: value }))
                          }
                          ariaLabel="Time off start date"
                        />
                      </div>
                    </label>
                    <label className="text-sm">
                      End date
                      <div className="mt-1">
                        <DatePicker
                          value={timeOffForm.endDate}
                          onChange={(value) =>
                            value && setTimeOffForm((prev) => ({ ...prev, endDate: value }))
                          }
                          ariaLabel="Time off end date"
                        />
                      </div>
                    </label>
                    {timeOffForm.startDate === timeOffForm.endDate ? (
                      <label className="text-sm">
                        Day fraction
                        <select
                          className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                          value={timeOffForm.startDayFraction}
                          onChange={(event) =>
                            setTimeOffForm((prev) => ({
                              ...prev,
                              startDayFraction: Number(event.target.value),
                              endDayFraction: Number(event.target.value),
                            }))
                          }
                        >
                          <option value={1}>Full day</option>
                          <option value={0.5}>Half day</option>
                        </select>
                      </label>
                    ) : (
                      <>
                        <label className="text-sm">
                          Start fraction
                          <select
                            className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                            value={timeOffForm.startDayFraction}
                            onChange={(event) =>
                              setTimeOffForm((prev) => ({
                                ...prev,
                                startDayFraction: Number(event.target.value),
                              }))
                            }
                          >
                            <option value={1}>Full day</option>
                            <option value={0.5}>Half day</option>
                          </select>
                        </label>
                        <label className="text-sm">
                          End fraction
                          <select
                            className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                            value={timeOffForm.endDayFraction}
                            onChange={(event) =>
                              setTimeOffForm((prev) => ({
                                ...prev,
                                endDayFraction: Number(event.target.value),
                              }))
                            }
                          >
                            <option value={1}>Full day</option>
                            <option value={0.5}>Half day</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label className="text-sm md:col-span-2">
                      Reason (optional)
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                        value={timeOffForm.reason}
                        onChange={(event) =>
                          setTimeOffForm((prev) => ({ ...prev, reason: event.target.value }))
                        }
                        placeholder="e.g. Summer vacation"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {timeOffForm.id ? (
                      <button className="btn-ghost" onClick={resetTimeOffForm} disabled={timeOffBusy}>
                        Cancel
                      </button>
                    ) : null}
                    <button className="btn-primary" onClick={saveTimeOff} disabled={timeOffBusy}>
                      {timeOffForm.id ? 'Update time off' : 'Add time off'}
                    </button>
                  </div>

                  <div className="rounded-xl border border-[--color-border]">
                    <div className="flex items-center justify-between border-b border-[--color-border] px-4 py-3">
                      <span className="text-sm font-semibold">Time off entries</span>
                      <span className="text-xs muted">{visibleTimeOff.length} items</span>
                    </div>
                    <div className="max-h-[340px] overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-[color:var(--color-surface)] text-left text-xs uppercase muted">
                          <tr>
                            <th className="px-4 py-3">Member</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Dates</th>
                            <th className="px-4 py-3">Fractions</th>
                            <th className="px-4 py-3">Reason</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleTimeOff.map((entry) => {
                            const member = memberLookup.get(entry.userId);
                            const name = member?.displayName || member?.email || entry.userId;
                            const singleDay = entry.startDate === entry.endDate;
                            const fractionLabel = singleDay
                              ? formatFraction(entry.startDayFraction)
                              : `${formatFraction(entry.startDayFraction)} / ${formatFraction(entry.endDayFraction)}`;
                            return (
                              <tr key={entry.id} className="border-t border-[--color-border]">
                                <td className="px-4 py-3">
                                  <div className="font-medium">{name}</div>
                                  <div className="text-xs muted">{member?.email ?? ''}</div>
                                </td>
                                <td className="px-4 py-3">{timeOffTypeLabels[entry.type]}</td>
                                <td className="px-4 py-3">
                                  {entry.startDate}
                                  {singleDay ? '' : ` -> ${entry.endDate}`}
                                </td>
                                <td className="px-4 py-3">{fractionLabel}</td>
                                <td className="px-4 py-3">{entry.reason || '-'}</td>
                                <td className="px-4 py-3 text-right space-x-2">
                                  <button
                                    className="btn-ghost text-xs border border-[--color-border] px-2 py-1"
                                    onClick={() => editTimeOff(entry)}
                                    disabled={timeOffBusy}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn-ghost text-xs border border-[--color-border] px-2 py-1 text-red-600"
                                    onClick={() => deleteTimeOff(entry)}
                                    disabled={timeOffBusy}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {!visibleTimeOff.length ? (
                            <tr>
                              <td className="px-4 py-6 text-center text-sm muted" colSpan={6}>
                                No time off entries found for this period.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card p-4 text-sm muted">
        <p className="font-medium text-[color:var(--color-text)]">Notes</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Capacity uses Monday-Friday only.</li>
          <li>Workload includes CRM DQ, manual efforts, strategy efforts, and campaign production units.</li>
          <li>Vacation entitlement defaults to ES=22 days, FR=30 days unless overridden.</li>
          <li>Public holidays are applied per calendar (ES = Catalonia, FR = adjusted company).</li>
          <li>Time off is applied per member (vacation/sick/other, half days supported).</li>
          <li>Use "Manage calendars" to update holidays and time off.</li>
        </ul>
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Contract settings</h2>
            <p className="text-sm muted">
              {editing.member.displayName || editing.member.email}
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                Weekly hours
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                  value={editing.weeklyHours}
                  onChange={(event) =>
                    setEditing((prev) => (prev ? { ...prev, weeklyHours: event.target.value } : prev))
                  }
                />
              </label>
              <label className="block text-sm">
                Contract country
                <select
                  className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                  value={editing.contractCountryCode}
                  onChange={(event) =>
                    setEditing((prev) =>
                      prev ? { ...prev, contractCountryCode: event.target.value as 'ES' | 'FR' } : prev
                    )
                  }
                >
                  <option value="FR">France (FR)</option>
                  <option value="ES">Spain (ES)</option>
                </select>
              </label>
              <label className="block text-sm">
                Holiday calendar
                <select
                  className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                  value={editing.calendarCode}
                  onChange={(event) =>
                    setEditing((prev) =>
                      prev ? { ...prev, calendarCode: event.target.value as 'ES' | 'FR' } : prev
                    )
                  }
                >
                  <option value="FR">France (FR adjusted)</option>
                  <option value="ES">Spain (Catalonia)</option>
                </select>
              </label>
              <label className="block text-sm">
                Annual vacation days
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="mt-1 w-full rounded-md border border-[--color-border] bg-[color:var(--color-surface)] px-3 py-2"
                  value={editing.annualVacationDays}
                  onChange={(event) =>
                    setEditing((prev) =>
                      prev ? { ...prev, annualVacationDays: event.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="block text-sm">
                Effective from
                <div className="mt-1">
                  <DatePicker
                    value={editing.startDate}
                    onChange={(value) =>
                      value &&
                      setEditing((prev) => (prev ? { ...prev, startDate: value } : prev))
                    }
                    ariaLabel="Contract start date"
                  />
                </div>
              </label>
              <label className="block text-sm">
                Effective to (optional)
                <div className="mt-1">
                  <DatePicker
                    value={editing.endDate}
                    onChange={(value) =>
                      setEditing((prev) => (prev ? { ...prev, endDate: value } : prev))
                    }
                    ariaLabel="Contract end date"
                  />
                </div>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button className="btn-ghost" onClick={closeEditor}>
                Cancel
              </button>
              <button className="btn-primary" onClick={saveContract} disabled={loading}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
