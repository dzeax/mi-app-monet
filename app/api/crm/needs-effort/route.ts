import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DEFAULT_CLIENT = "emg";

const DismissReasonZ = z.enum(["no_effort_needed", "duplicate", "out_of_scope"]);

const ActionPayloadZ = z
  .object({
    client: z.string().optional(),
    ticketId: z.string().uuid(),
    action: z.enum(["clear", "dismiss"]),
    reason: DismissReasonZ.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "dismiss" && !value.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reason is required when action=dismiss",
        path: ["reason"],
      });
    }
  });

async function ensureAdmin() {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message, status: 500 as const };
  }
  const userId = userData.user?.id;
  if (!userId) {
    return { error: "Not authenticated", status: 401 as const };
  }

  const { data: profile, error: profileError } = await supabase
    .from("app_users")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return { error: profileError.message, status: 500 as const };
  }

  if (!profile?.is_active || profile.role !== "admin") {
    return { error: "Forbidden", status: 403 as const };
  }

  return { userId } as const;
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = ActionPayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;

    const auth = await ensureAdmin();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = supabaseAdmin();

    const { data: ticket, error: ticketError } = await admin
      .from("crm_data_quality_tickets")
      .select("id, client_slug, status")
      .eq("id", parsed.ticketId)
      .maybeSingle();

    if (ticketError) {
      return NextResponse.json({ error: ticketError.message }, { status: 500 });
    }
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (ticket.client_slug !== clientSlug) {
      return NextResponse.json(
        { error: "Ticket does not belong to the specified client" },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();

    const basePayload = {
      client_slug: clientSlug,
      ticket_id: parsed.ticketId,
    };

    const updatePayload =
      parsed.action === "clear"
        ? {
            ...basePayload,
            state: "cleared",
            dismiss_reason: null,
            dismissed_at: null,
            dismissed_by: null,
            cleared_at: nowIso,
            cleared_by: auth.userId,
          }
        : {
            ...basePayload,
            state: "dismissed",
            dismiss_reason: parsed.reason ?? null,
            dismissed_at: nowIso,
            dismissed_by: auth.userId,
            cleared_at: null,
            cleared_by: null,
          };

    const { data: flag, error: flagError } = await admin
      .from("crm_needs_effort_flags")
      .upsert(updatePayload, { onConflict: "client_slug,ticket_id" })
      .select(
        "ticket_id, state, dismiss_reason, dismissed_at, dismissed_by, cleared_at, cleared_by, last_detected_at, last_detected_status",
      )
      .single();

    if (flagError || !flag) {
      const message =
        flagError?.message ||
        "Needs effort queue is not configured. Run supabase/sql/crm_needs_effort_flags.sql.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({
      flag: {
        ticketId: flag.ticket_id,
        state: flag.state,
        dismissReason: flag.dismiss_reason ?? null,
        dismissedAt: flag.dismissed_at ?? null,
        dismissedBy: flag.dismissed_by ?? null,
        clearedAt: flag.cleared_at ?? null,
        clearedBy: flag.cleared_by ?? null,
        lastDetectedAt: flag.last_detected_at ?? null,
        lastDetectedStatus: flag.last_detected_status ?? null,
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


