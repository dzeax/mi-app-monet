import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { EasyInputMessage, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';

import {
  DEFAULT_EMAIL_COPY_VARIANT_COUNT,
  EMAIL_COPY_BLOCK_CONTENT_LIMITS,
  EMAIL_COPY_CHAR_LIMITS,
  EMAIL_COPY_PRONOUN_STYLE,
  MAX_EMAIL_COPY_VARIANT_COUNT,
  SAVEURS_DEFAULT_BRAND_PROFILE,
  type EmailCopyBrandProfile,
  type EmailCopyBrief,
  type EmailCopyBriefBlock,
  type EmailCopyGenerateResult,
  type EmailCopyGeneratedBlock,
  type EmailCopyVariant,
} from '@/lib/crm/emailCopyConfig';

type GenerateEmailCopyParams = {
  clientSlug: string;
  brandProfile?: EmailCopyBrandProfile | null;
  brief: EmailCopyBrief;
  variantCount?: number;
  model?: 'gpt-5-mini' | 'gpt-4-turbo' | 'gpt-4o-mini';
};

type RawGeneratedBlock = {
  id?: unknown;
  title?: unknown;
  subtitle?: unknown;
  content?: unknown;
  ctaLabel?: unknown;
};

type RawVariant = {
  subject?: unknown;
  preheader?: unknown;
  blocks?: unknown;
};

const EMAIL_COPY_CACHE = new Map<string, EmailCopyGenerateResult>();

const OPENAI_MODEL_DEFAULT = process.env.OPENAI_EMAIL_COPY_MODEL ?? 'gpt-4o-mini';
const EMAIL_COPY_ALLOWED_MODELS = new Set(['gpt-5-mini', 'gpt-4-turbo', 'gpt-4o-mini']);
const EMAIL_COPY_OPENAI_TIMEOUT_MS = 18_000;
const INFORMAL_FRENCH_PATTERN = /(?:\btu\b|\btoi\b|\bton\b|\bta\b|\btes\b|\bt['’])/i;

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
});

function sanitizeWhitespace(value: string): string {
  return value.replace(/\u2800+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toSafeString(value: unknown): string {
  return typeof value === 'string' ? sanitizeWhitespace(value) : '';
}

function charCount(value: string): number {
  return [...value].length;
}

function trimToLimit(value: string, limit: number): string {
  if (charCount(value) <= limit) return value;
  return [...value].slice(0, limit).join('').trim();
}

function ensureWithinLimit(
  input: string,
  limit: number,
  warningLabel: string,
  warnings: string[]
): string {
  const trimmed = trimToLimit(input, limit);
  if (trimmed !== input) {
    warnings.push(`${warningLabel} trimmed to ${limit} chars.`);
  }
  return trimmed;
}

function mentionsInformalPronoun(value: string): boolean {
  if (!value) return false;
  return INFORMAL_FRENCH_PATTERN.test(value.toLowerCase());
}

function checkPronoun(value: string, label: string, warnings: string[]) {
  if (mentionsInformalPronoun(value)) {
    warnings.push(`${label} may contain tutoiement. Expected "${EMAIL_COPY_PRONOUN_STYLE}".`);
  }
}

function extractJsonBlock(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return raw.slice(firstBrace, lastBrace + 1).trim();
}

function parseRawVariants(raw: string): RawVariant[] {
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) return [];
  try {
    const parsed = JSON.parse(jsonBlock) as { variants?: unknown };
    if (!Array.isArray(parsed?.variants)) return [];
    return parsed.variants as RawVariant[];
  } catch {
    return [];
  }
}

function buildOpenAiInput(systemInstruction: string, prompt: string): EasyInputMessage[] {
  return [
    {
      role: 'system',
      content: [{ type: 'input_text', text: systemInstruction }],
    },
    {
      role: 'user',
      content: [{ type: 'input_text', text: prompt }],
    },
  ];
}

function errorToLowerString(error: unknown): string {
  if (!error) return '';
  const message = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: unknown }).cause;
  const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : '';
  const name =
    typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : '';
  const code =
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  return `${name} ${message} ${causeMessage} ${code}`.toLowerCase();
}

function getOpenAiErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : null;
}

function isOpenAiConnectionError(error: unknown): boolean {
  const text = errorToLowerString(error);
  if (!text) return false;
  return (
    text.includes('connection error') ||
    text.includes('fetch failed') ||
    text.includes('und_err_socket') ||
    text.includes('socket') ||
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('abort') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('network')
  );
}

function isOpenAiRetryableError(error: unknown): boolean {
  if (isOpenAiConnectionError(error)) return true;
  const status = getOpenAiErrorStatus(error);
  if (status === 429) return true;
  if (status != null && status >= 500) return true;
  const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
  const type = String((error as { type?: unknown })?.type ?? '').toLowerCase();
  return code === 'server_error' || type === 'server_error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createOpenAiResponse(selectedModel: string, systemInstruction: string, prompt: string) {
  const input = buildOpenAiInput(systemInstruction, prompt);
  const openAiRequest: ResponseCreateParamsNonStreaming = {
    model: selectedModel,
    input,
  };
  return openaiClient.responses.create(openAiRequest, {
    timeout: EMAIL_COPY_OPENAI_TIMEOUT_MS,
  });
}

function uniqueWarnings(input: string[]): string[] {
  const seen = new Set<string>();
  return input.filter((warning) => {
    if (!warning) return false;
    if (seen.has(warning)) return false;
    seen.add(warning);
    return true;
  });
}

function createFallbackBlock(sourceBlock: EmailCopyBriefBlock, offerSummary: string): EmailCopyGeneratedBlock {
  const warnings: string[] = [];
  const contentLimit = EMAIL_COPY_BLOCK_CONTENT_LIMITS[sourceBlock.blockType];
  const titleSeed = sourceBlock.sourceTitle || 'Une solution adaptee pour vous';
  const subtitleSeed = 'Un service humain et rassurant, pense pour votre quotidien.';
  const contentSeed =
    sourceBlock.sourceContent ||
    offerSummary ||
    'Decouvrez un accompagnement simple, des menus adaptes et une livraison a domicile en toute confiance.';
  const ctaSeed = sourceBlock.ctaLabel || 'Je decouvre';

  const title = ensureWithinLimit(titleSeed, EMAIL_COPY_CHAR_LIMITS.title, `Block ${sourceBlock.id} title`, warnings);
  const subtitle = ensureWithinLimit(
    subtitleSeed,
    EMAIL_COPY_CHAR_LIMITS.subtitle,
    `Block ${sourceBlock.id} subtitle`,
    warnings
  );
  const content = ensureWithinLimit(contentSeed, contentLimit, `Block ${sourceBlock.id} content`, warnings);
  const ctaLabel = trimToLimit(ctaSeed, 40);

  return {
    id: sourceBlock.id,
    blockType: sourceBlock.blockType,
    title,
    subtitle,
    content,
    ctaLabel,
    charCount: {
      title: charCount(title),
      subtitle: charCount(subtitle),
      content: charCount(content),
    },
  };
}

