import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const createSchema = z.object({
  client: z.string().trim().min(1),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error } = await supabase
    .from("app_users")
    .select("role,is_active")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!profile || profile.is_active === false || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, session };
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");
  if (!client) {
    return NextResponse.json({ error: "Missing client." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_public_shares")
    .select(
      "id,client_slug,module,allowed_years,is_active,created_at,revoked_at,last_used_at,use_count",
    )
    .eq("client_slug", client)
    .eq("module", "dq-tickets")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shares: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { supabase, session } = auth;

  let parsed: z.infer<typeof createSchema>;
  try {
    const body = await req.json();
    parsed = createSchema.parse(body);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(", ")
        : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from("crm_public_shares")
    .insert({
      client_slug: parsed.client,
      module: "dq-tickets",
      allowed_years: [],
      token_hash: tokenHash,
      created_by: session.user.id,
      is_active: true,
    })
    .select("id,client_slug,module,allowed_years,is_active,created_at,revoked_at,last_used_at,use_count")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token, share: data });
}
