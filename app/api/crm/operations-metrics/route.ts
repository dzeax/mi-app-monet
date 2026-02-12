import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { CRM_CLIENTS } from "@/lib/crm/clients";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;
const DEFAULT_CLIENT = "emg";

type ClientMetrics = {
  budgetTotal: number;
  spentTotal: number;
  remainingTotal: number;
  utilizationTotal: number;
  currency: string;
};

type BudgetRoleRow = {
  id: string;
  client_slug: string | null;
  pool_amount: number | null;
  currency: string | null;
};

type BudgetAdjustmentRow = {
  role_id: string | null;
  amount: number | null;
};

type OwnerRateRow = {
  client_slug: string | null;
  owner: string | null;
  person_id: string | null;
  daily_rate: number | null;
  currency: string | null;
};

type AliasRow = {
  client_slug: string | null;
  alias: string | null;
  person_id: string | null;
};

type ContributionRow = {
  client_slug: string | null;
  person_id: string | null;
  owner: string | null;
  work_hours: number | null;
  prep_hours: number | null;
};

type CampaignRow = {
  client_slug: string | null;
  person_id: string | null;
  owner: string | null;
  hours_total: number | null;
};

type ManualEffortRow = {
  client_slug: string | null;
  person_id: string | null;
  owner: string | null;
  hours: number | null;
};

type PagedQueryResult<T> = Promise<{
  data: T[] | null;
  error: { message: string } | null;
}>;

const parseYear = (value: string | null) => {
  const year = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(year) && year > 1900) return year;
  return new Date().getFullYear();
};

const parseClients = (raw: string | null) => {
  const available = new Set(CRM_CLIENTS.map((client) => client.slug));
  const requested =
    raw && raw.trim()
      ? raw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : CRM_CLIENTS.map((client) => client.slug);
  const unique = Array.from(new Set(requested));
  const valid = unique.filter((slug) => available.has(slug));
  return valid.length > 0 ? valid : [DEFAULT_CLIENT];
};

const stripDiacritics = (value: string) =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

