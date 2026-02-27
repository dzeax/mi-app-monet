import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { EasyInputMessage, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';

import {
  getDefaultTemplateForType,
  getTemplateDef,
  getTemplateNameFromKey,
  isTemplateCompatibleWithType,
} from '@/lib/crm/emailCopy/templates/templateRegistry';
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
  model?: 'gpt-5.2' | 'gpt-4.1' | 'gpt-5-mini' | 'gpt-4-turbo' | 'gpt-4o-mini';
};

type RawGeneratedBlock = {
  id?: unknown;
  blockId?: unknown;
  type?: unknown;
  templateKey?: unknown;
  layoutSpec?: unknown;
  title?: unknown;
  subtitle?: unknown;
  content?: unknown;
  ctaLabel?: unknown;
  renderSlots?: unknown;
};

type RawVariant = {
  subject?: unknown;
  preheader?: unknown;
  blocks?: unknown;
};

const EMAIL_COPY_CACHE = new Map<string, EmailCopyGenerateResult>();

const OPENAI_MODEL_DEFAULT = process.env.OPENAI_EMAIL_COPY_MODEL ?? 'gpt-4.1';
const EMAIL_COPY_ALLOWED_MODELS = new Set(['gpt-5.2', 'gpt-4.1', 'gpt-5-mini', 'gpt-4-turbo', 'gpt-4o-mini']);
const EMAIL_COPY_OPENAI_TIMEOUT_MS = 18_000;
const INFORMAL_FRENCH_PATTERN = /(?:\btu\b|\btoi\b|\bton\b|\bta\b|\btes\b|\bt['’])/i;
const ARTIFACT_PATTERN = /(?:^\+|template|voir\s+bloc|inscription\s+newsletter|https?:\/\/)/i;
const MENU_PASTEL_BULLET_MIN = 3;
const MENU_PASTEL_BULLET_MAX = 5;
const MENU_PASTEL_LEAD_SOFT_LIMIT = 24;
const MENU_PASTEL_LEAD_HARD_LIMIT = 32;
const MENU_PASTEL_TEXT_SOFT_LIMIT = 90;
const MENU_PASTEL_TEXT_HARD_LIMIT = 110;
const MARKDOWN_BOLD_PATTERN = /(?:\*\*|__)/g;

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

function toSafeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toSafeString(entry)).filter(Boolean);
}

function charCount(value: string): number {
  return [...value].length;
}

