import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabase/admin';

const DEFAULT_CLIENT = 'emg';
const JQL_DEFAULT = 'project = CRM ORDER BY updated DESC';
const PAGE_SIZE = 100;

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

  // Use new search endpoint per Atlassian CHANGE-2046
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
      fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'created', 'duedate', 'parent', 'reporter'],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`JIRA request failed (${res.status}): ${body}`);
  }
  return (await res.json()) as JiraSearchResponse;
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const admin = supabaseAdmin();

  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client') || DEFAULT_CLIENT;
    const jql = searchParams.get('jql') || JQL_DEFAULT;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
    const userId = userData.user?.id;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Optional: enforce admin role via app_users
    const { data: profile } = await supabase
      .from('app_users')
      .select('role,is_active')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile?.is_active || (profile.role !== 'admin' && profile.role !== 'editor')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let nextPageToken: string | null | undefined = null;
    let pageCount = 0;
    type JiraRow = Record<string, unknown>;
    const payload: JiraRow[] = [];

    do {
      const page = await fetchIssues(jql, nextPageToken);
      const issues = Array.isArray(page.issues) ? page.issues : [];
      nextPageToken = page.nextPageToken;
      pageCount += 1;

      for (const issue of issues) {
        const fields = issue.fields || {};
        const statusName = fields.status?.name as string | undefined;
        const priorityName = fields.priority?.name as string | undefined;
        const assignee = fields.assignee || {};
        if (!isTeamOwner(assignee)) continue;
        const assigneeName = assignee.displayName as string | undefined;
        const parentKey = fields.parent?.key as string | undefined;
        const parentSummary = fields.parent?.fields?.summary as string | undefined;
        const parentIssuetype =
          (fields.parent?.fields?.issuetype?.name as string | undefined) ||
          (fields.parent?.issuetype?.name as string | undefined);
        const typeName =
          parentKey
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
        // Owner stays app-owned (primary contributor). Do not set it from JIRA to avoid clobbering contributions.
        owner: 'Unassigned',
          reporter: reporterName || null,
          type: typeName || null,
          jira_url: `${process.env.JIRA_BASE?.replace(/\/+$/, '') || ''}/browse/${issue.key}`,
          work_hours: 0,
          prep_hours: null,
          comments: null,
          jira_assignee: assigneeName || null,
          created_by: userId,
        });
      }
    } while (nextPageToken);

    if (!payload.length) {
      return NextResponse.json({ imported: 0, message: 'No issues returned from JIRA' });
    }

    // Preserve effort and comments entered in the app when syncing with JIRA.
    // JIRA remains the source of truth for status, title, assignee, and due date.
    // ETA is app-owned and should not be overwritten by sync.
    const ticketIds = Array.from(new Set(payload.map((row) => row.ticket_id as string)));
    const CHUNK_SIZE = 200;

    // Fetch existing tickets to preserve effort/comments AND keep the same row id
    // so that contributions (FK with ON DELETE CASCADE) are not lost.
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
      const { data: existingChunk, error: existingError } = await supabase
        .from('crm_data_quality_tickets')
        .select('id, ticket_id, status, work_hours, prep_hours, comments')
        .eq('client_slug', client)
        .in('ticket_id', slice);
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
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
      .map((v) => v.id)
      .filter(Boolean);

    // Build a per-ticket total-hours map based on contributions when available,
    // falling back to ticket-level work/prep hours when no contributions exist.
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
        const { data: contribChunk, error: contribError } = await admin
          .from('crm_data_quality_contributions')
          .select('ticket_id, work_hours, prep_hours')
          .in('ticket_id', slice);

        if (contribError) {
          return NextResponse.json({ error: contribError.message }, { status: 500 });
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
        current.prep += Number.isFinite(prepRaw ?? null) ? Number(prepRaw ?? 0) : (Number.isFinite(work) ? work * 0.35 : 0);
        contribTotals.set(ticketId, current);
      });

      contribTotals.forEach((totals, ticketId) => {
        totalHoursByTicketId.set(ticketId, totals.work + totals.prep);
      });
    }

    const detectedNeedsEffortIds = new Set<string>();
    const detectedStatusByTicketId = new Map<string, string>();

    const toInsert: JiraRow[] = [];
    const toUpdate: { id: string; data: Record<string, unknown> }[] = [];

    payload.forEach((row) => {
      const key = row.ticket_id as string;
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

      // Detect transitions into Done/Validation without effort and persist them.
      if (!prevInNeedsEffort && nextInNeedsEffort && isZeroValue(totalHours)) {
        detectedNeedsEffortIds.add(prev.id);
        detectedStatusByTicketId.set(prev.id, nextStatus);
      }

      // Preserve app-owned effort/comments, update only JIRA-owned fields.
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
        // DO NOT touch work_hours, prep_hours, comments (app-owned)
      };
      toUpdate.push({ id: prev.id, data: updateData });
    });

    if (toInsert.length) {
      const { error: insertError } = await supabase.from('crm_data_quality_tickets').insert(toInsert);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    // Batched updates by id to avoid recreating rows (which would cascade-delete contributions).
    for (const chunk of toUpdate) {
      const { error: updError } = await supabase
        .from('crm_data_quality_tickets')
        .update(chunk.data)
        .eq('id', chunk.id);
      if (updError) {
        return NextResponse.json({ error: updError.message }, { status: 500 });
      }
    }

    let needsEffortDetected = detectedNeedsEffortIds.size;
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
        detected_by: userId,
        last_detected_at: detectedAt,
        last_detected_status: detectedStatusByTicketId.get(ticketId) ?? null,
      }));

      const { error: flagsError } = await admin
        .from('crm_needs_effort_flags')
        .upsert(flagsPayload, { onConflict: 'client_slug,ticket_id' });

      if (flagsError) {
        // Do not break the sync if the queue table is missing or misconfigured.
        console.warn('[jira-sync] needs effort upsert failed', flagsError.message);
        needsEffortDetected = 0;
      }
    }

    return NextResponse.json({ imported: payload.length, pages: pageCount, needsEffortDetected });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
