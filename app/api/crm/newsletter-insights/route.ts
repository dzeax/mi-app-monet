import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { parse } from "csv-parse/sync";

const DEFAULT_CLIENT = "emg";
const PAGE_SIZE = 1000;

type UnitRow = {
  id: string;
  client_slug: string;
  campaign_name: string;
  send_date: string | null;
  market: string;
  segment: string | null;
  touchpoint: string | null;
  variant: string;
  owner: string;
  sfmc_tracking: string | null;
  status: string;
};

type KpiRow = {
  unit_id: string;
  deliveries: number | null;
  open_rate: number | null;
  ctr: number | null;
  total_clicks: number | null;
  unique_clicks: number | null;
  unsubs: number | null;
  revenue: number | null;
  updated_at: string | null;
};

type HeatmapRow = {
  id: string;
  unit_id: string;
  status: string;
  request_date: string | null;
  days_since_sent: number | null;
  summary_visual_click_rate: number | null;
  summary_cta_click_rate: number | null;
  click_alerts: string | null;
  updated_at: string | null;
};

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeDate = (val: unknown): string | null => {
  if (val == null) return null;
  const raw = String(val).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/.exec(raw);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
};

const parseNumericCore = (raw: string): number | null => {
  const compact = raw.replace(/\s+/g, "");
  if (!compact) return null;
  let cleaned = compact;
  const commaPos = cleaned.lastIndexOf(",");
  const dotPos = cleaned.lastIndexOf(".");
  if (commaPos >= 0 && dotPos >= 0) {
    if (commaPos > dotPos) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (commaPos >= 0 && dotPos < 0) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const toNumber = (val: unknown): number | null => {
  if (val == null) return null;
  const raw = String(val).trim();
  if (!raw) return null;
  if (["no result", "n/a", "na", "null", "/", "-", "--"].includes(raw.toLowerCase())) return null;
  return parseNumericCore(raw.replace("%", ""));
};

const toRate = (val: unknown): number | null => {
  if (val == null) return null;
  const raw = String(val).trim();
  if (!raw) return null;
  if (["no result", "n/a", "na", "null", "/", "-", "--"].includes(raw.toLowerCase())) return null;
  const hasPercent = raw.includes("%");
  const parsed = parseNumericCore(raw.replace("%", ""));
  if (parsed == null) return null;
  return hasPercent ? parsed / 100 : parsed;
};

const normalizeRow = (row: Record<string, unknown>) => {
  const out: Record<string, string> = {};
  Object.entries(row).forEach(([key, value]) => {
    out[normalizeHeader(key)] = value == null ? "" : String(value).trim();
  });
  return out;
};

const getField = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const value = row[normalizedKey];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

const toHeatmapStatus = (raw: string) => {
  const key = raw.trim().toLowerCase();
  if (!key) return "not_requested";
  if (key.includes("completed")) return "completed";
  if (key.includes("request")) return "request_submitted";
  if (key.includes("submitted")) return "request_submitted";
  if (key.includes("fail")) return "failed";
  return "not_requested";
};

const fetchPaged = async <T,>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) => {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = Array.isArray(data) ? data : [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 10000) break;
  }
  return all;
};

const chunk = <T,>(items: T[], size = 500) => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

const getAuthContext = async (supabase: ReturnType<typeof createRouteHandlerClient>) => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("role,is_active")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  const appUserRow = (appUser ?? null) as { role?: string | null; is_active?: boolean | null } | null;
  if (appUserError) {
    return { error: NextResponse.json({ error: appUserError.message }, { status: 500 }) };
  }
  if (!appUserRow || appUserRow.is_active === false) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const role = String(appUserRow.role ?? "").toLowerCase();
  return { userId: authData.user.id, role };
};

const parseCsvPayload = (text: string): Record<string, string>[] => {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const parsed: Record<string, unknown>[] = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
  });
  return parsed.map(normalizeRow);
};

