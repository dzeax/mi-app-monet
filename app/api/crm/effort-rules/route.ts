import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { randomUUID } from "crypto";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const RuleZ = z.object({
  id: z.string().uuid().optional(),
  priority: z.number().int().min(0).default(100),
  brand: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  touchpoint: z.string().optional().nullable(),
  markets: z.array(z.string()).optional().nullable(),
  hours_master_template: z.number().min(0).default(0),
  hours_translations: z.number().min(0).default(0),
  hours_copywriting: z.number().min(0).default(0),
  hours_assets: z.number().min(0).default(0),
  hours_revisions: z.number().min(0).default(0),
  hours_build: z.number().min(0).default(0),
  hours_prep: z.number().min(0).default(0),
  active: z.boolean().default(true),
});

const PayloadZ = z.object({
  client: z.string().optional(),
  rules: z.array(RuleZ),
});

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  try {
    const { data, error } = await supabase
      .from("crm_effort_rules")
      .select("*")
      .eq("client_slug", client)
      .order("priority", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rules: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  try {
    const body = await request.json();
    const parsed = PayloadZ.parse(body);
    const client = parsed.client || DEFAULT_CLIENT;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = parsed.rules.map((r) => ({
      id: r.id ?? randomUUID(),
      client_slug: client,
      priority: r.priority ?? 100,
      brand: r.brand || null,
      scope: r.scope || null,
      touchpoint: r.touchpoint || null,
      markets: r.markets && r.markets.length ? r.markets : null,
      hours_master_template: r.hours_master_template ?? 0,
      hours_translations: r.hours_translations ?? 0,
      hours_copywriting: r.hours_copywriting ?? 0,
      hours_assets: r.hours_assets ?? 0,
      hours_revisions: r.hours_revisions ?? 0,
      hours_build: r.hours_build ?? 0,
      hours_prep: r.hours_prep ?? 0,
      active: r.active ?? true,
      updated_by: userId,
    }));

    const { error } = await supabase.from("crm_effort_rules").upsert(payload, {
      onConflict: "id",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: payload.length });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 });
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

