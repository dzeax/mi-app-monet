import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const DEFAULT_CLIENT = 'emg';
const FULL_SYNC_JQL = 'project = CRM ORDER BY updated DESC';
const PAGE_SIZE = 100;
const LOCK_TTL_MINUTES = 20;
const CURSOR_OVERLAP_MINUTES = 10;

const STATUS_MAP: Record<string, string> = {
  backlog: 'Backlog',
  refining: 'Refining',
  ready: 'Ready',
  'in progress': 'In progress',
  validation: 'Validation',
  done: 'Done',
};

const PRIORITY_MAP: Record<string, 'P1' | 'P2' | 'P3'> = {
  critical: 'P1',
  blocker: 'P1',
  highest: 'P1',
  major: 'P1',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
  minor: 'P3',
  trivial: 'P3',
  lowest: 'P3',
};

const TEAM_OWNERS = [
  'adrianna bienko',
  'bela hanif',
  'david zea',
  'extern.adrianna.bienko@europcar.com',
  'extern.bela.hanif@europcar.com',
  'extern.david.zea@europcar.com',
  'extern.gina.reyes',
  'extern.gina.reyes@europcar.com',
  'extern.judit.jover@europcar.com',
  'extern.louis.bouquerel@europcar.com',
  'extern.lucas.vialatte',
  'extern.lucas.vialatte@europcar.com',
  'extern.pierre.gasnier',
  'extern.pierre.gasnier@europcar.com',
  'extern.stephane.rabarinala@europcar.com',
  'gina reyes',
  'judit jover',
  'louis bouquerel',
  'pierre gasnier',
  'stephane rabarinala',
];

const NEEDS_EFFORT_STATUSES = new Set(['Validation', 'Done']);

const isZeroValue = (value: number) => Math.abs(value) < 0.0001;

const computeContributionTotalHours = (work: number | null, prep: number | null) => {
  const safeWork = Number.isFinite(work ?? null) ? Number(work ?? 0) : 0;
  const safePrep = Number.isFinite(prep ?? null)
    ? Number(prep ?? 0)
    : safeWork * 0.35;
  return safeWork + safePrep;
};

const isMissingSyncStateTableError = (error: unknown) => {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.toLowerCase().includes('crm_jira_sync_state');
};

const normalizeIsoDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const formatJqlDate = (date: Date) =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(
    date.getUTCHours(),
  )}:${pad2(date.getUTCMinutes())}`;

function mapStatus(input?: string | null) {
  if (!input) return 'Backlog';
  const key = input.trim().toLowerCase();
  return STATUS_MAP[key] || 'Backlog';
}

function mapPriority(input?: string | null): 'P1' | 'P2' | 'P3' {
  if (!input) return 'P2';
  const key = input.trim().toLowerCase();
  return PRIORITY_MAP[key] || 'P3';
}

function normalizeAssignee(value?: string | null) {
  return value
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    : '';
}

function isTeamOwner(assignee?: { displayName?: string | null; emailAddress?: string | null }) {
  if (!assignee) return false;
  const display = normalizeAssignee(assignee.displayName);
  const email = normalizeAssignee(assignee.emailAddress);
  return TEAM_OWNERS.some((name) => {
    const token = normalizeAssignee(name);
    return (display && display.includes(token)) || (email && email.includes(token));
  });
}

type JiraIssueFields = {
  summary?: string | null;
  status?: { name?: string | null } | null;
  priority?: { name?: string | null } | null;
  assignee?: { displayName?: string | null; emailAddress?: string | null } | null;
  issuetype?: { name?: string | null } | null;
  created?: string | null;
  updated?: string | null;
  duedate?: string | null;
  parent?: {
    key?: string | null;
    fields?: { summary?: string | null; issuetype?: { name?: string | null } | null } | null;
    issuetype?: { name?: string | null } | null;
  } | null;
  reporter?: { displayName?: string | null } | null;
};

type JiraIssue = {
  key?: string;
  fields?: JiraIssueFields | null;
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  nextPageToken?: string | null;
};

type JiraRow = {
  client_slug: string;
  ticket_id: string;
  title: string;
  status: string;
  priority: 'P1' | 'P2' | 'P3';
  assigned_date: string | null;
  jira_created_at: string | null;
  due_date: string | null;
  owner: string;
  reporter: string | null;
  type: string | null;
  jira_url: string;
  work_hours: number;
  prep_hours: number | null;
  comments: string | null;
  jira_assignee: string | null;
  created_by: string | null;
};

type SyncStateRow = {
  client_slug: string;
  is_running: boolean | null;
  locked_until: string | null;
  last_cursor_at: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_imported: number | null;
  last_pages: number | null;
  updated_at: string | null;
};

export type JiraSyncResult = {
  imported: number;
  pages: number;
  needsEffortDetected: number;
  running: boolean;
  message?: string;
  jql: string;
  lastCursorAt?: string | null;
  lastSuccessAt?: string | null;
};

async function fetchIssues(
  jql: string,
  nextPageToken?: string | null,
): Promise<JiraSearchResponse> {
  const base = process.env.JIRA_BASE;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!base || !email || !token) {
    throw new Error('Missing JIRA env vars (JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN)');
  }

  const url = `${base}/rest/api/3/search/jql`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify({
      jql,
      maxResults: PAGE_SIZE,
      nextPageToken: nextPageToken || undefined,
      fields: [
        'summary',
        'status',
        'priority',
        'assignee',
        'issuetype',
        'created',
        'updated',
        'duedate',
        'parent',
        'reporter',
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`JIRA request failed (${res.status}): ${body}`);
  }
  return (await res.json()) as JiraSearchResponse;
}

async function getSyncState(
  sb: SupabaseClient,
  client: string,
): Promise<{ state: SyncStateRow | null; supported: boolean }> {
  try {
    const { data, error } = await sb
      .from('crm_jira_sync_state')
      .select(
        'client_slug,is_running,locked_until,last_cursor_at,last_started_at,last_finished_at,last_success_at,last_error,last_imported,last_pages,updated_at',
      )
      .eq('client_slug', client)
      .maybeSingle();

    if (error) throw error;
    return { state: (data as SyncStateRow | null) ?? null, supported: true };
  } catch (err) {
    if (isMissingSyncStateTableError(err)) {
      return { state: null, supported: false };
    }
    throw err;
  }
}

async function acquireSyncLock(sb: SupabaseClient, client: string) {
  const stateResult = await getSyncState(sb, client);
  const currentState = stateResult.state;
  if (!stateResult.supported) {
    return { acquired: true, currentState, supportsState: false };
  }

  const now = Date.now();
  const lockUntilMs = currentState?.locked_until
    ? Date.parse(currentState.locked_until)
    : Number.NaN;
  if (currentState?.is_running && Number.isFinite(lockUntilMs) && lockUntilMs > now) {
    return { acquired: false, currentState, supportsState: true };
  }

  const startedAt = new Date(now).toISOString();
  const lockedUntil = new Date(now + LOCK_TTL_MINUTES * 60_000).toISOString();
  const { error } = await sb.from('crm_jira_sync_state').upsert(
    {
      client_slug: client,
      is_running: true,
      locked_until: lockedUntil,
      last_started_at: startedAt,
      last_error: null,
    },
    { onConflict: 'client_slug' },
  );
  if (error) {
    if (isMissingSyncStateTableError(error)) {
      return { acquired: true, currentState, supportsState: false };
    }
    throw error;
  }
  return { acquired: true, currentState, supportsState: true };
}

async function saveSyncState(
  sb: SupabaseClient,
  supportsState: boolean,
  payload: Record<string, unknown>,
) {
  if (!supportsState) return;
  const { error } = await sb
    .from('crm_jira_sync_state')
    .upsert(payload, { onConflict: 'client_slug' });
  if (error && !isMissingSyncStateTableError(error)) {
    throw error;
  }
}

function buildIncrementalJql(cursorAt: string | null) {
  if (!cursorAt) return FULL_SYNC_JQL;
  const cursor = new Date(cursorAt);
  if (Number.isNaN(cursor.getTime())) return FULL_SYNC_JQL;
  const sinceDate = new Date(cursor.getTime() - CURSOR_OVERLAP_MINUTES * 60_000);
  return `project = CRM AND updated >= "${formatJqlDate(sinceDate)}" ORDER BY updated ASC`;
}

export async function runJiraSync({
  client,
  jql,
  userId,
  forceFull = false,
  admin,
}: {
  client: string;
  jql?: string | null;
  userId?: string | null;
  forceFull?: boolean;
  admin?: SupabaseClient;
}): Promise<JiraSyncResult> {
  const sb = admin ?? supabaseAdmin();
  const lock = await acquireSyncLock(sb, client);
  if (!lock.acquired) {
    return {
      imported: 0,
      pages: 0,
      needsEffortDetected: 0,
      running: true,
      message: 'JIRA sync already running',
      jql: jql || FULL_SYNC_JQL,
      lastSuccessAt: lock.currentState?.last_success_at ?? null,
      lastCursorAt: lock.currentState?.last_cursor_at ?? null,
    };
  }

  const cursorBase = lock.currentState?.last_cursor_at || lock.currentState?.last_success_at || null;
  const effectiveJql = jql?.trim()
    ? jql.trim()
    : forceFull
      ? FULL_SYNC_JQL
      : buildIncrementalJql(cursorBase);

  let imported = 0;
  let pages = 0;
  let needsEffortDetected = 0;
  let latestUpdatedAt: string | null = null;

  try {
    let nextPageToken: string | null | undefined = null;
    const payload: JiraRow[] = [];

    do {
      const page = await fetchIssues(effectiveJql, nextPageToken);
      const issues = Array.isArray(page.issues) ? page.issues : [];
      nextPageToken = page.nextPageToken;
      pages += 1;

      for (const issue of issues) {
        const fields = issue.fields || {};
        const normalizedUpdated = normalizeIsoDateTime(fields.updated);
        if (normalizedUpdated && (!latestUpdatedAt || normalizedUpdated > latestUpdatedAt)) {
          latestUpdatedAt = normalizedUpdated;
        }

        const statusName = fields.status?.name as string | undefined;
        const priorityName = fields.priority?.name as string | undefined;
        const assignee = fields.assignee || {};
        if (!issue.key || !isTeamOwner(assignee)) continue;
        const assigneeName = assignee.displayName as string | undefined;
        const parentKey = fields.parent?.key as string | undefined;
        const parentSummary = fields.parent?.fields?.summary as string | undefined;
        const parentIssuetype =
          (fields.parent?.fields?.issuetype?.name as string | undefined) ||
          (fields.parent?.issuetype?.name as string | undefined);
        const typeName = parentKey
          ? `${parentKey}${parentSummary ? ` ${parentSummary}` : parentIssuetype ? ` ${parentIssuetype}` : ''}`
          : (fields.issuetype?.name as string | undefined);
        const reporterName = fields.reporter?.displayName as string | undefined;

        payload.push({
          client_slug: client,
          ticket_id: issue.key,
          title: fields.summary || '',
          status: mapStatus(statusName),
          priority: mapPriority(priorityName),
          assigned_date: fields.created ? fields.created.slice(0, 10) : null,
          jira_created_at: fields.created || null,
          due_date: fields.duedate || null,
          owner: 'Unassigned',
          reporter: reporterName || null,
          type: typeName || null,
          jira_url: `${process.env.JIRA_BASE?.replace(/\/+$/, '') || ''}/browse/${issue.key}`,
          work_hours: 0,
          prep_hours: null,
          comments: null,
          jira_assignee: assigneeName || null,
          created_by: userId ?? null,
        });
      }
    } while (nextPageToken);

    imported = payload.length;

    if (payload.length > 0) {
      const ticketIds = Array.from(new Set(payload.map((row) => row.ticket_id)));
      const CHUNK_SIZE = 200;

      const existingRows: Array<{
        id: string;
        ticket_id: string;
        status: string | null;
        work_hours: number | null;
        prep_hours: number | null;
        comments: string | null;
      }> = [];
      for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
        const slice = ticketIds.slice(i, i + CHUNK_SIZE);
        const { data: existingChunk, error: existingError } = await sb
          .from('crm_data_quality_tickets')
          .select('id, ticket_id, status, work_hours, prep_hours, comments')
          .eq('client_slug', client)
          .in('ticket_id', slice);
        if (existingError) {
          throw new Error(existingError.message);
        }
        if (Array.isArray(existingChunk) && existingChunk.length > 0) {
          existingRows.push(...existingChunk);
        }
      }

      const existingMap = new Map<
        string,
        {
          id: string;
          status: string;
          work_hours: number | null;
          prep_hours: number | null;
          comments: string | null;
        }
      >();
      existingRows.forEach((row) => {
        existingMap.set(row.ticket_id as string, {
          id: row.id as string,
          status: String(row.status ?? 'Backlog'),
          work_hours: row.work_hours != null ? Number(row.work_hours) : null,
          prep_hours: row.prep_hours != null ? Number(row.prep_hours) : null,
          comments: (row.comments as string | null) ?? null,
        });
      });

      const existingIds = Array.from(existingMap.values())
        .map((value) => value.id)
        .filter(Boolean);

      const totalHoursByTicketId = new Map<string, number>();
      existingMap.forEach((prev) => {
        totalHoursByTicketId.set(
          prev.id,
          computeContributionTotalHours(prev.work_hours, prev.prep_hours),
        );
      });

      if (existingIds.length > 0) {
        const contribRows: Array<{
          ticket_id?: string | null;
          work_hours?: unknown;
          prep_hours?: unknown;
        }> = [];
        for (let i = 0; i < existingIds.length; i += CHUNK_SIZE) {
          const slice = existingIds.slice(i, i + CHUNK_SIZE);
          const { data: contribChunk, error: contribError } = await sb
            .from('crm_data_quality_contributions')
            .select('ticket_id, work_hours, prep_hours')
            .in('ticket_id', slice);

          if (contribError) {
            throw new Error(contribError.message);
          }
          if (Array.isArray(contribChunk) && contribChunk.length > 0) {
            contribRows.push(...contribChunk);
          }
        }

        const contribTotals = new Map<string, { work: number; prep: number }>();
        contribRows.forEach(
          (row: { ticket_id?: string | null; work_hours?: unknown; prep_hours?: unknown }) => {
            const ticketId = row.ticket_id;
            if (!ticketId) return;
            const work = Number(row.work_hours ?? 0);
            const prepRaw = row.prep_hours == null ? null : Number(row.prep_hours);
            const current = contribTotals.get(ticketId) ?? { work: 0, prep: 0 };
            current.work += Number.isFinite(work) ? work : 0;
            current.prep += Number.isFinite(prepRaw ?? null)
              ? Number(prepRaw ?? 0)
              : Number.isFinite(work)
                ? work * 0.35
                : 0;
            contribTotals.set(ticketId, current);
          },
        );

        contribTotals.forEach((totals, ticketId) => {
          totalHoursByTicketId.set(ticketId, totals.work + totals.prep);
        });
      }

      const detectedNeedsEffortIds = new Set<string>();
      const detectedStatusByTicketId = new Map<string, string>();

      const toInsert: JiraRow[] = [];
      const toUpdate: { id: string; data: Record<string, unknown> }[] = [];

      payload.forEach((row) => {
        const key = row.ticket_id;
        const prev = existingMap.get(key);
        if (!prev) {
          toInsert.push(row);
          return;
        }

        const prevStatus = String(prev.status ?? '');
        const nextStatus = String(row.status ?? '');
        const prevInNeedsEffort = NEEDS_EFFORT_STATUSES.has(prevStatus);
        const nextInNeedsEffort = NEEDS_EFFORT_STATUSES.has(nextStatus);
        const totalHours = totalHoursByTicketId.get(prev.id) ?? 0;

        if (!prevInNeedsEffort && nextInNeedsEffort && isZeroValue(totalHours)) {
          detectedNeedsEffortIds.add(prev.id);
          detectedStatusByTicketId.set(prev.id, nextStatus);
        }

        const updateData: Record<string, unknown> = {
          status: row.status,
          assigned_date: row.assigned_date,
          due_date: row.due_date,
          ticket_id: row.ticket_id,
          title: row.title,
          priority: row.priority,
          reporter: row.reporter,
          type: row.type,
          jira_url: row.jira_url,
          jira_assignee: row.jira_assignee,
        };
        toUpdate.push({ id: prev.id, data: updateData });
      });

      if (toInsert.length > 0) {
        const { error: insertError } = await sb.from('crm_data_quality_tickets').insert(toInsert);
        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      for (const row of toUpdate) {
        const { error: updError } = await sb
          .from('crm_data_quality_tickets')
          .update(row.data)
          .eq('id', row.id);
        if (updError) {
          throw new Error(updError.message);
        }
      }

      needsEffortDetected = detectedNeedsEffortIds.size;
      if (needsEffortDetected > 0) {
        const detectedAt = new Date().toISOString();
        const flagsPayload = Array.from(detectedNeedsEffortIds).map((ticketId) => ({
          client_slug: client,
          ticket_id: ticketId,
          state: 'open',
          dismiss_reason: null,
          dismissed_at: null,
          dismissed_by: null,
          cleared_at: null,
          cleared_by: null,
          detected_by: userId ?? null,
          last_detected_at: detectedAt,
          last_detected_status: detectedStatusByTicketId.get(ticketId) ?? null,
        }));

        const { error: flagsError } = await sb
          .from('crm_needs_effort_flags')
          .upsert(flagsPayload, { onConflict: 'client_slug,ticket_id' });

        if (flagsError) {
          console.warn('[jira-sync] needs effort upsert failed', flagsError.message);
          needsEffortDetected = 0;
        }
      }
    }

    const finishedAt = new Date();
    const lastCursorAt = latestUpdatedAt || finishedAt.toISOString();
    const finishedAtIso = finishedAt.toISOString();
    await saveSyncState(sb, lock.supportsState, {
      client_slug: client,
      is_running: false,
      locked_until: null,
      last_cursor_at: lastCursorAt,
      last_success_at: finishedAtIso,
      last_finished_at: finishedAtIso,
      last_error: null,
      last_imported: imported,
      last_pages: pages,
    });

    return {
      imported,
      pages,
      needsEffortDetected,
      running: false,
      jql: effectiveJql,
      lastCursorAt,
      lastSuccessAt: finishedAtIso,
    };
  } catch (err) {
    const finishedAtIso = new Date().toISOString();
    const message = err instanceof Error ? err.message : 'Unexpected error';
    await saveSyncState(sb, lock.supportsState, {
      client_slug: client,
      is_running: false,
      locked_until: null,
      last_finished_at: finishedAtIso,
      last_error: message,
      last_imported: imported,
      last_pages: pages,
    });
    throw err;
  }
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const admin = supabaseAdmin();

  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client') || DEFAULT_CLIENT;
    const jql = searchParams.get('jql');
    const forceFull = searchParams.get('full') === '1';

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
    const userId = userData.user?.id;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase
      .from('app_users')
      .select('role,is_active')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile?.is_active || (profile.role !== 'admin' && profile.role !== 'editor')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await runJiraSync({
      client,
      jql,
      userId,
      forceFull,
      admin,
    });
    if (result.running) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

