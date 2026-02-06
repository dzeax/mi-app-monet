import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LIMIT = 1000;

const normalizeKey = (value?: string | null) =>
  value
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
    : "";

const normalizeList = (values?: string[]) =>
  (values ?? []).map((value) => normalizeKey(value)).filter(Boolean);

const clampLimit = (value?: number | null) => {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, 5000);
};

export async function getDqTicketsDashboardData({
  admin,
  client,
  statusFilter,
  assigneeFilter,
  priorityFilter,
  typeFilter,
  search,
  limit,
}: {
  admin: SupabaseClient;
  client: string;
  statusFilter?: string[];
  assigneeFilter?: string[];
  priorityFilter?: string[];
  typeFilter?: string[];
  search?: string | null;
  limit?: number;
}) {
  const statusSet = new Set(normalizeList(statusFilter));
  const assigneeSet = new Set(normalizeList(assigneeFilter));
  const prioritySet = new Set(normalizeList(priorityFilter));
  const typeSet = new Set(normalizeList(typeFilter));
  const searchKey = normalizeKey(search ?? "");
  const safeLimit = clampLimit(limit);

  const [
    { data: peopleRows, error: peopleError },
    { data: aliasRows, error: aliasError },
    { data: appUsersRows, error: appUsersError },
  ] =
    await Promise.all([
      admin.from("crm_people").select("id, display_name").eq("client_slug", client),
      admin.from("crm_people_aliases").select("person_id, alias").eq("client_slug", client),
      admin
        .from("app_users")
        .select("display_name, avatar_url")
        .eq("is_active", true),
    ]);

  if (peopleError) {
    throw new Error(peopleError.message);
  }
  if (aliasError) {
    throw new Error(aliasError.message);
  }
  if (appUsersError) {
    throw new Error(appUsersError.message);
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

  const avatarByDisplayName = new Map<string, string>();
  (appUsersRows ?? []).forEach((row: { display_name?: string | null; avatar_url?: string | null }) => {
    const displayName = String(row?.display_name ?? "").trim();
    const avatarUrl = String(row?.avatar_url ?? "").trim();
    if (!displayName || !avatarUrl) return;
    avatarByDisplayName.set(normalizeKey(displayName), avatarUrl);
  });

  const { data: ticketRows, error: ticketError } = await admin
    .from("crm_data_quality_tickets")
    .select(
      "id, client_slug, status, assigned_date, due_date, ticket_id, title, priority, owner, reporter, type, jira_url, jira_assignee, work_hours, prep_hours, eta_date, comments, app_status, app_status_updated_at, app_status_updated_by, jira_created_at, jira_ready_at, jira_ack_at, jira_ack_source, created_at, updated_at",
    )
    .eq("client_slug", client)
    .order("assigned_date", { ascending: false })
    .limit(safeLimit);

  if (ticketError) {
    throw new Error(ticketError.message);
  }

  const tickets =
    (ticketRows ?? [])
      .map((row: any) => {
        const rawAssignee = String(row.jira_assignee ?? row.owner ?? "").trim();
        const key = normalizeKey(rawAssignee);
        const personId = key ? aliasToPerson.get(key) ?? displayNameToPerson.get(key) : "";
        const assigneeLabel =
          personId && peopleById.get(personId)
            ? peopleById.get(personId) ?? rawAssignee
            : rawAssignee || "Unassigned";
        const assigneeAvatarUrl = avatarByDisplayName.get(normalizeKey(assigneeLabel)) ?? null;

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
          assigneeAvatarUrl,
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
        if (searchKey) {
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
          if (!hay.includes(searchKey)) return false;
        }
        return true;
      }) ?? [];

  const meta = {
    assignees: Array.from(new Set(tickets.map((t) => t.assigneeLabel).filter(Boolean))).sort(),
    statuses: Array.from(new Set(tickets.map((t) => t.status).filter(Boolean))).sort(),
    types: Array.from(new Set(tickets.map((t) => t.type).filter(Boolean))).sort(),
    priorities: Array.from(new Set(tickets.map((t) => t.priority).filter(Boolean))).sort(),
  };

  return { tickets, meta };
}
