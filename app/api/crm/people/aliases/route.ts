import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const AddAliasZ = z.object({
  client: z.string().optional(),
  personId: z.string().uuid(),
  alias: z.string().min(1),
});

const normalize = (value: string) => value.trim();

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const body = await request.json();
    const parsed = AddAliasZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const alias = normalize(parsed.alias);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: person } = await supabase
      .from("crm_people")
      .select("id")
      .eq("client_slug", clientSlug)
      .eq("id", parsed.personId)
      .maybeSingle();
    if (!person?.id) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from("crm_people_aliases")
      .select("id, person_id")
      .eq("client_slug", clientSlug)
      .ilike("alias", alias)
      .maybeSingle();
    if (existing?.id) {
      if (existing.person_id === parsed.personId) {
        return NextResponse.json({ alias, existed: true });
      }
      return NextResponse.json({ error: "Alias already used by another person" }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("crm_people_aliases")
      .insert({
        client_slug: clientSlug,
        person_id: parsed.personId,
        alias,
        created_by: userId,
      })
      .select("id, alias")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ alias: data.alias });
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
  const clientSlug = searchParams.get("client") || DEFAULT_CLIENT;
  const personId = searchParams.get("personId");
  const aliasRaw = searchParams.get("alias");

  if (!personId || !aliasRaw) {
    return NextResponse.json({ error: "Missing personId or alias" }, { status: 400 });
  }
  const alias = normalize(aliasRaw);

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: person } = await supabase
      .from("crm_people")
      .select("display_name")
      .eq("client_slug", clientSlug)
      .eq("id", personId)
      .maybeSingle();
    if (!person?.display_name) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (person.display_name.trim().toLowerCase() === alias.toLowerCase()) {
      return NextResponse.json({ error: "Cannot remove primary alias" }, { status: 400 });
    }

    const { error } = await supabase
      .from("crm_people_aliases")
      .delete()
      .eq("client_slug", clientSlug)
      .eq("person_id", personId)
      .eq("alias", alias);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
