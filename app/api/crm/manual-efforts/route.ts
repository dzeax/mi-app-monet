import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { parse } from "csv-parse/sync";

const DEFAULT_CLIENT = "emg";
const normalizeKey = (value?: string | null) => value?.trim().toLowerCase() ?? "";
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

type AuthProfile = {
  userId: string;
  role: "admin" | "editor";
  displayName: string | null;
  email: string | null;
};

const EntryZ = z.object({
  effortDate: z.string().min(1),
  personId: z.string().uuid(),
  owner: z.string().min(1).optional(),
  workstream: z.string().min(1),
  unit: z.enum(["hours", "days"]),
  value: z.number().nonnegative(),
  comments: z.string().optional().nullable(),
});

const CreatePayloadZ = z.object({
  client: z.string().optional(),
  entries: z.array(EntryZ).min(1),
});

const UpdatePayloadZ = z.object({
  client: z.string().optional(),
  id: z.string().uuid(),
  effortDate: z.string().min(1).optional(),
  personId: z.string().uuid().optional(),
  workstream: z.string().min(1).optional(),
  unit: z.enum(["hours", "days"]).optional(),
  value: z.number().nonnegative().optional(),
  comments: z.string().optional().nullable(),
});

export const runtime = "nodejs";

const computeHours = (unit: "hours" | "days", value: number) =>
  unit === "days" ? value * 7 : value;

const loadPeopleMap = async (
  supabase: ReturnType<typeof createRouteHandlerClient>,
  clientSlug: string,
  personIds: string[],
) => {
  if (personIds.length === 0) return new Map<string, string>();
  const { data, error } = await supabase
    .from("crm_people")
    .select("id, display_name")
    .eq("client_slug", clientSlug)
    .in("id", personIds);
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  (data ?? []).forEach((row: { id?: string | null; display_name?: string | null }) => {
    if (!row?.id || !row?.display_name) return;
    map.set(String(row.id), String(row.display_name));
  });
  return map;
};

const loadAvatarByPerson = async (
  supabase: ReturnType<typeof createRouteHandlerClient>,
  clientSlug: string,
  personIds: string[],
) => {
  if (personIds.length === 0) return new Map<string, string>();

  const { data: peopleRows, error: peopleError } = await supabase
    .from("crm_people")
    .select("id,display_name,email")
    .eq("client_slug", clientSlug)
    .in("id", personIds);
  if (peopleError) throw new Error(peopleError.message);

  const { data: appUsersRows, error: appUsersError } = await supabase
    .from("app_users")
    .select("display_name,email,avatar_url")
    .eq("is_active", true);
  if (appUsersError) throw new Error(appUsersError.message);

  const avatarByMatcher = new Map<string, string>();
  (appUsersRows ?? []).forEach(
    (row: { display_name?: string | null; email?: string | null; avatar_url?: string | null }) => {
      const avatar = String(row?.avatar_url ?? "").trim();
      if (!avatar) return;
      const displayNameKey = normalizeKey(row?.display_name);
      const emailKey = normalizeKey(row?.email);
      if (displayNameKey) avatarByMatcher.set(displayNameKey, avatar);
      if (emailKey) avatarByMatcher.set(emailKey, avatar);
    },
  );

  const avatarByPersonId = new Map<string, string>();
  (peopleRows ?? []).forEach((row: { id?: string | null; display_name?: string | null; email?: string | null }) => {
    const id = row?.id ? String(row.id) : "";
    if (!id) return;
    const displayNameKey = normalizeKey(row?.display_name);
    const emailKey = normalizeKey(row?.email);
    const avatar =
      (emailKey ? avatarByMatcher.get(emailKey) : null) ??
      (displayNameKey ? avatarByMatcher.get(displayNameKey) : null) ??
      "";
    if (avatar) avatarByPersonId.set(id, avatar);
  });
  return avatarByPersonId;
};