function buildFallbackVariants(input: {
  brief: EmailCopyBrief;
  variantCount: number;
  warning?: string;
}): EmailCopyVariant[] {
  const subjectSeeds = [
    input.brief.sourceSubject || 'Vos menus Saveurs et Vie, en confiance',
    'Votre offre Saveurs et Vie, simplement',
    'Une solution repas adaptee pour vous',
    'Profitez de votre offre Saveurs et Vie',
    'Decouvrez une livraison repas sereine',
  ];
  const preheaderSeeds = [
    input.brief.sourcePreheader || 'Des menus adaptes a vos besoins, chez vous.',
    'Un accompagnement humain et des menus equilibres.',
    'Commandez simplement et testez notre service.',
    'Une offre claire pour votre premiere commande.',
    'Des recettes pensees pour votre quotidien.',
  ];

  const variants: EmailCopyVariant[] = [];
  for (let index = 0; index < input.variantCount; index += 1) {
    const warnings: string[] = [];
    if (input.warning) warnings.push(input.warning);
    const subject = ensureWithinLimit(
      subjectSeeds[index] || subjectSeeds[0],
      EMAIL_COPY_CHAR_LIMITS.subject,
      `Variant ${index + 1} subject`,
      warnings
    );
    const preheader = ensureWithinLimit(
      preheaderSeeds[index] || preheaderSeeds[0],
      EMAIL_COPY_CHAR_LIMITS.preheader,
      `Variant ${index + 1} preheader`,
      warnings
    );
    checkPronoun(subject, `Variant ${index + 1} subject`, warnings);
    checkPronoun(preheader, `Variant ${index + 1} preheader`, warnings);

    const blocks = input.brief.blocks.map((block) => {
      const fallbackBlock = createFallbackBlock(
        block,
        input.brief.offerSummary || input.brief.objective || input.brief.rawBriefText || ''
      );
      checkPronoun(fallbackBlock.title, `Variant ${index + 1} block ${block.id} title`, warnings);
      checkPronoun(fallbackBlock.subtitle, `Variant ${index + 1} block ${block.id} subtitle`, warnings);
      checkPronoun(fallbackBlock.content, `Variant ${index + 1} block ${block.id} content`, warnings);
      return fallbackBlock;
    });

    variants.push({
      index: index + 1,
      subject,
      preheader,
      blocks,
      warnings: uniqueWarnings(warnings),
    });
  }
  return variants;
}

function normalizeBlock(
  rawBlock: RawGeneratedBlock | null,
  sourceBlock: EmailCopyBriefBlock,
  variantIndex: number,
  warnings: string[]
): EmailCopyGeneratedBlock {
  const contentLimit = EMAIL_COPY_BLOCK_CONTENT_LIMITS[sourceBlock.blockType];
  const titleSeed = toSafeString(rawBlock?.title) || sourceBlock.sourceTitle || 'Une solution adaptee pour vous';
  const subtitleSeed =
    toSafeString(rawBlock?.subtitle) || 'Un accompagnement clair et rassurant pour votre quotidien.';
  const contentSeed =
    toSafeString(rawBlock?.content) ||
    sourceBlock.sourceContent ||
    'Decouvrez des menus adaptes et une livraison a domicile en toute confiance.';
  const ctaSeed = toSafeString(rawBlock?.ctaLabel) || sourceBlock.ctaLabel || 'Je decouvre';

  const title = ensureWithinLimit(
    titleSeed,
    EMAIL_COPY_CHAR_LIMITS.title,
    `Variant ${variantIndex} block ${sourceBlock.id} title`,
    warnings
  );
  const subtitle = ensureWithinLimit(
    subtitleSeed,
    EMAIL_COPY_CHAR_LIMITS.subtitle,
    `Variant ${variantIndex} block ${sourceBlock.id} subtitle`,
    warnings
  );
  const content = ensureWithinLimit(
    contentSeed,
    contentLimit,
    `Variant ${variantIndex} block ${sourceBlock.id} content`,
    warnings
  );
  const ctaLabel = trimToLimit(ctaSeed, 40);

  checkPronoun(title, `Variant ${variantIndex} block ${sourceBlock.id} title`, warnings);
  checkPronoun(subtitle, `Variant ${variantIndex} block ${sourceBlock.id} subtitle`, warnings);
  checkPronoun(content, `Variant ${variantIndex} block ${sourceBlock.id} content`, warnings);

  return {
    id: sourceBlock.id,
    blockType: sourceBlock.blockType,
    title,
    subtitle,
    content,
    ctaLabel,
    charCount: {
      title: charCount(title),
      subtitle: charCount(subtitle),
      content: charCount(content),
    },
  };
}

