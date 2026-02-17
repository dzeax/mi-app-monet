import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_CLIENT = "emg";
export const DEFAULT_JQL =
  'project = CRM AND priority in (Critical, Blocker, Highest, Major, High) ORDER BY updated DESC';
const PAGE_SIZE = 100;

const PRIORITY_MAP: Record<string, "P1" | "P2" | "P3"> = {
  critical: "P1",
  blocker: "P1",
  highest: "P1",
  major: "P1",
  high: "P1",
  medium: "P2",
  low: "P3",
  minor: "P3",
  trivial: "P3",
  lowest: "P3",
};

const TEAM_OWNERS = [
  "adrianna bienko",
  "bela hanif",
  "david zea",
  "extern.adrianna.bienko@europcar.com",
  "extern.bela.hanif@europcar.com",
  "extern.david.zea@europcar.com",
  "extern.gina.reyes",
  "extern.gina.reyes@europcar.com",
  "extern.judit.jover@europcar.com",
  "extern.louis.bouquerel@europcar.com",
  "extern.lucas.vialatte",
  "extern.lucas.vialatte@europcar.com",
  "extern.pierre.gasnier",
  "extern.pierre.gasnier@europcar.com",
  "extern.stephane.rabarinala@europcar.com",
  "gina reyes",
  "judit jover",
  "louis bouquerel",
  "pierre gasnier",
  "stephane rabarinala",
];

const SLA_TYPE_ALLOWLIST = new Set(["data", "lifecycle"]);

const normalizeAssignee = (value?: string | null) =>
  value
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

const isAgencyActor = (actor?: { displayName?: string | null; emailAddress?: string | null } | null) => {
  if (!actor) return false;
  const display = normalizeAssignee(actor.displayName);
  const email = normalizeAssignee(actor.emailAddress);
  const jiraEmail = normalizeAssignee(process.env.JIRA_EMAIL || "");
  if (jiraEmail && email === jiraEmail) return true;
  return TEAM_OWNERS.some((name) => {
    const token = normalizeAssignee(name);
    return (display && display.includes(token)) || (email && email.includes(token));
  });
};

const stripTypePrefix = (value?: string | null) => {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^[A-Z]{2,6}-\d+\s+(.*)$/);
  const cleaned = match?.[1]?.trim();
  return cleaned || trimmed;
};

function mapPriority(input?: string | null): "P1" | "P2" | "P3" {
  if (!input) return "P2";
  const key = input.trim().toLowerCase();
  return PRIORITY_MAP[key] || "P3";
}

type JiraUser = {
  displayName?: string | null;
  emailAddress?: string | null;
  accountId?: string | null;
};

type JiraIssueFields = {
  summary?: string | null;
  status?: { name?: string | null } | null;
  priority?: { name?: string | null } | null;
  assignee?: JiraUser | null;
  issuetype?: { name?: string | null } | null;
  created?: string | null;
  duedate?: string | null;
  parent?: {
    key?: string | null;
    fields?: { summary?: string | null; issuetype?: { name?: string | null } | null } | null;
    issuetype?: { name?: string | null } | null;
  } | null;
  reporter?: { displayName?: string | null } | null;
  comment?: {
    comments?: Array<{
      id?: string | null;
      created?: string | null;
      author?: JiraUser | null;
      body?: unknown;
    }>;
  } | null;
};

type JiraIssue = {
  key?: string;
  fields?: JiraIssueFields | null;
  changelog?: {
    histories?: Array<{
      created?: string | null;
      author?: JiraUser | null;
      items?: Array<{
        field?: string | null;
        fromString?: string | null;
        toString?: string | null;
      }> | null;
    }> | null;
  } | null;
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  nextPageToken?: string | null;
};

const requireJiraEnv = () => {
  const base = process.env.JIRA_BASE;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) {
    throw new Error("Missing JIRA env vars (JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN)");
  }
  return { base: base.replace(/\/+$/, ""), email, token };
};

