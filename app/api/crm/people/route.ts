import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const CreatePersonZ = z.object({
  client: z.string().optional(),
  displayName: z.string().min(1),
  email: z.string().email().optional().nullable(),
});

const UpdatePersonZ = z.object({
  client: z.string().optional(),
  personId: z.string().uuid(),
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  isActive: z.boolean().optional(),
});

const normalize = (value: string) => value.trim();

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const includeInactive =
    searchParams.get("includeInactive") === "1" ||
    searchParams.get("includeInactive") === "true";

  try {
    const peopleQuery = supabase.from("crm_people").select("*").eq("client_slug", client);
    if (!includeInactive) {
      peopleQuery.eq("is_active", true);
    }
    const { data: peopleRows, error: peopleError } = await peopleQuery.order(
      "display_name",
      { ascending: true },
    );

    if (peopleError) {
      return NextResponse.json({ error: peopleError.message }, { status: 500 });
    }

    const { data: aliasRows, error: aliasError } = await supabase
      .from("crm_people_aliases")
      .select("person_id, alias")
      .eq("client_slug", client);

    if (aliasError) {
      return NextResponse.json({ error: aliasError.message }, { status: 500 });
    }

    const aliasMap = new Map<string, string[]>();
    (aliasRows ?? []).forEach((row: { person_id?: string | null; alias?: string | null }) => {
      if (!row.person_id || !row.alias) return;
      const list = aliasMap.get(row.person_id) || [];
      list.push(row.alias);
      aliasMap.set(row.person_id, list);
    });

    const people =
      peopleRows?.map((row) => ({
        id: row.id,
        personId: row.id,
        clientSlug: row.client_slug,
        displayName: row.display_name,
        email: row.email ?? null,
        isActive: row.is_active,
        aliases: aliasMap.get(row.id) ?? [],
      })) ?? [];

    return NextResponse.json({ people });
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
    const parsed = CreatePersonZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const displayName = normalize(parsed.displayName);
    const email = parsed.email ? normalize(parsed.email) : null;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: existingPerson } = await supabase
      .from("crm_people")
      .select("id")
      .eq("client_slug", clientSlug)
      .ilike("display_name", displayName)
      .maybeSingle();
    if (existingPerson?.id) {
      return NextResponse.json({ error: "Person already exists" }, { status: 409 });
    }

    const { data: existingAlias } = await supabase
      .from("crm_people_aliases")
      .select("id, person_id")
      .eq("client_slug", clientSlug)
      .ilike("alias", displayName)
      .maybeSingle();
    if (existingAlias?.id) {
      return NextResponse.json({ error: "Alias already used by another person" }, { status: 409 });
    }

    const { data: person, error: insertError } = await supabase
      .from("crm_people")
      .insert({
        client_slug: clientSlug,
        display_name: displayName,
        email,
        created_by: userId,
      })
      .select("*")
      .single();
    if (insertError || !person) {
      return NextResponse.json({ error: insertError?.message || "Insert failed" }, { status: 500 });
    }

    const { error: aliasError } = await supabase
      .from("crm_people_aliases")
      .insert({
        client_slug: clientSlug,
        person_id: person.id,
        alias: displayName,
        created_by: userId,
      });
    if (aliasError) {
      return NextResponse.json({ error: aliasError.message }, { status: 500 });
    }

    return NextResponse.json({
      person: {
        id: person.id,
        personId: person.id,
        clientSlug: person.client_slug,
        displayName: person.display_name,
        email: person.email ?? null,
        isActive: person.is_active,
        aliases: [displayName],
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const body = await request.json();
    const parsed = UpdatePersonZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const displayName = parsed.displayName ? normalize(parsed.displayName) : null;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (displayName) {
      const { data: existingPerson } = await supabase
        .from("crm_people")
        .select("id")
        .eq("client_slug", clientSlug)
        .ilike("display_name", displayName)
        .maybeSingle();
      if (existingPerson?.id && existingPerson.id !== parsed.personId) {
        return NextResponse.json({ error: "Person already exists" }, { status: 409 });
      }

      const { data: existingAlias } = await supabase
        .from("crm_people_aliases")
        .select("id, person_id")
        .eq("client_slug", clientSlug)
        .ilike("alias", displayName)
        .maybeSingle();
      if (existingAlias?.id && existingAlias.person_id !== parsed.personId) {
        return NextResponse.json({ error: "Alias already used by another person" }, { status: 409 });
      }
    }

    const updates: Record<string, unknown> = {};
    if (displayName) updates.display_name = displayName;
    if (parsed.email !== undefined) updates.email = parsed.email ? normalize(parsed.email) : null;
    if (parsed.isActive !== undefined) updates.is_active = parsed.isActive;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: person, error: updateError } = await supabase
      .from("crm_people")
      .update(updates)
      .eq("client_slug", clientSlug)
      .eq("id", parsed.personId)
      .select("*")
      .single();
    if (updateError || !person) {
      return NextResponse.json({ error: updateError?.message || "Update failed" }, { status: 500 });
    }

    if (displayName) {
      const { data: aliasCheck } = await supabase
        .from("crm_people_aliases")
        .select("id")
        .eq("client_slug", clientSlug)
        .eq("person_id", parsed.personId)
        .ilike("alias", displayName)
        .maybeSingle();
      if (!aliasCheck?.id) {
        await supabase.from("crm_people_aliases").insert({
          client_slug: clientSlug,
          person_id: parsed.personId,
          alias: displayName,
          created_by: userId,
        });
      }
    }

    const { data: aliasRows } = await supabase
      .from("crm_people_aliases")
      .select("alias")
      .eq("client_slug", clientSlug)
      .eq("person_id", parsed.personId);

    return NextResponse.json({
      person: {
        id: person.id,
        personId: person.id,
        clientSlug: person.client_slug,
        displayName: person.display_name,
        email: person.email ?? null,
        isActive: person.is_active,
        aliases: (aliasRows ?? [])
          .map((row: { alias?: string | null }) => row.alias)
          .filter(Boolean),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