function normalizeVariant(rawVariant: RawVariant | null, brief: EmailCopyBrief, variantIndex: number): EmailCopyVariant {
  const warnings: string[] = [];
  const rawBlocks = Array.isArray(rawVariant?.blocks) ? (rawVariant?.blocks as RawGeneratedBlock[]) : [];
  const rawBlockById = new Map<string, RawGeneratedBlock>();
  rawBlocks.forEach((block) => {
    const id = toSafeString(block?.id);
    if (!id) return;
    rawBlockById.set(id, block);
  });

  const subjectSeed =
    toSafeString(rawVariant?.subject) || brief.sourceSubject || 'Votre solution Saveurs et Vie, pour vous';
  const preheaderSeed =
    toSafeString(rawVariant?.preheader) || brief.sourcePreheader || 'Des menus adaptes pour votre quotidien.';

  const subject = ensureWithinLimit(
    subjectSeed,
    EMAIL_COPY_CHAR_LIMITS.subject,
    `Variant ${variantIndex} subject`,
    warnings
  );
  const preheader = ensureWithinLimit(
    preheaderSeed,
    EMAIL_COPY_CHAR_LIMITS.preheader,
    `Variant ${variantIndex} preheader`,
    warnings
  );

  checkPronoun(subject, `Variant ${variantIndex} subject`, warnings);
  checkPronoun(preheader, `Variant ${variantIndex} preheader`, warnings);

  const blocks = brief.blocks.map((sourceBlock, sourceIndex) => {
    const byId = rawBlockById.get(sourceBlock.id) ?? null;
    const byIndex = rawBlocks[sourceIndex] ?? null;
    return normalizeBlock(byId ?? byIndex, sourceBlock, variantIndex, warnings);
  });

  return {
    index: variantIndex,
    subject,
    preheader,
    blocks,
    warnings: uniqueWarnings(warnings),
  };
}

function buildPrompt(input: {
  clientSlug: string;
  brief: EmailCopyBrief;
  brandProfile: EmailCopyBrandProfile;
  variantCount: number;
}) {
  const blockInstructions = input.brief.blocks.map((block) => ({
    id: block.id,
    blockType: block.blockType,
    titleLimit: EMAIL_COPY_CHAR_LIMITS.title,
    subtitleLimit: EMAIL_COPY_CHAR_LIMITS.subtitle,
    contentLimit: EMAIL_COPY_BLOCK_CONTENT_LIMITS[block.blockType],
    sourceTitle: block.sourceTitle ?? '',
    sourceContent: block.sourceContent ?? '',
    ctaLabel: block.ctaLabel ?? '',
    ctaUrl: block.ctaUrl ?? '',
  }));

  return [
    `Client slug: ${input.clientSlug}`,
    `Write exactly ${input.variantCount} variants.`,
    'Language policy: French only.',
    'Pronoun policy: always use vouvoiement ("vous"), never tutoiement.',
    `Subject max chars: ${EMAIL_COPY_CHAR_LIMITS.subject}`,
    `Preheader max chars: ${EMAIL_COPY_CHAR_LIMITS.preheader}`,
    `Title max chars: ${EMAIL_COPY_CHAR_LIMITS.title}`,
    `Subtitle max chars: ${EMAIL_COPY_CHAR_LIMITS.subtitle}`,
    `Block content limits by type: ${JSON.stringify(EMAIL_COPY_BLOCK_CONTENT_LIMITS)}`,
    'Do not invent promotions, numbers, deadlines, prices, conditions, or medical claims.',
    'Respect the brief facts exactly. When uncertain, stay generic and safe.',
    'Return strict JSON only with this shape:',
    '{"variants":[{"subject":"","preheader":"","blocks":[{"id":"","title":"","subtitle":"","content":"","ctaLabel":""}]}]}',
    'Each variant must include all requested blocks and keep the same block ids.',
    `Brand profile JSON: ${JSON.stringify(input.brandProfile)}`,
    `Brief JSON: ${JSON.stringify(input.brief)}`,
    `Block instructions JSON: ${JSON.stringify(blockInstructions)}`,
  ].join('\n\n');
}

