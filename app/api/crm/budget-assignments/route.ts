import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";

const AssignmentPayloadZ = z.object({
  id: z.string().uuid().optional(),
  client: z.string().optional(),
  roleId: z.string().uuid(),
  personId: z.string().uuid(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  allocationAmount: z.number().nonnegative().nullable().optional(),
  allocationPct: z.number().nonnegative().nullable().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const body = await request.json();
    const parsed = AssignmentPayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = {
      client_slug: clientSlug,
      role_id: parsed.roleId,
      person_id: parsed.personId,
      start_date: parsed.startDate || null,
      end_date: parsed.endDate || null,
      is_active: parsed.isActive ?? true,
      allocation_amount:
        parsed.allocationAmount != null ? parsed.allocationAmount : null,
      allocation_pct:
        parsed.allocationPct != null ? parsed.allocationPct : null,
      created_by: userId,
    };

    if (parsed.id) {
      const { data, error } = await supabase
        .from("crm_budget_assignments")
        .update({
          role_id: payload.role_id,
          person_id: payload.person_id,
          start_date: payload.start_date,
          end_date: payload.end_date,
          is_active: payload.is_active,
          allocation_amount: payload.allocation_amount,
          allocation_pct: payload.allocation_pct,
        })
        .eq("id", parsed.id)
        .select("*")
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Update failed" },
          { status: 500 },
        );
      }
      return NextResponse.json({ assignment: data });
    }

    const { data, error } = await supabase
      .from("crm_budget_assignments")
      .insert(payload)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ assignment: data });
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
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { error } = await supabase
      .from("crm_budget_assignments")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
