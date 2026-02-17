import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";

const AllocationZ = z.object({
  roleId: z.string().uuid(),
  amount: z.number(),
});

const AdjustmentsPayloadZ = z.object({
  client: z.string().optional(),
  fromYear: z.number().int(),
  toYear: z.number().int(),
  type: z.string().optional().default("carryover"),
  allocations: z.array(AllocationZ).default([]),
});

export const runtime = "nodejs";

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const toYear = Number(searchParams.get("toYear"));
  const fromYear = Number(searchParams.get("fromYear"));
  const type = searchParams.get("type") || "carryover";

  if (!Number.isFinite(toYear) || !Number.isFinite(fromYear)) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("crm_budget_adjustments")
    .select("id, role_id, amount, from_year, to_year, type")
    .eq("client_slug", client)
    .eq("to_year", toYear)
    .eq("from_year", fromYear)
    .eq("type", type);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    adjustments: (data ?? []).map((row: any) => ({
      id: row.id,
      roleId: row.role_id,
      amount: Number(row.amount ?? 0),
      fromYear: Number(row.from_year ?? fromYear),
      toYear: Number(row.to_year ?? toYear),
      type: row.type ?? type,
    })),
  });
}

export async function POST(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  try {
    const body = await request.json();
    const parsed = AdjustmentsPayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { error: deleteError } = await supabase
      .from("crm_budget_adjustments")
      .delete()
      .eq("client_slug", clientSlug)
      .eq("from_year", parsed.fromYear)
      .eq("to_year", parsed.toYear)
      .eq("type", parsed.type);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const allocations = parsed.allocations.filter(
      (entry) => Number(entry.amount ?? 0) !== 0,
    );

    if (allocations.length === 0) {
      return NextResponse.json({ adjustments: [] });
    }

    const payload = allocations.map((entry) => ({
      client_slug: clientSlug,
      from_year: parsed.fromYear,
      to_year: parsed.toYear,
      role_id: entry.roleId,
      amount: entry.amount,
      type: parsed.type,
      created_by: userId,
    }));

    const { data, error } = await supabase
      .from("crm_budget_adjustments")
      .insert(payload)
      .select("id, role_id, amount, from_year, to_year, type");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      adjustments: (data ?? []).map((row: any) => ({
        id: row.id,
        roleId: row.role_id,
        amount: Number(row.amount ?? 0),
        fromYear: Number(row.from_year ?? parsed.fromYear),
        toYear: Number(row.to_year ?? parsed.toYear),
        type: row.type ?? parsed.type,
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

