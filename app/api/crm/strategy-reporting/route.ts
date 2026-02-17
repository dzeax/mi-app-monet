import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const TicketZ = z.object({
  id: z.string().uuid().optional(),
  jiraTicket: z.string().min(1),
  jiraUrl: z.string().url().optional().nullable(),
  title: z.string().min(1),
  status: z.string().min(1),
  category: z.string().min(1),
  createdDate: IsoDate.optional().nullable(),
  dueDate: IsoDate.optional().nullable(),
  jiraAssignee: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const EffortZ = z.object({
  id: z.string().uuid().optional(),
  effortDate: IsoDate.optional().nullable(),
  owner: z.string().min(1),
  hours: z.number().min(0),
  notes: z.string().optional().nullable(),
});

const SavePayloadZ = z.object({
  client: z.string().optional(),
  ticket: TicketZ,
  efforts: z.array(EffortZ).optional(),
});

type DbTicket = {
  id: string;
  client_slug: string;
  jira_ticket: string;
  jira_url: string | null;
  title: string;
  status: string;
  category: string;
  created_date: string;
  due_date: string | null;
  jira_assignee: string | null;
  brand: string | null;
  segment: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DbEffort = {
  id: string;
  ticket_id: string;
  client_slug: string;
  effort_date: string | null;
  owner: string;
  hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const mapTicket = (t: DbTicket) => ({
  id: t.id,
  clientSlug: t.client_slug,
  jiraTicket: t.jira_ticket,
  jiraUrl: t.jira_url,
  title: t.title,
  status: t.status,
  category: t.category,
  createdDate: t.created_date,
  dueDate: t.due_date,
  jiraAssignee: t.jira_assignee,
  brand: t.brand,
  segment: t.segment,
  notes: t.notes,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

const mapEffort = (e: DbEffort) => ({
  id: e.id,
  ticketId: e.ticket_id,
  clientSlug: e.client_slug,
  effortDate: e.effort_date,
  owner: e.owner,
  hours: Number(e.hours ?? 0),
  notes: e.notes,
  createdAt: e.created_at,
  updatedAt: e.updated_at,
});

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: tickets, error: tErr } = await supabase
      .from("crm_strategy_tickets")
      .select("*")
      .eq("client_slug", client)
      .order("updated_at", { ascending: false });
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const { data: efforts, error: eErr } = await supabase
      .from("crm_strategy_efforts")
      .select("*")
      .eq("client_slug", client)
      .order("effort_date", { ascending: false });
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

    const effortsByTicket = new Map<string, DbEffort[]>();
    (efforts ?? []).forEach((e: DbEffort) => {
      const list = effortsByTicket.get(e.ticket_id) ?? [];
      list.push(e);
      effortsByTicket.set(e.ticket_id, list);
    });

    const rows = (tickets ?? []).map((t: DbTicket) => ({
      ...mapTicket(t),
      efforts: (effortsByTicket.get(t.id) ?? []).map(mapEffort),
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  try {
    const body = await request.json().catch(() => null);
    const parsed = SavePayloadZ.parse(body);
    const client = parsed.client || DEFAULT_CLIENT;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const ticketPayload = {
      client_slug: client,
      jira_ticket: parsed.ticket.jiraTicket.trim(),
      jira_url: parsed.ticket.jiraUrl ?? null,
      title: parsed.ticket.title.trim(),
      status: parsed.ticket.status.trim(),
      category: parsed.ticket.category.trim(),
      ...(parsed.ticket.createdDate ? { created_date: parsed.ticket.createdDate } : {}),
      due_date: parsed.ticket.dueDate ?? null,
      jira_assignee: parsed.ticket.jiraAssignee?.trim() || null,
      brand: parsed.ticket.brand?.trim() || null,
      segment: parsed.ticket.segment?.trim() || null,
      notes: parsed.ticket.notes?.trim() || null,
      created_by: userId,
    };

    let ticketId = parsed.ticket.id;
    if (ticketId) {
      const { error } = await supabase
        .from("crm_strategy_tickets")
        .update(ticketPayload)
        .eq("id", ticketId)
        .eq("client_slug", client);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      // Upsert by (client_slug, jira_ticket)
      const { data, error } = await supabase
        .from("crm_strategy_tickets")
        .upsert(ticketPayload, { onConflict: "client_slug,jira_ticket" })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ticketId = data?.id;
    }

    if (!ticketId) return NextResponse.json({ error: "Unable to resolve ticket id" }, { status: 500 });

    const incoming = parsed.efforts ?? [];

    const { data: existingEfforts, error: listErr } = await supabase
      .from("crm_strategy_efforts")
      .select("id")
      .eq("ticket_id", ticketId)
      .eq("client_slug", client);
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const existingIds = new Set<string>((existingEfforts ?? []).map((r: { id: string }) => r.id));
    const incomingIds = new Set<string>(incoming.map((e) => e.id).filter(Boolean) as string[]);

    const toDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      const { error } = await supabase
        .from("crm_strategy_efforts")
        .delete()
        .in("id", toDelete)
        .eq("client_slug", client);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const upsertRows = incoming
      .filter((e) => !!e.id)
      .map((e) => ({
        id: e.id,
        ticket_id: ticketId,
        client_slug: client,
        effort_date: e.effortDate ?? null,
        owner: e.owner.trim(),
        hours: e.hours,
        notes: e.notes?.trim() || null,
        created_by: userId,
      }));

    if (upsertRows.length) {
      const { error } = await supabase
        .from("crm_strategy_efforts")
        .upsert(upsertRows, { onConflict: "id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const insertRows = incoming
      .filter((e) => !e.id)
      .map((e) => ({
        ticket_id: ticketId,
        client_slug: client,
        effort_date: e.effortDate ?? null,
        owner: e.owner.trim(),
        hours: e.hours,
        notes: e.notes?.trim() || null,
        created_by: userId,
      }));

    if (insertRows.length) {
      const { error } = await supabase.from("crm_strategy_efforts").insert(insertRows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ saved: true, ticketId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  try {
    const body = await request.json().catch(() => null);
    const client = (body?.client as string | undefined) || DEFAULT_CLIENT;
    const id = (body?.id as string | undefined) || "";
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { error } = await supabase
      .from("crm_strategy_tickets")
      .delete()
      .eq("id", id)
      .eq("client_slug", client);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

