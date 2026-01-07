import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const CopyRatesZ = z.object({
  client: z.string().optional(),
  fromYear: z.number().int().min(2000),
  toYear: z.number().int().min(2000),
  overwrite: z.boolean().optional(),
});

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const body = await request.json();
    const parsed = CopyRatesZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const { fromYear, toYear } = parsed;

    if (fromYear === toYear) {
      return NextResponse.json({ error: "fromYear and toYear must differ" }, { status: 400 });
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: sourceRows, error: sourceError } = await supabase
      .from("crm_owner_rates")
      .select("owner, person_id, daily_rate, currency")
      .eq("client_slug", clientSlug)
      .eq("year", fromYear);
    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }
    if (!sourceRows || sourceRows.length === 0) {
      return NextResponse.json({ error: "No rates found for source year" }, { status: 404 });
    }

    let filtered = sourceRows;
    if (!parsed.overwrite) {
      const { data: existingRows, error: existingError } = await supabase
        .from("crm_owner_rates")
        .select("owner")
        .eq("client_slug", clientSlug)
        .eq("year", toYear);
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }
      const existing = new Set((existingRows ?? []).map((row) => row.owner));
      filtered = sourceRows.filter((row) => !existing.has(row.owner));
    }

    if (filtered.length === 0) {
      return NextResponse.json({ copied: 0 });
    }

    const payload = filtered.map((row) => ({
      client_slug: clientSlug,
      owner: row.owner,
      person_id: row.person_id ?? null,
      daily_rate: row.daily_rate,
      currency: row.currency || "EUR",
      year: toYear,
      valid_from: `${toYear}-01-01`,
      created_by: userId,
    }));

    if (parsed.overwrite) {
      const { error: upsertError } = await supabase
        .from("crm_owner_rates")
        .upsert(payload, { onConflict: "client_slug,owner,year" });
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase
        .from("crm_owner_rates")
        .insert(payload);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ copied: payload.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
