import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDqTicketsDashboardData } from "@/lib/crm/dqTicketsDashboard";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 1000;

const parseList = (value: string | null) =>
  value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseLimit = (value: string | null) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 5000);
  return DEFAULT_LIMIT;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const client = searchParams.get("client");
  const statusFilter = parseList(searchParams.get("status"));
  const assigneeFilter = parseList(searchParams.get("assignee"));
  const priorityFilter = parseList(searchParams.get("priority"));
  const typeFilter = parseList(searchParams.get("type"));
  const search = searchParams.get("search");
  const limit = parseLimit(searchParams.get("limit"));

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const tokenHash = hashToken(token);

  const { data: share, error } = await admin
    .from("crm_public_shares")
    .select("id, client_slug, module, allowed_years, is_active, use_count")
    .eq("token_hash", tokenHash)
    .eq("module", "dq-tickets")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!share || !share.is_active) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }

  if (client && share.client_slug !== client) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }

  try {
    const payload = await getDqTicketsDashboardData({
      admin,
      client: share.client_slug,
      statusFilter,
      assigneeFilter,
      priorityFilter,
      typeFilter,
      search,
      limit,
    });

    await admin
      .from("crm_public_shares")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (share.use_count ?? 0) + 1,
      })
      .eq("id", share.id);

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
