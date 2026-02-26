import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

import { SAVEURS_DEFAULT_BRAND_PROFILE } from "@/lib/crm/emailCopyConfig";

const DEFAULT_CLIENT = "saveurs-et-vie";
export const runtime = "nodejs";

const blockTypeSchema = z.enum(["hero", "three_columns", "two_columns", "image_text_side_by_side"]);

const brandProfileSchema = z.object({
  brandName: z.string().min(1),
  audience: z.string().min(1),
  toneSummary: z.string().min(1),
  toneDo: z.array(z.string()).default([]),
  toneDont: z.array(z.string()).default([]),
  mandatoryTerms: z.array(z.string()).default([]),
  forbiddenTerms: z.array(z.string()).default([]),
  proofPoints: z.array(z.string()).default([]),
  ctaStyle: z.string().default("CTA courts, utiles et rassurants."),
  legalGuardrails: z.string().nullable().optional(),
  exampleEmails: z.array(z.string()).nullable().optional(),
});

const briefBlockSchema = z.object({
  id: z.string().min(1),
  blockType: blockTypeSchema,
  sourceTitle: z.string().nullable().optional(),
  sourceContent: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().nullable().optional(),
});

const briefSchema = z.object({
  campaignName: z.string().min(1),
  sendDate: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  offerSummary: z.string().nullable().optional(),
  visualLinks: z.array(z.string()).nullable().optional(),
  promoCode: z.string().nullable().optional(),
  promoValidUntil: z.string().nullable().optional(),
  senderEmail: z.string().nullable().optional(),
  comments: z.string().nullable().optional(),
  sourceSubject: z.string().nullable().optional(),
  sourcePreheader: z.string().nullable().optional(),
  rawBriefText: z.string().nullable().optional(),
  blocks: z.array(briefBlockSchema).min(1),
});

const variantBlockSchema = z.object({
  id: z.string(),
  blockType: blockTypeSchema,
  title: z.string(),
  subtitle: z.string(),
  content: z.string(),
  ctaLabel: z.string(),
  charCount: z.object({
    title: z.number(),
    subtitle: z.number(),
    content: z.number(),
  }),
});

const variantSchema = z.object({
  index: z.number().int().min(1),
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(variantBlockSchema),
  warnings: z.array(z.string()).default([]),
});

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveBrandProfile"),
    client: z.string().optional(),
    profile: brandProfileSchema,
  }),
  z.object({
    action: z.literal("saveBrief"),
    client: z.string().optional(),
    briefId: z.string().uuid().optional().nullable(),
    status: z.string().nullable().optional(),
    brief: briefSchema,
  }),
  z.object({
    action: z.literal("saveDrafts"),
    client: z.string().optional(),
    briefId: z.string().uuid(),
    model: z.string().min(1),
    source: z.enum(["openai", "local-fallback"]).default("openai"),
    variants: z.array(variantSchema).min(1),
  }),
]);

type AppUserAuthRow = {
  role?: string | null;
  is_active?: boolean | null;
};

