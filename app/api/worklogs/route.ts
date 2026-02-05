import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const ScopeZ = z.enum(["monetization", "internal"]);

const EntryZ = z.object({
  effortDate: z.string().min(1),
  userId: z.string().uuid(),
  workstream: z.string().min(1),
  unit: z.enum(["hours", "days"]),
  value: z.number().nonnegative(),
  comments: z.string().optional().nullable(),
});

const CreatePayloadZ = z.object({
  scope: ScopeZ,
  entries: z.array(EntryZ).min(1),
});

const UpdatePayloadZ = z.object({
  id: z.string().uuid(),
  scope: ScopeZ.optional(),
  effortDate: z.string().min(1).optional(),
  userId: z.string().uuid().optional(),
  workstream: z.string().min(1).optional(),
  unit: z.enum(["hours", "days"]).optional(),
  value: z.number().nonnegative().optional(),
  comments: z.string().optional().nullable(),
});

export const runtime = "nodejs";

const computeHours = (unit: "hours" | "days", value: number) =>
  unit === "days" ? value * 7 : value;

const resolveOwnerLabel = (row: {
  display_name?: string | null;
  email?: string | null;
}) => {
  const displayName = String(row.display_name ?? "").trim();
  if (displayName) return displayName;
  const email = String(row.email ?? "").trim();
  return email || "Unknown";
};

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

async function loadUserMap(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  userIds: string[],
) {
  if (userIds.length === 0) return new Map<string, { display_name?: string | null; email?: string | null }>();
  const { data, error } = await supabase
    .from("app_users")
    .select("user_id,display_name,email")
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, { display_name?: string | null; email?: string | null }>();
  (data ?? []).forEach((row) => {
    if (!row?.user_id) return;
    map.set(String(row.user_id), {
      display_name: row.display_name,
      email: row.email,
    });
  });
  return map;
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

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const userId = searchParams.get("userId");
  const owner = searchParams.get("owner");
  const workstream = searchParams.get("workstream");

  try {
    const query = supabase
      .from("work_manual_efforts")
      .select("*")
      .eq("scope", parsedScope.data);

    if (from) query.gte("effort_date", from);
    if (to) query.lte("effort_date", to);
    if (userId) query.eq("user_id", userId);
    if (owner) query.ilike("owner", owner);
    if (workstream) query.eq("workstream", workstream);

    const { data, error } = await query
      .order("effort_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows =
      data?.map((row) => ({
        id: row.id as string,
        scope: row.scope as "monetization" | "internal",
        effortDate: row.effort_date as string,
        userId: row.user_id as string | null,
        owner: row.owner as string,
        workstream: row.workstream as string,
        inputUnit: row.input_unit as "hours" | "days",
        inputValue: Number(row.input_value ?? 0),
        hours: Number(row.hours ?? 0),
        comments: (row.comments as string | null) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      })) ?? [];

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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

    const userIds = Array.from(new Set(parsed.entries.map((entry) => entry.userId)));
    const userMap = await loadUserMap(supabase, userIds);

    const payload = parsed.entries.map((entry) => {
      const user = userMap.get(entry.userId);
      if (!user) throw new Error(`User not found for id ${entry.userId}`);
      const hours = computeHours(entry.unit, entry.value);
      return {
        scope: parsed.scope,
        effort_date: entry.effortDate,
        user_id: entry.userId,
        owner: resolveOwnerLabel(user),
        workstream: entry.workstream.trim(),
        input_unit: entry.unit,
        input_value: entry.value,
        hours,
        comments: entry.comments ? entry.comments.trim() : null,
        created_by: auth.user?.id,
      };
    });

    const { data, error } = await supabase
      .from("work_manual_efforts")
      .insert(payload)
      .select("*");

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Insert failed" },
        { status: 500 },
      );
    }

    const rows =
      data?.map((row) => ({
        id: row.id as string,
        scope: row.scope as "monetization" | "internal",
        effortDate: row.effort_date as string,
        userId: row.user_id as string | null,
        owner: row.owner as string,
        workstream: row.workstream as string,
        inputUnit: row.input_unit as "hours" | "days",
        inputValue: Number(row.input_value ?? 0),
        hours: Number(row.hours ?? 0),
        comments: (row.comments as string | null) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      })) ?? [];

    return NextResponse.json({ rows });
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
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const auth = await requireUser(supabase);
  if (auth.error) return auth.error;

  if (!auth.role || (auth.role !== "editor" && auth.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = UpdatePayloadZ.parse(body);

    const { data: existing, error: existingError } = await supabase
      .from("work_manual_efforts")
      .select("*")
      .eq("id", parsed.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const unit = (parsed.unit ?? existing.input_unit) as "hours" | "days";
    const value = Number(parsed.value ?? existing.input_value ?? 0);
    const hours = computeHours(unit, value);

    let owner = existing.owner as string;
    let userId = existing.user_id as string | null;
    if (parsed.userId) {
      const userMap = await loadUserMap(supabase, [parsed.userId]);
      const user = userMap.get(parsed.userId);
      if (!user) throw new Error(`User not found for id ${parsed.userId}`);
      owner = resolveOwnerLabel(user);
      userId = parsed.userId;
    }

    const updates: Record<string, unknown> = {
      scope: parsed.scope ?? existing.scope,
      effort_date: parsed.effortDate ?? existing.effort_date,
      user_id: userId,
      owner,
      workstream: parsed.workstream ?? existing.workstream,
      input_unit: unit,
      input_value: value,
      hours,
      comments:
        parsed.comments !== undefined
          ? parsed.comments && parsed.comments.trim().length > 0
            ? parsed.comments.trim()
            : null
          : existing.comments,
    };

    const { data, error } = await supabase
      .from("work_manual_efforts")
      .update(updates)
      .eq("id", parsed.id)
      .select("*");

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Update failed" },
        { status: 500 },
      );
    }

    const row = data[0];

    return NextResponse.json({
      row: {
        id: row.id as string,
        scope: row.scope as "monetization" | "internal",
        effortDate: row.effort_date as string,
        userId: row.user_id as string | null,
        owner: row.owner as string,
        workstream: row.workstream as string,
        inputUnit: row.input_unit as "hours" | "days",
        inputValue: Number(row.input_value ?? 0),
        hours: Number(row.hours ?? 0),
        comments: (row.comments as string | null) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
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

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const auth = await requireUser(supabase);
  if (auth.error) return auth.error;

  if (!auth.role || auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("work_manual_efforts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
