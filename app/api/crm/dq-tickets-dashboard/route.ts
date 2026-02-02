import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_CLIENT = "emg";
const DEFAULT_LIMIT = 1000;
export const runtime = "nodejs";

const normalizeKey = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const parseList = (value: string | null) =>
  value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseLimit = (value: string | null) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 5000);
  return DEFAULT_LIMIT;
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const admin = supabaseAdmin();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const statusFilter = parseList(searchParams.get("status"));
  const assigneeFilter = parseList(searchParams.get("assignee"));
  const priorityFilter = parseList(searchParams.get("priority"));
  const typeFilter = parseList(searchParams.get("type"));
  const search = normalizeKey(searchParams.get("search"));
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const [{ data: peopleRows, error: peopleError }, { data: aliasRows, error: aliasError }] =
      await Promise.all([
        admin
          .from("crm_people")
          .select("id, display_name")
          .eq("client_slug", client),
        admin
          .from("crm_people_aliases")
          .select("person_id, alias")
          .eq("client_slug", client),
      ]);

    if (peopleError) {
      return NextResponse.json({ error: peopleError.message }, { status: 500 });
    }
    if (aliasError) {
      return NextResponse.json({ error: aliasError.message }, { status: 500 });
    }

    const peopleById = new Map<string, string>();
    const displayNameToPerson = new Map<string, string>();
    (peopleRows ?? []).forEach((row: { id?: string | null; display_name?: string | null }) => {
      if (!row?.id || !row.display_name) return;
      const displayName = String(row.display_name).trim();
      if (!displayName) return;
      peopleById.set(String(row.id), displayName);
      displayNameToPerson.set(normalizeKey(displayName), String(row.id));
    });

    const aliasToPerson = new Map<string, string>();
    (aliasRows ?? []).forEach((row: { person_id?: string | null; alias?: string | null }) => {
      if (!row?.person_id || !row.alias) return;
      aliasToPerson.set(normalizeKey(row.alias), String(row.person_id));
    });

    const { data: ticketRows, error: ticketError } = await admin
      .from("crm_data_quality_tickets")
      .select(
        "id, client_slug, status, assigned_date, due_date, ticket_id, title, priority, owner, reporter, type, jira_url, jira_assignee, work_hours, prep_hours, eta_date, comments, app_status, app_status_updated_at, app_status_updated_by, jira_created_at, jira_ready_at, jira_ack_at, jira_ack_source, created_at, updated_at",
      )
      .eq("client_slug", client)
      .order("assigned_date", { ascending: false })
      .limit(limit);

    if (ticketError) {
      return NextResponse.json({ error: ticketError.message }, { status: 500 });
    }

    const statusSet = new Set(statusFilter.map(normalizeKey));
    const assigneeSet = new Set(assigneeFilter.map(normalizeKey));
    const prioritySet = new Set(priorityFilter.map(normalizeKey));
    const typeSet = new Set(typeFilter.map(normalizeKey));

    const tickets =
      (ticketRows ?? [])
        .map((row: any) => {
          const rawAssignee = String(row.jira_assignee ?? row.owner ?? "").trim();
          const key = normalizeKey(rawAssignee);
          const personId = key
            ? aliasToPerson.get(key) ?? displayNameToPerson.get(key)
            : "";
          const assigneeLabel =
            personId && peopleById.get(personId)
              ? peopleById.get(personId) ?? rawAssignee
              : rawAssignee || "Unassigned";

          return {
            id: String(row.id),
            clientSlug: String(row.client_slug),
            status: String(row.status ?? ""),
            assignedDate: String(row.assigned_date ?? ""),
            dueDate: row.due_date ?? null,
            ticketId: String(row.ticket_id ?? ""),
            title: String(row.title ?? ""),
            priority: row.priority ?? "P3",
            owner: String(row.owner ?? ""),
            reporter: row.reporter ?? null,
            type: row.type ?? null,
            jiraUrl: row.jira_url ?? null,
            jiraAssignee: row.jira_assignee ?? null,
            workHours: Number(row.work_hours ?? 0),
            prepHours: row.prep_hours != null ? Number(row.prep_hours) : null,
            etaDate: row.eta_date ?? null,
            comments: row.comments ?? null,
            appStatus: row.app_status ?? null,
            appStatusUpdatedAt: row.app_status_updated_at ?? null,
            appStatusUpdatedBy: row.app_status_updated_by ?? null,
            jiraCreatedAt: row.jira_created_at ?? null,
            jiraReadyAt: row.jira_ready_at ?? null,
            jiraAckAt: row.jira_ack_at ?? null,
            jiraAckSource: row.jira_ack_source ?? null,
            createdAt: row.created_at ?? null,
            updatedAt: row.updated_at ?? null,
            assigneeLabel,
            assigneeKey: personId || assigneeLabel,
          };
        })
        .filter((ticket) => {
          if (statusSet.size && !statusSet.has(normalizeKey(ticket.status))) return false;
          if (assigneeSet.size && !assigneeSet.has(normalizeKey(ticket.assigneeLabel))) return false;
          if (prioritySet.size && !prioritySet.has(normalizeKey(ticket.priority))) return false;
          if (typeSet.size) {
            const typeKey = normalizeKey(ticket.type ?? "");
            if (!typeSet.has(typeKey)) return false;
          }
          if (search) {
            const hay = [
              ticket.ticketId,
              ticket.title,
              ticket.status,
              ticket.priority,
              ticket.assigneeLabel,
              ticket.type,
              ticket.comments,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            if (!hay.includes(search)) return false;
          }
          return true;
        }) ?? [];

    const meta = {
      assignees: Array.from(new Set(tickets.map((t) => t.assigneeLabel).filter(Boolean))).sort(),
      statuses: Array.from(new Set(tickets.map((t) => t.status).filter(Boolean))).sort(),
      types: Array.from(new Set(tickets.map((t) => t.type).filter(Boolean))).sort(),
      priorities: Array.from(new Set(tickets.map((t) => t.priority).filter(Boolean))).sort(),
    };

    return NextResponse.json({ tickets, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
