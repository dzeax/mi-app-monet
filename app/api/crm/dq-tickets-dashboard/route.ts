import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDqTicketsDashboardData } from "@/lib/crm/dqTicketsDashboard";

const DEFAULT_CLIENT = "emg";
const DEFAULT_LIMIT = 1000;
export const runtime = "nodejs";

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

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const admin = supabaseAdmin();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const statusFilter = parseList(searchParams.get("status"));
  const assigneeFilter = parseList(searchParams.get("assignee"));
  const priorityFilter = parseList(searchParams.get("priority"));
  const typeFilter = parseList(searchParams.get("type"));
  const search = searchParams.get("search");
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const payload = await getDqTicketsDashboardData({
      admin,
      client,
      statusFilter,
      assigneeFilter,
      priorityFilter,
      typeFilter,
      search,
      limit,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