const normalizeKey = (value?: string | null) =>
  stripDiacritics(String(value ?? ""))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const fetchPaged = async <T,>(buildQuery: (from: number, to: number) => PagedQueryResult<T>) => {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseYear(searchParams.get("year"));
  const clients = parseClients(searchParams.get("clients"));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  try {
    const [
      { data: rolesData, error: rolesError },
      { data: adjustmentsData, error: adjustmentsError },
      { data: ratesData, error: ratesError },
      { data: aliasData, error: aliasError },
    ] = await Promise.all([
      supabase
        .from("crm_budget_roles")
        .select("id, client_slug, pool_amount, currency")
        .eq("year", year)
        .in("client_slug", clients),
      supabase
        .from("crm_budget_adjustments")
        .select("role_id, amount, type")
        .eq("to_year", year)
        .eq("type", "carryover")
        .in("client_slug", clients),
      supabase
        .from("crm_owner_rates")
        .select("client_slug, owner, person_id, daily_rate, currency")
        .eq("year", year)
        .in("client_slug", clients),
      supabase
        .from("crm_people_aliases")
        .select("client_slug, alias, person_id")
        .in("client_slug", clients),
    ]);

    if (rolesError) throw new Error(rolesError.message);
    if (adjustmentsError) throw new Error(adjustmentsError.message);
    if (ratesError) throw new Error(ratesError.message);
    if (aliasError) throw new Error(aliasError.message);

    const [contribRows, campaignRows, manualRows] = await Promise.all([
      fetchPaged<ContributionRow>((from, to) =>
        supabase
          .from("crm_data_quality_contributions")
          .select("client_slug, person_id, owner, work_hours, prep_hours, effort_date")
          .in("client_slug", clients)
          .gte("effort_date", yearStart)
          .lte("effort_date", yearEnd)
          .order("effort_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchPaged<CampaignRow>((from, to) =>
        supabase
          .from("campaign_email_units")
          .select("client_slug, person_id, owner, hours_total, send_date")
          .in("client_slug", clients)
          .gte("send_date", yearStart)
          .lte("send_date", yearEnd)
          .order("send_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchPaged<ManualEffortRow>((from, to) =>
        supabase
          .from("crm_manual_efforts")
          .select("client_slug, person_id, owner, hours, effort_date")
          .in("client_slug", clients)
          .gte("effort_date", yearStart)
          .lte("effort_date", yearEnd)
          .order("effort_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);

    const metricsByClient: Record<string, ClientMetrics> = {};
    clients.forEach((slug) => {
      metricsByClient[slug] = {
        budgetTotal: 0,
        spentTotal: 0,
        remainingTotal: 0,
        utilizationTotal: 0,
        currency: "EUR",
      };
    });

    const roles = (rolesData ?? []) as BudgetRoleRow[];
    const adjustments = (adjustmentsData ?? []) as BudgetAdjustmentRow[];
    const rates = (ratesData ?? []) as OwnerRateRow[];
    const aliases = (aliasData ?? []) as AliasRow[];

    const roleClientById = new Map<string, string>();
    roles.forEach((row) => {
      const clientSlug = String(row.client_slug || "");
      if (!metricsByClient[clientSlug]) return;
      roleClientById.set(String(row.id), clientSlug);
      metricsByClient[clientSlug].budgetTotal += Number(row.pool_amount ?? 0);
      if (row.currency) metricsByClient[clientSlug].currency = String(row.currency);
    });

    adjustments.forEach((row) => {
      const roleId = String(row.role_id ?? "");
      const clientSlug = roleClientById.get(roleId);
      if (!clientSlug || !metricsByClient[clientSlug]) return;
      metricsByClient[clientSlug].budgetTotal += Number(row.amount ?? 0);
    });

    const aliasToPersonId = new Map<string, string>();
    aliases.forEach((row) => {
      const clientSlug = String(row.client_slug || "");
      const alias = normalizeKey(row.alias);
      const personId = row.person_id ? String(row.person_id) : "";
      if (!clientSlug || !alias || !personId) return;
      aliasToPersonId.set(`${clientSlug}|${alias}`, personId);
    });

    const rateByPerson = new Map<string, { dailyRate: number; currency: string }>();
    const rateByOwner = new Map<string, { dailyRate: number; currency: string }>();
    rates.forEach((row) => {
      const clientSlug = String(row.client_slug || "");
      if (!metricsByClient[clientSlug]) return;
      const dailyRate = Number(row.daily_rate ?? 0);
      const currency = String(row.currency || "EUR");
      if (row.person_id) {
        rateByPerson.set(`${clientSlug}|${row.person_id}`, { dailyRate, currency });
      }
      if (row.owner) {
        rateByOwner.set(`${clientSlug}|${normalizeKey(row.owner)}`, {
          dailyRate,
          currency,
        });
      }
    });

    const addSpend = (
      clientSlug: string,
      personId: string | null,
      owner: string | null,
      hours: number,
    ) => {
      if (!metricsByClient[clientSlug]) return;
      if (!Number.isFinite(hours) || hours <= 0) return;
      const ownerKey = normalizeKey(owner);
      const resolvedPersonId =
        personId || (ownerKey ? aliasToPersonId.get(`${clientSlug}|${ownerKey}`) ?? null : null);
      const rate =
        (resolvedPersonId
          ? rateByPerson.get(`${clientSlug}|${resolvedPersonId}`)
          : null) ||
        (ownerKey ? rateByOwner.get(`${clientSlug}|${ownerKey}`) : null);
      if (!rate || !Number.isFinite(rate.dailyRate) || rate.dailyRate <= 0) return;
      metricsByClient[clientSlug].spentTotal += (hours / 7) * rate.dailyRate;
      if (rate.currency) metricsByClient[clientSlug].currency = rate.currency;
    };

    contribRows.forEach((row) => {
      const clientSlug = String(row.client_slug || "");
      if (!metricsByClient[clientSlug]) return;
      const work = Number(row.work_hours ?? 0);
      const prepRaw = row.prep_hours;
      const prep = prepRaw == null || prepRaw === "" ? work * 0.35 : Number(prepRaw);
      const totalHours = work + (Number.isFinite(prep) ? prep : 0);
      addSpend(
        clientSlug,
        row.person_id ? String(row.person_id) : null,
        row.owner ? String(row.owner) : null,
        totalHours,
      );
    });

    campaignRows.forEach((row) => {
      const clientSlug = String(row.client_slug || "");
      if (!metricsByClient[clientSlug]) return;
      const hours = Number(row.hours_total ?? 0);
      addSpend(
        clientSlug,
        row.person_id ? String(row.person_id) : null,
        row.owner ? String(row.owner) : null,
        hours,
      );
    });

    manualRows.forEach((row) => {
      const clientSlug = String(row.client_slug || "");
      if (!metricsByClient[clientSlug]) return;
      const hours = Number(row.hours ?? 0);
      addSpend(
        clientSlug,
        row.person_id ? String(row.person_id) : null,
        row.owner ? String(row.owner) : null,
        hours,
      );
    });

    Object.values(metricsByClient).forEach((metric) => {
      metric.remainingTotal = metric.budgetTotal - metric.spentTotal;
      metric.utilizationTotal =
        metric.budgetTotal > 0 ? metric.spentTotal / metric.budgetTotal : 0;
    });

    return NextResponse.json(
      { year, metricsByClient },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