const fetchUnitsByTracking = async (
  supabase: ReturnType<typeof createRouteHandlerClient>,
  clientSlug: string,
  trackings: string[],
) => {
  const map = new Map<string, UnitRow>();
  const unique = Array.from(new Set(trackings.map((tracking) => tracking.trim()).filter(Boolean)));
  for (const batch of chunk(unique, 200)) {
    const { data, error } = await supabase
      .from("campaign_email_units")
      .select("id,client_slug,campaign_name,send_date,market,segment,touchpoint,variant,owner,sfmc_tracking,status")
      .eq("client_slug", clientSlug)
      .in("sfmc_tracking", batch);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((row) => {
      const tracking = String((row as UnitRow).sfmc_tracking ?? "").trim();
      if (!tracking) return;
      map.set(tracking, row as UnitRow);
    });
  }
  return map;
};

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const from = normalizeDate(searchParams.get("from"));
  const to = normalizeDate(searchParams.get("to"));
  const market = searchParams.get("market");
  const segment = searchParams.get("segment");
  const touchpoint = searchParams.get("touchpoint");
  const owner = searchParams.get("owner");
  const status = searchParams.get("status");
  const hasTracking = searchParams.get("hasTracking");
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const unitId = searchParams.get("unitId");

  try {
    if (unitId) {
      const { data: sections, error } = await supabase
        .from("campaign_email_unit_heatmap_sections")
        .select(
          "id,unit_id,section_key,section_type,section_position,visual_click_rate,cta_click_rate,click_alerts,updated_at",
        )
        .eq("client_slug", client)
        .eq("unit_id", unitId)
        .order("section_key", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ sections: sections ?? [] });
    }

    const buildBase = () => {
      let query = supabase
        .from("campaign_email_units")
        .select(
          "id,client_slug,campaign_name,send_date,market,segment,touchpoint,variant,owner,sfmc_tracking,status",
        )
        .eq("client_slug", client)
        .order("send_date", { ascending: false });
      if (from) query = query.gte("send_date", from);
      if (to) query = query.lte("send_date", to);
      if (market) query = query.eq("market", market);
      if (segment) query = query.eq("segment", segment);
      if (touchpoint) query = query.eq("touchpoint", touchpoint);
      if (owner) query = query.eq("owner", owner);
      if (status) query = query.eq("status", status);
      if (hasTracking === "true") query = query.not("sfmc_tracking", "is", null);
      if (hasTracking === "false") query = query.is("sfmc_tracking", null);
      return query;
    };

    const allUnits = await fetchPaged<UnitRow>((rangeFrom, rangeTo) =>
      buildBase().range(rangeFrom, rangeTo),
    );
    const units = search
      ? allUnits.filter((row) =>
          [
            row.campaign_name,
            row.sfmc_tracking ?? "",
            row.market,
            row.segment ?? "",
            row.touchpoint ?? "",
            row.owner,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search),
        )
      : allUnits;

    const ids = units.map((row) => row.id);
    const kpiByUnit = new Map<string, KpiRow>();
    const heatmapByUnit = new Map<string, HeatmapRow>();
    const sectionCountByUnit = new Map<string, number>();

    for (const batch of chunk(ids, 400)) {
      const [{ data: kpis, error: kpiError }, { data: heatmaps, error: heatmapError }, { data: sections, error: sectionError }] =
        await Promise.all([
          supabase
            .from("campaign_email_unit_kpis")
            .select(
              "unit_id,deliveries,open_rate,ctr,total_clicks,unique_clicks,unsubs,revenue,updated_at",
            )
            .in("unit_id", batch),
          supabase
            .from("campaign_email_unit_heatmap")
            .select(
              "id,unit_id,status,request_date,days_since_sent,summary_visual_click_rate,summary_cta_click_rate,click_alerts,updated_at",
            )
            .in("unit_id", batch),
          supabase
            .from("campaign_email_unit_heatmap_sections")
            .select("unit_id")
            .in("unit_id", batch),
        ]);
      if (kpiError) return NextResponse.json({ error: kpiError.message }, { status: 500 });
      if (heatmapError) return NextResponse.json({ error: heatmapError.message }, { status: 500 });
      if (sectionError) return NextResponse.json({ error: sectionError.message }, { status: 500 });
      (kpis ?? []).forEach((row) => kpiByUnit.set((row as KpiRow).unit_id, row as KpiRow));
      (heatmaps ?? []).forEach((row) => heatmapByUnit.set((row as HeatmapRow).unit_id, row as HeatmapRow));
      (sections ?? []).forEach((row) => {
        const key = String((row as { unit_id?: string }).unit_id ?? "");
        if (!key) return;
        sectionCountByUnit.set(key, (sectionCountByUnit.get(key) ?? 0) + 1);
      });
    }

    const rows = units.map((unit) => {
      const kpi = kpiByUnit.get(unit.id) ?? null;
      const heatmap = heatmapByUnit.get(unit.id) ?? null;
      return {
        id: unit.id,
        clientSlug: unit.client_slug,
        campaignName: unit.campaign_name,
        sendDate: unit.send_date,
        market: unit.market,
        segment: unit.segment,
        touchpoint: unit.touchpoint,
        variant: unit.variant,
        owner: unit.owner,
        status: unit.status,
        sfmcTracking: unit.sfmc_tracking,
        hasTracking: Boolean(unit.sfmc_tracking && unit.sfmc_tracking.trim()),
        kpi: kpi
          ? {
              deliveries: kpi.deliveries,
              openRate: kpi.open_rate,
              ctr: kpi.ctr,
              totalClicks: kpi.total_clicks,
              uniqueClicks: kpi.unique_clicks,
              unsubs: kpi.unsubs,
              revenue: kpi.revenue,
              updatedAt: kpi.updated_at,
            }
          : null,
        heatmap: heatmap
          ? {
              status: heatmap.status,
              requestDate: heatmap.request_date,
              daysSinceSent: heatmap.days_since_sent,
              summaryVisualClickRate: heatmap.summary_visual_click_rate,
              summaryCtaClickRate: heatmap.summary_cta_click_rate,
              clickAlerts: heatmap.click_alerts,
              updatedAt: heatmap.updated_at,
              sectionCount: sectionCountByUnit.get(unit.id) ?? 0,
            }
          : null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get("client") || DEFAULT_CLIENT;
  const dataset = (searchParams.get("dataset") || "").trim().toLowerCase();

  try {
    const auth = await getAuthContext(supabase);
    if ("error" in auth) return auth.error;
    if (!["admin", "editor"].includes(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!dataset) {
      return NextResponse.json(
        { error: "dataset query param is required (global-kpis|heatmap-requests|section-kpis)" },
        { status: 400 },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (
      !contentType.includes("text/csv") &&
      !contentType.includes("application/octet-stream") &&
      !contentType.includes("multipart/form-data")
    ) {
      return NextResponse.json({ error: "CSV file expected" }, { status: 400 });
    }

    const text = await request.text();
    const records = parseCsvPayload(text);
    if (!records.length) {
      return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
    }

    const trackings = records
      .map((row) => getField(row, ["tracking", "sfmc_tracking"]))
      .map((value) => value.trim())
      .filter(Boolean);
    const unitByTracking = await fetchUnitsByTracking(supabase, client, trackings);

    let imported = 0;
    let skipped = 0;
    const warnings: string[] = [];

    if (dataset === "global-kpis") {
      const payload = records.flatMap((row) => {
        const tracking = getField(row, ["tracking", "sfmc_tracking"]).trim();
        if (!tracking) {
          skipped += 1;
          return [];
        }
        const unit = unitByTracking.get(tracking);
        if (!unit) {
          skipped += 1;
          warnings.push(`No unit linked to tracking: ${tracking}`);
          return [];
        }
        const deliveries = toNumber(getField(row, ["deliveries"]));
        const totalClicks = toNumber(getField(row, ["total_click", "total_clicks"]));
        const uniqueClicks = toNumber(getField(row, ["unique_click", "unique_clicks"]));
        return [
          {
            unit_id: unit.id,
            client_slug: client,
            sfmc_tracking: tracking,
            deliveries,
            open_rate: toRate(getField(row, ["open_rate"])),
            ctr: toRate(getField(row, ["ctr"])),
            total_clicks: totalClicks,
            unique_clicks: uniqueClicks,
            unsubs: toNumber(getField(row, ["unsub", "unsubs"])),
            revenue: toNumber(getField(row, ["revenue"])),
            notes: getField(row, ["comment"]),
            source: "csv_global_kpis",
            raw_payload: row,
            created_by: auth.userId,
          },
        ];
      });

      for (const batch of chunk(payload, 300)) {
        if (!batch.length) continue;
        const { error } = await supabase
          .from("campaign_email_unit_kpis")
          .upsert(batch, { onConflict: "unit_id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        imported += batch.length;
      }
      return NextResponse.json({ imported, skipped, warnings });
    }

    if (dataset === "heatmap-requests") {
      const payload = records.flatMap((row) => {
        const tracking = getField(row, ["tracking", "sfmc_tracking"]).trim();
        if (!tracking) {
          skipped += 1;
          return [];
        }
        const unit = unitByTracking.get(tracking);
        if (!unit) {
          skipped += 1;
          warnings.push(`No unit linked to tracking: ${tracking}`);
          return [];
        }
        return [
          {
            unit_id: unit.id,
            client_slug: client,
            sfmc_tracking: tracking,
            status: toHeatmapStatus(getField(row, ["status"])),
            request_date: normalizeDate(getField(row, ["date"])),
            days_since_sent: toNumber(getField(row, ["days_since_sent"])),
            comment: getField(row, ["comment"]),
            source: "csv_heatmap_requests",
            raw_payload: row,
            created_by: auth.userId,
          },
        ];
      });

      for (const batch of chunk(payload, 300)) {
        if (!batch.length) continue;
        const { error } = await supabase
          .from("campaign_email_unit_heatmap")
          .upsert(batch, { onConflict: "unit_id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        imported += batch.length;
      }
      return NextResponse.json({ imported, skipped, warnings });
    }

    if (dataset === "section-kpis") {
      const summaryByUnit = new Map<
        string,
        {
          unitId: string;
          tracking: string;
          summaryVisual: number | null;
          summaryCta: number | null;
          clickAlerts: string;
        }
      >();

      const sectionRows: Array<{
        unitId: string;
        tracking: string;
        sectionType: string;
        sectionPosition: string;
        sectionKey: string;
        visualClickRate: number | null;
        ctaClickRate: number | null;
        clickAlerts: string;
        raw: Record<string, string>;
      }> = [];

      records.forEach((row) => {
        const tracking = getField(row, ["tracking", "sfmc_tracking"]).trim();
        if (!tracking) {
          skipped += 1;
          return;
        }
        const unit = unitByTracking.get(tracking);
        if (!unit) {
          skipped += 1;
          warnings.push(`No unit linked to tracking: ${tracking}`);
          return;
        }

        const summaryVisual = toRate(
          getField(row, [
            "summary_visual_click_rate",
            "visual_click_rate_summary",
            "visual_click_rate",
          ]),
        );
        const summaryCta = toRate(
          getField(row, [
            "summary_cta_click_rate",
            "cta_click_rate_summary",
            "cta_click_rate",
          ]),
        );
        const clickAlerts = getField(row, ["click_alerts"]);
        summaryByUnit.set(unit.id, {
          unitId: unit.id,
          tracking,
          summaryVisual,
          summaryCta,
          clickAlerts,
        });

        const sectionType = getField(row, ["section_type", "insertion_bloc_type"]);
        const sectionPosition = getField(row, ["section_position"]);
        const sectionVisual = toRate(
          getField(row, [
            "section_visual_click_rate",
            "visual_click_rate2",
            "visual_click_rate_2",
            "visual_click_rate_1",
          ]),
        );
        const sectionCta = toRate(
          getField(row, [
            "section_cta_click_rate",
            "cta_click_rate2",
            "cta_click_rate_2",
          ]),
        );
        const sectionKey = `${sectionType.trim().toLowerCase()}|${sectionPosition.trim().toLowerCase()}`;
        if (!sectionType && sectionVisual == null && sectionCta == null && !clickAlerts) return;
        sectionRows.push({
          unitId: unit.id,
          tracking,
          sectionType,
          sectionPosition,
          sectionKey: sectionKey || "default",
          visualClickRate: sectionVisual,
          ctaClickRate: sectionCta,
          clickAlerts,
          raw: row,
        });
      });

      const heatmapUpserts = Array.from(summaryByUnit.values()).map((entry) => ({
        unit_id: entry.unitId,
        client_slug: client,
        sfmc_tracking: entry.tracking,
        status: "completed",
        summary_visual_click_rate: entry.summaryVisual,
        summary_cta_click_rate: entry.summaryCta,
        click_alerts: entry.clickAlerts || null,
        source: "csv_section_kpis",
        raw_payload: null,
        created_by: auth.userId,
      }));

      for (const batch of chunk(heatmapUpserts, 300)) {
        if (!batch.length) continue;
        const { error } = await supabase
          .from("campaign_email_unit_heatmap")
          .upsert(batch, { onConflict: "unit_id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const heatmapIdByUnit = new Map<string, string>();
      const relatedUnitIds = Array.from(summaryByUnit.keys());
      for (const batch of chunk(relatedUnitIds, 400)) {
        const { data, error } = await supabase
          .from("campaign_email_unit_heatmap")
          .select("id,unit_id")
          .in("unit_id", batch);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        (data ?? []).forEach((row) => {
          const unitId = String((row as { unit_id?: string }).unit_id ?? "");
          const id = String((row as { id?: string }).id ?? "");
          if (unitId && id) heatmapIdByUnit.set(unitId, id);
        });
      }

      const sectionUpserts = sectionRows.flatMap((row) => {
        const heatmapId = heatmapIdByUnit.get(row.unitId);
        if (!heatmapId) {
          skipped += 1;
          return [];
        }
        return [
          {
            heatmap_id: heatmapId,
            unit_id: row.unitId,
            client_slug: client,
            sfmc_tracking: row.tracking,
            section_key: row.sectionKey,
            section_type: row.sectionType || null,
            section_position: row.sectionPosition || null,
            visual_click_rate: row.visualClickRate,
            cta_click_rate: row.ctaClickRate,
            click_alerts: row.clickAlerts || null,
            source: "csv_section_kpis",
            raw_payload: row.raw,
          },
        ];
      });

      for (const batch of chunk(sectionUpserts, 300)) {
        if (!batch.length) continue;
        const { error } = await supabase
          .from("campaign_email_unit_heatmap_sections")
          .upsert(batch, { onConflict: "unit_id,section_key" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      imported = heatmapUpserts.length;
      return NextResponse.json({
        imported,
        sectionRowsImported: sectionUpserts.length,
        skipped,
        warnings,
      });
    }

    return NextResponse.json(
      { error: "Unsupported dataset. Use global-kpis, heatmap-requests, or section-kpis." },
      { status: 400 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
