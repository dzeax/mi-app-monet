import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const ScopeZ = z.enum(["monetization", "internal"]);

const CreatePayloadZ = z.object({
  scope: ScopeZ,
  label: z.string().min(1),
});

export const runtime = "nodejs";

async function requireUser(
  supabase: ReturnType<typeof createRouteHandlerClient>,
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: currentUser, error: currentUserError } = await supabase
    .from("app_users")
    .select("role,is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (currentUserError) {
    return { error: NextResponse.json({ error: currentUserError.message }, { status: 500 }) };
  }
  if (!currentUser || currentUser.is_active === false) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user: userData.user, role: currentUser.role as string };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const auth = await requireUser(supabase);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const scopeParam = searchParams.get("scope") || "monetization";
  const parsedScope = ScopeZ.safeParse(scopeParam);
  if (!parsedScope.success) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("work_manual_workstreams")
    .select("id,label,scope,is_active,created_at")
    .eq("scope", parsedScope.data)
    .eq("is_active", true)
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workstreams: data ?? [] });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const auth = await requireUser(supabase);
  if (auth.error) return auth.error;

  if (!auth.role || (auth.role !== "editor" && auth.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = CreatePayloadZ.parse(body);
    const label = parsed.label.trim();

    if (!label) {
      return NextResponse.json({ error: "Invalid label" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("work_manual_workstreams")
      .select("id,label,scope")
      .eq("scope", parsed.scope)
      .ilike("label", label)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ workstream: existing });
    }

    const { data, error } = await supabase
      .from("work_manual_workstreams")
      .insert({
        scope: parsed.scope,
        label,
        created_by: auth.user?.id,
      })
      .select("id,label,scope")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ workstream: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