const requireAuthProfile = async (
  supabase: ReturnType<typeof createRouteHandlerClient>,
): Promise<{ profile: AuthProfile } | { error: NextResponse }> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("role,is_active,display_name,email")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (appUserError) {
    return { error: NextResponse.json({ error: appUserError.message }, { status: 500 }) };
  }
  if (!appUser || appUser.is_active === false) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const role = String(appUser.role ?? "").toLowerCase() === "admin" ? "admin" : "editor";
  return {
    profile: {
      userId: userData.user.id,
      role,
      displayName: appUser.display_name ? String(appUser.display_name) : null,
      email: appUser.email ? String(appUser.email) : userData.user.email ?? null,
    },
  };
};

const resolveEditorPersonIds = async (
  supabase: ReturnType<typeof createRouteHandlerClient>,
  clientSlug: string,
  profile: AuthProfile,
): Promise<string[]> => {
  const matchers = new Set(
    [profile.displayName, profile.email].map((value) => normalizeKey(value)).filter(Boolean),
  );
  if (matchers.size === 0) return [];

  const { data: peopleRows, error } = await supabase
    .from("crm_people")
    .select("id,display_name,email")
    .eq("client_slug", clientSlug);

  if (error) throw new Error(error.message);

  const allowed = new Set<string>();
  (peopleRows ?? []).forEach((row: { id?: string | null; display_name?: string | null; email?: string | null }) => {
    const id = row?.id ? String(row.id) : "";
    if (!id) return;
    const displayName = normalizeKey(row.display_name);
    const email = normalizeKey(row.email);
    if (matchers.has(displayName) || matchers.has(email)) {
      allowed.add(id);
    }
  });
  return Array.from(allowed);
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const personId = searchParams.get("personId");
  const owner = searchParams.get("owner");
  const workstream = searchParams.get("workstream");

  try {
    const auth = await requireAuthProfile(supabase);
    if ("error" in auth) return auth.error;
    const profile = auth.profile;
    const isAdmin = profile.role === "admin";
    const allowedPersonIds = isAdmin
      ? []
      : await resolveEditorPersonIds(supabase, client, profile);

    if (!isAdmin && personId && !allowedPersonIds.includes(personId)) {
      return NextResponse.json({
        rows: [],
        scope: {
          role: profile.role,
          allowedPersonIds,
        },
      });
    }

    const query = supabase
      .from("crm_manual_efforts")
      .select("*")
      .eq("client_slug", client);
    if (from) query.gte("effort_date", from);
    if (to) query.lte("effort_date", to);
    if (personId) query.eq("person_id", personId);
    if (owner) query.ilike("owner", owner);
    if (workstream) query.eq("workstream", workstream);
    if (!isAdmin) {
      if (allowedPersonIds.length > 0) query.in("person_id", allowedPersonIds);
      else query.eq("created_by", profile.userId);
    }

    const { data, error } = await query
      .order("effort_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const personIds = Array.from(
      new Set(
        (data ?? [])
          .map((row: { person_id?: string | null }) => String(row?.person_id ?? ""))
          .filter((value) => isUuid(value)),
      ),
    );
    const avatarByPersonId = await loadAvatarByPerson(supabase, client, personIds);

    const rows =
      data?.map((row) => ({
        id: row.id as string,
        clientSlug: row.client_slug as string,
        effortDate: row.effort_date as string,
        personId: row.person_id as string,
        owner: row.owner as string,
        ownerAvatarUrl: avatarByPersonId.get(String(row.person_id ?? "")) ?? null,
        workstream: row.workstream as string,
        inputUnit: row.input_unit as "hours" | "days",
        inputValue: Number(row.input_value ?? 0),
        hours: Number(row.hours ?? 0),
        comments: (row.comments as string | null) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      })) ?? [];

    return NextResponse.json({
      rows,
      scope: {
        role: profile.role,
        allowedPersonIds: isAdmin ? null : allowedPersonIds,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const auth = await requireAuthProfile(supabase);
    if ("error" in auth) return auth.error;
    const profile = auth.profile;
    const isAdmin = profile.role === "admin";
    if (!(isAdmin || profile.role === "editor")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreatePayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;

    if (!isAdmin) {
      const allowedPersonIds = await resolveEditorPersonIds(supabase, clientSlug, profile);
      if (allowedPersonIds.length === 0) {
        return NextResponse.json(
          { error: "Unable to resolve your owner profile for this client." },
          { status: 403 },
        );
      }
      const hasInvalidOwner = parsed.entries.some(
        (entry) => !allowedPersonIds.includes(entry.personId),
      );
      if (hasInvalidOwner) {
        return NextResponse.json(
          { error: "Editors can only create entries for their own owner." },
          { status: 403 },
        );
      }
    }

    const personIds = Array.from(
      new Set(parsed.entries.map((entry) => entry.personId)),
    );
    const peopleMap = await loadPeopleMap(supabase, clientSlug, personIds);

    const payload = parsed.entries.map((entry) => {
      const displayName = peopleMap.get(entry.personId);
      if (!displayName) {
        throw new Error(`Person not found for id ${entry.personId}`);
      }
      const hours = computeHours(entry.unit, entry.value);
      return {
        client_slug: clientSlug,
        effort_date: entry.effortDate,
        person_id: entry.personId,
        owner: displayName,
        workstream: entry.workstream.trim(),
        input_unit: entry.unit,
        input_value: entry.value,
        hours,
        comments: entry.comments ? entry.comments.trim() : null,
        created_by: profile.userId,
      };
    });

    const { data, error } = await supabase
      .from("crm_manual_efforts")
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
        clientSlug: row.client_slug as string,
        effortDate: row.effort_date as string,
        personId: row.person_id as string,
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

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const url = new URL(request.url);
  const clientSlug = url.searchParams.get("client") || DEFAULT_CLIENT;

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const contentType = request.headers.get("content-type") || "";
    if (
      !contentType.includes("text/csv") &&
      !contentType.includes("application/octet-stream") &&
      !contentType.includes("multipart/form-data")
    ) {
      return NextResponse.json({ error: "CSV file expected" }, { status: 400 });
    }

    const csvText = await request.text();
    const firstLine = csvText.split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
    const records: Record<string, unknown>[] = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter,
    });

    const parseNum = (val: unknown): number | null => {
      if (val == null || val === "") return null;
      let s = String(val).trim();
      if (!s) return null;
      s = s.replace(/\s/g, "");
      s = s.replace(/[^\d,.\-]/g, "");
      if (!s) return null;
      const hasComma = s.includes(",");
      const hasDot = s.includes(".");
      if (hasComma && hasDot) {
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
          s = s.replace(/\./g, "").replace(",", ".");
        } else {
          s = s.replace(/,/g, "");
        }
      } else if (hasComma) {
        s = s.replace(",", ".");
      }
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    const normalizeDate = (val: unknown): string | null => {
      if (!val) return null;
      const raw = String(val).trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const m = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/.exec(raw);
      if (m) {
        const [, dd, mm, yyyy] = m;
        return `${yyyy}-${mm}-${dd}`;
      }
      const d = new Date(raw);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };

    const getCI = (row: Record<string, unknown>, key: string): string => {
      const target = key.trim().toLowerCase();
      for (const k of Object.keys(row)) {
        if (k.trim().toLowerCase() === target) {
          const v = row[k];
          return v == null ? "" : String(v);
        }
      }
      return "";
    };

    const getValue = (row: Record<string, unknown>, keys: string[]) => {
      for (const key of keys) {
        const v = getCI(row, key);
        if (v != null && String(v).trim() !== "") return v;
      }
      return "";
    };

    const { data: aliasRows, error: aliasError } = await supabase
      .from("crm_people_aliases")
      .select("alias, person_id")
      .eq("client_slug", clientSlug);
    if (aliasError) {
      return NextResponse.json({ error: aliasError.message }, { status: 500 });
    }
    const aliasMap = new Map<string, string>();
    (aliasRows ?? []).forEach((row: { alias?: string | null; person_id?: string | null }) => {
      if (!row?.alias || !row?.person_id) return;
      aliasMap.set(normalizeKey(row.alias), String(row.person_id));
    });

    let skipped = 0;
    const normalized: Array<{
      effortDate: string;
      personId: string;
      workstream: string;
      unit: "hours" | "days";
      value: number;
      hours: number;
      comments: string | null;
    }> = [];

    records.forEach((row) => {
      const effortDate = normalizeDate(getValue(row, ["date", "effort_date", "effortDate"]));
      const ownerRaw = getValue(row, ["owner", "person"]);
      const personIdRaw = getValue(row, ["person_id", "personId"]);
      const workstream = getValue(row, ["workstream", "scope"]);
      const hoursVal = parseNum(getValue(row, ["hours", "work_hours", "workHours"]));
      const daysVal = parseNum(getValue(row, ["days", "work_days", "workDays"]));
      const unitRaw = getValue(row, ["unit", "input_unit"]);
      const valueRaw = parseNum(getValue(row, ["value", "input_value"]));
      const comments = getValue(row, ["comments", "comment", "notes", "note"]);

      const resolvedPersonId = (() => {
        if (personIdRaw && isUuid(personIdRaw)) return personIdRaw;
        if (ownerRaw) {
          return aliasMap.get(normalizeKey(ownerRaw)) ?? "";
        }
        return "";
      })();

      let unit: "hours" | "days" | null = null;
      let value: number | null = null;
      if (hoursVal != null && hoursVal > 0) {
        unit = "hours";
        value = hoursVal;
      } else if (daysVal != null && daysVal > 0) {
        unit = "days";
        value = daysVal;
      } else if (unitRaw && valueRaw != null && valueRaw > 0) {
        const unitKey = String(unitRaw).trim().toLowerCase();
        unit = unitKey.startsWith("d") ? "days" : "hours";
        value = valueRaw;
      }

      if (!effortDate || !resolvedPersonId || !workstream || !unit || value == null) {
        skipped += 1;
        return;
      }

      const hours = unit === "days" ? value * 7 : value;
      normalized.push({
        effortDate,
        personId: resolvedPersonId,
        workstream: String(workstream).trim(),
        unit,
        value,
        hours,
        comments: comments ? String(comments).trim() : null,
      });
    });

    if (normalized.length === 0) {
      return NextResponse.json({ error: "No valid rows found" }, { status: 400 });
    }

    const personIds = Array.from(new Set(normalized.map((row) => row.personId)));
    const peopleMap = await loadPeopleMap(supabase, clientSlug, personIds);

    const cleaned = normalized.filter((row) => peopleMap.has(row.personId));
    skipped += normalized.length - cleaned.length;

    if (cleaned.length === 0) {
      return NextResponse.json({ error: "No valid rows after person mapping" }, { status: 400 });
    }

    const { data: workstreamRows, error: workstreamError } = await supabase
      .from("crm_catalog_items")
      .select("label")
      .eq("client_slug", clientSlug)
      .eq("kind", "workstream")
      .eq("is_active", true);
    if (workstreamError) {
      return NextResponse.json({ error: workstreamError.message }, { status: 500 });
    }
    const existingWorkstreams = new Set(
      (workstreamRows ?? []).map((row: { label?: string | null }) =>
        normalizeKey(row.label),
      ),
    );
    const missingWorkstreams = Array.from(
      new Set(cleaned.map((row) => row.workstream.trim()).filter(Boolean)),
    ).filter((label) => !existingWorkstreams.has(normalizeKey(label)));

    if (missingWorkstreams.length > 0) {
      const { error: insertWorkstreamError } = await supabase
        .from("crm_catalog_items")
        .insert(
          missingWorkstreams.map((label) => ({
            client_slug: clientSlug,
            kind: "workstream",
            label,
            created_by: userId,
          })),
        );
      if (insertWorkstreamError) {
        return NextResponse.json({ error: insertWorkstreamError.message }, { status: 500 });
      }
    }

    const payload = cleaned.map((row) => ({
      client_slug: clientSlug,
      effort_date: row.effortDate,
      person_id: row.personId,
      owner: peopleMap.get(row.personId) ?? "",
      workstream: row.workstream,
      input_unit: row.unit,
      input_value: row.value,
      hours: row.hours,
      comments: row.comments,
      created_by: userId,
    }));

    const { error: insertError } = await supabase
      .from("crm_manual_efforts")
      .insert(payload);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ imported: payload.length, skipped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const auth = await requireAuthProfile(supabase);
    if ("error" in auth) return auth.error;
    const profile = auth.profile;
    const isAdmin = profile.role === "admin";
    if (!(isAdmin || profile.role === "editor")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = UpdatePayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const allowedPersonIds = isAdmin
      ? []
      : await resolveEditorPersonIds(supabase, clientSlug, profile);

    const updates: Record<string, unknown> = {};
    if (parsed.effortDate) updates.effort_date = parsed.effortDate;
    if (parsed.workstream) updates.workstream = parsed.workstream.trim();
    if (parsed.comments !== undefined) {
      updates.comments = parsed.comments ? parsed.comments.trim() : null;
    }
    if (parsed.unit || parsed.value !== undefined) {
      const { data: existing, error: existingError } = await supabase
        .from("crm_manual_efforts")
        .select("input_unit, input_value")
        .eq("id", parsed.id)
        .eq("client_slug", clientSlug)
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }
      const unit = (parsed.unit ?? existing?.input_unit) as "hours" | "days";
      const value =
        parsed.value !== undefined ? parsed.value : Number(existing?.input_value ?? 0);
      updates.input_unit = unit;
      updates.input_value = value;
      updates.hours = computeHours(unit, Number(value));
    }

    if (parsed.personId) {
      if (!isAdmin && !allowedPersonIds.includes(parsed.personId)) {
        return NextResponse.json(
          { error: "Editors can only assign their own owner." },
          { status: 403 },
        );
      }
      const peopleMap = await loadPeopleMap(supabase, clientSlug, [parsed.personId]);
      const displayName = peopleMap.get(parsed.personId);
      if (!displayName) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
      updates.person_id = parsed.personId;
      updates.owner = displayName;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crm_manual_efforts")
      .select("*")
      .eq("id", parsed.id)
      .eq("client_slug", clientSlug)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    if (
      !isAdmin &&
      !allowedPersonIds.includes(String(data.person_id ?? "")) &&
      String(data.created_by ?? "") !== profile.userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("crm_manual_efforts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", parsed.id)
      .eq("client_slug", clientSlug)
      .select("*")
      .single();
    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || "Update failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      row: {
        id: updated.id as string,
        clientSlug: updated.client_slug as string,
        effortDate: updated.effort_date as string,
        personId: updated.person_id as string,
        owner: updated.owner as string,
        workstream: updated.workstream as string,
        inputUnit: updated.input_unit as "hours" | "days",
        inputValue: Number(updated.input_value ?? 0),
        hours: Number(updated.hours ?? 0),
        comments: (updated.comments as string | null) ?? null,
        createdAt: updated.created_at as string,
        updatedAt: updated.updated_at as string,
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
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const clientSlug = searchParams.get("client") || DEFAULT_CLIENT;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const auth = await requireAuthProfile(supabase);
    if ("error" in auth) return auth.error;
    const profile = auth.profile;
    const isAdmin = profile.role === "admin";

    const { data: existing, error: existingError } = await supabase
      .from("crm_manual_efforts")
      .select("person_id,created_by,client_slug")
      .eq("id", id)
      .eq("client_slug", clientSlug)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (!isAdmin) {
      const allowedPersonIds = await resolveEditorPersonIds(supabase, clientSlug, profile);
      const canDelete =
        allowedPersonIds.includes(String(existing.person_id ?? "")) ||
        String(existing.created_by ?? "") === profile.userId;
      if (!canDelete) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from("crm_manual_efforts")
      .delete()
      .eq("id", id)
      .eq("client_slug", clientSlug);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
