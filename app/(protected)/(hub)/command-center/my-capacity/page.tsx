'use client';

import { useEffect, useMemo, useState } from 'react';
import DatePicker from '@/components/ui/DatePicker';
import { useAuth } from '@/context/AuthContext';
import { Briefcase, Calendar, CalendarDays, ChevronDown, ChevronUp, Clock, RefreshCw, XCircle } from 'lucide-react';

type Member = {
  userId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  weeklyHours: number | null;
  contractCountryCode: 'ES' | 'FR' | null;
  calendarCode: 'ES' | 'FR' | null;
  vacationRemainingDays: number | null;
  capacityHours: number | null;
  workloadHours: number;
  utilization: number | null;
  holidayDays: number;
  timeOffByType: { total: number };
};

type Weekly = {
  weekStart: string;
  weekEnd: string;
  capacityHours: number;
  workloadHours: number;
  utilization: number | null;
  isCurrentWeek: boolean;
  isFutureWeek: boolean;
  isClosedWeek: boolean;
};

type CapacityPayload = {
  members: Member[];
  weeklyByUser?: Record<string, Weekly[]>;
};

type Detail = {
  id: string;
  clientSlug: string | null;
  clientName: string | null;
  source: 'crm_dq' | 'manual' | 'strategy' | 'campaign' | 'monetization' | 'internal';
  label: string | null;
  hours: number;
};

type Preset = 'custom' | 'month_to_date' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year';

const now = new Date();
const startDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
const endDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
const WORKDAYS = 5;

const labels: Record<Preset, string> = {
  custom: 'Custom',
  month_to_date: 'Month to date',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  this_year: 'This Year',
};

const sourceLabels: Record<Detail['source'], string> = {
  crm_dq: 'CRM DQ',
  manual: 'Manual Effort',
  strategy: 'Strategy',
  campaign: 'Campaign Production',
  monetization: 'Monetization',
  internal: 'Internal',
};

const fHours = (v: number | null) => (v == null || Number.isNaN(v) ? '--' : `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v)} h`);
const fDays = (v: number | null) => (v == null || Number.isNaN(v) ? '--' : `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v)} d`);
const fPct = (v: number | null) => (v == null || Number.isNaN(v) ? '--' : new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v));
const dayH = (weekly: number | null) => (weekly == null || weekly <= 0 ? null : weekly / WORKDAYS);
const toDays = (hours: number | null, hpd: number | null) => (hours == null || hpd == null || hpd <= 0 ? null : hours / hpd);
const weekLabel = (start: string, end: string) => `${start.slice(5)} -> ${end.slice(5)}`;

const presetRange = (preset: Preset) => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (preset === 'month_to_date') return { start: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m, d.getUTCDate())).toISOString().slice(0, 10) };
  if (preset === 'this_month') return { start: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) };
  if (preset === 'last_month') return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
  if (preset === 'this_quarter') {
    const qm = Math.floor(m / 3) * 3;
    return { start: new Date(Date.UTC(y, qm, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, qm + 3, 0)).toISOString().slice(0, 10) };
  }
  if (preset === 'this_year') return { start: `${y}-01-01`, end: `${y}-12-31` };
  return null;
};