export async function generateEmailCopy({
  clientSlug,
  brandProfile,
  brief,
  variantCount = DEFAULT_EMAIL_COPY_VARIANT_COUNT,
  model,
}: GenerateEmailCopyParams): Promise<EmailCopyGenerateResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!brief.blocks.length) {
    throw new Error('At least one brief block is required.');
  }

  const safeVariantCount = Math.max(1, Math.min(variantCount, MAX_EMAIL_COPY_VARIANT_COUNT));
  const selectedModel =
    model && EMAIL_COPY_ALLOWED_MODELS.has(model) ? model : OPENAI_MODEL_DEFAULT;
  const fallbackModel =
    OPENAI_MODEL_DEFAULT && OPENAI_MODEL_DEFAULT !== selectedModel ? OPENAI_MODEL_DEFAULT : null;

  const mergedBrandProfile = {
    ...SAVEURS_DEFAULT_BRAND_PROFILE,
    ...(brandProfile ?? {}),
  };

  const cacheKey = createHash('sha256')
    .update(
      JSON.stringify({
        clientSlug,
        mergedBrandProfile,
        brief,
        safeVariantCount,
        selectedModel,
        fallbackModel,
      })
    )
    .digest('hex');

  const cached = EMAIL_COPY_CACHE.get(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const systemInstruction =
    'You are a senior CRM copywriter for healthcare-adjacent meal delivery emails. Generate concise, brand-safe French copy in vouvoiement. Never output markdown, explanations, or extra keys.';
  const prompt = buildPrompt({
    clientSlug,
    brief,
    brandProfile: mergedBrandProfile,
    variantCount: safeVariantCount,
  });

  const modelAttempts = fallbackModel ? [selectedModel, fallbackModel] : [selectedModel];
  let rawOutput = '';
  let successfulModel = selectedModel;
  let lastError: unknown = null;

  for (let index = 0; index < modelAttempts.length; index += 1) {
    const modelName = modelAttempts[index];
    try {
      const response = await createOpenAiResponse(modelName, systemInstruction, prompt);
      rawOutput = response.output_text ?? '';
      successfulModel = modelName;
      break;
    } catch (error) {
      lastError = error;
      const hasNextAttempt = index < modelAttempts.length - 1;
      if (!isOpenAiRetryableError(error) || !hasNextAttempt) {
        break;
      }
      await sleep(350 * (index + 1));
    }
  }

  let variants: EmailCopyVariant[] = [];
  let source: 'openai' | 'local-fallback' = 'openai';

  if (rawOutput) {
    const parsedVariants = parseRawVariants(rawOutput);
    variants = parsedVariants
      .slice(0, safeVariantCount)
      .map((variant, index) => normalizeVariant(variant, brief, index + 1));
  }

  if (!variants.length) {
    if (lastError && !isOpenAiRetryableError(lastError)) {
      throw (lastError instanceof Error ? lastError : new Error('Email copy generation failed.'));
    }
    variants = buildFallbackVariants({
      brief,
      variantCount: safeVariantCount,
      warning: 'Local fallback used after OpenAI instability.',
    });
    source = 'local-fallback';
  }

  if (variants.length < safeVariantCount) {
    const fallback = buildFallbackVariants({
      brief,
      variantCount: safeVariantCount - variants.length,
      warning: 'Variant backfilled with local fallback.',
    });
    variants = [
      ...variants,
      ...fallback.map((variant, idx) => ({
        ...variant,
        index: variants.length + idx + 1,
      })),
    ];
  }

  const payload: EmailCopyGenerateResult = {
    variants: variants.slice(0, safeVariantCount),
    model: successfulModel,
    fromCache: false,
    source,
  };

  EMAIL_COPY_CACHE.set(cacheKey, payload);
  return payload;
}

export type { GenerateEmailCopyParams };

