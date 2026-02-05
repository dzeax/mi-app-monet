import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentUser, error: currentUserError } = await supabase
    .from("app_users")
    .select("is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (currentUserError) {
    return NextResponse.json({ error: currentUserError.message }, { status: 500 });
  }

  if (!currentUser || currentUser.is_active === false) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("user_id,display_name,email,is_active,in_team_capacity")
    .eq("in_team_capacity", true)
    .eq("is_active", true)
    .order("display_name", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users =
    data?.map((row) => ({
      value: row.user_id as string,
      label: String(row.display_name ?? row.email ?? "Unknown").trim(),
      email: row.email as string | null,
      isActive: Boolean(row.is_active),
    })) ?? [];

  return NextResponse.json({ users });
}
