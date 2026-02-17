import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const APP_STATUS_OPTIONS = ["Standby", "Waiting EMG", "Waiting Internal", "Blocked"] as const;

const PayloadZ = z.object({
  client: z.string().optional(),
  ticketId: z.string().min(1),
  appStatus: z.string().nullable().optional(),
  comments: z.string().nullable().optional(),
  etaDate: z.string().nullable().optional(),
});

const normalizeStatus = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return null;
  return trimmed;
};

export async function PATCH(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const admin = supabaseAdmin();

  try {
    const body = await request.json();
    const hasAppStatusField = Object.prototype.hasOwnProperty.call(body ?? {}, "appStatus");
    const hasCommentsField = Object.prototype.hasOwnProperty.call(body ?? {}, "comments");
    const hasEtaField = Object.prototype.hasOwnProperty.call(body ?? {}, "etaDate");
    const parsed = PayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const ticketId = parsed.ticketId.trim();
    const nextStatus = normalizeStatus(parsed.appStatus);
    const comments = parsed.comments?.trim() ?? "";
    const etaDate = parsed.etaDate?.trim() ?? "";

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (hasAppStatusField && nextStatus && !APP_STATUS_OPTIONS.includes(nextStatus as any)) {
      return NextResponse.json({ error: "Invalid app status" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await admin
      .from("crm_data_quality_tickets")
      .select("id, comments, app_status")
      .eq("client_slug", clientSlug)
      .eq("ticket_id", ticketId)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing?.id) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!hasAppStatusField && !hasCommentsField && !hasEtaField) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const effectiveStatus = hasAppStatusField ? nextStatus : (existing.app_status ?? null);
    const effectiveComments = hasCommentsField ? comments : (existing.comments ?? "");

    if (effectiveStatus && !effectiveComments.trim()) {
      return NextResponse.json(
        { error: "Comments are required when a blocker status is set." },
        { status: 400 },
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (hasAppStatusField) {
      updatePayload.app_status = nextStatus;
      updatePayload.app_status_updated_at = new Date().toISOString();
      updatePayload.app_status_updated_by = session.user.id;
    }

    if (hasCommentsField) {
      updatePayload.comments = effectiveComments.trim() ? effectiveComments.trim() : null;
    }

    if (hasEtaField) {
      updatePayload.eta_date = etaDate ? etaDate : null;
    }

    const { data, error } = await supabase
      .from("crm_data_quality_tickets")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("id, ticket_id, app_status, comments, eta_date, app_status_updated_at, app_status_updated_by")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
    }

    return NextResponse.json({
      ticket: {
        id: data.id,
        ticketId: data.ticket_id,
        appStatus: data.app_status ?? null,
        comments: data.comments ?? null,
        etaDate: data.eta_date ?? null,
        appStatusUpdatedAt: data.app_status_updated_at ?? null,
        appStatusUpdatedBy: data.app_status_updated_by ?? null,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

