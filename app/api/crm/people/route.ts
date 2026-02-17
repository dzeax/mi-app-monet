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
const normalizeKey = (value?: string | null) => {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) return "";
  return trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
};

type PersonRowForAvatar = {
  id?: string | null;
  display_name?: string | null;
  email?: string | null;
};

const resolveAvatarByPeople = async (
  supabase: ReturnType<typeof createRouteHandlerClient>,
  peopleRows: PersonRowForAvatar[],
  aliasesByPersonId: Map<string, string[]>,
) => {
  if (peopleRows.length === 0) return new Map<string, string>();

  const { data: appUsersRows, error: appUsersError } = await supabase
    .from("app_users")
    .select("display_name,email,avatar_url")
    .eq("is_active", true);

  if (appUsersError) {
    throw new Error(appUsersError.message);
  }

  const avatarByMatcher = new Map<string, string>();
  (appUsersRows ?? []).forEach(
    (row: { display_name?: string | null; email?: string | null; avatar_url?: string | null }) => {
      const avatar = String(row?.avatar_url ?? "").trim();
      if (!avatar) return;
      const displayNameKey = normalizeKey(row?.display_name);
      const emailKey = normalizeKey(row?.email);
      if (displayNameKey && !avatarByMatcher.has(displayNameKey)) {
        avatarByMatcher.set(displayNameKey, avatar);
      }
      if (emailKey && !avatarByMatcher.has(emailKey)) {
        avatarByMatcher.set(emailKey, avatar);
      }
    },
  );

  const avatarByPersonId = new Map<string, string>();
  peopleRows.forEach((row) => {
    const personId = String(row?.id ?? "").trim();
    if (!personId) return;

    const matchers = new Set<string>();
    const displayNameKey = normalizeKey(row?.display_name);
    const emailKey = normalizeKey(row?.email);
    if (emailKey) matchers.add(emailKey);
    if (displayNameKey) matchers.add(displayNameKey);
    (aliasesByPersonId.get(personId) ?? []).forEach((alias) => {
      const aliasKey = normalizeKey(alias);
      if (aliasKey) matchers.add(aliasKey);
    });

    for (const matcher of matchers) {
      const avatar = avatarByMatcher.get(matcher);
      if (!avatar) continue;
      avatarByPersonId.set(personId, avatar);
      break;
    }
  });

  return avatarByPersonId;
};

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
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
      const personId = String(row.person_id);
      const list = aliasMap.get(personId) || [];
      list.push(String(row.alias));
      aliasMap.set(personId, list);
    });

    const avatarByPersonId = await resolveAvatarByPeople(
      supabase,
      (peopleRows ?? []).map((row) => ({
        id: row.id,
        display_name: row.display_name,
        email: row.email,
      })),
      aliasMap,
    );

    const people =
      peopleRows?.map((row) => ({
        id: row.id,
        personId: row.id,
        clientSlug: row.client_slug,
        displayName: row.display_name,
        email: row.email ?? null,
        avatarUrl: avatarByPersonId.get(String(row.id)) ?? null,
        isActive: row.is_active,
        aliases: aliasMap.get(String(row.id)) ?? [],
      })) ?? [];

    return NextResponse.json({ people });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

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

    const avatarByPersonId = await resolveAvatarByPeople(
      supabase,
      [
        {
          id: person.id,
          display_name: person.display_name,
          email: person.email ?? null,
        },
      ],
      new Map<string, string[]>([[String(person.id), [displayName]]]),
    );

    return NextResponse.json({
      person: {
        id: person.id,
        personId: person.id,
        clientSlug: person.client_slug,
        displayName: person.display_name,
        email: person.email ?? null,
        avatarUrl: avatarByPersonId.get(String(person.id)) ?? null,
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
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

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

    const aliases = (aliasRows ?? [])
      .map((row: { alias?: string | null }) => row.alias)
      .filter((value): value is string => Boolean(value));

    const avatarByPersonId = await resolveAvatarByPeople(
      supabase,
      [
        {
          id: person.id,
          display_name: person.display_name,
          email: person.email ?? null,
        },
      ],
      new Map<string, string[]>([[String(person.id), aliases]]),
    );

    return NextResponse.json({
      person: {
        id: person.id,
        personId: person.id,
        clientSlug: person.client_slug,
        displayName: person.display_name,
        email: person.email ?? null,
        avatarUrl: avatarByPersonId.get(String(person.id)) ?? null,
        isActive: person.is_active,
        aliases,
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

