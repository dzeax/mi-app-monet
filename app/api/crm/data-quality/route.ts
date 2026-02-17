import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { parse } from "csv-parse/sync";

const DEFAULT_CLIENT = "emg";
const DEFAULT_WORKSTREAM = "Data Quality";
export const runtime = "nodejs";

type ContributionInput = {
  owner?: unknown;
  personId?: unknown;
  effortDate?: unknown;
  workHours?: unknown;
  prepHours?: unknown;
  workstream?: unknown;
  notes?: unknown;
};

type Contribution = {
  owner: string;
  personId: string | null;
  effortDate: string | null;
  workHours: number;
  prepHours: number | null;
  workstream: string;
  notes: string | null;
};

const ContributionZ = z.object({
  owner: z.string().min(1),
  personId: z.string().uuid().nullable().optional(),
  effortDate: z.string().min(1).nullable().optional(),
  workHours: z.number().nonnegative(),
  prepHours: z.number().nonnegative().nullable().optional(),
  workstream: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
});

const TicketPayloadZ = z.object({
  client: z.string().optional(),
  status: z.string().min(1),
  assignedDate: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  ticketId: z.string().min(1),
  title: z.string().min(1),
  priority: z.enum(["P1", "P2", "P3"]),
  owner: z.string().min(1),
  reporter: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  jiraUrl: z.string().url().nullable().optional(),
  jiraAssignee: z.string().nullable().optional(),
  workHours: z.number().nonnegative(),
  prepHours: z.number().nonnegative().nullable().optional(),
  etaDate: z.string().nullable().optional(),
  comments: z.string().nullable().optional(),
  appStatus: z.string().nullable().optional(),
  contributions: z.array(ContributionZ).optional(),
  id: z.string().uuid().optional(),
});

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const todaysIsoDate = () => new Date().toISOString().slice(0, 10);

const defaultEffortDateForAssignedDate = (assignedDate: string) => {
  const year = Number(assignedDate.slice(0, 4));
  if (Number.isFinite(year) && year >= 2026) return todaysIsoDate();
  return assignedDate;
};

const normalizeContributions = (
  contribs: ContributionInput[] | undefined,
  fallbackOwner: string,
  fallbackWork: number,
  fallbackPrep: number | null,
  fallbackEffortDate: string,
) => {
  const list: ContributionInput[] =
    contribs && Array.isArray(contribs) && contribs.length > 0
      ? contribs
      : [
          {
            owner: fallbackOwner,
            personId: null,
            effortDate: fallbackEffortDate,
            workHours: fallbackWork,
            prepHours: fallbackPrep,
            workstream: DEFAULT_WORKSTREAM,
          },
        ];
  return list
    .map((c) => {
      const effortDateRaw =
        typeof c.effortDate === "string" ? c.effortDate.trim() : "";
      const work = Number(c.workHours ?? 0);
      const prepRaw = c.prepHours;
      const prep =
        prepRaw == null || prepRaw === ""
          ? work * 0.35
          : Number(prepRaw);
      const workstreamRaw =
        typeof c.workstream === "string" ? c.workstream.trim() : "";
      const personIdRaw =
        typeof c.personId === "string" && c.personId.trim()
          ? c.personId.trim()
          : null;
      return {
        owner: String(c.owner || "").trim(),
        personId: personIdRaw,
        effortDate: effortDateRaw && isIsoDate(effortDateRaw) ? effortDateRaw : fallbackEffortDate,
        workHours: Number.isFinite(work) && work >= 0 ? work : 0,
        prepHours:
          Number.isFinite(prep) && prep >= 0 ? prep : work * 0.35,
        workstream: workstreamRaw || DEFAULT_WORKSTREAM,
        notes: c.notes ? String(c.notes) : null,
      };
    })
    .filter((c) => c.owner);
};

const aggregateTotals = (contributions: Contribution[]) => {
  return contributions.reduce(
    (acc, c) => {
      acc.work += c.workHours;
      acc.prep += c.prepHours ?? c.workHours * 0.35;
      return acc;
    },
    { work: 0, prep: 0 },
  );
};

const stripDiacritics = (value: string) =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

const normalizeAlias = (value: string) =>
  stripDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

type PeopleLookup = {
  aliasToPersonId: Map<string, string>;
  personNameById: Map<string, string>;
};

