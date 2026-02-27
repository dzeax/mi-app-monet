import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import { generateEmailCopy } from '@/lib/ai/emailCopyGenerator';
import {
  extractEmailCopyBriefWithAgent,
  optimizeEmailCopyBriefWithAgent,
  reviewEmailCopyVariantsWithAgent,
} from '@/lib/ai/emailCopyPipeline';
import {
  DEFAULT_EMAIL_COPY_VARIANT_COUNT,
  MAX_EMAIL_COPY_VARIANT_COUNT,
  SAVEURS_DEFAULT_BRAND_PROFILE,
  type EmailCopyBrief,
} from '@/lib/crm/emailCopyConfig';
import {
  getDefaultTemplateForType,
  getTemplateDef,
  isTemplateCompatibleWithType,
} from '@/lib/crm/emailCopy/templates/templateRegistry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const FALLBACK_AGENT_MODEL = process.env.OPENAI_EMAIL_COPY_MODEL ?? 'gpt-4.1';

const blockTypeSchema = z.enum(['hero', 'three_columns', 'two_columns', 'image_text_side_by_side']);
const modelSchema = z.enum(['gpt-5.2', 'gpt-4.1', 'gpt-5-mini', 'gpt-4-turbo', 'gpt-4o-mini']);

const brandProfileSchema = z.object({
  brandName: z.string().min(1),
  audience: z.string().min(1),
  toneSummary: z.string().min(1),
  toneDo: z.array(z.string()).default([]),
  toneDont: z.array(z.string()).default([]),
  mandatoryTerms: z.array(z.string()).default([]),
  forbiddenTerms: z.array(z.string()).default([]),
  proofPoints: z.array(z.string()).default([]),
  ctaStyle: z.string().default('CTA courts, utiles et rassurants.'),
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
  templateKey: z.string().optional(),
  layoutSpec: z.record(z.string(), z.unknown()).optional(),
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
  id: z.string().min(1),
  blockType: blockTypeSchema,
  title: z.string(),
  subtitle: z.string(),
  content: z.string(),
  ctaLabel: z.string(),
  templateKey: z.string().optional(),
  layoutSpec: z.record(z.string(), z.unknown()).optional(),
  renderSlots: z.unknown().optional(),
  charCount: z.object({
    title: z.number().int().nonnegative(),
    subtitle: z.number().int().nonnegative(),
    content: z.number().int().nonnegative(),
  }),
});

const variantSchema = z.object({
  index: z.number().int().min(1),
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(variantBlockSchema),
  warnings: z.array(z.string()).default([]),
});

const commonSchema = z.object({
  clientSlug: z.string().default('saveurs-et-vie'),
  briefId: z.string().uuid().nullable().optional(),
  runGroupId: z.string().uuid().optional(),
  model: modelSchema.optional(),
  brandProfile: brandProfileSchema.default(SAVEURS_DEFAULT_BRAND_PROFILE).optional(),
});

const extractSchema = commonSchema.extend({
  action: z.literal('extract'),
  rawBriefText: z.string().min(1),
});

const optimizeSchema = commonSchema.extend({
  action: z.literal('optimize'),
  brief: briefSchema,
  selectedBlockId: z.string().nullable().optional(),
});

const generateSchema = commonSchema.extend({
  action: z.literal('generate'),
  brief: briefSchema,
  variantCount: z.number().int().min(1).max(MAX_EMAIL_COPY_VARIANT_COUNT).default(DEFAULT_EMAIL_COPY_VARIANT_COUNT),
});

const qaSchema = commonSchema.extend({
  action: z.literal('qa'),
  brief: briefSchema,
  variants: z.array(variantSchema).min(1),
});

