import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

const parseYear = (value: string | null) => {
  const year = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(year) && year > 1900) return year;
  return new Date().getFullYear();
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const year = parseYear(searchParams.get("year"));

  const { data, error } = await supabase
    .from("crm_owner_rates")
    .select("owner, daily_rate")
    .eq("client_slug", client)
    .eq("year", year)
    .order("owner");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rates =
    data?.reduce<Record<string, number>>((acc, row) => {
      acc[row.owner] = Number(row.daily_rate ?? 0);
      return acc;
    }, {}) ?? {};
  return NextResponse.json({ rates });
}
