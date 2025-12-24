import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;

  try {
    const { data: peopleRows, error: peopleError } = await supabase
      .from("crm_people")
      .select("*")
      .eq("client_slug", client)
      .eq("is_active", true)
      .order("display_name", { ascending: true });

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