async function requireAuth(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: appUserData, error: appUserError } = await supabase
    .from("app_users")
    .select("role,is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  const appUser = (appUserData ?? null) as AppUserAuthRow | null;
  if (appUserError) {
    return { error: NextResponse.json({ error: appUserError.message }, { status: 500 }) };
  }
  if (!appUser || appUser.is_active === false) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const role = String(appUser.role ?? "").toLowerCase() === "admin" ? "admin" : "editor";
  return { userId: userData.user.id, role } as const;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const auth = await requireAuth(supabase);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const clientSlug = searchParams.get("client") || DEFAULT_CLIENT;
  const briefId = searchParams.get("briefId");

  try {
    const { data: brandData, error: brandError } = await supabase
      .from("crm_brand_profiles")
      .select("profile_json")
      .eq("client_slug", clientSlug)
      .maybeSingle();
    if (brandError) {
      return NextResponse.json({ error: brandError.message }, { status: 500 });
    }

    const { data: briefsData, error: briefsError } = await supabase
      .from("crm_email_briefs")
      .select("id,campaign_name,status,send_date_text,created_at,updated_at")
      .eq("client_slug", clientSlug)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (briefsError) {
      return NextResponse.json({ error: briefsError.message }, { status: 500 });
    }

    let selectedBrief: Record<string, unknown> | null = null;
    let drafts: Record<string, unknown>[] = [];

    if (briefId) {
      const { data: briefData, error: briefError } = await supabase
        .from("crm_email_briefs")
        .select("id,campaign_name,status,brief_json,created_at,updated_at")
        .eq("client_slug", clientSlug)
        .eq("id", briefId)
        .maybeSingle();
      if (briefError) {
        return NextResponse.json({ error: briefError.message }, { status: 500 });
      }
      selectedBrief = (briefData as Record<string, unknown> | null) ?? null;

      const { data: draftsData, error: draftsError } = await supabase
        .from("crm_email_drafts")
        .select("id,brief_id,variant_index,draft_json,model,source,created_at")
        .eq("client_slug", clientSlug)
        .eq("brief_id", briefId)
        .order("variant_index", { ascending: true });
      if (draftsError) {
        return NextResponse.json({ error: draftsError.message }, { status: 500 });
      }
      drafts = (draftsData as Record<string, unknown>[] | null) ?? [];
    }

    return NextResponse.json({
      brandProfile: (brandData?.profile_json as Record<string, unknown> | null) ?? SAVEURS_DEFAULT_BRAND_PROFILE,
      briefs: (briefsData ?? []).map((row) => ({
        id: row.id,
        campaignName: row.campaign_name,
        status: row.status ?? null,
        sendDate: row.send_date_text ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      selectedBrief: selectedBrief
        ? {
            id: String(selectedBrief.id ?? ""),
            campaignName: String(selectedBrief.campaign_name ?? ""),
            status: (selectedBrief.status as string | null) ?? null,
            brief: selectedBrief.brief_json ?? null,
            createdAt: selectedBrief.created_at ?? null,
            updatedAt: selectedBrief.updated_at ?? null,
          }
        : null,
      drafts: drafts.map((row) => ({
        id: row.id,
        briefId: row.brief_id,
        variantIndex: row.variant_index,
        draft: row.draft_json,
        model: row.model,
        source: row.source,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const auth = await requireAuth(supabase);
  if ("error" in auth) return auth.error;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const actionPayload = parsed.data;
  const clientSlug = actionPayload.client || DEFAULT_CLIENT;

  try {
    if (actionPayload.action === "saveBrandProfile") {
      const { data: brandRow, error: brandError } = await supabase
        .from("crm_brand_profiles")
        .upsert(
          {
            client_slug: clientSlug,
            profile_json: actionPayload.profile,
            created_by: auth.userId,
            updated_by: auth.userId,
          },
          { onConflict: "client_slug" }
        )
        .select("id,client_slug,profile_json,updated_at")
        .single();

      if (brandError) return NextResponse.json({ error: brandError.message }, { status: 500 });

      return NextResponse.json({
        brandProfile: brandRow.profile_json,
        record: {
          id: brandRow.id,
          clientSlug: brandRow.client_slug,
          updatedAt: brandRow.updated_at,
        },
      });
    }

    if (actionPayload.action === "saveBrief") {
      const rowPayload = {
        client_slug: clientSlug,
        campaign_name: actionPayload.brief.campaignName,
        status: actionPayload.status ?? null,
        send_date_text: actionPayload.brief.sendDate ?? null,
        source_subject: actionPayload.brief.sourceSubject ?? null,
        source_preheader: actionPayload.brief.sourcePreheader ?? null,
        raw_brief_text: actionPayload.brief.rawBriefText ?? null,
        brief_json: actionPayload.brief,
        updated_by: auth.userId,
      };

      if (actionPayload.briefId) {
        const { data: updatedBrief, error: updateError } = await supabase
          .from("crm_email_briefs")
          .update(rowPayload)
          .eq("id", actionPayload.briefId)
          .eq("client_slug", clientSlug)
          .select("id,campaign_name,status,brief_json,created_at,updated_at")
          .single();
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        return NextResponse.json({
          briefRecord: {
            id: updatedBrief.id,
            campaignName: updatedBrief.campaign_name,
            status: updatedBrief.status ?? null,
            brief: updatedBrief.brief_json,
            createdAt: updatedBrief.created_at,
            updatedAt: updatedBrief.updated_at,
          },
        });
      }

      const { data: insertedBrief, error: insertError } = await supabase
        .from("crm_email_briefs")
        .insert({
          ...rowPayload,
          created_by: auth.userId,
        })
        .select("id,campaign_name,status,brief_json,created_at,updated_at")
        .single();
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

      return NextResponse.json({
        briefRecord: {
          id: insertedBrief.id,
          campaignName: insertedBrief.campaign_name,
          status: insertedBrief.status ?? null,
          brief: insertedBrief.brief_json,
          createdAt: insertedBrief.created_at,
          updatedAt: insertedBrief.updated_at,
        },
      });
    }

    if (actionPayload.action === "saveDrafts") {
      const { data: existingBrief, error: checkError } = await supabase
        .from("crm_email_briefs")
        .select("id")
        .eq("id", actionPayload.briefId)
        .eq("client_slug", clientSlug)
        .maybeSingle();
      if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 });
      if (!existingBrief?.id) {
        return NextResponse.json({ error: "Brief not found" }, { status: 404 });
      }

      const draftRows = actionPayload.variants.map((variant) => ({
        client_slug: clientSlug,
        brief_id: actionPayload.briefId,
        variant_index: variant.index,
        draft_json: variant,
        model: actionPayload.model,
        source: actionPayload.source,
        created_by: auth.userId,
        updated_by: auth.userId,
      }));

      const { data: upsertedDrafts, error: draftsError } = await supabase
        .from("crm_email_drafts")
        .upsert(draftRows, { onConflict: "brief_id,variant_index" })
        .select("id,brief_id,variant_index,draft_json,model,source,created_at,updated_at");
      if (draftsError) return NextResponse.json({ error: draftsError.message }, { status: 500 });

      return NextResponse.json({
        drafts: (upsertedDrafts ?? []).map((row) => ({
          id: row.id,
          briefId: row.brief_id,
          variantIndex: row.variant_index,
          draft: row.draft_json,
          model: row.model,
          source: row.source,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
