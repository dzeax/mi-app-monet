import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { computeHoursForUnit } from "@/lib/crm/timeProfiles";

const DEFAULT_CLIENT = "emg";
export const runtime = "nodejs";

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
  return raw;
};

const parseNum = (val: unknown, fallback: number) => {
  if (val == null || val === "") return fallback;
  const n = Number(String(val).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const toInt = (val: unknown): number | null => {
  if (val == null || val === "") return null;
  const n = Number(String(val));
  return Number.isInteger(n) ? n : null;
};

const GeneratePayloadZ = z.object({
  client: z.string().optional(),
  jiraTicket: z.string().min(1),
  campaignName: z.string().min(1),
  brand: z.string().min(1),
  scope: z.string().min(1),
  status: z.string().min(1),
  owner: z.string().min(1),
  sendDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sendDate must be yyyy-mm-dd"),
  markets: z.array(z.string().min(1)).nonempty(),
  segments: z.array(z.string().min(1)).optional(),
  touchpoints: z.array(z.string().min(1)).nonempty(),
  variants: z.array(z.string().min(1)).optional(),
  profileKey: z.string().min(1),
  touchpointDates: z
    .record(z.string().min(1), z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
});

type EffortRule = {
  id?: string;
  priority: number;
  brand: string | null;
  scope: string | null;
  touchpoint: string | null;
  markets: string[] | null;
  hours_master_template: number;
  hours_translations: number;
  hours_copywriting: number;
  hours_assets: number;
  hours_revisions: number;
  hours_build: number;
  hours_prep: number;
  active: boolean;
};

type CampaignUnitInsert = {
  client_slug: string;
  week: number | null;
  year: number | null;
  campaign_name: string;
  brand: string;
  send_date: string;
  market: string;
  scope: string;
  segment: string | null;
  touchpoint: string;
  variant: string;
  owner: string;
  jira_ticket: string;
  status: string;
  hours_master_template: number;
  hours_translations: number;
  hours_copywriting: number;
  hours_assets: number;
  hours_revisions: number;
  hours_build: number;
  hours_prep: number;
  created_by?: string;
};

const sumHours = (rule: EffortRule) =>
  (rule.hours_master_template ?? 0) +
  (rule.hours_translations ?? 0) +
  (rule.hours_copywriting ?? 0) +
  (rule.hours_assets ?? 0) +
  (rule.hours_revisions ?? 0) +
  (rule.hours_build ?? 0) +
  (rule.hours_prep ?? 0);

const ruleSpecificity = (rule: EffortRule) => {
  let score = 0;
  if (rule.brand) score += 2;
  if (rule.scope) score += 2;
  if (rule.touchpoint) score += 2;
  if (rule.markets && rule.markets.length) score += 3;
  return score;
};

const toList = (val: unknown): string[] => {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (val == null) return [];
  return String(val)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

const ruleMatches = (
  rule: EffortRule,
  unit: { brand: string; scope: string; touchpoint: string; market: string },
) => {
  if (!rule.active) return false;
  if (rule.brand && rule.brand !== unit.brand) return false;
  if (rule.scope && rule.scope !== unit.scope) return false;
  const ruleTouchpoints = toList(rule.touchpoint);
  if (ruleTouchpoints.length && !ruleTouchpoints.includes(unit.touchpoint)) return false;
  const ruleMarkets = rule.markets ? toList(rule.markets) : [];
  if (ruleMarkets.length && !ruleMarkets.includes(unit.market)) return false;
  return true;
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const from = normalizeDate(searchParams.get("from"));
  const to = normalizeDate(searchParams.get("to"));
  const owner = searchParams.get("owner");
  const brand = searchParams.get("brand");
  const market = searchParams.get("market");
  const segment = searchParams.get("segment");
  const touchpoint = searchParams.get("touchpoint");
  const status = searchParams.get("status");

  try {
    // Pagination loop to bypass PostgREST row limits
    const chunkSize = 1000;
    let offset = 0;
    const all: CampaignUnitInsert[] = [];

    const buildBase = () => {
      let q = supabase
        .from("campaign_email_units")
        .select("*")
        .eq("client_slug", client)
        .order("send_date", { ascending: false });
      if (from) q = q.gte("send_date", from);
      if (to) q = q.lte("send_date", to);
      if (owner) q = q.eq("owner", owner);
      if (brand) q = q.eq("brand", brand);
      if (market) q = q.eq("market", market);
      if (segment) q = q.eq("segment", segment);
      if (touchpoint) q = q.eq("touchpoint", touchpoint);
      if (status) q = q.eq("status", status);
      return q;
    };

    while (true) {
      const { data, error } = await buildBase().range(offset, offset + chunkSize - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const batch = data ?? [];
      all.push(...batch);
      if (batch.length < chunkSize) break;
      offset += chunkSize;
      // hard cap to avoid runaway; adjust if needed
      if (offset > 10000) break;
    }

    const rows = all.map((r) => ({
      id: r.id,
      clientSlug: r.client_slug,
      week: r.week,
      year: r.year,
      campaignName: r.campaign_name || "",
      brand: r.brand,
      sendDate: r.send_date,
      market: r.market,
      scope: r.scope,
      segment: r.segment,
      touchpoint: r.touchpoint,
      variant: r.variant || "",
      owner: r.owner,
      jiraTicket: r.jira_ticket,
      status: r.status,
      hoursMasterTemplate: Number(r.hours_master_template ?? 0),
      hoursTranslations: Number(r.hours_translations ?? 0),
      hoursCopywriting: Number(r.hours_copywriting ?? 0),
      hoursAssets: Number(r.hours_assets ?? 0),
      hoursRevisions: Number(r.hours_revisions ?? 0),
      hoursBuild: Number(r.hours_build ?? 0),
      hoursPrep: Number(r.hours_prep ?? 0),
      hoursTotal: Number(r.hours_total ?? 0),
      daysTotal: Number(r.days_total ?? 0),
      budgetEur: r.budget_eur != null ? Number(r.budget_eur) : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const fetchEffortRules = async (clientSlug: string): Promise<EffortRule[]> => {
      const { data, error } = await supabase
        .from("crm_effort_rules")
        .select("*")
        .eq("client_slug", clientSlug)
        .eq("active", true)
      .order("priority", { ascending: true });
    if (error) {
      // Do not break generation; fallback to base profile.
      console.error("Failed to load effort rules", error.message);
      return [];
    }
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      priority: Number(r.priority ?? 100),
      brand: r.brand ?? null,
      scope: r.scope ?? null,
      touchpoint: r.touchpoint ?? null,
      markets: Array.isArray(r.markets) ? r.markets : toList(r.markets),
      hours_master_template: Number(r.hours_master_template ?? 0),
      hours_translations: Number(r.hours_translations ?? 0),
      hours_copywriting: Number(r.hours_copywriting ?? 0),
      hours_assets: Number(r.hours_assets ?? 0),
      hours_revisions: Number(r.hours_revisions ?? 0),
      hours_build: Number(r.hours_build ?? 0),
      hours_prep: Number(r.hours_prep ?? 0),
      active: r.active ?? true,
    }));
  };

  try {
    const body = await request.json();
    const parsed = GeneratePayloadZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const markets = Array.from(
      new Set(parsed.markets.map((m) => m.trim()).filter(Boolean)),
    );
    const touchpoints = Array.from(
      new Set(parsed.touchpoints.map((t) => t.trim()).filter(Boolean)),
    );
    const touchpointDateMap = Object.fromEntries(
      Object.entries(parsed.touchpointDates ?? {}).map(([key, val]) => [
        key.trim(),
        val,
      ]),
    );
    const segments = Array.from(
      new Set((parsed.segments ?? []).map((s) => s.trim()).filter(Boolean)),
    );
    const variants = Array.from(
      new Set((parsed.variants ?? []).map((v) => v.trim()).filter(Boolean)),
    );

    if (!markets.length || !touchpoints.length) {
      return NextResponse.json(
        { error: "At least one market and one touchpoint are required" },
        { status: 400 },
      );
    }

    const effortRules = await fetchEffortRules(clientSlug);

    const effectiveSegments = segments.length > 0 ? segments : [""];
    const effectiveVariants = variants.length > 0 ? variants : ["A"];

    const pickRule = (touchpoint: string, market: string) => {
      const matched = effortRules
        .filter((r) =>
          ruleMatches(r, {
            brand: parsed.brand,
            scope: parsed.scope,
            touchpoint,
            market,
          }),
        )
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return ruleSpecificity(b) - ruleSpecificity(a);
        });
      return matched.length ? matched[0] : null;
    };

    const rows: CampaignUnitInsert[] = [];
    const seen = new Set<string>();

    markets.forEach((market) => {
      effectiveSegments.forEach((segment) => {
        touchpoints.forEach((touchpoint) => {
          effectiveVariants.forEach((variant) => {
            const resolvedDate = touchpointDateMap[touchpoint] || parsed.sendDate;
            const key = [
              clientSlug,
              parsed.jiraTicket,
              resolvedDate,
              market,
              segment || "",
              touchpoint,
              variant || "",
              parsed.owner,
            ].join("|");
            if (seen.has(key)) return;
            seen.add(key);
            const matchedRule = pickRule(touchpoint, market);
            const hours =
              matchedRule && sumHours(matchedRule) > 0
                ? {
                    hours_master_template: matchedRule.hours_master_template ?? 0,
                    hours_translations: matchedRule.hours_translations ?? 0,
                    hours_copywriting: matchedRule.hours_copywriting ?? 0,
                    hours_assets: matchedRule.hours_assets ?? 0,
                    hours_revisions: matchedRule.hours_revisions ?? 0,
                    hours_build: matchedRule.hours_build ?? 0,
                    hours_prep: matchedRule.hours_prep ?? 0,
                  }
                : computeHoursForUnit(parsed.profileKey, touchpoint, variant || "A");
            rows.push({
              client_slug: clientSlug,
              week: null,
              year: Number(resolvedDate.slice(0, 4)),
              campaign_name: parsed.campaignName,
              brand: parsed.brand,
              send_date: resolvedDate,
              market,
              scope: parsed.scope,
              segment: segment || null,
              touchpoint,
              variant: variant || "",
              owner: parsed.owner,
              jira_ticket: parsed.jiraTicket,
              status: parsed.status,
              hours_master_template: hours.hours_master_template,
              hours_translations: hours.hours_translations,
              hours_copywriting: hours.hours_copywriting,
              hours_assets: hours.hours_assets,
              hours_revisions: hours.hours_revisions,
              hours_build: hours.hours_build,
              hours_prep: hours.hours_prep,
              created_by: userId,
            });
          });
        });
      });
    });

    if (!rows.length) {
      return NextResponse.json(
        { error: "No rows to generate" },
        { status: 400 },
      );
    }

    const chunkSize = 500;
    let imported = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const batch = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("campaign_email_units")
        .upsert(batch, {
          onConflict:
            "client_slug,jira_ticket,send_date,market,segment,touchpoint,variant,owner",
        });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      imported += batch.length;
    }

    return NextResponse.json({ imported });
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

    const normalized = records.map((r) => {
      const sendDate = normalizeDate(r.send_date || r.sending_date || r.date);
      const week = toInt(r.week);
      const year = toInt(r.year) || (sendDate ? Number(sendDate.slice(0, 4)) : null);
      const owner = String(r.owner || r.in_charge || "").trim();
      const jira = String(r.jira_ticket || r.ticket || r.jira || "").trim();
      const brand = String(r.brand || "").trim();
      const market = String(r.market || "").trim();
      const campaignName = String(
        r.campaign_name || r.campaign || r.title || ""
      ).trim();
      const variant = String(r.variant || r.test || r.ab_group || "").trim();
      return {
        client_slug: clientSlug,
        week,
        year,
        campaign_name: campaignName,
        brand,
        send_date: sendDate,
        market,
        scope: (r.scope || r.level || "Global").toString().trim() || "Global",
        segment: r.segment ? String(r.segment).trim() : null,
        touchpoint: r.touchpoint ? String(r.touchpoint).trim() : null,
        variant,
        owner,
        jira_ticket: jira,
        status: (r.status || "Planned").toString().trim() || "Planned",
        hours_master_template: parseNum(r.hours_master_template ?? r.time_master_template, 0),
        hours_translations: parseNum(r.hours_translations ?? r.time_translations, 0),
        hours_copywriting: parseNum(r.hours_copywriting ?? r.time_copywriting, 0),
        hours_assets: parseNum(r.hours_assets ?? r.time_image_resize ?? r.time_assets, 0),
        hours_revisions: parseNum(r.hours_revisions ?? r.time_revisions, 0),
        hours_build: parseNum(r.hours_build ?? r.time_de_jb ?? r.time_build, 0),
        hours_prep: parseNum(
          r.hours_prep ?? r.hours_meetings ?? r.time_meetings,
          0
        ),
      };
    });

    const cleaned = normalized.filter(
      (row) =>
        row.send_date &&
        row.jira_ticket &&
        row.owner &&
        row.brand &&
        row.market,
    );

    // Deduplicate rows by the natural key to avoid "ON CONFLICT ... cannot affect row a second time"
    const byKey = new Map<string, CampaignUnitInsert>();
    for (const row of cleaned) {
      const key = [
        row.client_slug,
        row.jira_ticket,
        row.send_date,
        row.market,
        row.segment || "",
        row.touchpoint || "",
        row.variant || "",
        row.owner || "",
      ].join("|");
      byKey.set(key, row);
    }

    const deduped = Array.from(byKey.values());

    if (deduped.length === 0) {
      return NextResponse.json({ error: "No valid rows found" }, { status: 400 });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = deduped.map((row) => ({
      ...row,
      created_by: userId,
    }));

    // Supabase limita inserts/upserts masivos; hacemos batches
    const chunkSize = 500;
    let imported = 0;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const batch = payload.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("campaign_email_units")
        .upsert(batch, {
          onConflict: "client_slug,jira_ticket,send_date,market,segment,touchpoint,variant,owner",
        });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      imported += batch.length;
    }

    return NextResponse.json({ imported });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  try {
    const body = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    const client = body?.client || DEFAULT_CLIENT;

    if (!ids.length) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    const { error } = await supabase
      .from("campaign_email_units")
      .delete()
      .in("id", ids)
      .eq("client_slug", client);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: ids.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
