import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const UpsertEntitiesZ = z.object({
  client: z.string().optional(),
  year: z.number().int().min(2000),
  entries: z
    .array(
      z.object({
        personId: z.string().uuid(),
        entity: z.string().min(1),
      }),
    )
    .min(1),
});

const parseYear = (value: string | null) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 1900) return parsed;
  return new Date().getFullYear();
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const year = parseYear(searchParams.get("year"));

  try {
    const { data, error } = await supabase
      .from("crm_people_entities")
      .select("id, client_slug, year, person_id, entity")
      .eq("client_slug", client)
      .eq("year", year)
      .order("entity", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries =
      data?.map((row) => ({
        id: row.id as string,
        clientSlug: row.client_slug as string,
        year: Number(row.year),
        personId: row.person_id as string,
        entity: row.entity as string,
      })) ?? [];

    return NextResponse.json({ year, entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const body = await request.json();
    const parsed = UpsertEntitiesZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const { year, entries } = parsed;

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = entries.map((entry) => ({
      client_slug: clientSlug,
      year,
      person_id: entry.personId,
      entity: entry.entity.trim(),
      created_by: userId,
    }));

    const { error } = await supabase
      .from("crm_people_entities")
      .upsert(payload, { onConflict: "client_slug,year,person_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ saved: payload.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