async function fetchIssues(jql: string, nextPageToken?: string | null): Promise<JiraSearchResponse> {
  const { base, email, token } = requireJiraEnv();
  const url = `${base}/rest/api/3/search/jql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      jql,
      maxResults: PAGE_SIZE,
      nextPageToken: nextPageToken || undefined,
      fields: [
        "summary",
        "status",
        "priority",
        "assignee",
        "issuetype",
        "created",
        "duedate",
        "parent",
        "reporter",
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA request failed (${res.status}): ${body}`);
  }
  return (await res.json()) as JiraSearchResponse;
}

async function fetchIssueDetail(key: string): Promise<JiraIssue> {
  const { base, email, token } = requireJiraEnv();
  const url = `${base}/rest/api/3/issue/${encodeURIComponent(key)}?expand=changelog&fields=${encodeURIComponent(
    [
      "summary",
      "status",
      "priority",
      "assignee",
      "issuetype",
      "created",
      "duedate",
      "parent",
      "reporter",
      "comment",
    ].join(","),
  )}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA issue fetch failed (${res.status}): ${body}`);
  }

  return (await res.json()) as JiraIssue;
}

const normalizeStatus = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const findFirstStatusTransitionAt = (issue: JiraIssue, toStatusLower: string) => {
  const histories = issue.changelog?.histories ?? [];
  const hits = histories
    .flatMap((history) => {
      const created = history?.created ?? null;
      const matches = (history?.items ?? []).some(
        (item) => item?.field === "status" && normalizeStatus(item?.toString) === toStatusLower,
      );
      return matches && created ? [created] : [];
    })
    .filter(Boolean)
    .sort();
  return hits.length ? hits[0] : null;
};

const findFirstAgencyCommentAt = (issue: JiraIssue) => {
  const comments = issue.fields?.comment?.comments ?? [];
  const hits = comments
    .flatMap((comment) => {
      const created = comment?.created ?? null;
      const author = comment?.author ?? null;
      if (!created || !author || !isAgencyActor(author)) return [];
      return [created];
    })
    .filter(Boolean)
    .sort();
  return hits.length ? hits[0] : null;
};

const findFirstAgencyStatusChangeAt = (issue: JiraIssue, toStatusLower: string) => {
  const histories = issue.changelog?.histories ?? [];
  const hits = histories
    .flatMap((history) => {
      const created = history?.created ?? null;
      const author = history?.author ?? null;
      const matches = (history?.items ?? []).some(
        (item) => item?.field === "status" && normalizeStatus(item?.toString) === toStatusLower,
      );
      if (!created || !matches || !isAgencyActor(author)) return [];
      return [created];
    })
    .filter(Boolean)
    .sort();
  return hits.length ? hits[0] : null;
};

const adfFromText = (text: string) => ({
  type: "doc",
  version: 1,
  content: text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
});

