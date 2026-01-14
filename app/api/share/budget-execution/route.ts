import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBudgetExecutionData } from "@/lib/crm/budgetExecution";

export const runtime = "nodejs";

const parseYear = (value: string | null) => {
  const year = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(year) && year > 1900) return year;
  return null;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const client = searchParams.get("client");
  const yearValue = parseYear(searchParams.get("year"));

  if (!token || !yearValue) {
    return NextResponse.json({ error: "Missing token or year." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const tokenHash = hashToken(token);

  const { data: share, error } = await admin
    .from("crm_public_shares")
    .select("id, client_slug, module, allowed_years, is_active, use_count")
    .eq("token_hash", tokenHash)
    .eq("module", "budget-execution")
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

  const allowedYears = (share.allowed_years ?? []).map((value: number) => Number(value)).filter((value: number) => Number.isFinite(value));
  if (!allowedYears.includes(yearValue)) {
    return NextResponse.json({ error: "Year not allowed for this share." }, { status: 403 });
  }

  try {
    const payload = await getBudgetExecutionData({
      supabase: admin,
      client: share.client_slug,
      year: yearValue,
    });

    await admin
      .from("crm_public_shares")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (share.use_count ?? 0) + 1,
      })
      .eq("id", share.id);

    return NextResponse.json({ ...payload, allowedYears });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