export default function MyCapacityPage() {
  const { user, loading: authLoading } = useAuth();
  const [start, setStart] = useState(startDefault);
  const [end, setEnd] = useState(endDefault);
  const [preset, setPreset] = useState<Preset>('month_to_date');
  const [presetOpen, setPresetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CapacityPayload | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);

  const member = useMemo(() => {
    if (!data?.members?.length) return null;
    if (user?.id) return data.members.find((m) => m.userId === user.id) ?? null;
    return data.members.length === 1 ? data.members[0] : null;
  }, [data, user?.id]);

  const memberId = member?.userId ?? user?.id ?? null;
  const hpd = dayH(member?.weeklyHours ?? null);
  const capacity = member?.capacityHours ?? null;
  const workload = member?.workloadHours ?? 0;
  const remaining = capacity != null ? Math.max(capacity - workload, 0) : null;

  const weekly = useMemo(() => {
    if (!memberId || !data?.weeklyByUser) return [] as Weekly[];
    return (data.weeklyByUser[memberId] ?? []).filter((w) => !w.isFutureWeek);
  }, [data, memberId]);

  const weeklyPeak = useMemo(() => Math.max(1, weekly.reduce((a, w) => Math.max(a, w.capacityHours, w.workloadHours), 0)), [weekly]);
  const avgWeeklyLoad = useMemo(() => {
    const closed = weekly.filter((w) => w.isClosedWeek && (w.capacityHours > 0 || w.workloadHours > 0));
    if (!closed.length) return null;
    return closed.reduce((a, w) => a + w.workloadHours, 0) / closed.length;
  }, [weekly]);
  const avgWeeklyUtil = useMemo(() => {
    const closed = weekly.filter((w) => w.isClosedWeek && w.utilization != null);
    if (!closed.length) return null;
    return closed.reduce((a, w) => a + (w.utilization ?? 0), 0) / closed.length;
  }, [weekly]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; total: number; entries: Detail[] }>();
    details.forEach((d) => {
      const k = d.clientSlug || d.clientName || 'other';
      const current = map.get(k) ?? { name: d.clientName || d.clientSlug || 'Other', total: 0, entries: [] };
      current.total += d.hours;
      current.entries.push(d);
      map.set(k, current);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [details]);

  const groupedTotal = useMemo(() => grouped.reduce((a, g) => a + g.total, 0), [grouped]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/admin/team-capacity?${params.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load capacity');
      setData(payload as CapacityPayload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load capacity');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async () => {
    if (!memberId) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const params = new URLSearchParams({ start, end, userId: memberId });
      const res = await fetch(`/api/admin/team-capacity/workload-detail?${params.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load detail');
      setDetails(Array.isArray(payload?.items) ? (payload.items as Detail[]) : []);
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  useEffect(() => {
    if (!drawerOpen) return;
    void fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, memberId, start, end]);

  const utilClass =
    member?.utilization == null
      ? 'bg-slate-200'
      : member.utilization < 0.5
        ? 'bg-emerald-400'
        : member.utilization < 0.75
          ? 'bg-blue-500'
          : member.utilization < 0.86
            ? 'bg-amber-400'
            : 'bg-red-500';
  const utilPct = member?.utilization != null ? Math.min(member.utilization, 1) * 100 : 0;

  return (
    <section className="space-y-8">
      <div className="card p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] muted">Command Center</p>
            <h1 className="text-2xl font-semibold">My Capacity</h1>
            <p className="text-sm text-[var(--color-muted)]">Private view of your workload and capacity.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm px-4 py-2">
            <div className="relative">
              <button
                className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text)] px-2 py-1.5 rounded hover:bg-[var(--color-surface-2)] transition-colors min-w-[90px]"
                onClick={() => setPresetOpen((v) => !v)}
              >
                <span>{labels[preset]}</span>
                <ChevronDown size={14} className="text-[var(--color-muted)]" />
              </button>
              {presetOpen ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPresetOpen(false)} />
                  <div className="absolute top-full left-0 mt-2 w-32 z-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1 flex flex-col">
                    {(Object.keys(labels) as Preset[]).filter((k) => k !== 'custom').map((k) => (
                      <button
                        key={k}
                        className={`text-left px-4 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors ${
                          preset === k
                            ? 'text-[var(--color-primary)] font-semibold'
                            : 'text-[var(--color-text)]'
                        }`}
                        onClick={() => {
                          const range = presetRange(k);
                          if (range) {
                            setStart(range.start);
                            setEnd(range.end);
                          }
                          setPreset(k);
                          setPresetOpen(false);
                        }}
                      >
                        {labels[k]}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <div className="h-6 w-px bg-[var(--color-border)]/60" />

            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)]/50 border border-[var(--color-border)]/60 px-3 py-1.5 min-h-[36px] transition-colors hover:bg-[var(--color-surface-2)]">
              <Calendar className="h-3.5 w-3.5 text-[var(--color-muted)]" />
              <div className="w-[120px]">
                <DatePicker
                  value={start}
                  onChange={(v) => {
                    if (!v) return;
                    setStart(v);
                    setPreset('custom');
                  }}
                  ariaLabel="Start date"
                  buttonClassName="!bg-transparent !border-transparent !shadow-none !px-0 !py-0 !min-h-0 !text-xs !font-medium"
                />
              </div>
            </div>

            <span className="text-[var(--color-muted)] opacity-50">&rarr;</span>

            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)]/50 border border-[var(--color-border)]/60 px-3 py-1.5 min-h-[36px] transition-colors hover:bg-[var(--color-surface-2)]">
              <Calendar className="h-3.5 w-3.5 text-[var(--color-muted)]" />
              <div className="w-[120px]">
                <DatePicker
                  value={end}
                  onChange={(v) => {
                    if (!v) return;
                    setEnd(v);
                    setPreset('custom');
                  }}
                  ariaLabel="End date"
                  buttonClassName="!bg-transparent !border-transparent !shadow-none !px-0 !py-0 !min-h-0 !text-xs !font-medium"
                />
              </div>
            </div>

            <button
              className="btn-primary flex items-center gap-2 text-xs px-4 py-1.5 h-[36px] rounded-lg shadow-sm"
              onClick={() => void fetchData()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={<CalendarDays size={20} />} label="Total capacity" value={fHours(capacity)} sub={fDays(toDays(capacity, hpd))} />
          <button
            type="button"
            className="kpi-frame group block w-full appearance-none border-0 bg-transparent p-4 text-left font-[inherit] transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/35"
            onClick={() => setDrawerOpen(true)}
            title="Open workload details"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)]">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Total workload</p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-[var(--color-text)] tabular-nums">{fHours(workload)}</span>
                  <span className="text-xs text-[var(--color-muted)]">({fDays(toDays(workload, hpd))})</span>
                </div>
              </div>
            </div>
          </button>
          <Kpi icon={<Briefcase size={20} />} label="Remaining" value={fHours(remaining)} sub={fDays(toDays(remaining, hpd))} />
          <Kpi icon={<Clock size={20} />} label="Utilization" value={fPct(member?.utilization ?? null)} />
        </div>
      </div>

      {error ? <div className="card border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-700">{error}</div> : null}

      <div className="card p-5 space-y-3">
        {authLoading ? (
          <p className="text-sm muted">Loading profile...</p>
        ) : member ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[--color-border] bg-[color:var(--color-surface-2)]">
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={member.displayName || member.email || 'Member'}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[color:var(--color-text)]/60">
                      {(member.displayName || member.email || 'Member')
                        .split(' ')
                        .slice(0, 2)
                        .map((chunk) => chunk[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{member.displayName || member.email || 'Member'}</div>
                  <div className="truncate text-xs muted">{member.email}</div>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">Active</span>
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-widest text-[--color-muted] mb-1 uppercase">
                Utilization {member.utilization != null ? `${Math.round(member.utilization * 100)}%` : '--'}
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${utilClass}`} style={{ width: `${utilPct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <SimpleMetric label="Capacity" value={fHours(capacity)} />
              <button type="button" className="text-left rounded px-2 -mx-2 hover:bg-[var(--color-surface-2)]/50" onClick={() => setDrawerOpen(true)}>
                <div className="text-[10px] uppercase tracking-widest muted">Workload</div>
                <div className="text-lg font-semibold">{fHours(workload)}</div>
              </button>
              <SimpleMetric label="Remaining" value={fHours(remaining)} />
            </div>
            <div className="text-xs muted">
              <div>{member.weeklyHours != null ? `${member.weeklyHours}h/week` : 'Missing contract'}</div>
              {member.weeklyHours != null ? <div>Contract {member.contractCountryCode ?? '--'} / Calendar {member.calendarCode ?? '--'}</div> : null}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[--color-border] p-4 text-center text-sm muted">
            We could not resolve your member profile in Team Capacity data.
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <button className="flex w-full items-center justify-between bg-[var(--color-surface-2)]/80 border-b border-[var(--color-border)]/60 px-6 py-4 text-left" onClick={() => setWeeklyOpen((v) => !v)}>
          <div>
            <h2 className="text-base font-semibold">Weekly workload trend</h2>
            <p className="text-xs muted">Workload vs capacity by workweek (Mon-Fri).</p>
          </div>
          {weeklyOpen ? <ChevronUp className="h-5 w-5 text-[var(--color-muted)]" /> : <ChevronDown className="h-5 w-5 text-[var(--color-muted)]" />}
        </button>
        {weeklyOpen ? (
          <div className="p-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-2">
              {weekly.length ? weekly.map((w) => {
                const wp = Math.max(0, Math.min((w.workloadHours / weeklyPeak) * 100, 100));
                const cp = Math.max(0, Math.min((w.capacityHours / weeklyPeak) * 100, 100));
                return (
                  <div key={w.weekStart} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium">{weekLabel(w.weekStart, w.weekEnd)}</span>
                      <span className="text-[var(--color-muted)]">{fHours(w.workloadHours)} / {fHours(w.capacityHours)}</span>
                    </div>
                    <div className="mt-1.5 h-2.5 rounded-full bg-slate-200/70 relative overflow-hidden">
                      <div className="absolute left-0 top-0 h-full bg-slate-300/80" style={{ width: `${cp}%` }} />
                      <div className="absolute left-0 top-0 h-full bg-emerald-500" style={{ width: `${wp}%` }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--color-muted)]">
                      <span>{w.isCurrentWeek && !w.isClosedWeek ? 'Current week (pending Friday logs)' : w.isClosedWeek ? 'Closed week' : 'Open week'}</span>
                      <span>{fPct(w.utilization)}</span>
                    </div>
                  </div>
                );
              }) : <div className="rounded-xl border border-dashed border-[--color-border] p-4 text-sm muted">No weekly data in this period.</div>}
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2 text-sm">
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-muted)]">Weekly rate</div>
              <Rate label="Scope" value={member?.displayName || member?.email || 'Member'} />
              <Rate label="Avg weekly workload" value={fHours(avgWeeklyLoad)} />
              <Rate label="Avg weekly utilization" value={fPct(avgWeeklyUtil)} />
              <Rate label="Reported weeks" value={String(weekly.filter((w) => w.isClosedWeek).length)} />
            </div>
          </div>
        ) : null}
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[150] flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-6 py-5">
              <div>
                <h3 className="text-base font-bold">Workload Breakdown</h3>
                <p className="text-xs text-[var(--color-muted)]">{member?.displayName || member?.email || 'Member'}</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="btn-ghost rounded-full p-2">
                <XCircle className="h-5 w-5 text-[var(--color-muted)]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {detailLoading ? <div className="text-sm muted">Loading breakdown...</div> : null}
              {detailError ? <div className="text-sm text-rose-700">{detailError}</div> : null}
              {!detailLoading && !detailError ? grouped.map((g, idx) => (
                <details key={g.name} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]" open={idx === 0}>
                  <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">{g.name}</div>
                      <div className="text-xs muted">{fPct(groupedTotal > 0 ? g.total / groupedTotal : 0)}</div>
                    </div>
                    <div className="font-semibold text-sm">{fHours(g.total)}</div>
                  </summary>
                  <div className="border-t border-[var(--color-border)]/60 px-4 py-3 space-y-2">
                    {g.entries.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs">
                        <span>{d.label ? `${sourceLabels[d.source]} - ${d.label}` : sourceLabels[d.source]}</span>
                        <span className="font-semibold">{fHours(d.hours)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )) : null}
              {!detailLoading && !detailError && !grouped.length ? <div className="text-sm muted">No workload recorded for this period.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-frame p-3.5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[var(--color-surface-2)] text-[var(--color-primary)] flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted)]">{label}</div>
          <div className="text-[30px] leading-none font-bold tracking-tight tabular-nums">{value}</div>
          {sub ? <div className="text-xs text-[var(--color-muted)]">({sub})</div> : null}
        </div>
      </div>
    </div>
  );
}

function SimpleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
