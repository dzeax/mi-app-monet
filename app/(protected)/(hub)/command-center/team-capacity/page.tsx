'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import DatePicker from '@/components/ui/DatePicker';
import {
  Briefcase,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Info,
  MoreHorizontal,
  Palmtree,
  Plus,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';

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

type HolidayCsvRow = {
  date: string;
  label: string;
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

type WorkloadDetailSource = 'crm_dq' | 'manual' | 'strategy' | 'campaign';

type WorkloadDetailItem = {
  id: string;
  clientSlug: string | null;
  clientName: string | null;
  source: WorkloadDetailSource;
  label: string | null;
  hours: number;
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

const WORKDAYS_PER_WEEK = 5;

const formatHours = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return '--';
  return `${numberFormatter.format(value)} h`;
};

const formatDays = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return '--';
  return `${dayFormatter.format(value)} d`;
};

const formatDaysValue = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return null;
  return `${dayFormatter.format(value)} d`;
};

const getHoursPerDay = (weeklyHours: number | null) => {
  if (weeklyHours == null || Number.isNaN(weeklyHours) || weeklyHours <= 0) return null;
  return weeklyHours / WORKDAYS_PER_WEEK;
};

const toDaysFromHours = (hours: number | null, hoursPerDay: number | null) => {
  if (hours == null || Number.isNaN(hours)) return null;
  if (hoursPerDay == null || Number.isNaN(hoursPerDay) || hoursPerDay <= 0) return null;
  return hours / hoursPerDay;
};

type DatePreset = 'custom' | 'this_month' | 'next_month' | 'this_quarter' | 'this_year';

const getPresetRange = (preset: DatePreset) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (preset) {
    case 'this_month':
      return {
        start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
        end: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
      };
    case 'next_month':
      return {
        start: new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10),
        end: new Date(Date.UTC(year, month + 2, 0)).toISOString().slice(0, 10),
      };
    case 'this_quarter': {
      const qMonth = Math.floor(month / 3) * 3;
      return {
        start: new Date(Date.UTC(year, qMonth, 1)).toISOString().slice(0, 10),
        end: new Date(Date.UTC(year, qMonth + 3, 0)).toISOString().slice(0, 10),
      };
    }
    case 'this_year':
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
      };
    default:
      return null;
  }
};

const presetLabels: Record<DatePreset, string> = {
  custom: 'Custom',
  this_month: 'This Month',
  next_month: 'Next Month',
  this_quarter: 'This Quarter',
  this_year: 'This Year',
};