const loadPeopleLookup = async (
  admin: ReturnType<typeof supabaseAdmin>,
  clientSlug: string,
) => {
  const [{ data: aliasRows }, { data: peopleRows }] = await Promise.all([
    admin
      .from("crm_people_aliases")
      .select("alias, person_id")
      .eq("client_slug", clientSlug),
    admin
      .from("crm_people")
      .select("id, display_name")
      .eq("client_slug", clientSlug),
  ]);

  const aliasToPersonId = new Map<string, string>();
  const personNameById = new Map<string, string>();

  (peopleRows ?? []).forEach((row: { id?: string | null; display_name?: string | null }) => {
    if (!row.id || !row.display_name) return;
    const displayName = row.display_name.trim();
    if (!displayName) return;
    personNameById.set(row.id, displayName);
    aliasToPersonId.set(normalizeAlias(displayName), row.id);
  });

  (aliasRows ?? []).forEach((row: { alias?: string | null; person_id?: string | null }) => {
    if (!row.alias || !row.person_id) return;
    aliasToPersonId.set(normalizeAlias(row.alias), row.person_id);
  });

  return { aliasToPersonId, personNameById } as PeopleLookup;
};

const resolveContributionIdentity = (
  contribution: Contribution,
  lookup: PeopleLookup,
): Contribution => {
  const owner = String(contribution.owner || "").trim();
  const personId =
    contribution.personId ??
    (owner ? lookup.aliasToPersonId.get(normalizeAlias(owner)) ?? null : null);
  const canonicalOwner = personId
    ? lookup.personNameById.get(personId) ?? owner
    : owner;

  return {
    ...contribution,
    owner: canonicalOwner || owner,
    personId,
  };
};

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const admin = supabaseAdmin();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;

  try {
    let peopleLookup: PeopleLookup = {
      aliasToPersonId: new Map<string, string>(),
      personNameById: new Map<string, string>(),
    };
    try {
      peopleLookup = await loadPeopleLookup(admin, client);
    } catch (err) {
      console.warn("[crm:data-quality] people lookup unavailable", err);
    }

    const { data, error } = await admin
      .from("crm_data_quality_tickets")
      .select("*")
      .eq("client_slug", client)
      .order("due_date", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tickets = (data ?? []).map((row) => ({
      id: row.id,
      clientSlug: row.client_slug,
      status: row.status,
      assignedDate: row.assigned_date,
      dueDate: row.due_date,
      ticketId: row.ticket_id,
      title: row.title,
      priority: row.priority,
      owner: row.owner,
      reporter: row.reporter,
      jiraAssignee: row.jira_assignee ?? null,
      type: row.type,
      jiraUrl: row.jira_url,
      workHours: Number(row.work_hours ?? 0),
      prepHours: row.prep_hours != null ? Number(row.prep_hours) : null,
      etaDate: row.eta_date,
      comments: row.comments,
      appStatus: row.app_status ?? null,
      appStatusUpdatedAt: row.app_status_updated_at ?? null,
      appStatusUpdatedBy: row.app_status_updated_by ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contributions: [] as Contribution[],
      hasContributions: false,
      needsEffort: null as {
        state: string | null;
        dismissReason: string | null;
        dismissedAt: string | null;
        dismissedBy: string | null;
        clearedAt: string | null;
        clearedBy: string | null;
        lastDetectedAt: string | null;
        lastDetectedStatus: string | null;
      } | null,
    }));

    const ids = tickets.map((t) => t.id);
    if (ids.length > 0) {
      const CHUNK = 200;
      type ContributionRow = {
        ticket_id?: string;
        owner?: string;
        person_id?: string | null;
        effort_date?: string | null;
        work_hours?: number | string | null;
        prep_hours?: number | string | null;
        workstream?: string | null;
        notes?: string | null;
      };
      const contribRows: ContributionRow[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: contribs, error: contribError } = await admin
          .from("crm_data_quality_contributions")
          .select("*")
          .in("ticket_id", slice);
        if (contribError) {
          console.error("[crm:data-quality] contribError chunk", { error: contribError, from: i, to: i + CHUNK });
          continue;
        }
        if (Array.isArray(contribs)) {
          contribRows.push(...contribs);
        }
      }
      if (contribRows.length > 0) {
        const map = new Map<string, Contribution[]>();
        contribRows.forEach((c) => {
          const ticketId = c.ticket_id || "";
          if (!ticketId) return;
          const arr = map.get(ticketId) || [];
          arr.push(
            resolveContributionIdentity(
              {
                owner: c.owner || "",
                personId: c.person_id ?? null,
                effortDate: c.effort_date ?? null,
                workHours: Number(c.work_hours ?? 0),
                prepHours: c.prep_hours != null ? Number(c.prep_hours) : null,
                workstream: c.workstream || DEFAULT_WORKSTREAM,
                notes: c.notes ?? null,
              },
              peopleLookup,
            ),
          );
          map.set(ticketId, arr);
        });
        tickets.forEach((t) => {
          const contribs = map.get(t.id);
          if (contribs?.length) {
            t.contributions = contribs;
            t.hasContributions = true;
            const totals = aggregateTotals(contribs);
            t.workHours = totals.work;
            t.prepHours = totals.prep;
            t.owner = contribs[0].owner;
          }
        });
      }
    }

    // Attach persistent "needs effort" flags when the table is available.
    try {
      if (ids.length > 0) {
        const { data: flagsData, error: flagsError } = await admin
          .from("crm_needs_effort_flags")
          .select(
            "ticket_id, state, dismiss_reason, dismissed_at, dismissed_by, cleared_at, cleared_by, last_detected_at, last_detected_status",
          )
          .eq("client_slug", client)
          .in("ticket_id", ids);

        if (!flagsError && Array.isArray(flagsData) && flagsData.length > 0) {
          const flagsByTicketId = new Map<string, (typeof flagsData)[number]>();
          flagsData.forEach((flag) => {
            if (!flag?.ticket_id) return;
            flagsByTicketId.set(String(flag.ticket_id), flag);
          });

          tickets.forEach((ticket) => {
            const flag = flagsByTicketId.get(ticket.id);
            if (!flag) return;
            ticket.needsEffort = {
              state: flag.state,
              dismissReason: flag.dismiss_reason ?? null,
              dismissedAt: flag.dismissed_at ?? null,
              dismissedBy: flag.dismissed_by ?? null,
              clearedAt: flag.cleared_at ?? null,
              clearedBy: flag.cleared_by ?? null,
              lastDetectedAt: flag.last_detected_at ?? null,
              lastDetectedStatus: flag.last_detected_status ?? null,
            };
          });
        }
      }
    } catch (err) {
      // If the table has not been created yet, do not break the page.
      console.warn("[crm-data-quality] needs effort flags unavailable", err);
    }

    return NextResponse.json({ tickets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  try {
    const body = await request.json();
    const parsed = TicketPayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const admin = supabaseAdmin();
    const peopleLookup = await loadPeopleLookup(admin, clientSlug);

    const fallbackEffortDate = defaultEffortDateForAssignedDate(parsed.assignedDate);
    const contributions = normalizeContributions(
      parsed.contributions,
      parsed.owner,
      parsed.workHours,
      parsed.prepHours ?? null,
      fallbackEffortDate,
    ).map((c) => resolveContributionIdentity(c, peopleLookup));
    if (contributions.length === 0) {
      return NextResponse.json({ error: "At least one contribution is required" }, { status: 400 });
    }
    const totals = aggregateTotals(contributions);

    const insertPayload = {
      client_slug: clientSlug,
      status: parsed.status,
      assigned_date: parsed.assignedDate,
      due_date: parsed.dueDate || null,
      ticket_id: parsed.ticketId,
      title: parsed.title,
      priority: parsed.priority,
      owner: contributions[0].owner,
      reporter: parsed.reporter || null,
      jira_assignee: parsed.jiraAssignee || null,
      type: parsed.type || null,
      jira_url: parsed.jiraUrl || null,
      work_hours: totals.work,
      prep_hours: totals.prep,
      eta_date: parsed.etaDate || null,
      comments: parsed.comments || null,
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("crm_data_quality_tickets")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    const ticketId = data.id as string;
    // replace contributions
    // Replace contributions using service role to avoid RLS delete/insert issues
    const { error: deleteContribError } = await admin
      .from("crm_data_quality_contributions")
      .delete()
      .eq("ticket_id", ticketId);
    if (deleteContribError) {
      throw new Error(`Failed to clear contributions: ${deleteContribError.message}`);
    }
    const contribPayload = contributions.map((c) => ({
      ticket_id: ticketId,
      client_slug: clientSlug,
      owner: c.owner,
      person_id: c.personId,
      effort_date: c.effortDate,
      work_hours: c.workHours,
      prep_hours: c.prepHours,
      workstream: c.workstream,
      notes: c.notes ?? null,
      created_by: userId,
    }));
    if (contribPayload.length > 0) {
      const { error: contribError } = await admin
        .from("crm_data_quality_contributions")
        .upsert(contribPayload, { onConflict: "ticket_id,owner,effort_date,workstream" });
      if (contribError) {
        throw new Error(`Failed to save contributions: ${contribError.message}`);
      }
    }

    const { data: contribRows, error: contribSelectError } = await admin
      .from("crm_data_quality_contributions")
      .select("*")
      .eq("ticket_id", ticketId);
    if (contribSelectError) {
      throw new Error(`Failed to reload contributions: ${contribSelectError.message}`);
    }

    const ticket = {
      id: data.id,
      clientSlug: data.client_slug,
      status: data.status,
      assignedDate: data.assigned_date,
      dueDate: data.due_date,
      ticketId: data.ticket_id,
      title: data.title,
      priority: data.priority,
      owner: data.owner,
      reporter: data.reporter,
      type: data.type,
      jiraUrl: data.jira_url,
      jiraAssignee: data.jira_assignee ?? null,
      workHours: Number(data.work_hours ?? 0),
      prepHours: data.prep_hours != null ? Number(data.prep_hours) : null,
      etaDate: data.eta_date,
      comments: data.comments,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      contributions: contribRows?.map((c) => ({
        owner: c.owner,
        personId: c.person_id ?? null,
        effortDate: c.effort_date ?? null,
        workHours: Number(c.work_hours ?? 0),
        prepHours: c.prep_hours != null ? Number(c.prep_hours) : null,
        workstream: c.workstream || DEFAULT_WORKSTREAM,
        notes: c.notes ?? null,
      })),
    };

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const url = new URL(request.url);
  const clientSlug = url.searchParams.get("client") || DEFAULT_CLIENT;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (
      !contentType.includes("text/csv") &&
      !contentType.includes("application/octet-stream") &&
      !contentType.includes("multipart/form-data")
    ) {
      return NextResponse.json({ error: "CSV file expected" }, { status: 400 });
    }

    const csvText = await request.text();
    const firstLine = csvText.split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

    const records: Record<string, unknown>[] = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter,
    });

    const parseNum = (val: unknown, fallback: number | null) => {
      if (val == null || val === "") return fallback;
      const n = Number(String(val).replace(",", "."));
      return Number.isFinite(n) ? n : fallback;
    };

    const normalizeDate = (val: unknown): string | null => {
      if (!val) return null;
      const raw = String(val).trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const m = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/.exec(raw);
      if (m) {
        const [, dd, mm, yyyy] = m;
        return `${yyyy}-${mm}-${dd}`;
      }
      return raw;
    };

    const normalized = records.map((r) => ({
      client_slug: clientSlug,
      status: String(r.status || "").trim(),
      assigned_date: normalizeDate(
        r.assigned_date || r.assignedDate || r.assignment_date || null,
      ),
      due_date: normalizeDate(r.due_date || r.dueDate || null),
      ticket_id: String(r.ticket_id || r.ticketId || "").trim(),
      title: String(r.title || "").trim(),
      priority: String(r.priority || "").toUpperCase(),
      owner: String(r.owner || "").trim(),
      reporter: r.reporter ? String(r.reporter).trim() : null,
      type: r.type ? String(r.type).trim() : null,
      jira_url: r.jira_url || r.jiraUrl || null,
      work_hours: parseNum(r.work_hours ?? r.workHours, 0) ?? 0,
      prep_hours: parseNum(r.prep_hours ?? r.prepHours, null),
      eta_date: normalizeDate(r.eta_date || r.etaDate || null),
      comments: r.comments || null,
    }));

    const cleaned = normalized
      .filter((row) => row.ticket_id && row.title)
      .map((row) => ({
        ...row,
        priority: ["P1", "P2", "P3"].includes(row.priority) ? row.priority : "P2",
      }));

    if (cleaned.length === 0) {
      return NextResponse.json({ error: "No valid rows found" }, { status: 400 });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = cleaned.map((row) => ({
      ...row,
      created_by: userId,
    }));

    const { error } = await supabase
      .from("crm_data_quality_tickets")
      .upsert(payload, { onConflict: "client_slug,ticket_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ imported: payload.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  try {
    const body = await request.json();
    const parsed = TicketPayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const ticketId = parsed.ticketId.trim();

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = supabaseAdmin();
    const peopleLookup = await loadPeopleLookup(admin, clientSlug);

    const fallbackEffortDate = defaultEffortDateForAssignedDate(parsed.assignedDate);
    const contributions = normalizeContributions(
      parsed.contributions,
      parsed.owner,
      parsed.workHours,
      parsed.prepHours ?? null,
      fallbackEffortDate,
    ).map((c) => resolveContributionIdentity(c, peopleLookup));
    if (contributions.length === 0) {
      return NextResponse.json({ error: "At least one contribution is required" }, { status: 400 });
    }
    const totals = aggregateTotals(contributions);

    const hasAppStatus =
      parsed.appStatus != null && String(parsed.appStatus).trim().length > 0;
    if (hasAppStatus && !parsed.comments?.trim()) {
      return NextResponse.json(
        { error: "Comments are required when a blocker status is set." },
        { status: 400 },
      );
    }

    const updatePayload: Record<string, unknown> = {
      status: parsed.status,
      assigned_date: parsed.assignedDate,
      due_date: parsed.dueDate || null,
      ticket_id: ticketId,
      title: parsed.title,
      priority: parsed.priority,
      owner: contributions[0].owner,
      reporter: parsed.reporter || null,
      jira_assignee: parsed.jiraAssignee || null,
      type: parsed.type || null,
      jira_url: parsed.jiraUrl || null,
      work_hours: totals.work,
      prep_hours: totals.prep,
      eta_date: parsed.etaDate || null,
      comments: parsed.comments || null,
      client_slug: clientSlug,
      created_by: userId,
    };

    if (parsed.appStatus !== undefined) {
      updatePayload.app_status = parsed.appStatus || null;
      updatePayload.app_status_updated_at = new Date().toISOString();
      updatePayload.app_status_updated_by = userId;
    }

    const { error: upsertError } = await supabase
      .from("crm_data_quality_tickets")
      .upsert(updatePayload, { onConflict: "client_slug,ticket_id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message || "Update failed" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("crm_data_quality_tickets")
      .select("*")
      .eq("ticket_id", ticketId)
      .eq("client_slug", clientSlug)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
    }

    const dbTicketId = data.id as string;
    const { error: deleteContribError } = await admin
      .from("crm_data_quality_contributions")
      .delete()
      .eq("ticket_id", dbTicketId);
    if (deleteContribError) {
      throw new Error(`Failed to clear contributions: ${deleteContribError.message}`);
    }
    const contribPayload = contributions.map((c) => ({
      ticket_id: dbTicketId,
      client_slug: clientSlug,
      owner: c.owner,
      person_id: c.personId,
      effort_date: c.effortDate,
      work_hours: c.workHours,
      prep_hours: c.prepHours,
      workstream: c.workstream,
      notes: c.notes ?? null,
      created_by: userId,
    }));
    if (contribPayload.length > 0) {
      const { error: contribError } = await admin
        .from("crm_data_quality_contributions")
        .upsert(contribPayload, { onConflict: "ticket_id,owner,effort_date,workstream" });
      if (contribError) {
        throw new Error(`Failed to save contributions: ${contribError.message}`);
      }
    }

    const { data: contribRows, error: contribSelectError } = await admin
      .from("crm_data_quality_contributions")
      .select("*")
      .eq("ticket_id", dbTicketId);
    if (contribSelectError) {
      throw new Error(`Failed to reload contributions: ${contribSelectError.message}`);
    }

    const ticket = {
      id: data.id,
      clientSlug: data.client_slug,
      status: data.status,
      assignedDate: data.assigned_date,
      dueDate: data.due_date,
      ticketId: data.ticket_id,
      title: data.title,
      priority: data.priority,
      owner: data.owner,
      reporter: data.reporter,
      type: data.type,
      jiraAssignee: data.jira_assignee ?? null,
      jiraUrl: data.jira_url,
      workHours: Number(data.work_hours ?? 0),
      prepHours: data.prep_hours != null ? Number(data.prep_hours) : null,
      etaDate: data.eta_date,
      comments: data.comments,
      appStatus: data.app_status ?? null,
      appStatusUpdatedAt: data.app_status_updated_at ?? null,
      appStatusUpdatedBy: data.app_status_updated_by ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      contributions: contribRows?.map((c) => ({
        owner: c.owner,
        personId: c.person_id ?? null,
        effortDate: c.effort_date ?? null,
        workHours: Number(c.work_hours ?? 0),
        prepHours: c.prep_hours != null ? Number(c.prep_hours) : null,
        workstream: c.workstream || DEFAULT_WORKSTREAM,
        notes: c.notes ?? null,
      })),
    };

    return NextResponse.json({ ticket });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const clientSlug = searchParams.get("client") || DEFAULT_CLIENT;
  const ticketId = (searchParams.get("ticketId") || "").trim();
  if (!ticketId) return NextResponse.json({ error: "ticketId is required" }, { status: 400 });

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .select("role,is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (appUserError) {
      return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }
    if (!appUser || appUser.is_active === false || appUser.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("crm_data_quality_tickets")
      .delete()
      .eq("ticket_id", ticketId)
      .eq("client_slug", clientSlug);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