const trackSchema = commonSchema.extend({
  action: z.literal('track'),
  step: z.enum(['parse', 'mapping']),
  rawBriefText: z.string().nullable().optional(),
  brief: briefSchema.optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const actionSchema = z.discriminatedUnion('action', [extractSchema, optimizeSchema, generateSchema, qaSchema, trackSchema]);

const legacyGenerateSchema = z.object({
  clientSlug: z.string().default('saveurs-et-vie'),
  model: modelSchema.optional(),
  brandProfile: brandProfileSchema.default(SAVEURS_DEFAULT_BRAND_PROFILE).optional(),
  brief: briefSchema,
  variantCount: z.number().int().min(1).max(MAX_EMAIL_COPY_VARIANT_COUNT).default(DEFAULT_EMAIL_COPY_VARIANT_COUNT),
});

type AppUserAuthRow = {
  role?: string | null;
  is_active?: boolean | null;
};

type AuthContext = {
  userId: string;
  role: 'admin' | 'editor';
};

async function requireAuth(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const { data: appUserData, error: appUserError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (appUserError) {
    return { error: NextResponse.json({ error: appUserError.message }, { status: 500 }) };
  }
  const appUser = (appUserData ?? null) as AppUserAuthRow | null;
  if (!appUser || appUser.is_active === false) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const role: AuthContext['role'] = String(appUser.role ?? '').toLowerCase() === 'admin' ? 'admin' : 'editor';
  return { userId: userData.user.id, role } as const;
}

async function persistAgentRun(input: {
  supabase: ReturnType<typeof createRouteHandlerClient>;
  auth: AuthContext;
  clientSlug: string;
  briefId: string | null;
  runGroupId: string;
  agentName: 'extract' | 'plan' | 'copy' | 'qa' | 'parse' | 'mapping';
  model: string;
  status: 'success' | 'fallback' | 'error';
  requestPayload: unknown;
  responsePayload: unknown;
  warnings?: string[];
  latencyMs: number;
}) {
  try {
    const { error } = await (input.supabase as any).from('crm_email_agent_runs').insert({
      client_slug: input.clientSlug,
      brief_id: input.briefId,
      run_group_id: input.runGroupId,
      agent_name: input.agentName,
      model: input.model,
      status: input.status,
      input_json: input.requestPayload ?? {},
      output_json: input.responsePayload ?? {},
      warnings_json: input.warnings ?? [],
      latency_ms: input.latencyMs,
      created_by: input.auth.userId,
    });
    if (error) {
      console.warn('[api/ai/email-copy] unable to persist agent run', error.message);
    }
  } catch (error) {
    console.warn('[api/ai/email-copy] persist run failed', error);
  }
}

function summarizeBrief(brief: EmailCopyBrief | null, rawBriefText?: string | null) {
  if (!brief) {
    return {
      rawBriefLength: rawBriefText ? rawBriefText.length : 0,
      blockCount: 0,
      blockTypeCounts: {},
      filledFieldCount: 0,
      fields: {},
      blocks: [],
    };
  }

  const fields = {
    campaignName: brief.campaignName || '',
    sendDate: brief.sendDate || '',
    objective: brief.objective || '',
    offerSummary: brief.offerSummary || '',
    sourceSubject: brief.sourceSubject || '',
    sourcePreheader: brief.sourcePreheader || '',
    promoCode: brief.promoCode || '',
    promoValidUntil: brief.promoValidUntil || '',
    senderEmail: brief.senderEmail || '',
    comments: brief.comments || '',
  };
  const filledFieldCount = Object.values(fields).filter((value) => String(value).trim().length > 0).length;
  const blockTypeCounts = brief.blocks.reduce<Record<string, number>>((accumulator, block) => {
    accumulator[block.blockType] = (accumulator[block.blockType] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    rawBriefLength: rawBriefText ? rawBriefText.length : brief.rawBriefText?.length ?? 0,
    blockCount: brief.blocks.length,
    blockTypeCounts,
    filledFieldCount,
    fields: {
      campaignNameLength: (fields.campaignName || '').length,
      objectiveLength: (fields.objective || '').length,
      offerSummaryLength: (fields.offerSummary || '').length,
      sourceSubjectLength: (fields.sourceSubject || '').length,
      sourcePreheaderLength: (fields.sourcePreheader || '').length,
      hasPromoCode: Boolean(fields.promoCode),
      hasPromoValidUntil: Boolean(fields.promoValidUntil),
      visualLinkCount: brief.visualLinks?.length ?? 0,
    },
    blocks: brief.blocks.map((block) => ({
      id: block.id,
      blockType: block.blockType,
      sourceTitleLength: (block.sourceTitle || '').length,
      sourceContentLength: (block.sourceContent || '').length,
      ctaLabelLength: (block.ctaLabel || '').length,
      hasCtaUrl: Boolean(block.ctaUrl),
      sourceTitlePreview: (block.sourceTitle || '').slice(0, 80),
      sourceContentPreview: (block.sourceContent || '').slice(0, 120),
    })),
  };
}

function summarizeBlockDistribution(brief: EmailCopyBrief | null) {
  if (!brief) {
    return { blockCount: 0, blockTypeCounts: {} as Record<string, number> };
  }
  const blockTypeCounts = brief.blocks.reduce<Record<string, number>>((accumulator, block) => {
    accumulator[block.blockType] = (accumulator[block.blockType] ?? 0) + 1;
    return accumulator;
  }, {});
  return { blockCount: brief.blocks.length, blockTypeCounts };
}

function cleanText(value: string): string {
  return value.replace(/\u2800+/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalizeBriefForGeneration(brief: EmailCopyBrief, clientSlug: string): EmailCopyBrief {
  const blocks = brief.blocks.map((block, index) => {
    const fallbackTemplateKey = getDefaultTemplateForType(block.blockType, clientSlug);
    const incomingTemplateDef = getTemplateDef(block.templateKey ?? null, clientSlug);
    const templateKey =
      isTemplateCompatibleWithType(block.templateKey ?? null, block.blockType, clientSlug) &&
      incomingTemplateDef
        ? incomingTemplateDef.key
        : fallbackTemplateKey;
    const templateDef = getTemplateDef(templateKey, clientSlug);
    const layoutSpec =
      block.layoutSpec && typeof block.layoutSpec === 'object'
        ? { ...block.layoutSpec }
        : { ...(templateDef?.defaultLayoutSpec ?? {}) };

    return {
      ...block,
      id: cleanText(block.id || '') || `block-${index + 1}`,
      templateKey,
      layoutSpec,
    };
  });

  return { ...brief, blocks };
}

function detailParts(error: unknown): string[] {
  const err = error as {
    message?: unknown;
    requestID?: unknown;
    status?: unknown;
    code?: unknown;
    type?: unknown;
  };
  const parts: string[] = [];
  if (typeof err.message === 'string' && err.message.trim()) parts.push(err.message.trim());
  if (typeof err.requestID === 'string' && err.requestID.trim()) parts.push(`request_id=${err.requestID.trim()}`);
  if (typeof err.status === 'number') parts.push(`status=${err.status}`);
  if (typeof err.code === 'string' && err.code.trim()) parts.push(`code=${err.code.trim()}`);
  if (typeof err.type === 'string' && err.type.trim()) parts.push(`type=${err.type.trim()}`);
  return parts;
}

function compactText(value: string, maxChars = 1600) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars)}…`;
}

function resolveAgentName(
  payload: { action: 'extract' | 'optimize' | 'generate' | 'qa' | 'track'; step?: 'parse' | 'mapping' }
): 'extract' | 'plan' | 'copy' | 'qa' | 'parse' | 'mapping' {
  if (payload.action === 'optimize') return 'plan';
  if (payload.action === 'generate') return 'copy';
  if (payload.action === 'track') return payload.step === 'parse' ? 'parse' : 'mapping';
  return payload.action;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const auth = await requireAuth(supabase);
  if ('error' in auth) return auth.error;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload', details: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  const actionParsed = actionSchema.safeParse(payload);
  const legacyParsed = actionParsed.success ? null : legacyGenerateSchema.safeParse(payload);
  if (!actionParsed.success && !legacyParsed?.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: actionParsed.error.flatten() },
      { status: 422 }
    );
  }

  const normalizedPayload =
    actionParsed.success
      ? actionParsed.data
      : {
          action: 'generate' as const,
          ...legacyParsed!.data,
          briefId: null,
          runGroupId: undefined,
        };
  const clientSlug = normalizedPayload.clientSlug ?? 'saveurs-et-vie';
  const runGroupId = normalizedPayload.runGroupId || crypto.randomUUID();
  const startedAt = Date.now();

  try {
    if (normalizedPayload.action === 'track') {
      const latencyMs = Date.now() - startedAt;
      const briefSummary = summarizeBrief(
        normalizedPayload.brief ?? null,
        normalizedPayload.rawBriefText ?? normalizedPayload.brief?.rawBriefText ?? null
      );
      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: normalizedPayload.step,
        model: normalizedPayload.model || 'manual',
        status: 'success',
        requestPayload: {
          action: normalizedPayload.action,
          step: normalizedPayload.step,
          context: normalizedPayload.context ?? {},
          brief: normalizedPayload.brief ?? null,
          rawBriefText: normalizedPayload.rawBriefText ?? null,
          briefSummary,
        },
        responsePayload: {
          trackedAt: new Date().toISOString(),
          briefSummary,
          context: normalizedPayload.context ?? {},
        },
        warnings: [],
        latencyMs,
      });
      return NextResponse.json({ action: 'track', runGroupId, latencyMs, tracked: true, briefSummary });
    }

    if (normalizedPayload.action === 'extract') {
      const parseSnapshotStarted = Date.now();
      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: 'parse',
        model: normalizedPayload.model || FALLBACK_AGENT_MODEL,
        status: 'success',
        requestPayload: {
          action: 'track',
          step: 'parse',
          sourceAction: 'extract',
          rawBriefLength: normalizedPayload.rawBriefText.length,
          rawBriefPreview: compactText(normalizedPayload.rawBriefText),
        },
        responsePayload: {
          trackedAt: new Date().toISOString(),
          rawBriefLength: normalizedPayload.rawBriefText.length,
        },
        warnings: [],
        latencyMs: Date.now() - parseSnapshotStarted,
      });

      const result = await extractEmailCopyBriefWithAgent({
        clientSlug,
        rawBriefText: normalizedPayload.rawBriefText,
        brandProfile: normalizedPayload.brandProfile,
        model: normalizedPayload.model,
      });
      const latencyMs = Date.now() - startedAt;
      const mappingSnapshotStarted = Date.now();
      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: 'mapping',
        model: result.model,
        status: result.source === 'local-fallback' ? 'fallback' : 'success',
        requestPayload: {
          action: 'track',
          step: 'mapping',
          sourceAction: 'extract',
          briefSummary: summarizeBrief(result.brief, normalizedPayload.rawBriefText),
        },
        responsePayload: {
          trackedAt: new Date().toISOString(),
          source: result.source,
          warningCount: result.warnings.length,
          evidenceCount: result.evidence.length,
          briefSummary: summarizeBrief(result.brief, normalizedPayload.rawBriefText),
        },
        warnings: result.warnings,
        latencyMs: Date.now() - mappingSnapshotStarted,
      });

      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: 'extract',
        model: result.model,
        status: result.source === 'local-fallback' ? 'fallback' : 'success',
        requestPayload: {
          ...normalizedPayload,
          rawBriefLength: normalizedPayload.rawBriefText.length,
        },
        responsePayload: {
          ...result,
          briefSummary: summarizeBrief(result.brief, normalizedPayload.rawBriefText),
        },
        warnings: result.warnings,
        latencyMs,
      });
      return NextResponse.json({ action: 'extract', runGroupId, latencyMs, ...result });
    }

    if (normalizedPayload.action === 'optimize') {
      const mappingBeforeStarted = Date.now();
      const inputBriefSummary = summarizeBrief(normalizedPayload.brief, normalizedPayload.brief.rawBriefText ?? null);
      const requestedSelectedBlockId = normalizedPayload.selectedBlockId ?? null;
      const inputDistribution = summarizeBlockDistribution(normalizedPayload.brief);
      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: 'mapping',
        model: normalizedPayload.model || FALLBACK_AGENT_MODEL,
        status: 'success',
        requestPayload: {
          action: 'track',
          step: 'mapping',
          sourceAction: 'optimize',
          phase: 'before',
          selectedBlockId: requestedSelectedBlockId,
          optimizeSummary: {
            before: inputDistribution,
            after: null,
            selection: {
              requestedBlockId: requestedSelectedBlockId,
              selectedBlockId: null,
              retained: false,
            },
          },
          briefSummary: inputBriefSummary,
        },
        responsePayload: {
          trackedAt: new Date().toISOString(),
          phase: 'before',
          selectedBlockId: requestedSelectedBlockId,
          optimizeSummary: {
            before: inputDistribution,
            after: null,
            selection: {
              requestedBlockId: requestedSelectedBlockId,
              selectedBlockId: null,
              retained: false,
            },
          },
          briefSummary: inputBriefSummary,
        },
        warnings: [],
        latencyMs: Date.now() - mappingBeforeStarted,
      });

      const result = await optimizeEmailCopyBriefWithAgent({
        clientSlug,
        brief: normalizedPayload.brief,
        brandProfile: normalizedPayload.brandProfile,
        model: normalizedPayload.model,
      });
      const latencyMs = Date.now() - startedAt;
      const afterDistribution = summarizeBlockDistribution(result.brief);
      const selectionRetained =
        Boolean(requestedSelectedBlockId) &&
        result.brief.blocks.some((block) => block.id === requestedSelectedBlockId);
      const selectedBlockIdAfter = selectionRetained
        ? requestedSelectedBlockId
        : result.brief.blocks[0]?.id ?? null;
      const optimizeSummary = {
        before: inputDistribution,
        after: afterDistribution,
        selection: {
          requestedBlockId: requestedSelectedBlockId,
          selectedBlockId: selectedBlockIdAfter,
          retained: selectionRetained,
        },
      };
      const mappingAfterStarted = Date.now();
      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: 'mapping',
        model: result.model,
        status: result.source === 'local-fallback' ? 'fallback' : 'success',
        requestPayload: {
          action: 'track',
          step: 'mapping',
          sourceAction: 'optimize',
          phase: 'after',
          optimizeSummary,
          beforeSummary: inputBriefSummary,
          afterSummary: summarizeBrief(result.brief, normalizedPayload.brief.rawBriefText ?? null),
        },
        responsePayload: {
          trackedAt: new Date().toISOString(),
          phase: 'after',
          source: result.source,
          optimizeSummary,
          warningCount: result.warnings.length,
          changeCount: result.changes.length,
          evidenceCount: result.evidence.length,
          beforeSummary: inputBriefSummary,
          afterSummary: summarizeBrief(result.brief, normalizedPayload.brief.rawBriefText ?? null),
        },
        warnings: result.warnings,
        latencyMs: Date.now() - mappingAfterStarted,
      });

      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: 'plan',
        model: result.model,
        status: result.source === 'local-fallback' ? 'fallback' : 'success',
        requestPayload: {
          ...normalizedPayload,
          optimizeSummary,
          briefSummary: inputBriefSummary,
        },
        responsePayload: {
          ...result,
          optimizeSummary,
          beforeSummary: inputBriefSummary,
          afterSummary: summarizeBrief(result.brief, normalizedPayload.brief.rawBriefText ?? null),
        },
        warnings: result.warnings,
        latencyMs,
      });
      return NextResponse.json({
        action: 'optimize',
        runGroupId,
        latencyMs,
        selection: optimizeSummary.selection,
        optimizeSummary,
        ...result,
      });
    }

    if (normalizedPayload.action === 'qa') {
      const result = await reviewEmailCopyVariantsWithAgent({
        clientSlug,
        brief: normalizedPayload.brief,
        brandProfile: normalizedPayload.brandProfile,
        variants: normalizedPayload.variants,
        model: normalizedPayload.model,
      });
      const latencyMs = Date.now() - startedAt;
      await persistAgentRun({
        supabase,
        auth,
        clientSlug,
        briefId: normalizedPayload.briefId ?? null,
        runGroupId,
        agentName: 'qa',
        model: result.model,
        status: result.source === 'local-fallback' ? 'fallback' : 'success',
        requestPayload: normalizedPayload,
        responsePayload: result,
        warnings: [],
        latencyMs,
      });
      return NextResponse.json({ action: 'qa', runGroupId, latencyMs, result });
    }

    const generatePayload = normalizedPayload as z.infer<typeof generateSchema>;
    const briefForGeneration = canonicalizeBriefForGeneration(generatePayload.brief, clientSlug);
    const generated = await generateEmailCopy({
      clientSlug,
      brief: briefForGeneration,
      brandProfile: generatePayload.brandProfile,
      variantCount: generatePayload.variantCount,
      model: generatePayload.model,
    });
    const latencyMs = Date.now() - startedAt;
    await persistAgentRun({
      supabase,
      auth,
      clientSlug,
      briefId: generatePayload.briefId ?? null,
      runGroupId,
      agentName: 'copy',
      model: generated.model,
      status: generated.source === 'local-fallback' ? 'fallback' : 'success',
      requestPayload: {
        ...generatePayload,
        brief: briefForGeneration,
      },
      responsePayload: generated,
      warnings: generated.variants.flatMap((variant) => variant.warnings || []),
      latencyMs,
    });
    return NextResponse.json({ action: 'generate', runGroupId, latencyMs, ...generated });
  } catch (error) {
    await persistAgentRun({
      supabase,
      auth,
      clientSlug,
      briefId: normalizedPayload.briefId ?? null,
      runGroupId,
      agentName: resolveAgentName(normalizedPayload),
      model: normalizedPayload.model || FALLBACK_AGENT_MODEL,
      status: 'error',
      requestPayload: normalizedPayload,
      responsePayload: { error: detailParts(error).join(' | ') || 'Unknown error' },
      warnings: [],
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: 'Email copy agent failed',
        details: process.env.NODE_ENV === 'development' ? detailParts(error).join(' | ') || undefined : undefined,
      },
      { status: 500 }
    );
  }
}