const formatIsoDate = (value?: string | null) => {
  if (!value) return '--';
  if (!CSV_DATE_RE.test(value)) return value;
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year}`;
};

const formatIsoRange = (start?: string | null, end?: string | null) => {
  if (!start) return '--';
  if (!end || start === end) return formatIsoDate(start);
  return `${formatIsoDate(start)} -> ${formatIsoDate(end)}`;
};

const timeOffTypeLabels: Record<TimeOffEntry['type'], string> = {
  vacation: 'Vacation',
  sick: 'Sick',
  other: 'Other',
};

const workloadSourceLabels: Record<WorkloadDetailSource, string> = {
  crm_dq: 'CRM DQ',
  manual: 'Manual Effort',
  strategy: 'Strategy',
  campaign: 'Campaign Production',
};

const workloadSourceBadge: Record<WorkloadDetailSource, string> = {
  crm_dq: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300',
  manual: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  strategy: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
  campaign: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
};

type WorkloadClientColor = {
  bar: string;
  dot: string;
  chip: string;
  border: string;
};

type ClientLogo = {
  src: string;
  alt: string;
};

type WorkloadChartColor = {
  bar: string;
  dot: string;
};

const workloadClientPalette: WorkloadClientColor[] = [
  {
    bar: 'bg-sky-500/80 dark:bg-sky-400/70',
    dot: 'bg-sky-500 dark:bg-sky-300',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
    border: 'border-sky-200/70 dark:border-sky-800/60',
  },
  {
    bar: 'bg-emerald-500/80 dark:bg-emerald-400/70',
    dot: 'bg-emerald-500 dark:bg-emerald-300',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
    border: 'border-emerald-200/70 dark:border-emerald-800/60',
  },
  {
    bar: 'bg-amber-500/80 dark:bg-amber-400/70',
    dot: 'bg-amber-500 dark:bg-amber-300',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    border: 'border-amber-200/70 dark:border-amber-800/60',
  },
  {
    bar: 'bg-purple-500/80 dark:bg-purple-400/70',
    dot: 'bg-purple-500 dark:bg-purple-300',
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200',
    border: 'border-purple-200/70 dark:border-purple-800/60',
  },
  {
    bar: 'bg-indigo-500/80 dark:bg-indigo-400/70',
    dot: 'bg-indigo-500 dark:bg-indigo-300',
    chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
    border: 'border-indigo-200/70 dark:border-indigo-800/60',
  },
  {
    bar: 'bg-rose-500/80 dark:bg-rose-400/70',
    dot: 'bg-rose-500 dark:bg-rose-300',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
    border: 'border-rose-200/70 dark:border-rose-800/60',
  },
  {
    bar: 'bg-teal-500/80 dark:bg-teal-400/70',
    dot: 'bg-teal-500 dark:bg-teal-300',
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
    border: 'border-teal-200/70 dark:border-teal-800/60',
  },
];

const workloadChartPalette: WorkloadChartColor[] = [
  { bar: 'bg-blue-500', dot: 'bg-blue-500' },
  { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  { bar: 'bg-purple-500', dot: 'bg-purple-500' },
  { bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
];

const workloadChartOtherColor: WorkloadChartColor = {
  bar: 'bg-slate-300 dark:bg-slate-600',
  dot: 'bg-slate-400 dark:bg-slate-500',
};

const CLIENT_LOGOS: Record<string, ClientLogo> = {
  emg: { src: '/logos/emg-logo.png', alt: 'EMG' },
  bouygues: { src: '/logos/bouygues-logo.png', alt: 'Bouygues Telecom' },
  taittinger: { src: '/logos/taittinger-logo.png', alt: 'Taittinger' },
  ponant: { src: '/logos/ponant-logo.png', alt: 'Ponant' },
  'petit-forestier': { src: '/logos/petit-forestier.png', alt: 'Petit Forestier' },
  'saveurs-et-vie': { src: '/logos/logo-saveurs-et-vie.svg', alt: 'Saveurs et Vie' },
  sfr: { src: '/logos/prm.png', alt: 'Global PRM' },
  europcar: { src: '/logos/ec_logo.png', alt: 'Europcar' },
  goldcar: { src: '/logos/gc_logo.png', alt: 'Goldcar' },
};

const CLIENT_LOGO_ALIASES: Record<string, string> = {
  'emg': 'emg',
  'europcar mobility group': 'emg',
  'europcar mobility': 'emg',
  'emg europcar mobility group': 'emg',
  'europcar': 'europcar',
  'petit forestier': 'petit-forestier',
  'saveurs et vie': 'saveurs-et-vie',
  'global prm': 'sfr',
  'prm': 'sfr',
  'bouygues telecom': 'bouygues',
};

const getClientColor = (name: string) => {
  if (!name) return workloadClientPalette[0];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 2147483647;
  }
  const index = Math.abs(hash) % workloadClientPalette.length;
  return workloadClientPalette[index];
};

const normalizeClientName = (value?: string | null) =>
  value
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/gi, ' ')
        .trim()
        .toLowerCase()
    : '';

const getClientLogo = (clientSlug?: string | null, clientName?: string | null) => {
  const slugKey = (clientSlug || '').trim().toLowerCase();
  if (slugKey && CLIENT_LOGOS[slugKey]) {
    return CLIENT_LOGOS[slugKey];
  }
  const nameKey = normalizeClientName(clientName);
  const aliasKey = nameKey ? CLIENT_LOGO_ALIASES[nameKey] ?? nameKey : '';
  if (aliasKey && CLIENT_LOGOS[aliasKey]) {
    return CLIENT_LOGOS[aliasKey];
  }
  return null;
};

const getClientInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const formatAsDays = (hours: number | null, hoursPerDay: number | null) => {
  const days = toDaysFromHours(hours, hoursPerDay);
  return days != null ? formatDaysValue(days) : '-- d';
};

const formatFraction = (value: number) => dayFormatter.format(value);

const CSV_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const splitCsvLine = (line: string) => {
  const output: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      output.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  output.push(current);
  return output;
};

const parseHolidayCsvText = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errors: string[] = [];

  if (!lines.length) {
    return { rows: [] as HolidayCsvRow[], errors: ['CSV file is empty.'] };
  }

  const parsedRows = lines.map((line) => splitCsvLine(line).map((cell) => cell.trim()));
  const header = parsedRows[0]?.map((cell) => cell.toLowerCase()) ?? [];
  const hasHeader = header[0] === 'date' || header[0] === 'holiday_date';
  const startIndex = hasHeader ? 1 : 0;
  const seen = new Set<string>();
  const rows: HolidayCsvRow[] = [];

  for (let i = startIndex; i < parsedRows.length; i += 1) {
    const [rawDate, rawLabel = ''] = parsedRows[i];
    const date = rawDate?.trim() ?? '';
    const label = rawLabel?.trim() ?? '';
    const rowNumber = i + 1;

    if (!date) {
      errors.push(`Row ${rowNumber}: missing date.`);
      continue;
    }
    if (!CSV_DATE_RE.test(date)) {
      errors.push(`Row ${rowNumber}: invalid date "${date}".`);
      continue;
    }
    if (seen.has(date)) {
      errors.push(`Row ${rowNumber}: duplicate date "${date}".`);
      continue;
    }
    seen.add(date);
    rows.push({ date, label });
  }

  return { rows, errors };
};

const escapeCsvValue = (value: string | null | undefined) => {
  if (!value) return '';
  const needsQuotes = /[",\n]/.test(value);
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
};

const getUtilizationStyles = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return {
      bar: 'bg-slate-200',
    };
  }
  const percent = value * 100;
  if (percent < 50) return { bar: 'bg-emerald-400' };
  if (percent < 75) return { bar: 'bg-blue-500' };
  if (percent < 86) return { bar: 'bg-amber-400' };
  return { bar: 'bg-red-500' };
};

export default function TeamCapacityPage() {
  const { isAdmin } = useAuth();
  const [startDate, setStartDate] = useState(toDateInput(defaultStart));
  const [endDate, setEndDate] = useState(toDateInput(defaultEnd));
  const [activePreset, setActivePreset] = useState<DatePreset>('this_month');
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CapacityResponse | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffEntry[]>([]);
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [timeOffBusy, setTimeOffBusy] = useState(false);
  const holidayActionsRef = useRef<HTMLDivElement | null>(null);
  const [holidayActionsOpen, setHolidayActionsOpen] = useState(false);
  const holidayCsvInputRef = useRef<HTMLInputElement | null>(null);
  const [holidayImportFileName, setHolidayImportFileName] = useState('');
  const [holidayImportRows, setHolidayImportRows] = useState<HolidayCsvRow[]>([]);
  const [holidayImportErrors, setHolidayImportErrors] = useState<string[]>([]);
  const [holidayImportBusy, setHolidayImportBusy] = useState(false);
  const [holidayImportOpen, setHolidayImportOpen] = useState(false);
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
  const [workloadDrawerMember, setWorkloadDrawerMember] = useState<CapacityMember | null>(null);
  const [workloadDetailItems, setWorkloadDetailItems] = useState<WorkloadDetailItem[]>([]);
  const [workloadDetailLoading, setWorkloadDetailLoading] = useState(false);
  const [workloadDetailError, setWorkloadDetailError] = useState<string | null>(null);

  const selectedYear = useMemo(() => {
    const year = Number(startDate.slice(0, 4));
    return Number.isFinite(year) ? year : new Date().getUTCFullYear();
  }, [startDate]);

  const holidayRange = useMemo(() => {
    if (!Number.isFinite(selectedYear)) {
      return { start: startDate, end: endDate };
    }
    return { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31` };
  }, [selectedYear, startDate, endDate]);

  const monthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
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

  const totalWorkloadDays = useMemo(() => {
    if (!data) return null;
    let hasValue = false;
    const total = activeMembers.reduce((acc, member) => {
      const hoursPerDay = getHoursPerDay(member.weeklyHours);
      const days = toDaysFromHours(member.workloadHours, hoursPerDay);
      if (days != null) {
        hasValue = true;
        return acc + days;
      }
      return acc;
    }, 0);
    return hasValue ? total : null;
  }, [activeMembers, data]);

  const totalCapacity = useMemo(() => {
    if (!data) return 0;
    return activeMembers.reduce((acc, member) => acc + (member.capacityHours || 0), 0);
  }, [activeMembers, data]);
  const unmappedHours = data?.unmappedHours ?? 0;

  const totalCapacityDays = useMemo(() => {
    if (!data) return null;
    let hasValue = false;
    const total = activeMembers.reduce((acc, member) => {
      const hoursPerDay = getHoursPerDay(member.weeklyHours);
      const days = toDaysFromHours(member.capacityHours, hoursPerDay);
      if (days != null) {
        hasValue = true;
        return acc + days;
      }
      return acc;
    }, 0);
    return hasValue ? total : null;
  }, [activeMembers, data]);

  const averageHoursPerDay =
    totalCapacityDays != null && totalCapacityDays > 0 ? totalCapacity / totalCapacityDays : null;
  const unmappedDays = toDaysFromHours(unmappedHours, averageHoursPerDay);

  const memberLookup = useMemo(() => {
    const map = new Map<string, CapacityMember>();
    data?.members.forEach((member) => {
      map.set(member.userId, member);
    });
    return map;
  }, [data]);

  useEffect(() => {
    if (!workloadDrawerMember) return;
    const updatedMember = memberLookup.get(workloadDrawerMember.userId);
    if (!updatedMember) {
      setWorkloadDrawerMember(null);
      return;
    }
    if (updatedMember !== workloadDrawerMember) {
      setWorkloadDrawerMember(updatedMember);
    }
  }, [memberLookup, workloadDrawerMember]);

  const orderedMembers = useMemo(() => activeMembers, [activeMembers]);

  const sortedWorkloadDetails = useMemo(
    () => [...workloadDetailItems].sort((a, b) => b.hours - a.hours),
    [workloadDetailItems],
  );

  const drawerHoursPerDay = useMemo(
    () => (workloadDrawerMember ? getHoursPerDay(workloadDrawerMember.weeklyHours) : null),
    [workloadDrawerMember],
  );

  const groupedWorkload = useMemo(() => {
    const grouped = new Map<
      string,
      {
        name: string;
        slug: string | null;
        totalHours: number;
        entries: WorkloadDetailItem[];
        color: WorkloadClientColor;
      }
    >();

    sortedWorkloadDetails.forEach((entry) => {
      const clientKey = entry.clientSlug || entry.clientName || 'Other';
      const clientName = entry.clientName || entry.clientSlug || 'Other';
      if (!grouped.has(clientKey)) {
        grouped.set(clientKey, {
          name: clientName,
          slug: entry.clientSlug ?? null,
          totalHours: 0,
          entries: [],
          color: getClientColor(clientName),
        });
      }
      const target = grouped.get(clientKey);
      if (!target) return;
      if (!target.slug && entry.clientSlug) {
        target.slug = entry.clientSlug;
      }
      target.totalHours += entry.hours;
      target.entries.push(entry);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [sortedWorkloadDetails]);

  const groupedWorkloadTotal = useMemo(
    () => groupedWorkload.reduce((sum, group) => sum + group.totalHours, 0),
    [groupedWorkload],
  );

  const workloadChartSegments = useMemo(() => {
    if (!groupedWorkload.length) return [];
    const segments = groupedWorkload.slice(0, 5).map((group, index) => ({
      name: group.name,
      totalHours: group.totalHours,
      color: workloadChartPalette[index] ?? workloadChartPalette[0],
    }));
    const remainingHours = groupedWorkload
      .slice(5)
      .reduce((sum, group) => sum + group.totalHours, 0);
    if (remainingHours > 0) {
      segments.push({
        name: 'Other',
        totalHours: remainingHours,
        color: workloadChartOtherColor,
      });
    }
    return segments;
  }, [groupedWorkload]);

  const workloadLegend = useMemo(
    () =>
      groupedWorkload.slice(0, 3).map((group, index) => ({
        name: group.name,
        totalHours: group.totalHours,
        color: workloadChartPalette[index] ?? workloadChartPalette[0],
      })),
    [groupedWorkload],
  );

  const activeMemberIds = useMemo(() => new Set(activeMembers.map((member) => member.userId)), [activeMembers]);

  const visibleTimeOff = useMemo(
    () => timeOff.filter((entry) => activeMemberIds.has(entry.userId)),
    [timeOff, activeMemberIds],
  );
  const holidayCalendarLabel = holidayForm.countryCode === 'FR' ? 'FR adjusted' : 'ES Catalonia';

  const holidaysForCalendar = useMemo(
    () => holidays.filter((holiday) => holiday.countryCode === holidayForm.countryCode),
    [holidays, holidayForm.countryCode],
  );

  const nextHoliday = useMemo(() => {
    if (!holidaysForCalendar.length) return null;
    const todayKey = toDateInput(new Date());
    const sorted = [...holidaysForCalendar].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.find((holiday) => holiday.date >= todayKey) ?? sorted[0] ?? null;
  }, [holidaysForCalendar]);

  const timeOffStats = useMemo(() => {
    const counts = { total: 0, vacation: 0, sick: 0, other: 0 };
    const todayKey = toDateInput(new Date());
    let nextEntry: TimeOffEntry | null = null;

    visibleTimeOff.forEach((entry) => {
      counts.total += 1;
      counts[entry.type] += 1;
      if (entry.startDate >= todayKey) {
        if (!nextEntry || entry.startDate < nextEntry.startDate) {
          nextEntry = entry;
        }
      }
    });

    return { ...counts, nextEntry };
  }, [visibleTimeOff]);

  const nextTimeOffEntry = timeOffStats.nextEntry;
  const nextTimeOffMember = nextTimeOffEntry ? memberLookup.get(nextTimeOffEntry.userId) : null;
  const nextTimeOffLabel = nextTimeOffEntry
    ? formatIsoRange(nextTimeOffEntry.startDate, nextTimeOffEntry.endDate)
    : '--';
  const nextTimeOffName = nextTimeOffEntry
    ? nextTimeOffMember?.displayName || nextTimeOffMember?.email || nextTimeOffEntry.userId
    : '';

  const fetchHolidays = async () => {
    setHolidayBusy(true);
    try {
      const params = new URLSearchParams({ start: holidayRange.start, end: holidayRange.end });
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

  useEffect(() => {
    if (!holidayActionsOpen) return;
    const handler = (event: MouseEvent) => {
      if (!holidayActionsRef.current) return;
      if (!holidayActionsRef.current.contains(event.target as Node)) {
        setHolidayActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [holidayActionsOpen]);

  useEffect(() => {
    if (!workloadDrawerMember) {
      setWorkloadDetailItems([]);
      setWorkloadDetailError(null);
      setWorkloadDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadDetails = async () => {
      setWorkloadDetailLoading(true);
      setWorkloadDetailError(null);
      setWorkloadDetailItems([]);
      try {
        const params = new URLSearchParams({
          userId: workloadDrawerMember.userId,
          start: startDate,
          end: endDate,
        });
        const response = await fetch(
          `/api/admin/team-capacity/workload-detail?${params.toString()}`,
          { signal: controller.signal },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload.error === 'string'
              ? payload.error
              : 'Failed to load workload details';
          throw new Error(message);
        }
        const items = Array.isArray(payload?.items)
          ? (payload.items as WorkloadDetailItem[])
          : [];
        setWorkloadDetailItems(items);
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        setWorkloadDetailError(
          err instanceof Error ? err.message : 'Failed to load workload details',
        );
      } finally {
        if (!controller.signal.aborted) {
          setWorkloadDetailLoading(false);
        }
      }
    };

    loadDetails();

    return () => controller.abort();
  }, [workloadDrawerMember, startDate, endDate]);

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

  const clearHolidayImport = () => {
    setHolidayImportFileName('');
    setHolidayImportRows([]);
    setHolidayImportErrors([]);
    setHolidayImportOpen(false);
    if (holidayCsvInputRef.current) {
      holidayCsvInputRef.current.value = '';
    }
  };

  const handleHolidayCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseHolidayCsvText(text);
      setHolidayImportFileName(file.name);
      setHolidayImportRows(parsed.rows);
      setHolidayImportErrors(parsed.errors);
      setHolidayImportOpen(true);
    } catch {
      setHolidayImportFileName(file.name);
      setHolidayImportRows([]);
      setHolidayImportErrors(['Unable to read CSV file.']);
      setHolidayImportOpen(true);
    } finally {
      event.target.value = '';
    }
  };

  const importHolidayCsv = async () => {
    if (!holidayImportRows.length) return;
    setHolidayImportBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/team-capacity/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: holidayForm.countryCode,
          items: holidayImportRows.map((row) => ({
            date: row.date,
            label: row.label.trim() ? row.label.trim() : null,
          })),
          skipDuplicates: true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Unable to import holidays';
        throw new Error(message);
      }
      clearHolidayImport();
      setHolidayImportOpen(false);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to import holidays');
    } finally {
      setHolidayImportBusy(false);
    }
  };

  const exportHolidayCsv = () => {
    if (!holidaysForCalendar.length) {
      setError('No holidays available to export for this calendar.');
      return;
    }
    const header = ['date', 'label'].join(',');
    const lines = holidaysForCalendar.map((holiday) =>
      [holiday.date, escapeCsvValue(holiday.label ?? '')].join(','),
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileSuffix = `${holidayForm.countryCode}-${holidayRange.start}-${holidayRange.end}`;
    link.href = url;
    link.download = `holidays-${fileSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const showHolidayImportPanel =
    holidayImportOpen ||
    Boolean(holidayImportFileName) ||
    holidayImportRows.length > 0 ||
    holidayImportErrors.length > 0;

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
    <section className="space-y-8">
      <div className="card p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.3em] muted">Command Center</p>
            <h1 className="text-2xl font-semibold">Team Capacity</h1>
            <p className="text-sm text-[var(--color-muted)] max-w-3xl">
              Includes workload from <strong>Monetization</strong> and <strong>CRM</strong> (all active clients & PRM).
              Capacity is calculated based on contract hours, workdays, holidays, and time off.
            </p>
          </div>
            {/* Container: Soft Toolbar Style (White island with subtle shadow) */}
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm px-4 py-2">
              {/* Preset Selector */}
              <div className="relative">
                <button
                  onClick={() => setPresetMenuOpen(!presetMenuOpen)}
                  className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text)] px-2 py-1.5 rounded hover:bg-[var(--color-surface-2)] transition-colors min-w-[90px]"
                >
                  <span>{presetLabels[activePreset]}</span>
                  <ChevronDown size={14} className="text-[var(--color-muted)]" />
                </button>

                {/* Dropdown Menu */}
                {presetMenuOpen ? (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setPresetMenuOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-32 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1 z-40 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                      {(Object.keys(presetLabels) as DatePreset[])
                        .filter((key) => key !== 'custom')
                        .map((key) => (
                          <button
                            key={key}
                            className={`text-left px-4 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors ${
                              activePreset === key
                                ? 'text-[var(--color-primary)] font-semibold'
                                : 'text-[var(--color-text)]'
                            }`}
                            onClick={() => {
                              const range = getPresetRange(key);
                              if (range) {
                                setStartDate(range.start);
                                setEndDate(range.end);
                              }
                              setActivePreset(key);
                              setPresetMenuOpen(false);
                            }}
                          >
                            {presetLabels[key]}
                          </button>
                        ))}
                    </div>
                  </>
                ) : null}
              </div>

              {/* Divider */}
              <div className="h-6 w-px bg-[var(--color-border)]/60" />

              {/* Start Date */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)]/50 border border-[var(--color-border)]/60 px-3 py-1.5 min-h-[36px] transition-colors hover:bg-[var(--color-surface-2)]">
                  <Calendar className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                  <div className="w-[120px]">
                    <DatePicker
                      value={startDate}
                      onChange={(value) => {
                        if (!value) return;
                        setStartDate(value);
                        setActivePreset('custom');
                      }}
                      ariaLabel="Start date"
                      buttonClassName="!bg-transparent !border-transparent !shadow-none !px-0 !py-0 !min-h-0 !text-xs !font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Separator */}
              <span className="text-[var(--color-muted)] opacity-50">&rarr;</span>

              {/* End Date */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)]/50 border border-[var(--color-border)]/60 px-3 py-1.5 min-h-[36px] transition-colors hover:bg-[var(--color-surface-2)]">
                  <Calendar className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                  <div className="w-[120px]">
                    <DatePicker
                      value={endDate}
                      onChange={(value) => {
                        if (!value) return;
                        setEndDate(value);
                        setActivePreset('custom');
                      }}
                      ariaLabel="End date"
                      buttonClassName="!bg-transparent !border-transparent !shadow-none !px-0 !py-0 !min-h-0 !text-xs !font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="h-6 w-px bg-[var(--color-border)] mx-1" />

              {/* Actions */}
              <button
                className="btn-ghost text-xs px-3 py-1.5 h-[36px]"
                onClick={() => {
                  setCalendarTab('holidays');
                  setCalendarModalOpen(true);
                }}
              >
                Manage calendars
              </button>

              <button
                className="btn-primary flex items-center gap-2 text-xs px-4 py-1.5 h-[36px] rounded-lg shadow-sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="kpi-frame">
            <p className="text-xs font-bold tracking-widest text-[--color-muted] uppercase">Total capacity</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {formatHours(totalCapacity)}
              {totalCapacityDays != null ? (
                <span className="text-lg font-normal text-[var(--color-muted)] ml-2">
                  ({formatDaysValue(totalCapacityDays)})
                </span>
              ) : null}
            </p>
          </div>
          <div className="kpi-frame">
            <p className="text-xs font-bold tracking-widest text-[--color-muted] uppercase">Total workload</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {formatHours(totalWorkload)}
              {totalWorkloadDays != null ? (
                <span className="text-lg font-normal text-[var(--color-muted)] ml-2">
                  ({formatDaysValue(totalWorkloadDays)})
                </span>
              ) : null}
            </p>
          </div>
          <div className="kpi-frame">
            <p className="text-xs font-bold tracking-widest text-[--color-muted] uppercase">Unmapped workload</p>
            <p
              className={`mt-2 text-3xl font-bold tracking-tight ${
                unmappedHours > 0 ? 'text-amber-600' : ''
              }`}
            >
              {formatHours(unmappedHours)}
              {unmappedDays != null ? (
                <span className="text-lg font-normal text-[var(--color-muted)] ml-2">
                  ({formatDaysValue(unmappedDays)})
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="card border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="card overflow-hidden">
        {/* Header: More visual weight */}
        <div className="flex items-center gap-3 bg-[var(--color-surface-2)]/80 border-b border-[var(--color-border)]/60 px-6 py-4">
          <h2 className="text-sm font-bold text-[var(--color-text)] uppercase tracking-wide">
            Capacity by member
          </h2>
          {/* Counter Badge */}
          <span className="inline-flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-muted)] text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm ring-1 ring-inset ring-[var(--color-border)]/60">
            {activeMembers.length} members
          </span>
        </div>

        {/* Body: The Grid */}
        <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
          {orderedMembers.map((member) => {
            const name = member.displayName || member.email || 'Unnamed';
            const contractCountry = member.contractCountryCode ?? '--';
            const calendarCode = member.calendarCode ?? '--';
            const contractLabel =
              member.weeklyHours != null ? `${member.weeklyHours}h/week` : 'Missing contract';
            const vacationRemaining = formatDays(member.vacationRemainingDays);
            const utilizationValue = member.utilization ?? null;
            const utilizationStyles = getUtilizationStyles(utilizationValue);
            const hoursPerDay = getHoursPerDay(member.weeklyHours);
            const capacity = member.capacityHours ?? 0;
            const remaining = capacity ? Math.max(capacity - member.workloadHours, 0) : null;
            const capacityDays = toDaysFromHours(member.capacityHours, hoursPerDay);
            const workloadDays = toDaysFromHours(member.workloadHours, hoursPerDay);
            const remainingDays = toDaysFromHours(remaining, hoursPerDay);
            const progressValue =
              utilizationValue != null && Number.isFinite(utilizationValue)
                ? Math.min(utilizationValue, 1) * 100
                : 0;
            const utilizationPercent =
              utilizationValue != null && Number.isFinite(utilizationValue)
                ? Math.round(utilizationValue * 100)
                : null;
            const hasContract = member.weeklyHours != null;
            return (
              <div
                key={member.userId}
                className={`card p-4 hover:shadow-md transition-shadow ${
                  hasContract ? '' : 'border-amber-200 bg-amber-50/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
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
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{name}</div>
                      <div className="truncate text-xs muted">{member.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        hasContract
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-amber-500/10 text-amber-700'
                      }`}
                    >
                      {hasContract ? 'Active' : 'Missing'}
                    </span>
                    <button
                      className="text-[--color-muted] hover:text-[--color-text] p-1 rounded transition-colors"
                      onClick={() => openEditor(member)}
                      aria-label={hasContract ? 'Edit contract' : 'Set contract'}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-[10px] font-bold tracking-widest text-[--color-muted] mb-1.5 uppercase">
                    Utilization
                    <span className="text-[--color-text] ml-1 text-xs">
                      {utilizationPercent != null ? `${utilizationPercent}%` : '--'}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${utilizationStyles.bar}`}
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest muted">Capacity</div>
                      <div className="flex items-baseline text-lg font-semibold">
                        <span>{formatHours(member.capacityHours)}</span>
                        {capacityDays != null ? (
                          <span className="text-xs font-normal text-[var(--color-muted)] ml-1.5">
                            ({formatDaysValue(capacityDays)})
                          </span>
                        ) : null}
                      </div>
                    </div>
                      <div
                        className="cursor-pointer group hover:bg-[var(--color-surface-2)]/50 transition-colors rounded px-2 -mx-2"
                        onClick={() => setWorkloadDrawerMember(member)}
                      >
                        <div className="text-[10px] uppercase tracking-widest muted">Workload</div>
                        <div className="flex items-baseline text-lg font-semibold">
                          <span className="group-hover:text-[var(--color-primary)]">
                            {formatHours(member.workloadHours)}
                          </span>
                          {workloadDays != null ? (
                            <span className="text-xs font-normal text-[var(--color-muted)] ml-1.5">
                              ({formatDaysValue(workloadDays)})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest muted">Remaining</div>
                      <div className="flex items-baseline text-lg font-semibold">
                        <span>{formatHours(remaining)}</span>
                        {remainingDays != null ? (
                          <span className="text-xs font-normal text-[var(--color-muted)] ml-1.5">
                            ({formatDaysValue(remainingDays)})
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs muted">
                  <div className="font-semibold">{contractLabel}</div>
                  {hasContract ? (
                    <div className="muted">
                      Contract {contractCountry} / Calendar {calendarCode}
                    </div>
                  ) : null}
                </div>

                {/* Footer Metadata with Tooltips */}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--color-muted)]">
                  {/* Holiday Days */}
                  <div className="group relative flex items-center gap-1.5 cursor-help">
                    <Palmtree size={14} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                    <span>{formatDays(member.holidayDays)}</span>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max rounded bg-slate-800 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block z-10">
                      Public holidays
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  </div>

                  {/* Total Time Off */}
                  <div className="group relative flex items-center gap-1.5 cursor-help">
                    <Clock size={14} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                    <span>{formatDays(member.timeOffByType.total)}</span>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max rounded bg-slate-800 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block z-10">
                      Total time off taken
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  </div>

                  {/* Vacation Remaining */}
                  <div className="group relative flex items-center gap-1.5 cursor-help">
                    <Briefcase size={14} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                    <span>{vacationRemaining}</span>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max rounded bg-slate-800 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block z-10">
                      Vacation days left
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  </div>
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
          className="flex w-full items-center justify-between bg-[var(--color-surface-2)]/80 border-b border-[var(--color-border)]/60 px-6 py-4 text-left"
          onClick={() => setVacationOpen((prev) => !prev)}
          aria-expanded={vacationOpen}
        >
          <div>
            <h2 className="text-base font-semibold">Vacation calendar {selectedYear}</h2>
            <p className="text-xs muted">Days per month</p>
          </div>
          {vacationOpen ? (
            <ChevronUp className="h-5 w-5 text-[var(--color-muted)]" />
          ) : (
            <ChevronDown className="h-5 w-5 text-[var(--color-muted)]" />
          )}
        </button>
        {vacationOpen ? (
          <div className="max-h-[420px] overflow-auto">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="text-xs uppercase muted">Member</th>
                    {monthLabels.map((label) => (
                      <th key={label} className="text-xs uppercase muted text-center">
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
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[--color-border] bg-[color:var(--color-surface-2)]">
                              {member.avatarUrl ? (
                                <img
                                  src={member.avatarUrl}
                                  alt={name}
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[color:var(--color-text)]/60">
                                  {name
                                    .split(' ')
                                    .slice(0, 2)
                                    .map((chunk) => chunk[0])
                                    .join('')
                                    .toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium">{name}</div>
                              <div className="text-xs muted">{member.email}</div>
                            </div>
                          </div>
                        </td>
                        {monthLabels.map((_, idx) => {
                          const value = member.vacationByMonth?.[idx] ?? 0;
                          const hasValue = value > 0;
                          return (
                            <td
                              key={`${member.userId}-${idx}`}
                              className={`text-center ${
                                hasValue
                                  ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-100 dark:bg-blue-900/20 dark:text-blue-300'
                                  : 'text-slate-200'
                              }`}
                            >
                              {hasValue ? dayFormatter.format(value) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {data && data.members.length === 0 ? (
                    <tr>
                      <td className="py-6 text-center text-sm muted" colSpan={monthLabels.length + 1}>
                        No team members found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {calendarModalOpen ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCalendarModalOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <div
            className="relative card w-full max-w-5xl max-h-[90vh] overflow-hidden border border-[var(--color-border)] shadow-xl"
            style={{ background: 'var(--color-surface)' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 modal-chrome modal-header px-5 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Manage calendars</h2>
                    <p className="text-xs opacity-75">Update holidays and time off without leaving the dashboard.</p>
                  </div>
                </div>
                <button
                  className="btn-ghost"
                  onClick={() => setCalendarModalOpen(false)}
                  aria-label="Close manage calendars"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="modal-body overflow-y-auto px-5 pt-4 pb-12 space-y-4">
              <div className="segmented mb-4" role="tablist" aria-label="Calendar views">
                <button
                  role="tab"
                  aria-selected={calendarTab === 'holidays'}
                  className="flex items-center gap-2"
                  onClick={() => setCalendarTab('holidays')}
                >
                  <CalendarDays className="h-4 w-4" />
                  Holidays
                </button>
                <button
                  role="tab"
                  aria-selected={calendarTab === 'timeoff'}
                  className="flex items-center gap-2"
                  onClick={() => setCalendarTab('timeoff')}
                >
                  <Clock className="h-4 w-4" />
                  Time off
                </button>
              </div>

              {calendarTab === 'holidays' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="stat-tile p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Calendar
                      </div>
                      <div className="mt-2 text-lg font-semibold">{holidayCalendarLabel}</div>
                      <div className="text-xs muted">Range: {formatIsoRange(holidayRange.start, holidayRange.end)}</div>
                    </div>
                    <div className="stat-tile p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Holidays
                      </div>
                      <div className="mt-2 text-lg font-semibold">{holidaysForCalendar.length}</div>
                      <div className="text-xs muted">Items in this calendar</div>
                    </div>
                    <div className="stat-tile p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Next holiday
                      </div>
                      <div className="mt-2 text-lg font-semibold">{formatIsoDate(nextHoliday?.date)}</div>
                      <div className="text-xs muted">
                        {nextHoliday?.label ?? 'No upcoming holidays'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                    <div className="card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Add holiday</p>
                            <p className="text-xs muted">Create a single date entry.</p>
                          </div>
                          {holidayForm.id ? <span className="badge-field">Editing</span> : null}
                        </div>
                        <div className="mt-3 space-y-3">
                          <label className="block text-sm">
                            Calendar
                            <select
                              className="input mt-1 w-full"
                              value={holidayForm.countryCode}
                              onChange={(event) =>
                                setHolidayForm((prev) => ({
                                  ...prev,
                                  countryCode: event.target.value as 'ES' | 'FR',
                                }))
                              }
                            >
                              <option value="FR">FR adjusted</option>
                              <option value="ES">ES Catalonia</option>
                            </select>
                          </label>
                          <label className="block text-sm">
                            Date
                            <div className="mt-1">
                              <DatePicker
                                value={holidayForm.date}
                                onChange={(value) =>
                                  value && setHolidayForm((prev) => ({ ...prev, date: value }))
                                }
                                ariaLabel="Holiday date"
                                displayFormat="dd-MM-yyyy"
                              />
                            </div>
                          </label>
                          <label className="block text-sm">
                            Label (optional)
                            <input
                              type="text"
                              className="input mt-1 w-full"
                              value={holidayForm.label}
                              onChange={(event) =>
                                setHolidayForm((prev) => ({ ...prev, label: event.target.value }))
                              }
                              placeholder="e.g. Company day"
                            />
                          </label>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                          {holidayForm.id ? (
                            <button className="btn-ghost" onClick={resetHolidayForm} disabled={holidayBusy}>
                              Cancel
                            </button>
                          ) : null}
                          <button className="btn-primary gap-2" onClick={saveHoliday} disabled={holidayBusy}>
                            <Plus className="h-4 w-4" />
                            {holidayForm.id ? 'Update holiday' : 'Add holiday'}
                          </button>
                        </div>
                    </div>

                    <div className="card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Holiday list</p>
                          <p className="text-xs muted">{holidaysForCalendar.length} items</p>
                        </div>
                        <div className="relative" ref={holidayActionsRef}>
                          <button
                            className="btn-ghost text-sm gap-2"
                            onClick={() => setHolidayActionsOpen((prev) => !prev)}
                            aria-haspopup="menu"
                            aria-expanded={holidayActionsOpen}
                          >
                            More actions
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {holidayActionsOpen ? (
                            <div
                              className="absolute right-0 mt-2 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-50"
                              role="menu"
                            >
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)] flex items-center gap-2"
                                onClick={() => {
                                  setHolidayImportOpen(true);
                                  setHolidayActionsOpen(false);
                                  holidayCsvInputRef.current?.click();
                                }}
                              >
                                <Upload className="h-4 w-4" />
                                Import CSV
                              </button>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                onClick={() => {
                                  setHolidayActionsOpen(false);
                                  exportHolidayCsv();
                                }}
                                disabled={!holidaysForCalendar.length}
                              >
                                <Download className="h-4 w-4" />
                                Export CSV
                              </button>
                              {(holidayImportFileName || holidayImportRows.length || holidayImportErrors.length) ? (
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-hover)] flex items-center gap-2"
                                  onClick={() => {
                                    clearHolidayImport();
                                    setHolidayActionsOpen(false);
                                  }}
                                >
                                  Clear import
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <input
                        ref={holidayCsvInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={handleHolidayCsvUpload}
                      />
                      {showHolidayImportPanel ? (
                        <div className="mt-3 rounded-lg border border-[--color-border] bg-[color:var(--color-surface-2)]/70 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] muted">
                                Bulk import (CSV)
                              </p>
                              <p className="text-xs muted">Format: date,label. Calendar: {holidayCalendarLabel}.</p>
                            </div>
                            <span className="badge-field">Skip duplicates</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <button
                              className="btn-ghost text-xs gap-2"
                              onClick={() => holidayCsvInputRef.current?.click()}
                              disabled={holidayImportBusy}
                            >
                              <Upload className="h-4 w-4" />
                              Upload CSV
                            </button>
                            <span className="muted">{holidayImportFileName || 'No file selected'}</span>
                            <span className="muted">Rows parsed: {holidayImportRows.length}</span>
                          </div>
                          {holidayImportErrors.length ? (
                            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                              <div className="font-semibold">Issues found</div>
                              <ul className="mt-2 list-disc space-y-1 pl-4">
                                {holidayImportErrors.slice(0, 4).map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                                {holidayImportErrors.length > 4 ? (
                                  <li>+{holidayImportErrors.length - 4} more</li>
                                ) : null}
                              </ul>
                            </div>
                          ) : null}
                          {holidayImportRows.length ? (
                            <div className="rounded-lg border border-[--color-border] bg-[color:var(--color-surface)] p-2">
                              <div className="text-[11px] font-semibold uppercase muted">Preview</div>
                              <div className="mt-2 space-y-1 text-xs">
                                {holidayImportRows.slice(0, 4).map((row, idx) => (
                                  <div key={`${row.date}-${idx}`} className="flex items-center justify-between gap-2">
                                    <span>{formatIsoDate(row.date)}</span>
                                    <span className="muted">{row.label || '-'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              className="btn-ghost text-xs"
                              onClick={clearHolidayImport}
                              disabled={holidayImportBusy || (!holidayImportFileName && !holidayImportRows.length)}
                            >
                              Clear
                            </button>
                            <button
                              className="btn-primary text-xs gap-2"
                              onClick={importHolidayCsv}
                              disabled={
                                holidayImportBusy ||
                                !holidayImportRows.length ||
                                holidayImportErrors.length > 0
                              }
                            >
                              <Upload className="h-4 w-4" />
                              {holidayImportBusy ? 'Importing...' : 'Import holidays'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 max-h-[360px] overflow-auto">
                        <div className="table-wrap" style={{ zIndex: 0 }}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th className="text-xs uppercase muted">Date</th>
                                <th className="text-xs uppercase muted">Calendar</th>
                                <th className="text-xs uppercase muted">Label</th>
                                <th className="text-xs uppercase muted text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {holidaysForCalendar.map((holiday) => (
                                <tr key={holiday.id} className="border-t border-[--color-border]">
                                  <td>{formatIsoDate(holiday.date)}</td>
                                  <td>{holiday.countryCode}</td>
                                  <td>{holiday.label || '-'}</td>
                                  <td className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        className="btn-ghost px-2 py-1 text-xs"
                                        onClick={() => editHoliday(holiday)}
                                        disabled={holidayBusy}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        className="btn-ghost px-2 py-1 text-xs text-red-600"
                                        onClick={() => deleteHoliday(holiday)}
                                        disabled={holidayBusy}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {!holidaysForCalendar.length ? (
                                <tr>
                                  <td className="py-6 text-center text-sm muted" colSpan={4}>
                                    No holidays found for this calendar.
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="stat-tile p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Entries
                      </div>
                      <div className="mt-2 text-lg font-semibold">{timeOffStats.total}</div>
                      <div className="text-xs muted">Total in range</div>
                    </div>
                    <div className="stat-tile p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Breakdown
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div>Vacation: {timeOffStats.vacation}</div>
                        <div>Sick: {timeOffStats.sick}</div>
                        <div>Other: {timeOffStats.other}</div>
                      </div>
                    </div>
                    <div className="stat-tile p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text)]/60">
                        Next time off
                      </div>
                      <div className="mt-2 text-lg font-semibold">{nextTimeOffLabel}</div>
                      <div className="text-xs muted">
                        {nextTimeOffEntry
                          ? `${nextTimeOffName} - ${timeOffTypeLabels[nextTimeOffEntry.type]}`
                          : 'No upcoming entries'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                    <div className="card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Add time off</p>
                          <p className="text-xs muted">Plan vacation, sick days, or other time off.</p>
                        </div>
                        {timeOffForm.id ? <span className="badge-field">Editing</span> : null}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm sm:col-span-2">
                          Member
                          <select
                            className="input mt-1 w-full"
                            value={timeOffForm.userId}
                            onChange={(event) =>
                              setTimeOffForm((prev) => ({ ...prev, userId: event.target.value }))
                            }
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
                        <label className="block text-sm">
                          Type
                          <select
                            className="input mt-1 w-full"
                            value={timeOffForm.type}
                            onChange={(event) =>
                              setTimeOffForm((prev) => ({
                                ...prev,
                                type: event.target.value as TimeOffEntry['type'],
                              }))
                            }
                          >
                            <option value="vacation">Vacation</option>
                            <option value="sick">Sick</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="block text-sm">
                          Start date
                          <div className="mt-1">
                            <DatePicker
                              value={timeOffForm.startDate}
                              onChange={(value) =>
                                value && setTimeOffForm((prev) => ({ ...prev, startDate: value }))
                              }
                              ariaLabel="Time off start date"
                              displayFormat="dd-MM-yyyy"
                            />
                          </div>
                        </label>
                        <label className="block text-sm">
                          End date
                          <div className="mt-1">
                            <DatePicker
                              value={timeOffForm.endDate}
                              onChange={(value) =>
                                value && setTimeOffForm((prev) => ({ ...prev, endDate: value }))
                              }
                              ariaLabel="Time off end date"
                              displayFormat="dd-MM-yyyy"
                            />
                          </div>
                        </label>
                        {timeOffForm.startDate === timeOffForm.endDate ? (
                          <label className="block text-sm sm:col-span-2">
                            Day fraction
                            <select
                              className="input mt-1 w-full"
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
                            <label className="block text-sm">
                              Start fraction
                              <select
                                className="input mt-1 w-full"
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
                            <label className="block text-sm">
                              End fraction
                              <select
                                className="input mt-1 w-full"
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
                        <label className="block text-sm sm:col-span-2">
                          Reason (optional)
                          <input
                            type="text"
                            className="input mt-1 w-full"
                            value={timeOffForm.reason}
                            onChange={(event) =>
                              setTimeOffForm((prev) => ({ ...prev, reason: event.target.value }))
                            }
                            placeholder="e.g. Summer vacation"
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        {timeOffForm.id ? (
                          <button className="btn-ghost" onClick={resetTimeOffForm} disabled={timeOffBusy}>
                            Cancel
                          </button>
                        ) : null}
                        <button className="btn-primary gap-2" onClick={saveTimeOff} disabled={timeOffBusy}>
                          <Plus className="h-4 w-4" />
                          {timeOffForm.id ? 'Update time off' : 'Add time off'}
                        </button>
                      </div>
                    </div>

                    <div className="card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Time off entries</p>
                          <p className="text-xs muted">{visibleTimeOff.length} items</p>
                        </div>
                      </div>
                      <div className="mt-3 max-h-[360px] overflow-auto">
                        <div className="table-wrap" style={{ zIndex: 0 }}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th className="text-xs uppercase muted">Member</th>
                                <th className="text-xs uppercase muted">Type</th>
                                <th className="text-xs uppercase muted">Dates</th>
                                <th className="text-xs uppercase muted">Fractions</th>
                                <th className="text-xs uppercase muted">Reason</th>
                                <th className="text-xs uppercase muted text-right">Action</th>
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
                                    <td>
                                      <div className="font-medium">{name}</div>
                                      <div className="text-xs muted">{member?.email ?? ''}</div>
                                    </td>
                                    <td>{timeOffTypeLabels[entry.type]}</td>
                                    <td>{formatIsoRange(entry.startDate, entry.endDate)}</td>
                                    <td>{fractionLabel}</td>
                                    <td>{entry.reason || '-'}</td>
                                    <td className="text-right">
                                      <div className="flex justify-end gap-2">
                                        <button
                                          className="btn-ghost px-2 py-1 text-xs"
                                          onClick={() => editTimeOff(entry)}
                                          disabled={timeOffBusy}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          className="btn-ghost px-2 py-1 text-xs text-red-600"
                                          onClick={() => deleteTimeOff(entry)}
                                          disabled={timeOffBusy}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                              {!visibleTimeOff.length ? (
                                <tr>
                                  <td className="py-6 text-center text-sm muted" colSpan={6}>
                                    No time off entries found for this period.
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 z-10 modal-chrome modal-footer px-5 py-3 flex items-center justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCalendarModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Notes Section: Soft Info Callout Style */}
      <div className="mt-8 rounded-r-xl border-l-4 border-blue-400/30 bg-blue-50/30 p-5 text-sm dark:border-blue-500/30 dark:bg-blue-900/10">
        <div className="mb-3 flex items-center gap-2 text-[var(--color-text)] opacity-80">
          <Info className="h-4 w-4" />
          <p className="font-semibold">Reference notes</p>
        </div>
        <ul className="list-disc space-y-1.5 pl-7 text-[var(--color-muted)]">
          <li>
            Capacity uses <strong>Monday-Friday</strong> only.
          </li>
          <li>Workload includes CRM DQ, manual efforts, strategy efforts, and campaign production units.</li>
          <li>
            Vacation entitlement defaults to <strong>ES=22 days</strong>, <strong>FR=30 days</strong> unless
            overridden.
          </li>
          <li>Public holidays are applied per calendar (ES = Catalonia, FR = adjusted company).</li>
          <li>
            Time off is applied per member (vacation/sick/other, <strong>half days</strong> supported).
          </li>
          <li>Use "Manage calendars" in the toolbar to update holidays and time off.</li>
        </ul>
      </div>

      {/* Workload Detail Drawer */}
      {workloadDrawerMember ? (
        <div className="fixed inset-0 z-[150] flex justify-end" role="dialog">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={() => setWorkloadDrawerMember(null)}
          />

          {/* Drawer Panel */}
          <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-6 py-5">
              <div className="flex items-center gap-3">
                {/* Avatar (Reused logic) */}
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)]">
                  {workloadDrawerMember.avatarUrl ? (
                    <img
                      src={workloadDrawerMember.avatarUrl}
                      className="h-full w-full object-cover"
                      alt={workloadDrawerMember.displayName ?? 'Member'}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-2)] text-xs font-bold">
                      {workloadDrawerMember.displayName?.[0] ?? '?'}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-text)]">Workload Breakdown</h3>
                  <p className="text-xs text-[var(--color-muted)]">
                    {workloadDrawerMember.displayName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWorkloadDrawerMember(null)}
                className="btn-ghost rounded-full p-2 hover:bg-[var(--color-border)]"
              >
                <XCircle className="h-5 w-5 text-[var(--color-muted)]" />
              </button>
            </div>

            {/* Drawer Body - Scrollable */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Summary + Distribution */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted)]">
                      Total Workload
                    </p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-[var(--color-primary)]">
                        {formatHours(workloadDrawerMember.workloadHours)}
                      </span>
                      <span className="text-sm text-[var(--color-muted)]">
                        ({formatAsDays(workloadDrawerMember.workloadHours, drawerHoursPerDay)})
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {groupedWorkload.length} clients
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {workloadChartSegments.map((segment) => {
                      const percent =
                        groupedWorkloadTotal > 0
                          ? segment.totalHours / groupedWorkloadTotal
                          : 0;
                      return (
                        <div
                          key={segment.name}
                          className={segment.color.bar}
                          style={{ width: `${percent * 100}%` }}
                          title={`${segment.name}: ${percentFormatter.format(percent)}`}
                        />
                      );
                    })}
                  </div>

                  {groupedWorkloadTotal > 0 ? (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {workloadLegend.map((group) => {
                        const percent = groupedWorkloadTotal > 0 ? group.totalHours / groupedWorkloadTotal : 0;
                        return (
                          <div key={group.name} className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${group.color.dot}`} />
                            <span className="font-semibold text-[var(--color-text)]">
                              {group.name}
                            </span>
                            <span className="text-[var(--color-muted)]">
                              {percentFormatter.format(percent)}
                            </span>
                          </div>
                        );
                      })}
                      {groupedWorkload.length > 3 ? (
                        <span className="text-[var(--color-muted)]">
                          +{groupedWorkload.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-muted)]">
                      No workload distribution available.
                    </p>
                  )}
                </div>
              </div>

              {workloadDetailLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-muted)]">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading workload details...
                </div>
              ) : workloadDetailError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-700">
                  {workloadDetailError}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      Details by Client
                    </h4>
                    <span className="text-xs text-[var(--color-muted)]">
                      {formatHours(groupedWorkloadTotal)}{' '}
                      <span className="text-[var(--color-muted)]">
                        ({formatAsDays(groupedWorkloadTotal, drawerHoursPerDay)})
                      </span>
                    </span>
                  </div>

                  {groupedWorkload.map((group, index) => {
                    const percent =
                      groupedWorkloadTotal > 0
                        ? group.totalHours / groupedWorkloadTotal
                        : 0;
                    const logo = getClientLogo(group.slug, group.name);
                    return (
                      <details
                        key={group.name}
                        className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
                        open={index === 0}
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                          <div className="flex items-center gap-3">
                            {logo ? (
                              <div
                                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-white p-0.5"
                              >
                                <img
                                  src={logo.src}
                                  alt={logo.alt}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            ) : (
                              <div
                                className={`flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-bold ${group.color.chip} ${group.color.border}`}
                              >
                                {getClientInitials(group.name)}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-text)]">
                                {group.name}
                              </p>
                              <div className="mt-1 h-1.5 w-40 max-w-[220px] overflow-hidden rounded-full bg-[var(--color-border)]/60">
                                <div
                                  className={`h-full ${group.color.bar}`}
                                  style={{ width: `${percent * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-[var(--color-text)]">
                              {formatHours(group.totalHours)}{' '}
                              <span className="text-xs text-[var(--color-muted)]">
                                ({formatAsDays(group.totalHours, drawerHoursPerDay)})
                              </span>
                            </p>
                            <p className="text-[10px] text-[var(--color-muted)]">
                              {percentFormatter.format(percent)}
                            </p>
                          </div>
                        </summary>

                        <div className="space-y-2 border-t border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/40 px-4 py-3">
                          {group.entries.map((entry) => {
                            const sourceLabel = workloadSourceLabels[entry.source];
                            const detailLabel = entry.label
                              ? `${sourceLabel} · ${entry.label}`
                              : sourceLabel;
                            return (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)]/70 px-3 py-2 text-xs"
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${workloadSourceBadge[entry.source]}`}
                                  >
                                    <Briefcase size={14} />
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-[var(--color-text)]">
                                      {detailLabel}
                                    </p>
                                    <p className="text-[10px] text-[var(--color-muted)]">
                                      {entry.clientName || entry.clientSlug || 'Other'}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-semibold text-[var(--color-text)]">
                                    {formatHours(entry.hours)}{' '}
                                    <span className="text-[10px] text-[var(--color-muted)]">
                                      ({formatAsDays(entry.hours, drawerHoursPerDay)})
                                    </span>
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}

                  {!groupedWorkload.length ? (
                    <div className="py-10 text-center text-sm text-[var(--color-muted)]">
                      No workload recorded for this period.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Drawer Footer (Optional) */}
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/30 p-4 text-center">
              <p className="text-[10px] text-[var(--color-muted)]">
                Data sourced from CRM &amp; Monetization
              </p>
            </div>
          </div>
        </div>
      ) : null}

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
