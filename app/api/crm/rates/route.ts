import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";

const UpsertRateZ = z.object({
  client: z.string().optional(),
  owner: z.string().min(1),
  dailyRate: z.number().nonnegative(),
  currency: z.string().min(1).default("EUR"),
});

export const runtime = "nodejs";

const normalizeAlias = (value: string) => value.trim().toLowerCase();

const resolvePersonId = async (supabase: ReturnType<typeof createRouteHandlerClient>, clientSlug: string, owner: string) => {
  const { data } = await supabase
    .from("crm_people_aliases")
    .select("alias, person_id")
    .eq("client_slug", clientSlug);
  const key = normalizeAlias(owner);
  const match = (data ?? []).find(
    (row: { alias?: string | null; person_id?: string | null }) =>
      row.alias && row.person_id && normalizeAlias(row.alias) === key,
  );
  return match?.person_id ?? null;
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;

  try {
    const { data, error } = await supabase
      .from("crm_owner_rates")
      .select("*")
      .eq("client_slug", client)
      .order("owner", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rates =
      data?.map((row) => ({
        id: row.id as string,
        clientSlug: row.client_slug as string,
        owner: row.owner as string,
        personId: (row.person_id as string | null) ?? null,
        dailyRate: Number(row.daily_rate ?? 0),
        currency: (row.currency as string) || "EUR",
      })) ?? [];

    return NextResponse.json({ rates });
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
    const parsed = UpsertRateZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const owner = parsed.owner.trim();

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message },
        { status: 500 },
      );
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = {
      client_slug: clientSlug,
      owner,
      person_id: await resolvePersonId(supabase, clientSlug, owner),
      daily_rate: parsed.dailyRate,
      currency: parsed.currency || "EUR",
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("crm_owner_rates")
      .upsert(payload, { onConflict: "client_slug,owner" })
      .select("*")
      .eq("client_slug", clientSlug)
      .eq("owner", owner)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Upsert failed" },
        { status: 500 },
      );
    }

    const rate = {
      id: data.id as string,
      clientSlug: data.client_slug as string,
      owner: data.owner as string,
      personId: (data.person_id as string | null) ?? null,
      dailyRate: Number(data.daily_rate ?? 0),
      currency: (data.currency as string) || "EUR",
    };

    return NextResponse.json({ rate });
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
      return NextResponse.json(
        { error: sessionError.message },
        { status: 500 },
      );
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { error } = await supabase
      .from("crm_owner_rates")
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
