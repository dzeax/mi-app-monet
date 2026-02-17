import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getBudgetExecutionData } from "@/lib/crm/budgetExecution";

const DEFAULT_CLIENT = "emg";

const parseYear = (value: string | null) => {
  const year = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(year) && year > 1900) return year;
  return new Date().getFullYear();
};

export const runtime = "nodejs";

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const year = parseYear(searchParams.get("year"));

  try {
    const payload = await getBudgetExecutionData({ supabase, client, year });
    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

