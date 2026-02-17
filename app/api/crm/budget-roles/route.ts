import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";

const RolePayloadZ = z.object({
  id: z.string().uuid().optional(),
  client: z.string().optional(),
  year: z.number().int(),
  roleName: z.string().min(1),
  poolAmount: z.number().nonnegative(),
  currency: z.string().min(1).default("EUR"),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  try {
    const body = await request.json();
    const parsed = RolePayloadZ.parse(body);
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
      year: parsed.year,
      role_name: parsed.roleName.trim(),
      pool_amount: parsed.poolAmount,
      currency: parsed.currency || "EUR",
      sort_order: parsed.sortOrder ?? 0,
      is_active: parsed.isActive ?? true,
      created_by: userId,
    };

    if (parsed.id) {
      const { data, error } = await supabase
        .from("crm_budget_roles")
        .update({
          role_name: payload.role_name,
          pool_amount: payload.pool_amount,
          currency: payload.currency,
          sort_order: payload.sort_order,
          is_active: payload.is_active,
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
      return NextResponse.json({ role: data });
    }

    const { data, error } = await supabase
      .from("crm_budget_roles")
      .insert(payload)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ role: data });
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
      .from("crm_budget_roles")
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