function cleanGeneratedText(value: string): string {
  return sanitizeWhitespace(
    value
      .replace(/^["'`“”]+|["'`“”]+$/g, '')
      .replace(/\s*[\r\n]+\s*/g, ' ')
      .replace(/\s+\+\s+/g, ' ')
  );
}

function trimToLimit(value: string, limit: number): string {
  const cleaned = cleanGeneratedText(value);
  if (charCount(cleaned) <= limit) return cleaned;

  const slice = [...cleaned].slice(0, limit).join('').trim();
  const lastWhitespace = slice.lastIndexOf(' ');
  if (lastWhitespace >= Math.floor(limit * 0.55)) {
    return slice.slice(0, lastWhitespace).replace(/[,:;.!?'"`(\[]+$/g, '').trim();
  }
  return slice.replace(/[,:;.!?'"`(\[]+$/g, '').trim();
}

function ensureWithinLimit(
  input: string,
  limit: number,
  warningLabel: string,
  warnings: string[]
): string {
  const trimmed = trimToLimit(input, limit);
  if (trimmed !== cleanGeneratedText(input)) {
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

function stripArtifacts(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => cleanGeneratedText(line))
    .filter((line) => Boolean(line) && !ARTIFACT_PATTERN.test(line));
  return cleanGeneratedText(lines.join(' '));
}

function splitContentSentences(value: string): string[] {
  return cleanGeneratedText(value)
    .split(/(?<=[.!?;:])\s+/)
    .map((entry) => cleanGeneratedText(entry))
    .filter(Boolean);
}

function splitContentIntoBullets(value: string, maxItems: number, maxChars: number): string[] {
  const safe = value || '';
  const lineBullets = safe
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((line) => /^\s*(?:[-*•]+\s*)/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*•]+\s*)/, '').trim())
    .filter(Boolean);
  if (lineBullets.length >= 2) {
    return lineBullets.slice(0, maxItems).map((entry) => trimToLimit(entry, maxChars));
  }

  if (safe.includes('•')) {
    const splitBullets = safe
      .split('•')
      .map((entry) => cleanGeneratedText(entry))
      .filter(Boolean);
    if (splitBullets.length >= 2) {
      return splitBullets.slice(0, maxItems).map((entry) => trimToLimit(entry, maxChars));
    }
  }

  const sentenceBullets = splitContentSentences(safe).slice(0, maxItems).map((entry) => trimToLimit(entry, maxChars));
  if (sentenceBullets.length >= 2) return sentenceBullets;

  const compact = cleanGeneratedText(safe);
  if (!compact) return [];
  return [trimToLimit(compact, maxChars)];
}

function splitCardsFromContent(value: string, count: number, maxChars: number): string[] {
  const bullets = splitContentIntoBullets(value, count, maxChars);
  if (bullets.length >= count) return bullets.slice(0, count);

  const sentences = splitContentSentences(value);
  if (sentences.length >= count) {
    return sentences.slice(0, count).map((entry) => trimToLimit(entry, maxChars));
  }

  const words = cleanGeneratedText(value).split(/\s+/).filter(Boolean);
  if (!words.length) return Array.from({ length: count }, (_, index) => `Card ${index + 1}`);
  const chunkSize = Math.max(1, Math.ceil(words.length / count));
  const chunks: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * chunkSize;
    const end = index === count - 1 ? words.length : (index + 1) * chunkSize;
    const chunk = words.slice(start, end).join(' ').trim();
    chunks.push(trimToLimit(chunk || chunks[chunks.length - 1] || words.join(' '), maxChars));
  }
  return chunks;
}

type LeadTextBullet = {
  lead: string;
  text: string;
};

function stripMarkdownBold(value: string): string {
  return cleanGeneratedText(value.replace(MARKDOWN_BOLD_PATTERN, ''));
}

function splitLeadTextHeuristic(value: string): { lead: string; text: string } {
  const safe = stripArtifacts(value);
  const separatorCandidates = [
    safe.indexOf(','),
    safe.indexOf(' - '),
    safe.indexOf(':'),
  ].filter((index) => index > 0 && index < safe.length - 1);
  if (separatorCandidates.length > 0) {
    const separatorIndex = Math.min(...separatorCandidates);
    return {
      lead: cleanGeneratedText(safe.slice(0, separatorIndex)),
      text: cleanGeneratedText(safe.slice(separatorIndex + 1)),
    };
  }

  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { lead: safe || 'Point cle', text: safe || 'Detail important' };
  const leadWordCount = words.length >= 5 ? 3 : 2;
  return {
    lead: cleanGeneratedText(words.slice(0, leadWordCount).join(' ')),
    text: cleanGeneratedText(words.slice(leadWordCount).join(' ')),
  };
}

function normalizeMenuPastelBullet(input: {
  entry: unknown;
  side: 'left' | 'right';
  index: number;
  warnings: string[];
  warningPrefix: string;
}): LeadTextBullet | null {
  const pushWarning = (warning: string) => {
    input.warnings.push(`${input.warningPrefix}${warning}`);
  };

  let lead = '';
  let text = '';
  let usedHeuristic = false;
  const entryRecord = toSafeRecord(input.entry);

  if (entryRecord) {
    lead = stripMarkdownBold(toSafeString(entryRecord.lead));
    text = stripMarkdownBold(toSafeString(entryRecord.text));
    if (!lead && text) {
      const split = splitLeadTextHeuristic(text);
      lead = split.lead;
      text = split.text;
      usedHeuristic = true;
    }
  } else {
    const asString = toSafeString(input.entry);
    if (!asString) return null;
    const split = splitLeadTextHeuristic(asString);
    lead = split.lead;
    text = split.text;
    usedHeuristic = true;
  }

  if (!lead && !text) return null;

  if (!text) {
    const split = splitLeadTextHeuristic(lead);
    lead = split.lead;
    text = split.text;
    usedHeuristic = true;
  }

  if (usedHeuristic) {
    pushWarning(`${input.side}.bullets[${input.index}] heuristic conversion applied`);
  }

  lead = cleanGeneratedText(lead.replace(/[.,;:!?-]+$/g, ''));
  text = cleanGeneratedText(text);

  if (!lead) {
    lead = trimToLimit(text || 'Point cle', MENU_PASTEL_LEAD_SOFT_LIMIT);
    text = cleanGeneratedText(text || 'Detail important');
  }
  if (!text) {
    text = cleanGeneratedText(lead);
    lead = trimToLimit(lead, Math.min(MENU_PASTEL_LEAD_SOFT_LIMIT, 12));
    pushWarning(`${input.side}.bullets[${input.index}] heuristic conversion applied`);
  }

  if (charCount(lead) > MENU_PASTEL_LEAD_HARD_LIMIT) {
    const leadChars = [...lead];
    const leadOverflow = leadChars.slice(MENU_PASTEL_LEAD_HARD_LIMIT).join('').trim();
    lead = cleanGeneratedText(leadChars.slice(0, MENU_PASTEL_LEAD_HARD_LIMIT).join(''));
    text = cleanGeneratedText(`${leadOverflow} ${text}`);
    pushWarning(`${input.side}.bullets[${input.index}].lead trimmed`);
  } else if (charCount(lead) > MENU_PASTEL_LEAD_SOFT_LIMIT) {
    pushWarning(`${input.side}.bullets[${input.index}].lead exceeds soft limit`);
  }

  if (charCount(text) > MENU_PASTEL_TEXT_SOFT_LIMIT) {
    text = trimToLimit(text, MENU_PASTEL_TEXT_SOFT_LIMIT);
    pushWarning(`${input.side}.bullets[${input.index}].text trimmed`);
  } else if (charCount(text) > MENU_PASTEL_TEXT_HARD_LIMIT) {
    text = trimToLimit(text, MENU_PASTEL_TEXT_HARD_LIMIT);
    pushWarning(`${input.side}.bullets[${input.index}].text trimmed`);
  }

  return { lead, text };
}

function normalizeMenuPastelBulletArray(input: {
  value: unknown;
  fallback: string[];
  side: 'left' | 'right';
  warnings: string[];
  warningPrefix: string;
}): LeadTextBullet[] {
  const sourceEntries = Array.isArray(input.value)
    ? input.value
    : (input.fallback.length ? input.fallback : ['Point cle: detail utile']);

  const normalized = sourceEntries
    .map((entry, index) =>
      normalizeMenuPastelBullet({
        entry,
        side: input.side,
        index,
        warnings: input.warnings,
        warningPrefix: input.warningPrefix,
      })
    )
    .filter((entry): entry is LeadTextBullet => Boolean(entry));

  if (normalized.length > MENU_PASTEL_BULLET_MAX) {
    input.warnings.push(`${input.warningPrefix}${input.side}.bullets truncated to ${MENU_PASTEL_BULLET_MAX}`);
    return normalized.slice(0, MENU_PASTEL_BULLET_MAX);
  }

  if (normalized.length < MENU_PASTEL_BULLET_MIN) {
    input.warnings.push(`${input.warningPrefix}${input.side}.bullets fewer than ${MENU_PASTEL_BULLET_MIN}`);
  }

  return normalized;
}

function fallbackSubtitleByType(blockType: EmailCopyBriefBlock['blockType']): string {
  if (blockType === 'three_columns') return 'Des options claires, adaptees a vos besoins.';
  if (blockType === 'two_columns') return 'Choisissez la formule qui vous convient.';
  if (blockType === 'image_text_side_by_side') return 'Un accompagnement concret, simple et rassurant.';
  return 'Un service humain et rassurant, pense pour votre quotidien.';
}

function resolveTemplateKeyForBlock(
  rawTemplateKey: string,
  sourceBlock: EmailCopyBriefBlock,
  clientSlug: string
): string {
  if (isTemplateCompatibleWithType(rawTemplateKey, sourceBlock.blockType, clientSlug)) {
    return getTemplateDef(rawTemplateKey, clientSlug)?.key ?? rawTemplateKey;
  }
  if (
    isTemplateCompatibleWithType(sourceBlock.templateKey ?? null, sourceBlock.blockType, clientSlug) &&
    sourceBlock.templateKey
  ) {
    return getTemplateDef(sourceBlock.templateKey, clientSlug)?.key ?? sourceBlock.templateKey;
  }
  return getDefaultTemplateForType(sourceBlock.blockType, clientSlug);
}

function canonicalizeRenderSlots(input: {
  templateKey: string;
  sourceBlock: EmailCopyBriefBlock;
  incoming: unknown;
  title: string;
  subtitle: string;
  content: string;
  ctaLabel: string;
  warnings?: string[];
  warningPrefix?: string;
}): Record<string, unknown> {
  const sourceContent = stripArtifacts(input.sourceBlock.sourceContent || '');
  const incoming = toSafeRecord(input.incoming) ?? {};
  const templateName = getTemplateNameFromKey(input.templateKey);
  const warnings = input.warnings ?? [];
  const warningPrefix = input.warningPrefix ?? '';
  const pushWarning = (warning: string) => {
    warnings.push(`${warningPrefix}${warning}`);
  };

  if (templateName === 'hero.simple') {
    return {
      headline: trimToLimit(toSafeString(incoming.headline) || input.title, EMAIL_COPY_CHAR_LIMITS.title),
      subheadline: trimToLimit(toSafeString(incoming.subheadline) || input.subtitle, EMAIL_COPY_CHAR_LIMITS.subtitle),
      body: trimToLimit(toSafeString(incoming.body) || input.content, EMAIL_COPY_BLOCK_CONTENT_LIMITS.hero),
      ctaLabel: trimToLimit(toSafeString(incoming.ctaLabel) || input.ctaLabel, 40),
    };
  }

  if (templateName === 'twoCards.text') {
    const leftIncoming = toSafeRecord(incoming.left);
    const rightIncoming = toSafeRecord(incoming.right);
    const bullets = splitContentIntoBullets(sourceContent || input.content, 6, 40);
    const leftFallbackBullets = bullets.slice(0, 3);
    const rightFallbackBullets = bullets.slice(3, 6);
    const leftBullets = toStringArray(leftIncoming?.bullets).slice(0, 3);
    const rightBullets = toStringArray(rightIncoming?.bullets).slice(0, 3);
    const leftFinal = (leftBullets.length ? leftBullets : leftFallbackBullets).map((entry) => trimToLimit(entry, 40));
    const rightFinal = (rightBullets.length ? rightBullets : rightFallbackBullets).map((entry) => trimToLimit(entry, 40));

    return {
      left: {
        title: trimToLimit(toSafeString(leftIncoming?.title) || trimToLimit(input.title || 'Formule 1', 33), 33),
        bullets: leftFinal.length ? leftFinal : [trimToLimit(input.content, 40)],
        emphasis: trimToLimit(toSafeString(leftIncoming?.emphasis), 40),
      },
      right: {
        title: trimToLimit(toSafeString(rightIncoming?.title) || 'Formule 2', 33),
        bullets: rightFinal.length ? rightFinal : [trimToLimit(input.subtitle || input.content, 40)],
        emphasis: trimToLimit(toSafeString(rightIncoming?.emphasis), 40),
      },
    };
  }

  if (templateName === 'twoCards.menuPastel') {
    const leftIncoming = toSafeRecord(incoming.left);
    const rightIncoming = toSafeRecord(incoming.right);
    const sourceBullets = splitContentIntoBullets(sourceContent || input.content, 10, MENU_PASTEL_TEXT_HARD_LIMIT);
    const leftFallback = sourceBullets.slice(0, 4);
    const rightFallback = sourceBullets.slice(4, 8);
    const leftTitleInput = toSafeString(leftIncoming?.title) || trimToLimit(input.title || 'Menu 2', 33);
    const rightTitleInput = toSafeString(rightIncoming?.title) || trimToLimit(input.title || 'Menu 2', 33);
    const leftTitle = trimToLimit(leftTitleInput, EMAIL_COPY_CHAR_LIMITS.title);
    const rightTitle = trimToLimit(rightTitleInput, EMAIL_COPY_CHAR_LIMITS.title);
    if (leftTitle !== cleanGeneratedText(leftTitleInput)) {
      pushWarning('left.title trimmed');
    }
    if (rightTitle !== cleanGeneratedText(rightTitleInput)) {
      pushWarning('right.title trimmed');
    }

    return {
      left: {
        title: leftTitle,
        bullets: normalizeMenuPastelBulletArray({
          value: leftIncoming?.bullets,
          fallback: leftFallback,
          side: 'left',
          warnings,
          warningPrefix,
        }),
      },
      right: {
        title: rightTitle,
        bullets: normalizeMenuPastelBulletArray({
          value: rightIncoming?.bullets,
          fallback: rightFallback.length ? rightFallback : leftFallback,
          side: 'right',
          warnings,
          warningPrefix,
        }),
      },
    };
  }

  if (templateName === 'threeCards.text') {
    const incomingCards = Array.isArray(incoming.cards) ? incoming.cards : [];
    const fallbackBodies = splitCardsFromContent(sourceContent || input.content, 3, 65);
    const cards = Array.from({ length: 3 }, (_, index) => {
      const cardIncoming = toSafeRecord(incomingCards[index]);
      return {
        title: trimToLimit(toSafeString(cardIncoming?.title) || `Option ${index + 1}`, 33),
        body: trimToLimit(toSafeString(cardIncoming?.body) || fallbackBodies[index] || input.content, 65),
      };
    });
    return { cards };
  }

  if (templateName === 'sideBySide.imageText') {
    return {
      title: trimToLimit(toSafeString(incoming.title) || input.title, 33),
      body: trimToLimit(toSafeString(incoming.body) || input.content, EMAIL_COPY_BLOCK_CONTENT_LIMITS.image_text_side_by_side),
      ctaLabel: trimToLimit(toSafeString(incoming.ctaLabel) || input.ctaLabel, 40),
      imageAlt: trimToLimit(toSafeString(incoming.imageAlt), 90),
    };
  }

  if (templateName === 'sideBySide.helpCta') {
    const incomingImage = toSafeRecord(incoming.image);
    const incomingContent = toSafeRecord(incoming.content);
    return {
      image: {
        src: toSafeString(incomingImage?.src),
        alt: trimToLimit(
          toSafeString(incomingImage?.alt) || toSafeString(incoming.imageAlt),
          90
        ),
      },
      content: {
        title: trimToLimit(
          toSafeString(incomingContent?.title) || toSafeString(incoming.title) || input.title,
          33
        ),
        body: trimToLimit(
          toSafeString(incomingContent?.body) || toSafeString(incoming.body) || input.content,
          EMAIL_COPY_BLOCK_CONTENT_LIMITS.image_text_side_by_side
        ),
        ctaLabel: trimToLimit(
          toSafeString(incomingContent?.ctaLabel) || toSafeString(incoming.ctaLabel) || input.ctaLabel,
          40
        ),
      },
    };
  }

  return {
    title: input.title,
    subtitle: input.subtitle,
    content: input.content,
    ctaLabel: input.ctaLabel,
  };
}

function createFallbackBlock(
  sourceBlock: EmailCopyBriefBlock,
  offerSummary: string,
  clientSlug: string
): EmailCopyGeneratedBlock {
  const warnings: string[] = [];
  const contentLimit = EMAIL_COPY_BLOCK_CONTENT_LIMITS[sourceBlock.blockType];
  const titleSeed = stripArtifacts(sourceBlock.sourceTitle || 'Une solution adaptee pour vous');
  const subtitleSeed = fallbackSubtitleByType(sourceBlock.blockType);
  const contentSeed =
    stripArtifacts(sourceBlock.sourceContent || '') ||
    stripArtifacts(offerSummary || '') ||
    'Decouvrez un accompagnement simple, des menus adaptes et une livraison a domicile en toute confiance.';
  const ctaSeed = stripArtifacts(sourceBlock.ctaLabel || 'Je decouvre');

  const title = ensureWithinLimit(titleSeed, EMAIL_COPY_CHAR_LIMITS.title, `Block ${sourceBlock.id} title`, warnings);
  const subtitle = ensureWithinLimit(
    subtitleSeed,
    EMAIL_COPY_CHAR_LIMITS.subtitle,
    `Block ${sourceBlock.id} subtitle`,
    warnings
  );
  const content = ensureWithinLimit(contentSeed, contentLimit, `Block ${sourceBlock.id} content`, warnings);
  const ctaLabel = trimToLimit(ctaSeed, 40);
  const templateKey = resolveTemplateKeyForBlock('', sourceBlock, clientSlug);
  const renderSlots = canonicalizeRenderSlots({
    templateKey,
    sourceBlock,
    incoming: null,
    title,
    subtitle,
    content,
    ctaLabel,
    warnings,
    warningPrefix: `Block ${sourceBlock.id} `,
  });

  return {
    id: sourceBlock.id,
    blockType: sourceBlock.blockType,
    title,
    subtitle,
    content,
    ctaLabel,
    templateKey,
    layoutSpec: sourceBlock.layoutSpec,
    renderSlots,
    charCount: {
      title: charCount(title),
      subtitle: charCount(subtitle),
      content: charCount(content),
    },
  };
}

function buildFallbackVariants(input: {
  clientSlug: string;
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
        input.brief.offerSummary || input.brief.objective || input.brief.rawBriefText || '',
        input.clientSlug
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
  warnings: string[],
  clientSlug: string
): EmailCopyGeneratedBlock {
  const contentLimit = EMAIL_COPY_BLOCK_CONTENT_LIMITS[sourceBlock.blockType];
  const rawTitle = toSafeString(rawBlock?.title);
  const rawSubtitle = toSafeString(rawBlock?.subtitle);
  const rawContent = toSafeString(rawBlock?.content);
  const rawCta = toSafeString(rawBlock?.ctaLabel);
  const rawTemplateKey = toSafeString(rawBlock?.templateKey);
  const templateKey = resolveTemplateKeyForBlock(rawTemplateKey, sourceBlock, clientSlug);
  const titleSeed = stripArtifacts(rawTitle || sourceBlock.sourceTitle || 'Une solution adaptee pour vous');
  const subtitleSeed = stripArtifacts(rawSubtitle || fallbackSubtitleByType(sourceBlock.blockType));
  const contentSeed = stripArtifacts(
    rawContent || sourceBlock.sourceContent || 'Decouvrez des menus adaptes et une livraison a domicile en toute confiance.'
  );
  const ctaSeed = stripArtifacts(rawCta || sourceBlock.ctaLabel || 'Je decouvre');

  if ((rawContent && ARTIFACT_PATTERN.test(rawContent)) || (rawTitle && ARTIFACT_PATTERN.test(rawTitle))) {
    warnings.push(`Variant ${variantIndex} block ${sourceBlock.id} included brief artifacts and was cleaned.`);
  }

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
  const renderSlots = canonicalizeRenderSlots({
    templateKey,
    sourceBlock,
    incoming: rawBlock?.renderSlots,
    title,
    subtitle,
    content,
    ctaLabel,
    warnings,
    warningPrefix: `Variant ${variantIndex} block ${sourceBlock.id} `,
  });

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
    templateKey,
    layoutSpec: sourceBlock.layoutSpec,
    renderSlots,
    charCount: {
      title: charCount(title),
      subtitle: charCount(subtitle),
      content: charCount(content),
    },
  };
}

function normalizeVariant(
  rawVariant: RawVariant | null,
  brief: EmailCopyBrief,
  variantIndex: number,
  clientSlug: string
): EmailCopyVariant {
  const warnings: string[] = [];
  const rawBlocks = Array.isArray(rawVariant?.blocks) ? (rawVariant?.blocks as RawGeneratedBlock[]) : [];
  const rawBlockById = new Map<string, RawGeneratedBlock>();
  rawBlocks.forEach((block) => {
    const id = toSafeString(block?.id);
    const blockId = toSafeString(block?.blockId);
    if (id) rawBlockById.set(id, block);
    if (blockId) rawBlockById.set(blockId, block);
  });

  const subjectSeed = stripArtifacts(
    toSafeString(rawVariant?.subject) || brief.sourceSubject || 'Votre solution Saveurs et Vie, pour vous'
  );
  const preheaderSeed = stripArtifacts(
    toSafeString(rawVariant?.preheader) || brief.sourcePreheader || 'Des menus adaptes pour votre quotidien.'
  );

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
    return normalizeBlock(byId ?? byIndex, sourceBlock, variantIndex, warnings, clientSlug);
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
  const blockInstructions = input.brief.blocks.map((block) => {
    const templateKey = block.templateKey || getDefaultTemplateForType(block.blockType, input.clientSlug);
    const templateDef = getTemplateDef(templateKey, input.clientSlug);
    return {
      id: block.id,
      blockType: block.blockType,
      templateKey,
      templateName: getTemplateNameFromKey(templateKey),
      layoutSpec: block.layoutSpec ?? templateDef?.defaultLayoutSpec ?? {},
      slotSchema: templateDef?.slotsSchema ?? {},
      titleLimit: EMAIL_COPY_CHAR_LIMITS.title,
      subtitleLimit: EMAIL_COPY_CHAR_LIMITS.subtitle,
      contentLimit: EMAIL_COPY_BLOCK_CONTENT_LIMITS[block.blockType],
      sourceTitle: block.sourceTitle ?? '',
      sourceContent: block.sourceContent ?? '',
      ctaLabel: block.ctaLabel ?? '',
      ctaUrl: block.ctaUrl ?? '',
    };
  });

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
    'Source mapping fields can be over these limits. Final output must always respect hard limits.',
    'Do not invent promotions, numbers, deadlines, prices, conditions, or medical claims.',
    'Respect the brief facts exactly. When uncertain, stay generic and safe.',
    'Never truncate words. Rewrite shorter copy to fit limits naturally.',
    'Never output brief artifacts: URLs, template notes, "+", raw instructions, dangling quotes or dangling punctuation.',
    'Each block must be a complete standalone message, never sentence fragments.',
    'three_columns and two_columns blocks must read like concise standalone cards, not split pieces of one sentence.',
    'Avoid repeating the exact same subtitle on every block.',
    'Preserve templateKey and layoutSpec from block instructions; do not invent template identifiers.',
    'Each block must include renderSlots aligned to templateKey and keep semantic consistency with title/subtitle/content/ctaLabel.',
    'For templateKey "sv.twoCards.menuPastel.v1" OR templateName "twoCards.menuPastel":',
    '- renderSlots must be {"left":{"title":"","bullets":[{"lead":"","text":""}]},"right":{"title":"","bullets":[{"lead":"","text":""}]}}.',
    '- Generate 3 to 5 bullets per card.',
    '- Each bullet lead must be 1 to 3 words, concise, with no trailing punctuation.',
    '- Each bullet text must contain the complementary message only (no markdown markers).',
    '- DO NOT output bullets as plain strings.',
    '- DO NOT output markdown bold markers like ** or __.',
    'Return strict JSON only with this shape:',
    '{"variants":[{"subject":"","preheader":"","blocks":[{"blockId":"","type":"","templateKey":"","layoutSpec":{},"title":"","subtitle":"","content":"","ctaLabel":"","renderSlots":{}}]}]}',
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
      .map((variant, index) => normalizeVariant(variant, brief, index + 1, clientSlug));
  }

  if (!variants.length) {
    if (lastError && !isOpenAiRetryableError(lastError)) {
      throw (lastError instanceof Error ? lastError : new Error('Email copy generation failed.'));
    }
    variants = buildFallbackVariants({
      clientSlug,
      brief,
      variantCount: safeVariantCount,
      warning: 'Local fallback used after OpenAI instability.',
    });
    source = 'local-fallback';
  }

  if (variants.length < safeVariantCount) {
    const fallback = buildFallbackVariants({
      clientSlug,
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