async function postAckComment(ticketKey: string, assignee?: JiraUser | null) {
  const { base, email, token } = requireJiraEnv();
  const url = `${base}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment`;
  const mention =
    assignee?.accountId && assignee.displayName
      ? {
          type: "mention",
          attrs: {
            id: assignee.accountId,
            text: `@${assignee.displayName}`,
          },
        }
      : null;
  const bodyText =
    "Acknowledged by Dataventure (Agency). We are reviewing this P1 and will share next steps shortly.";
  const body = mention
    ? {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Acknowledged by Dataventure (Agency). " },
              mention,
              { type: "text", text: " We are reviewing this P1 and will share next steps shortly." },
            ],
          },
        ],
      }
    : adfFromText(bodyText);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
    },
    cache: "no-store",
    body: JSON.stringify({ body }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JIRA comment failed (${res.status}): ${body}`);
  }

  const payload = await res.json().catch(() => null);
  return payload as { created?: string | null } | null;
}

const computeTypeName = (fields: JiraIssueFields) => {
  const parentKey = fields.parent?.key as string | undefined;
  const parentSummary = fields.parent?.fields?.summary as string | undefined;
  const parentIssuetype =
    (fields.parent?.fields?.issuetype?.name as string | undefined) ||
    (fields.parent?.issuetype?.name as string | undefined);
  return parentKey
    ? `${parentKey}${parentSummary ? ` ${parentSummary}` : parentIssuetype ? ` ${parentIssuetype}` : ""}`
    : ((fields.issuetype?.name as string | undefined) || "");
};

export type P1AckSyncError = {
  ticketKey: string;
  step: string;
  message: string;
};

export type P1AckSyncResult = {
  processed: number;
  autoAcked: number;
  failed?: number;
  errors?: P1AckSyncError[];
  message?: string;
};

export async function runP1AckSync({
  client,
  jql,
  admin,
}: {
  client: string;
  jql: string;
  admin?: SupabaseClient;
}): Promise<P1AckSyncResult> {
  const sb = admin ?? supabaseAdmin();

  let nextPageToken: string | null | undefined = null;
  const issues: JiraIssue[] = [];

  do {
    const page = await fetchIssues(jql, nextPageToken);
    nextPageToken = page.nextPageToken;
    issues.push(...(page.issues ?? []));
  } while (nextPageToken);

  const candidates = issues
    .map((issue) => {
      const key = issue.key ?? "";
      const fields = issue.fields ?? {};
      const assignee = fields.assignee ?? null;
      const priorityName = (fields.priority?.name as string | undefined) ?? null;
      const mappedPriority = mapPriority(priorityName);
      const typeName = computeTypeName(fields);
      const strippedType = stripTypePrefix(typeName).toLowerCase();
      const typeInScope =
        strippedType === "data" ||
        strippedType.includes("lifecycle") ||
        SLA_TYPE_ALLOWLIST.has(strippedType);
      return {
        key,
        fields,
        assignee,
        mappedPriority,
        typeName,
        typeInScope,
      };
    })
    .filter(
      (row) =>
        row.key &&
        row.mappedPriority === "P1" &&
        row.typeInScope &&
        row.assignee &&
        isAgencyActor(row.assignee),
    );

  if (candidates.length === 0) {
    return { processed: 0, autoAcked: 0, failed: 0, message: "No P1 candidates found" };
  }

  const ticketIds = Array.from(new Set(candidates.map((c) => c.key)));
  const { data: existingRows, error: existingError } = await sb
    .from("crm_data_quality_tickets")
    .select("id, ticket_id, owner")
    .eq("client_slug", client)
    .in("ticket_id", ticketIds);
  if (existingError) {
    throw new Error(existingError.message);
  }
  const existingMap = new Map<string, { id: string; owner: string }>();
  (existingRows ?? []).forEach((row: any) => {
    if (!row?.ticket_id) return;
    existingMap.set(String(row.ticket_id), {
      id: String(row.id),
      owner: String(row.owner ?? "Unassigned"),
    });
  });

  const errors: P1AckSyncError[] = [];
  let autoAcked = 0;
  let processed = 0;

  for (const candidate of candidates) {
    const ticketKey = candidate.key;
    let detail: JiraIssue;
    try {
      detail = await fetchIssueDetail(ticketKey);
    } catch (err) {
      errors.push({
        ticketKey,
        step: "fetch_issue",
        message: err instanceof Error ? err.message : "Failed to fetch issue details",
      });
      continue;
    }

    const fields = detail.fields ?? {};

    const statusName = fields.status?.name as string | undefined;
    const priorityName = fields.priority?.name as string | undefined;
    const assignee = fields.assignee ?? null;
    if (!assignee || !isAgencyActor(assignee)) continue;

    const mappedPriority = mapPriority(priorityName);
    if (mappedPriority !== "P1") continue;

    const typeName = computeTypeName(fields);
    const strippedType = stripTypePrefix(typeName).toLowerCase();
    const typeInScope =
      strippedType === "data" ||
      strippedType.includes("lifecycle") ||
      SLA_TYPE_ALLOWLIST.has(strippedType);
    if (!typeInScope) continue;

    const jiraCreatedAt = fields.created ?? null;
    const jiraCreatedDate = jiraCreatedAt ? jiraCreatedAt.slice(0, 10) : null;

    const readyAtFromChangelog = findFirstStatusTransitionAt(detail, "ready");
    const normalizedStatus = normalizeStatus(statusName);
    const jiraReadyAt =
      readyAtFromChangelog ||
      (jiraCreatedAt &&
      ["ready", "in progress", "validation", "done"].includes(normalizedStatus)
        ? jiraCreatedAt
        : null);

    let jiraAckAt = findFirstAgencyCommentAt(detail);
    let jiraAckSource: string | null = jiraAckAt ? "comment" : null;

    const ackStatusAt = findFirstAgencyStatusChangeAt(detail, "in progress");
    if (ackStatusAt && (!jiraAckAt || ackStatusAt < jiraAckAt)) {
      jiraAckAt = ackStatusAt;
      jiraAckSource = "status";
    }

    // Auto-ack only when the ticket is Ready (clock starts on Ready) and we have no ack detected.
    if (!jiraAckAt && jiraReadyAt && normalizeStatus(statusName) === "ready") {
      try {
        const commentRes = await postAckComment(ticketKey, assignee);
        const created = commentRes?.created ?? null;
        if (created) {
          jiraAckAt = created;
          jiraAckSource = "bot_comment";
          autoAcked += 1;
        }
      } catch (err) {
        errors.push({
          ticketKey,
          step: "post_ack_comment",
          message: err instanceof Error ? err.message : "Failed to post acknowledgment comment",
        });
      }
    }

    const existing = existingMap.get(ticketKey);
    const existingOwner = existing?.owner?.trim() || "";
    const assigneeName = (assignee.displayName as string | undefined)?.trim() || "";
    const resolvedOwner =
      existingOwner && existingOwner !== "Unassigned"
        ? existingOwner
        : assigneeName || existingOwner || "Unassigned";

    const update = {
      ...(existing?.id ? { id: existing.id } : {}),
      client_slug: client,
      ticket_id: ticketKey,
      title: fields.summary || "",
      status: statusName || "Backlog",
      priority: mappedPriority,
      assigned_date: jiraCreatedDate,
      due_date: fields.duedate || null,
      owner: resolvedOwner,
      reporter: fields.reporter?.displayName || null,
      type: typeName || null,
      jira_url: `${requireJiraEnv().base}/browse/${ticketKey}`,
      jira_assignee: assigneeName || null,
      jira_created_at: jiraCreatedAt,
      jira_ready_at: jiraReadyAt,
      jira_ack_at: jiraAckAt,
      jira_ack_source: jiraAckSource,
    };

    try {
      const { error: upsertError } = await sb
        .from("crm_data_quality_tickets")
        .upsert([update], { onConflict: "client_slug,ticket_id" });
      if (upsertError) {
        throw new Error(upsertError.message);
      }
      processed += 1;
    } catch (err) {
      errors.push({
        ticketKey,
        step: "upsert",
        message: err instanceof Error ? err.message : "Failed to upsert ticket",
      });
    }
  }

  if (processed === 0) {
    const failed = new Set(errors.map((entry) => entry.ticketKey)).size;
    return {
      processed: 0,
      autoAcked,
      failed,
      errors: errors.length ? errors : undefined,
      message: "No rows updated",
    };
  }

  const failed = new Set(errors.map((entry) => entry.ticketKey)).size;
  return {
    processed,
    autoAcked,
    failed,
    errors: errors.length ? errors : undefined,
  };
}

export const runtime = "nodejs";

export async function POST(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const admin = supabaseAdmin();

  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get("client") || DEFAULT_CLIENT;
    const jql = searchParams.get("jql") || DEFAULT_JQL;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
    const userId = userData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("app_users")
      .select("role,is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.is_active || (profile.role !== "admin" && profile.role !== "editor")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await runP1AckSync({ client, jql, admin });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

