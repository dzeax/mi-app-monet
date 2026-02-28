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
const IMAGE_LEFT_TITLE_MAX = 22;
const IMAGE_LEFT_BULLET_COUNT = 3;
const IMAGE_LEFT_BULLET_MAX = 42;
const IMAGE_LEFT_DEFAULT_TITLE = 'Le Nutritest';
const IMAGE_LEFT_SAFE_FALLBACK_BULLETS = [
  'Auto-test gratuit',
  'Rapide à réaliser',
  'Profil alimentaire en 10 questions',
];
const FORMULE2_CARD_COUNT = 2;
const FORMULE2_TITLE_MAX = 28;
const FORMULE2_BULLETS_MIN = 1;
const FORMULE2_BULLETS_MAX = 2;
const FORMULE2_BULLET_CHAR_MAX = 110;
const MENU3_CARD_COUNT = 3;
const MENU3_TITLE_MAX = 33;
const MENU3_TEXT_MIN = 60;
const MENU3_TEXT_MAX = 95;
const MENU3_CTA_MAX = 28;
const MENU3_DEFAULT_CTA_LABEL = 'En savoir plus';
const HERO_IMAGE_TOP_LINE1_MAX = 28;
const HERO_IMAGE_TOP_LINE2_MAX = 32;
const HERO_IMAGE_TOP_PARAGRAPH_MIN = 140;
const HERO_IMAGE_TOP_PARAGRAPH_MAX = 220;
const HERO_IMAGE_TOP_CTA_MAX = 28;
const TITLE_TITRE_LINE_MAX = 28;
const TITLE_TITRE_DEFAULT_LINE1 = 'À chaque besoin';
const TITLE_TITRE_DEFAULT_LINE2 = 'sa formule adaptée';
const PROMO_CODE_PILL_TEXT_BEFORE_MAX = 32;
const PROMO_CODE_PILL_DISCOUNT_MAX = 6;
const PROMO_CODE_PILL_TEXT_AFTER_MAX = 14;
const PROMO_CODE_PILL_CODE_MAX = 12;
const PROMO_CODE_PILL_DEFAULT_TEXT_BEFORE = "N'oubliez pas de profiter de vos";
const PROMO_CODE_PILL_DEFAULT_DISCOUNT = '-15%';
const PROMO_CODE_PILL_DEFAULT_TEXT_AFTER = 'avec le code';
const PROMO_CODE_PILL_DEFAULT_CODE = 'CODE';
const PROMO_BLUE_DISCOUNT_MAX = 8;
const PROMO_BLUE_CODE_MAX = 16;
const PROMO_BLUE_FINE_PRINT_MAX = 70;
const PROMO_BLUE_CTA_MAX = 24;
const PROMO_BLUE_DEFAULT_DISCOUNT = '-25 %*';
const PROMO_BLUE_DEFAULT_CODE_LABEL = 'CODE :';
const PROMO_BLUE_DEFAULT_CODE_VALUE = 'BIENVENUE25';
const PROMO_BLUE_DEFAULT_FINE_PRINT = '*offre applicable sur la première commande en ligne';
const PROMO_BLUE_DEFAULT_CTA_LABEL = 'Je profite du code';
const CTA_PILL354_LABEL_MAX = 28;
const CTA_PILL354_DEFAULT_LABEL = 'DÉCOUVRIR';
const CTA_PILL354_DEFAULT_WIDTH = 354;
const CTA_PILL354_DEFAULT_RADIUS = 25;
const REASSURANCE_LINK_COUNT = 3;
const REASSURANCE_LABEL_MAX = 18;
const REASSURANCE_DEFAULT_GAP = 16;
const REASSURANCE_DEFAULT_LINKS = [
  { label: 'Nos services', url: '#' },
  { label: 'Qui sommes-nous', url: '#' },
  { label: 'Notre blog', url: '#' },
];
const TEXT_BEIGE_CTA_TITLE_MAX = 65;
const TEXT_BEIGE_CTA_PARAGRAPH1_MAX = 220;
const TEXT_BEIGE_CTA_PARAGRAPH2_MAX = 120;
const TEXT_BEIGE_CTA_PARAGRAPH_COUNT = 2;
const TEXT_BEIGE_CTA_CTA_MAX = 20;
const TEXT_BEIGE_CTA_DEFAULT_TITLE = 'Découvrez les engagements au cœur\nde notre approche :';
const TEXT_BEIGE_CTA_DEFAULT_BODY_PARAGRAPHS = [
  'Chez Saveurs et Vie, nous avons à coeur de proposer des recettes élaborées par nos diététiciens-nutritionnistes, qui allient équilibre alimentaire et plaisir gustatif pour favoriser le maintien à domicile.',
  'Découvrez les engagements qui sont au coeur de notre approche :',
];
const TEXT_BEIGE_CTA_DEFAULT_CTA_LABEL = 'NOS ENGAGEMENTS';
const CONTENT_HIGHLIGHT_PARAGRAPH_COUNT = 2;
const CONTENT_HIGHLIGHT_HIGHLIGHT_MAX = 45;
const CONTENT_HIGHLIGHT_PARAGRAPH2_MAX = 90;
const CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_LEAD =
  'Le portage de repas est une solution particulièrement adaptée afin de ';
const CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_HIGHLIGHT = 'favoriser le maintien à domicile.';
const CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH2 =
  'Vous pouvez commander nos formules directement sur notre site internet.';
const CONTENT_HIGHLIGHT_BENEFIT_PATTERN =
  /(favoriser|préserver|maintenir|améliorer|faciliter|simplifier|autonomie|confort|bien[- ]?être|sérénité|equilibre|proximité)[^.!?;:\n\r]{0,60}/i;
const SECTION_IMAGE_LOGO_CENTRE_URL =
  'https://img.mailinblue.com/2607945/images/content_library/original/6993539aedfea40618a90d38.png';
const SECTION_IMAGE_LOGO_CENTRE_ALT = 'Image logo centre';
const MOSAIC_IMAGE_KEYS = ['img1', 'img2', 'img3', 'img4', 'img5'] as const;
type MosaicImageKey = (typeof MOSAIC_IMAGE_KEYS)[number];
const MOSAIC_DEFAULT_IMAGES: Record<MosaicImageKey, { src: string; alt: string }> = {
  img1: {
    src: 'https://img.mailinblue.com/2607945/images/content_library/original/695ce6207cc7c28f805fa1c9.jpg',
    alt: 'Plat 1',
  },
  img2: {
    src: 'https://img.mailinblue.com/2607945/images/content_library/original/695ce62187ec1cf2e0721a41.jpg',
    alt: 'Plat 2',
  },
  img3: {
    src: 'https://img.mailinblue.com/2607945/images/content_library/original/695ce6217cc7c28f805fa1ca.jpg',
    alt: 'Plat 3',
  },
  img4: {
    src: 'https://img.mailinblue.com/2607945/images/content_library/original/695ce6742b2cc887da6c4210.jpg',
    alt: 'Plat 4',
  },
  img5: {
    src: 'https://img.mailinblue.com/2607945/images/content_library/original/695ce62167fe85e2c79ac611.jpg',
    alt: 'Plat 5',
  },
};
const MOSAIC_RADIUS_DEFAULT = 8;
const FOOTER_BEIGE_DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/saveursetvieofficiel';
const FOOTER_BEIGE_DEFAULT_FACEBOOK_URL = 'https://www.facebook.com/SaveursEtVie';
const FOOTER_BEIGE_DEFAULT_COMPANY_LINES = [
  'Saveurs et Vie - SAS au capital de 106 477, 50 €- N° Siret : 43467677100091',
  'Rue de la Soie Bât. 285 Cellule C8 C9, 94310 ORLY',
  'Cet email a été envoyé à EMAIL',
];
const FOOTER_BEIGE_DEFAULT_RECIPIENT_LABEL = 'EMAIL';
const FOOTER_BEIGE_DEFAULT_GDPR =
  'Vous disposez d’un droit d’accès, de rectification, d’effacement sur vos données, ainsi qu’un droit de limitation et d’opposition du traitement. Vous avez la possibilité d’exercer ces droits sur simple demande par courrier électronique à l’adresse suivante : dpo@saveursetvie.fr ou en cliquant sur le lien de désabonnement pour ne plus recevoir de mails de notre part. En cas de difficultés liées à la gestion de vos données, vous avez la possibilité de saisir la CNIL (www.cnil.fr).';
const FOOTER_BEIGE_DEFAULT_UNSUBSCRIBE_LABEL = 'Se désinscrire';
const MARKDOWN_BOLD_PATTERN = /(?:\*\*|__)/g;

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
});

function sanitizeWhitespace(value: string): string {
  return value.replace(/\u2800+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeMultiline(value: string): string {
  return value
    .replace(/\u2800+/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function toSafeString(value: unknown): string {
  return typeof value === 'string' ? sanitizeWhitespace(value) : '';
}

function toSafeMultiline(value: unknown): string {
  return typeof value === 'string' ? sanitizeMultiline(value) : '';
}

function toSafeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toSafeString(entry)).filter(Boolean);
}

function toSafeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function toSafeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
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

function splitHeroImageTopHeadline(input: {
  headline: string;
  fallbackLine2?: string;
}): { line1: string; line2: string; usedHeuristic: boolean } {
  const safe = cleanGeneratedText(input.headline);
  const fallbackLine2 = cleanGeneratedText(input.fallbackLine2 || '') || 'de portage de repas';
  if (!safe) {
    return {
      line1: 'Bien plus qu’un service',
      line2: fallbackLine2,
      usedHeuristic: true,
    };
  }

  const newlineParts = safe
    .split(/\r?\n/)
    .map((entry) => cleanGeneratedText(entry))
    .filter(Boolean);
  if (newlineParts.length >= 2) {
    return {
      line1: newlineParts[0],
      line2: newlineParts.slice(1).join(' '),
      usedHeuristic: false,
    };
  }

  const punctuationMatch = safe.match(/^(.{8,80}?)[,:;!?]\s+(.{4,120})$/);
  if (punctuationMatch?.[1] && punctuationMatch?.[2]) {
    return {
      line1: cleanGeneratedText(punctuationMatch[1]),
      line2: cleanGeneratedText(punctuationMatch[2]),
      usedHeuristic: true,
    };
  }

  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    return {
      line1: safe,
      line2: fallbackLine2,
      usedHeuristic: true,
    };
  }

  const midpoint = Math.max(2, Math.ceil(words.length / 2));
  return {
    line1: cleanGeneratedText(words.slice(0, midpoint).join(' ')),
    line2: cleanGeneratedText(words.slice(midpoint).join(' ')),
    usedHeuristic: true,
  };
}

function stripTrailingPunctuation(value: string): string {
  return cleanGeneratedText(value).replace(/[,:;.!?]+$/g, '').trim();
}

function stripEmoji(value: string): string {
  return cleanGeneratedText(value).replace(/\p{Extended_Pictographic}+/gu, '').trim();
}

function normalizeSingleLineBreak(value: string): { text: string; collapsed: boolean } {
  const safe = sanitizeMultiline(value);
  if (!safe) return { text: '', collapsed: false };
  const lines = safe
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length <= 1) return { text: lines[0] || '', collapsed: false };
  if (lines.length === 2) return { text: `${lines[0]}\n${lines[1]}`, collapsed: false };
  return {
    text: `${lines[0]}\n${lines.slice(1).join(' ').trim()}`,
    collapsed: true,
  };
}

type HighlightTone = 'default' | 'highlight';

type ContentHighlightPart = {
  text: string;
  tone: HighlightTone;
};

function normalizeContentHighlightPart(value: unknown): ContentHighlightPart | null {
  if (typeof value === 'string') {
    const text = stripEmoji(value);
    return text ? { text, tone: 'default' } : null;
  }
  const record = toSafeRecord(value);
  if (!record) return null;
  const text = stripEmoji(toSafeString(record.text));
  if (!text) return null;
  return {
    text,
    tone: record.tone === 'highlight' ? 'highlight' : 'default',
  };
}

function ensureTrailingSpace(value: string): string {
  const safe = stripEmoji(value);
  if (!safe) return '';
  return /\s$/.test(value) ? safe : `${safe} `;
}

function splitHighlightClause(value: string): { lead: string; highlight: string; usedHeuristic: boolean } {
  const safe = stripEmoji(value);
  if (!safe) {
    return {
      lead: CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_LEAD,
      highlight: CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_HIGHLIGHT,
      usedHeuristic: true,
    };
  }

  const benefitMatch = safe.match(CONTENT_HIGHLIGHT_BENEFIT_PATTERN);
  if (benefitMatch?.[0]) {
    const highlight = cleanGeneratedText(benefitMatch[0]);
    const lead = cleanGeneratedText(safe.replace(benefitMatch[0], '').trim());
    if (highlight && lead) {
      return {
        lead: ensureTrailingSpace(lead),
        highlight,
        usedHeuristic: true,
      };
    }
  }

  const clauses = safe
    .split(/(?:,|;|:|\bafin de\b|\bpour\b)/i)
    .map((entry) => cleanGeneratedText(entry))
    .filter(Boolean);

  if (clauses.length >= 2) {
    const highlight = clauses[clauses.length - 1];
    const lead = clauses.slice(0, -1).join(' ').trim();
    if (highlight && lead) {
      return {
        lead: ensureTrailingSpace(lead),
        highlight,
        usedHeuristic: true,
      };
    }
  }

  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length >= 6) {
    const highlight = words.slice(-5).join(' ');
    const lead = words.slice(0, -5).join(' ');
    if (lead && highlight) {
      return {
        lead: ensureTrailingSpace(lead),
        highlight,
        usedHeuristic: true,
      };
    }
  }

  return {
    lead: CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_LEAD,
    highlight: CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_HIGHLIGHT,
    usedHeuristic: true,
  };
}

function extractDiscountToken(value: string): string {
  const safe = cleanGeneratedText(value);
  if (!safe) return '';
  const match = safe.match(/(?:-|−)?\s?\d{1,3}\s?%/);
  if (!match?.[0]) return '';
  return cleanGeneratedText(match[0].replace(/\s+/g, ' '));
}

function extractCodeToken(value: string): string {
  const safe = cleanGeneratedText(value);
  if (!safe) return '';
  const match = safe.match(
    /(?:code(?:\s+promo(?:tionnel)?)?|coupon)\s*[:#-]?\s*([A-Za-z0-9_-]{3,24})/i
  );
  if (!match?.[1]) return '';
  return cleanGeneratedText(match[1]).replace(/[^A-Za-z0-9_-]/g, '');
}

function extractFirstUrl(value: string): string {
  const safe = cleanGeneratedText(value);
  if (!safe) return '';
  const match = safe.match(/https?:\/\/[^\s)"']+/i);
  return match?.[0] ? cleanGeneratedText(match[0]) : '';
}

function resolvePromoBriefDefaults(brief?: EmailCopyBrief): {
  discountText: string;
  codeText: string;
} {
  if (!brief) {
    return { discountText: '', codeText: '' };
  }

  const discountCandidates = [
    brief.sourceSubject || '',
    brief.sourcePreheader || '',
    brief.offerSummary || '',
    brief.objective || '',
    brief.comments || '',
    brief.rawBriefText || '',
  ];
  const codeCandidates = [
    brief.promoCode || '',
    brief.offerSummary || '',
    brief.objective || '',
    brief.comments || '',
    brief.sourcePreheader || '',
    brief.sourceSubject || '',
    brief.rawBriefText || '',
  ];

  const discountText =
    discountCandidates
      .map((entry) => extractDiscountToken(entry))
      .find(Boolean) || '';
  const codeText =
    (brief.promoCode ? cleanGeneratedText(brief.promoCode).replace(/[^A-Za-z0-9_-]/g, '') : '') ||
    codeCandidates.map((entry) => extractCodeToken(entry)).find(Boolean) ||
    '';

  return { discountText, codeText };
}

function extractPromoFinePrint(value: string): string {
  const safe = cleanGeneratedText(value);
  if (!safe) return '';
  const starredMatch = safe.match(/\*[^.\n\r]{5,140}/);
  if (starredMatch?.[0]) return cleanGeneratedText(starredMatch[0]);
  const lineMatch = safe.match(
    /(offre[^.\n\r]{0,120}|valable[^.\n\r]{0,120}|premi[èe]re commande[^.\n\r]{0,120})/i
  );
  return lineMatch?.[0] ? cleanGeneratedText(lineMatch[0]) : '';
}

type NavLinkEntry = {
  label: string;
  url: string;
};

function toNavLinkArray(value: unknown): NavLinkEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const link = toSafeRecord(entry);
      if (!link) return null;
      const label = toSafeString(link.label);
      const url = toSafeString(link.url);
      if (!label && !url) return null;
      return { label, url };
    })
    .filter((entry): entry is NavLinkEntry => Boolean(entry));
}

function extractAllUrls(value: string): string[] {
  const safe = cleanGeneratedText(value);
  if (!safe) return [];
  const matches = safe.match(/https?:\/\/[^\s)"']+/gi) || [];
  const seen = new Set<string>();
  return matches
    .map((entry) => cleanGeneratedText(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function isImageOnlyTemplate(templateKey: string): boolean {
  const templateName = getTemplateNameFromKey(templateKey);
  return templateName === 'section.image' || templateName === 'mosaic.images5.centerHero';
}

function splitTitleTitreLines(input: {
  line1: string;
  line2: string;
  title: string;
  subtitle: string;
}): { line1: string; line2: string; usedHeuristic: boolean } {
  const directLine1 = cleanGeneratedText(input.line1);
  const directLine2 = cleanGeneratedText(input.line2);
  if (directLine1 && directLine2) {
    return { line1: directLine1, line2: directLine2, usedHeuristic: false };
  }

  const normalizedSubtitle = cleanGeneratedText(input.subtitle);

  if (directLine1 && !directLine2) {
    const split = splitHeroImageTopHeadline({
      headline: directLine1,
      fallbackLine2: normalizedSubtitle || TITLE_TITRE_DEFAULT_LINE2,
    });
    if (split.usedHeuristic && split.line2) {
      return { line1: split.line1, line2: split.line2, usedHeuristic: true };
    }
    return {
      line1: directLine1,
      line2: normalizedSubtitle || TITLE_TITRE_DEFAULT_LINE2,
      usedHeuristic: true,
    };
  }

  if (!directLine1 && directLine2) {
    return {
      line1: cleanGeneratedText(input.title) || TITLE_TITRE_DEFAULT_LINE1,
      line2: directLine2,
      usedHeuristic: true,
    };
  }

  const combinedSeed = cleanGeneratedText(input.title) || normalizedSubtitle;
  if (!combinedSeed) {
    return {
      line1: TITLE_TITRE_DEFAULT_LINE1,
      line2: TITLE_TITRE_DEFAULT_LINE2,
      usedHeuristic: true,
    };
  }

  const split = splitHeroImageTopHeadline({
    headline: combinedSeed,
    fallbackLine2: normalizedSubtitle || TITLE_TITRE_DEFAULT_LINE2,
  });
  const nextLine1 = split.line1 || TITLE_TITRE_DEFAULT_LINE1;
  const nextLine2 = split.line2 || normalizedSubtitle || TITLE_TITRE_DEFAULT_LINE2;
  return {
    line1: nextLine1,
    line2: nextLine2,
    usedHeuristic: true,
  };
}

function paragraphSeedsFromText(value: string): string[] {
  const safe = cleanGeneratedText(value);
  if (!safe) return [];

  const explicitParagraphs = value
    .split(/\r?\n\s*\r?\n/)
    .map((entry) => cleanGeneratedText(entry))
    .filter(Boolean);
  if (explicitParagraphs.length >= 2) return explicitParagraphs;

  const sentenceParts = splitContentSentences(safe);
  if (sentenceParts.length >= 4) {
    const midpoint = Math.ceil(sentenceParts.length / 2);
    return [
      cleanGeneratedText(sentenceParts.slice(0, midpoint).join(' ')),
      cleanGeneratedText(sentenceParts.slice(midpoint).join(' ')),
    ].filter(Boolean);
  }
  if (sentenceParts.length >= 2) {
    return sentenceParts;
  }
  return [safe];
}

function normalizeHeroImageTopParagraphs(input: {
  value: unknown;
  fallbackText: string;
  warnings: string[];
  warningPrefix: string;
}): string[] {
  const sourceArray = Array.isArray(input.value)
    ? (input.value as unknown[])
    : [];
  const sourceString = typeof input.value === 'string' ? input.value : '';
  const fallbackSeeds = paragraphSeedsFromText(input.fallbackText);

  const fromArray = sourceArray
    .map((entry) => cleanGeneratedText(stripArtifacts(toSafeString(entry)).replace(/https?:\/\/\S+/gi, '')))
    .filter(Boolean);
  const seeds = fromArray.length
    ? fromArray
    : paragraphSeedsFromText(stripArtifacts(sourceString)).length
      ? paragraphSeedsFromText(stripArtifacts(sourceString))
      : fallbackSeeds;

  let paragraphs = seeds
    .map((entry) => cleanGeneratedText(entry.replace(/https?:\/\/\S+/gi, '')))
    .filter(Boolean);

  if (paragraphs.length === 0) {
    paragraphs = [
      'Depuis 2001, Saveurs et Vie vous accompagne avec des repas adaptes a vos besoins, prepares par nos equipes et livres a domicile pour vous offrir une solution simple, humaine et rassurante au quotidien.',
      'Nos menus allient plaisir gustatif, equilibre nutritionnel et souplesse de commande pour vous permettre de conserver vos habitudes, votre confort et votre autonomie, en toute serenite.',
    ];
    input.warnings.push(`${input.warningPrefix}body.paragraphs fallback applied`);
  }

  if (paragraphs.length === 1) {
    const split = paragraphSeedsFromText(paragraphs[0]);
    if (split.length >= 2) {
      paragraphs = [split[0], split.slice(1).join(' ')];
      input.warnings.push(`${input.warningPrefix}body.paragraphs split from single paragraph`);
    } else {
      const secondFallback =
        fallbackSeeds[1] ||
        'Decouvrez une offre claire et un accompagnement de proximite, pense pour faciliter votre quotidien avec un service fiable, chaleureux et adapte a votre rythme.';
      paragraphs = [paragraphs[0], secondFallback];
      input.warnings.push(`${input.warningPrefix}body.paragraphs completed to 2`);
    }
  }

  if (paragraphs.length > 3) {
    paragraphs = paragraphs.slice(0, 3);
    input.warnings.push(`${input.warningPrefix}body.paragraphs truncated to 3`);
  }

  return paragraphs.map((paragraph, index) => {
    const normalized = ensureWithinLimit(
      paragraph,
      HERO_IMAGE_TOP_PARAGRAPH_MAX,
      `${input.warningPrefix}body.paragraphs[${index}]`,
      input.warnings
    );
    if (charCount(normalized) < HERO_IMAGE_TOP_PARAGRAPH_MIN) {
      input.warnings.push(
        `${input.warningPrefix}body.paragraphs[${index}] below recommended ${HERO_IMAGE_TOP_PARAGRAPH_MIN} chars`
      );
    }
    return normalized;
  });
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

function normalizeFormule2Bullets(input: {
  value: unknown;
  fallback: string[];
  cardIndex: number;
  warnings: string[];
  warningPrefix: string;
}): string[] {
  const source = Array.isArray(input.value)
    ? input.value
    : (typeof input.value === 'string' && input.value ? [input.value] : []);

  let bullets = source
    .map((entry) => stripArtifacts(toSafeString(entry)).replace(/https?:\/\/\S+/gi, ''))
    .map((entry) => cleanGeneratedText(entry))
    .filter(Boolean);

  if (bullets.length === 0) {
    bullets = input.fallback
      .map((entry) => cleanGeneratedText(entry))
      .filter(Boolean);
  }

  if (bullets.length === 0) {
    bullets = ['Une formule claire et adaptée à vos besoins.'];
    input.warnings.push(`${input.warningPrefix}cards.${input.cardIndex}.bullets fallback applied`);
  }

  if (bullets.length > FORMULE2_BULLETS_MAX) {
    bullets = bullets.slice(0, FORMULE2_BULLETS_MAX);
    input.warnings.push(
      `${input.warningPrefix}cards.${input.cardIndex}.bullets truncated to ${FORMULE2_BULLETS_MAX}`
    );
  }

  if (bullets.length < FORMULE2_BULLETS_MIN) {
    bullets = [bullets[0] || 'Une formule claire et adaptée à vos besoins.'];
    input.warnings.push(
      `${input.warningPrefix}cards.${input.cardIndex}.bullets completed to ${FORMULE2_BULLETS_MIN}`
    );
  }

  return bullets.map((bullet, bulletIndex) =>
    ensureWithinLimit(
      bullet,
      FORMULE2_BULLET_CHAR_MAX,
      `${input.warningPrefix}cards.${input.cardIndex}.bullets[${bulletIndex}]`,
      input.warnings
    )
  );
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

function resolveFooterBeigeBaseline(input: {
  templateKey: string;
  sourceBlock: EmailCopyBriefBlock;
  clientSlug: string;
}) {
  const templateDef = getTemplateDef(input.templateKey, input.clientSlug);
  const defaultLayout = toSafeRecord(templateDef?.defaultLayoutSpec) ?? {};
  const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};

  const defaultSocials = toSafeRecord(defaultLayout.socials) ?? {};
  const sourceSocials = toSafeRecord(sourceLayout.socials) ?? {};

  const instagramUrl =
    toSafeString(sourceSocials.instagramUrl) ||
    toSafeString(defaultSocials.instagramUrl) ||
    FOOTER_BEIGE_DEFAULT_INSTAGRAM_URL;
  const facebookUrl =
    toSafeString(sourceSocials.facebookUrl) ||
    toSafeString(defaultSocials.facebookUrl) ||
    FOOTER_BEIGE_DEFAULT_FACEBOOK_URL;
  const socialsShow = toSafeBoolean(
    sourceSocials.show,
    toSafeBoolean(defaultSocials.show, true)
  );

  const sourceCompanyLines = toStringArray(sourceLayout.companyLines);
  const defaultCompanyLines = toStringArray(defaultLayout.companyLines);
  const canonicalDefaultLines = (
    defaultCompanyLines.length ? defaultCompanyLines : FOOTER_BEIGE_DEFAULT_COMPANY_LINES
  ).slice(0, 3);
  while (canonicalDefaultLines.length < 3) {
    canonicalDefaultLines.push(
      FOOTER_BEIGE_DEFAULT_COMPANY_LINES[canonicalDefaultLines.length] || 'Informations légales'
    );
  }

  const companyLines = sourceCompanyLines.length
    ? sourceCompanyLines.slice(0, 3)
    : [...canonicalDefaultLines];
  while (companyLines.length < 3) {
    companyLines.push(canonicalDefaultLines[companyLines.length] || `Ligne ${companyLines.length + 1}`);
  }

  const recipientEmailLabel =
    toSafeString(sourceLayout.recipientEmailLabel) ||
    toSafeString(defaultLayout.recipientEmailLabel) ||
    FOOTER_BEIGE_DEFAULT_RECIPIENT_LABEL;

  const gdprParagraph =
    toSafeString(sourceLayout.gdprParagraph) ||
    toSafeString(defaultLayout.gdprParagraph) ||
    FOOTER_BEIGE_DEFAULT_GDPR;

  const sourceUnsubscribe = toSafeRecord(sourceLayout.unsubscribe) ?? {};
  const defaultUnsubscribe = toSafeRecord(defaultLayout.unsubscribe) ?? {};
  const unsubscribeUrl =
    toSafeString(sourceUnsubscribe.url) ||
    toSafeString(defaultUnsubscribe.url);

  return {
    socials: {
      instagramUrl,
      facebookUrl,
      show: socialsShow,
    },
    companyLines,
    recipientEmailLabel,
    gdprParagraph,
    unsubscribe: {
      label: FOOTER_BEIGE_DEFAULT_UNSUBSCRIBE_LABEL,
      url: unsubscribeUrl,
    },
    hasBriefCompanyOverride: sourceCompanyLines.length > 0,
    hasBriefGdprOverride: toSafeString(sourceLayout.gdprParagraph).length > 0,
    hasBriefRecipientOverride: toSafeString(sourceLayout.recipientEmailLabel).length > 0,
    hasBriefSocialOverride:
      toSafeString(sourceSocials.instagramUrl).length > 0 ||
      toSafeString(sourceSocials.facebookUrl).length > 0 ||
      typeof sourceSocials.show === 'boolean',
  };
}

function canonicalizeRenderSlots(input: {
  clientSlug: string;
  templateKey: string;
  sourceBlock: EmailCopyBriefBlock;
  brief?: EmailCopyBrief;
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

  if (templateName === 'title.titre') {
    const incomingLine1Record = toSafeRecord(incoming.line1);
    const incomingLine2Record = toSafeRecord(incoming.line2);
    const resolvedLines = splitTitleTitreLines({
      line1:
        toSafeString(incomingLine1Record?.text) ||
        toSafeString(incoming.line1),
      line2:
        toSafeString(incomingLine2Record?.text) ||
        toSafeString(incoming.line2),
      title: toSafeString(incoming.title) || input.title,
      subtitle: toSafeString(incoming.subtitle) || input.subtitle,
    });
    if (resolvedLines.usedHeuristic) {
      pushWarning('line1/line2 inferred by canonicalizer');
    }

    const line1Source = stripTrailingPunctuation(resolvedLines.line1 || TITLE_TITRE_DEFAULT_LINE1);
    const line2Source = stripTrailingPunctuation(resolvedLines.line2 || TITLE_TITRE_DEFAULT_LINE2);
    const line1 = ensureWithinLimit(
      line1Source || TITLE_TITRE_DEFAULT_LINE1,
      TITLE_TITRE_LINE_MAX,
      `${warningPrefix}line1.text`,
      warnings
    );
    const line2 = ensureWithinLimit(
      line2Source || TITLE_TITRE_DEFAULT_LINE2,
      TITLE_TITRE_LINE_MAX,
      `${warningPrefix}line2.text`,
      warnings
    );

    return {
      line1: { text: line1 || TITLE_TITRE_DEFAULT_LINE1 },
      line2: { text: line2 || TITLE_TITRE_DEFAULT_LINE2 },
    };
  }

  if (templateName === 'cta.pill354') {
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = new Set(['label', 'url', 'widthPx', 'radiusPx', 'align']);
    const extraKeys = incomingKeys.filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }

    const templateDef = getTemplateDef(input.templateKey, input.clientSlug);
    const defaultLayout = toSafeRecord(templateDef?.defaultLayoutSpec) ?? {};
    const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};

    const labelSeed = stripTrailingPunctuation(
      toSafeString(incoming.label) ||
        toSafeString(incoming.ctaLabel) ||
        input.sourceBlock.ctaLabel ||
        input.ctaLabel ||
        toSafeString(sourceLayout.label) ||
        toSafeString(defaultLayout.label) ||
        CTA_PILL354_DEFAULT_LABEL
    );
    const label = ensureWithinLimit(
      labelSeed || CTA_PILL354_DEFAULT_LABEL,
      CTA_PILL354_LABEL_MAX,
      `${warningPrefix}label`,
      warnings
    );

    const explicitUrl =
      toSafeString(sourceLayout.url) ||
      toSafeString(input.sourceBlock.ctaUrl) ||
      extractFirstUrl(input.sourceBlock.sourceContent || '') ||
      extractFirstUrl(input.sourceBlock.sourceTitle || '');
    const incomingUrl = toSafeString(incoming.url);
    if (incomingUrl && incomingUrl !== explicitUrl) {
      pushWarning('url removed because brief did not request it');
    }

    const widthPx = Math.max(
      220,
      Math.min(
        420,
        Math.round(toSafeNumber(sourceLayout.widthPx ?? defaultLayout.widthPx, CTA_PILL354_DEFAULT_WIDTH))
      )
    );
    const radiusPx = Math.max(
      16,
      Math.min(
        40,
        Math.round(toSafeNumber(sourceLayout.radiusPx ?? defaultLayout.radiusPx, CTA_PILL354_DEFAULT_RADIUS))
      )
    );
    const alignSeed =
      toSafeString(sourceLayout.align) ||
      toSafeString(defaultLayout.align) ||
      'center';
    const align =
      alignSeed === 'left' || alignSeed === 'right' || alignSeed === 'center'
        ? alignSeed
        : 'center';

    return {
      label: label || CTA_PILL354_DEFAULT_LABEL,
      ...(explicitUrl ? { url: explicitUrl } : {}),
      widthPx,
      radiusPx,
      align,
    };
  }

  if (templateName === 'promo.codePill') {
    const briefDefaults = resolvePromoBriefDefaults(input.brief);
    const incomingTextBefore = toSafeString(incoming.textBefore);
    const incomingDiscount = toSafeString(incoming.discountText);
    const incomingTextAfter = toSafeString(incoming.textAfter);
    const incomingCode = toSafeString(incoming.codeText).replace(/[^A-Za-z0-9_-]/g, '');

    const sourceDiscount = [
      input.sourceBlock.sourceTitle || '',
      input.sourceBlock.sourceContent || '',
      input.sourceBlock.ctaLabel || '',
      input.title,
      input.subtitle,
      input.content,
    ]
      .map((entry) => extractDiscountToken(entry))
      .find(Boolean) || '';

    const sourceCode = [
      input.sourceBlock.sourceTitle || '',
      input.sourceBlock.sourceContent || '',
      input.sourceBlock.ctaLabel || '',
      input.title,
      input.subtitle,
      input.content,
    ]
      .map((entry) => extractCodeToken(entry))
      .find(Boolean) || '';

    const textBefore = ensureWithinLimit(
      stripTrailingPunctuation(incomingTextBefore || PROMO_CODE_PILL_DEFAULT_TEXT_BEFORE),
      PROMO_CODE_PILL_TEXT_BEFORE_MAX,
      `${warningPrefix}textBefore`,
      warnings
    );
    const discountText = ensureWithinLimit(
      cleanGeneratedText(
        incomingDiscount ||
          briefDefaults.discountText ||
          sourceDiscount ||
          PROMO_CODE_PILL_DEFAULT_DISCOUNT
      ),
      PROMO_CODE_PILL_DISCOUNT_MAX,
      `${warningPrefix}discountText`,
      warnings
    );
    const textAfter = ensureWithinLimit(
      stripTrailingPunctuation(incomingTextAfter || PROMO_CODE_PILL_DEFAULT_TEXT_AFTER),
      PROMO_CODE_PILL_TEXT_AFTER_MAX,
      `${warningPrefix}textAfter`,
      warnings
    );
    const codeSeed =
      incomingCode ||
      briefDefaults.codeText ||
      sourceCode ||
      (discountText ? PROMO_CODE_PILL_DEFAULT_CODE : '');
    const codeText = ensureWithinLimit(
      cleanGeneratedText(codeSeed || PROMO_CODE_PILL_DEFAULT_CODE),
      PROMO_CODE_PILL_CODE_MAX,
      `${warningPrefix}codeText`,
      warnings
    );

    return {
      textBefore: textBefore || PROMO_CODE_PILL_DEFAULT_TEXT_BEFORE,
      discountText: discountText || PROMO_CODE_PILL_DEFAULT_DISCOUNT,
      textAfter: textAfter || PROMO_CODE_PILL_DEFAULT_TEXT_AFTER,
      codeText: codeText || PROMO_CODE_PILL_DEFAULT_CODE,
    };
  }

  if (templateName === 'promo.blueCodeCta') {
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = new Set(['discountLine', 'codeLineLabel', 'codeValue', 'finePrint', 'cta', 'align']);
    const extraKeys = incomingKeys.filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }

    const templateDef = getTemplateDef(input.templateKey, input.clientSlug);
    const defaultLayout = toSafeRecord(templateDef?.defaultLayoutSpec) ?? {};
    const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};
    const sourceCta = toSafeRecord(sourceLayout.cta) ?? {};
    const incomingCta = toSafeRecord(incoming.cta) ?? {};
    const briefDefaults = resolvePromoBriefDefaults(input.brief);

    const sourceDiscount =
      [
        input.sourceBlock.sourceTitle || '',
        input.sourceBlock.sourceContent || '',
        input.title,
        input.subtitle,
        input.content,
      ]
        .map((entry) => extractDiscountToken(entry))
        .find(Boolean) || '';
    const discountSeed = cleanGeneratedText(
      toSafeString(incoming.discountLine) ||
        toSafeString(sourceLayout.discountLine) ||
        briefDefaults.discountText ||
        sourceDiscount ||
        toSafeString(defaultLayout.discountLine) ||
        PROMO_BLUE_DEFAULT_DISCOUNT
    );
    let discountLine = ensureWithinLimit(
      stripEmoji(discountSeed),
      PROMO_BLUE_DISCOUNT_MAX,
      `${warningPrefix}discountLine`,
      warnings
    );
    if (!discountLine.includes('%')) {
      discountLine = PROMO_BLUE_DEFAULT_DISCOUNT;
      pushWarning('discountLine reset to default because % symbol was missing');
    }

    const sourceCode =
      [
        input.sourceBlock.sourceTitle || '',
        input.sourceBlock.sourceContent || '',
        input.sourceBlock.ctaLabel || '',
        input.title,
        input.subtitle,
        input.content,
      ]
        .map((entry) => extractCodeToken(entry))
        .find(Boolean) || '';
    const codeSeed = cleanGeneratedText(
      toSafeString(incoming.codeValue) ||
        toSafeString(sourceLayout.codeValue) ||
        briefDefaults.codeText ||
        sourceCode ||
        toSafeString(defaultLayout.codeValue) ||
        PROMO_BLUE_DEFAULT_CODE_VALUE
    );
    let codeValue = ensureWithinLimit(
      codeSeed.replace(/\s+/g, '').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase(),
      PROMO_BLUE_CODE_MAX,
      `${warningPrefix}codeValue`,
      warnings
    );
    if (!codeValue) {
      codeValue = PROMO_BLUE_DEFAULT_CODE_VALUE;
      pushWarning('codeValue restored to default');
    }

    const codeLineLabel = PROMO_BLUE_DEFAULT_CODE_LABEL;
    if (toSafeString(incoming.codeLineLabel) && toSafeString(incoming.codeLineLabel) !== codeLineLabel) {
      pushWarning('codeLineLabel reset to "CODE :"');
    }

    const explicitFinePrint =
      extractPromoFinePrint(toSafeString(sourceLayout.finePrint)) ||
      extractPromoFinePrint(input.sourceBlock.sourceContent || '') ||
      extractPromoFinePrint(input.brief?.comments || '') ||
      extractPromoFinePrint(input.brief?.rawBriefText || '');
    const incomingFinePrint = stripEmoji(toSafeString(incoming.finePrint));
    let finePrintSeed = explicitFinePrint || incomingFinePrint || toSafeString(defaultLayout.finePrint) || PROMO_BLUE_DEFAULT_FINE_PRINT;
    if (incomingFinePrint && !explicitFinePrint && incomingFinePrint !== PROMO_BLUE_DEFAULT_FINE_PRINT) {
      finePrintSeed = toSafeString(defaultLayout.finePrint) || PROMO_BLUE_DEFAULT_FINE_PRINT;
      pushWarning('finePrint reset to default to avoid unsupported legal condition');
    }
    if (discountLine.includes('*') && !finePrintSeed.startsWith('*')) {
      finePrintSeed = `*${finePrintSeed.replace(/^\*+/, '').trim()}`;
      pushWarning('finePrint prefixed with * to match discountLine');
    }
    const finePrint = ensureWithinLimit(
      finePrintSeed,
      PROMO_BLUE_FINE_PRINT_MAX,
      `${warningPrefix}finePrint`,
      warnings
    );

    const ctaLabelSeed =
      stripEmoji(
        stripTrailingPunctuation(
          toSafeString(incomingCta.label) ||
            toSafeString(sourceCta.label) ||
            input.sourceBlock.ctaLabel ||
            input.ctaLabel ||
            PROMO_BLUE_DEFAULT_CTA_LABEL
        )
      ) || PROMO_BLUE_DEFAULT_CTA_LABEL;
    const ctaLabel = ensureWithinLimit(
      ctaLabelSeed,
      PROMO_BLUE_CTA_MAX,
      `${warningPrefix}cta.label`,
      warnings
    );

    const briefCtaUrl = toSafeString(sourceCta.url) || toSafeString(input.sourceBlock.ctaUrl);
    const incomingCtaUrl = toSafeString(incomingCta.url);
    if (incomingCtaUrl && incomingCtaUrl !== briefCtaUrl) {
      pushWarning('cta.url removed because brief did not request it');
    }

    const alignInput = toSafeString(incoming.align) || toSafeString(sourceLayout.align) || toSafeString(defaultLayout.align);
    const align =
      alignInput === 'left' || alignInput === 'right' || alignInput === 'center'
        ? alignInput
        : 'center';

    return {
      discountLine: discountLine || PROMO_BLUE_DEFAULT_DISCOUNT,
      codeLineLabel,
      codeValue,
      finePrint: finePrint || PROMO_BLUE_DEFAULT_FINE_PRINT,
      cta: {
        label: ctaLabel || PROMO_BLUE_DEFAULT_CTA_LABEL,
        ...(briefCtaUrl ? { url: briefCtaUrl } : {}),
      },
      align,
    };
  }

  if (templateName === 'reassurance.navLinks') {
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = new Set(['links', 'gapPx']);
    const extraKeys = incomingKeys.filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }

    const templateDef = getTemplateDef(input.templateKey, input.clientSlug);
    const defaultLayout = toSafeRecord(templateDef?.defaultLayoutSpec) ?? {};
    const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};

    const incomingLinks = toNavLinkArray(incoming.links);
    const sourceLinks = toNavLinkArray(sourceLayout.links);
    const defaultLinks = toNavLinkArray(defaultLayout.links);
    const baselineLinks = sourceLinks.length > 0 ? sourceLinks : defaultLinks.length > 0 ? defaultLinks : REASSURANCE_DEFAULT_LINKS;

    if (incomingLinks.length > REASSURANCE_LINK_COUNT) {
      pushWarning(`links truncated to ${REASSURANCE_LINK_COUNT}`);
    } else if (incomingLinks.length < REASSURANCE_LINK_COUNT) {
      pushWarning(`links completed to ${REASSURANCE_LINK_COUNT}`);
    }

    const explicitUrls = [
      ...extractAllUrls(input.sourceBlock.sourceContent || ''),
      ...extractAllUrls(input.sourceBlock.sourceTitle || ''),
      ...extractAllUrls(input.sourceBlock.ctaUrl || ''),
    ];

    const links = Array.from({ length: REASSURANCE_LINK_COUNT }, (_, index) => {
      const incomingLink = incomingLinks[index];
      const baseline = baselineLinks[index] || REASSURANCE_DEFAULT_LINKS[index];
      const defaultLink = REASSURANCE_DEFAULT_LINKS[index];

      const labelSeed =
        stripEmoji(
          stripTrailingPunctuation(
            incomingLink?.label || baseline?.label || defaultLink.label
          )
        ) || defaultLink.label;
      const label = ensureWithinLimit(
        labelSeed,
        REASSURANCE_LABEL_MAX,
        `${warningPrefix}links.${index}.label`,
        warnings
      ) || defaultLink.label;

      const baselineUrl = toSafeString(baseline?.url) || '#';
      const explicitUrl = explicitUrls[index] || '';
      const incomingUrl = toSafeString(incomingLink?.url);
      let url = explicitUrl || baselineUrl || '#';

      if (!url) url = '#';

      if (incomingUrl && incomingUrl !== url) {
        pushWarning(`links.${index}.url reset to brief/default value`);
      }

      return { label, url };
    });

    const explicitGapInLayout = sourceLayout.gapPx != null;
    const layoutGap = toSafeNumber(sourceLayout.gapPx, REASSURANCE_DEFAULT_GAP);
    const incomingGap = toSafeNumber(incoming.gapPx, REASSURANCE_DEFAULT_GAP);
    const gapPx = Math.max(
      8,
      Math.min(
        40,
        Math.round(explicitGapInLayout ? layoutGap : REASSURANCE_DEFAULT_GAP)
      )
    );

    if (!explicitGapInLayout && incoming.gapPx != null && incomingGap !== REASSURANCE_DEFAULT_GAP) {
      pushWarning(`gapPx reset to ${REASSURANCE_DEFAULT_GAP}`);
    }

    return {
      links,
      gapPx,
    };
  }

  if (templateName === 'text.beigeCta') {
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = new Set(['title', 'bodyParagraphs', 'cta', 'align']);
    const extraKeys = incomingKeys.filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }

    const templateDef = getTemplateDef(input.templateKey, input.clientSlug);
    const defaultLayout = toSafeRecord(templateDef?.defaultLayoutSpec) ?? {};
    const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};
    const sourceCta = toSafeRecord(sourceLayout.cta) ?? {};
    const incomingCta = toSafeRecord(incoming.cta) ?? {};

    const incomingTitleMultiline = toSafeMultiline(incoming.title);
    const sourceTitleMultiline = toSafeMultiline(sourceLayout.title);
    const defaultTitleMultiline = toSafeMultiline(defaultLayout.title);
    const titleSeed =
      incomingTitleMultiline ||
      sourceTitleMultiline ||
      toSafeMultiline(input.title) ||
      defaultTitleMultiline ||
      TEXT_BEIGE_CTA_DEFAULT_TITLE;
    const normalizedTitle = normalizeSingleLineBreak(stripEmoji(titleSeed));
    if (normalizedTitle.collapsed) {
      pushWarning('title line breaks normalized to a single "\\n"');
    }
    const title = ensureWithinLimit(
      normalizedTitle.text || TEXT_BEIGE_CTA_DEFAULT_TITLE,
      TEXT_BEIGE_CTA_TITLE_MAX,
      `${warningPrefix}title`,
      warnings
    );

    const incomingParagraphs = toStringArray(incoming.bodyParagraphs).map((entry) => stripEmoji(entry));
    const sourceParagraphs = toStringArray(sourceLayout.bodyParagraphs).map((entry) => stripEmoji(entry));
    const defaultParagraphs = toStringArray(defaultLayout.bodyParagraphs).map((entry) => stripEmoji(entry));
    const sentenceFallbacks = splitContentSentences(input.sourceBlock.sourceContent || input.content).map((entry) =>
      stripEmoji(entry)
    );

    let paragraphPool = incomingParagraphs.length
      ? incomingParagraphs
      : sourceParagraphs.length
      ? sourceParagraphs
      : defaultParagraphs.length
      ? defaultParagraphs
      : sentenceFallbacks.length
      ? sentenceFallbacks
      : TEXT_BEIGE_CTA_DEFAULT_BODY_PARAGRAPHS;

    if (paragraphPool.length > TEXT_BEIGE_CTA_PARAGRAPH_COUNT) {
      paragraphPool = paragraphPool.slice(0, TEXT_BEIGE_CTA_PARAGRAPH_COUNT);
      pushWarning(`bodyParagraphs truncated to ${TEXT_BEIGE_CTA_PARAGRAPH_COUNT}`);
    }

    while (paragraphPool.length < TEXT_BEIGE_CTA_PARAGRAPH_COUNT) {
      const fallback =
        TEXT_BEIGE_CTA_DEFAULT_BODY_PARAGRAPHS[paragraphPool.length] ||
        TEXT_BEIGE_CTA_DEFAULT_BODY_PARAGRAPHS[TEXT_BEIGE_CTA_DEFAULT_BODY_PARAGRAPHS.length - 1];
      paragraphPool.push(fallback);
      pushWarning(`bodyParagraphs completed to ${TEXT_BEIGE_CTA_PARAGRAPH_COUNT}`);
    }

    const paragraph1 = ensureWithinLimit(
      stripEmoji(paragraphPool[0] || TEXT_BEIGE_CTA_DEFAULT_BODY_PARAGRAPHS[0]),
      TEXT_BEIGE_CTA_PARAGRAPH1_MAX,
      `${warningPrefix}bodyParagraphs[0]`,
      warnings
    );
    const paragraph2 = ensureWithinLimit(
      stripEmoji(paragraphPool[1] || TEXT_BEIGE_CTA_DEFAULT_BODY_PARAGRAPHS[1]),
      TEXT_BEIGE_CTA_PARAGRAPH2_MAX,
      `${warningPrefix}bodyParagraphs[1]`,
      warnings
    );

    const ctaLabelSeed =
      stripEmoji(
        stripTrailingPunctuation(
          toSafeString(incomingCta.label) ||
            toSafeString(sourceCta.label) ||
            input.sourceBlock.ctaLabel ||
            input.ctaLabel ||
            toSafeString(defaultLayout.ctaLabel) ||
            TEXT_BEIGE_CTA_DEFAULT_CTA_LABEL
        )
      ) || TEXT_BEIGE_CTA_DEFAULT_CTA_LABEL;
    const uppercasedCtaLabel = ctaLabelSeed.toUpperCase();
    if (ctaLabelSeed !== uppercasedCtaLabel) {
      pushWarning('cta.label uppercased');
    }
    const ctaLabel = ensureWithinLimit(
      uppercasedCtaLabel,
      TEXT_BEIGE_CTA_CTA_MAX,
      `${warningPrefix}cta.label`,
      warnings
    );

    const ctaUrl =
      toSafeString(sourceCta.url) ||
      toSafeString(input.sourceBlock.ctaUrl);
    const incomingCtaUrl = toSafeString(incomingCta.url);
    if (incomingCtaUrl && incomingCtaUrl !== ctaUrl) {
      pushWarning('cta.url removed because brief did not request it');
    }

    const alignInput = toSafeString(incoming.align) || toSafeString(sourceLayout.align) || toSafeString(defaultLayout.align);
    const align = alignInput === 'center' ? 'center' : 'left';

    return {
      title: title || TEXT_BEIGE_CTA_DEFAULT_TITLE,
      bodyParagraphs: [paragraph1, paragraph2],
      cta: {
        label: ctaLabel || TEXT_BEIGE_CTA_DEFAULT_CTA_LABEL,
        ...(ctaUrl ? { url: ctaUrl } : {}),
      },
      align,
    };
  }

  if (templateName === 'content.centerHighlight') {
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = new Set(['paragraphs', 'align']);
    const extraKeys = incomingKeys.filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }

    const incomingParagraphs = Array.isArray(incoming.paragraphs) ? incoming.paragraphs : [];
    if (incomingParagraphs.length > CONTENT_HIGHLIGHT_PARAGRAPH_COUNT) {
      pushWarning(`paragraphs truncated to ${CONTENT_HIGHLIGHT_PARAGRAPH_COUNT}`);
    } else if (incomingParagraphs.length < CONTENT_HIGHLIGHT_PARAGRAPH_COUNT) {
      pushWarning(`paragraphs completed to ${CONTENT_HIGHLIGHT_PARAGRAPH_COUNT}`);
    }

    const paragraphOneRecord = toSafeRecord(incomingParagraphs[0]);
    const paragraphOneParts = Array.isArray(paragraphOneRecord?.parts)
      ? (paragraphOneRecord?.parts as unknown[])
          .map((part) => normalizeContentHighlightPart(part))
          .filter((part): part is ContentHighlightPart => Boolean(part))
      : [];
    const paragraphOneText = paragraphOneParts.map((part) => part.text).join(' ').trim();
    const paragraphOneFallback =
      splitContentSentences(sourceContent || input.content)[0] ||
      CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_LEAD + CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_HIGHLIGHT;

    const highlightPart = paragraphOneParts.find((part) => part.tone === 'highlight');
    const defaultParts = paragraphOneParts.filter((part) => part.tone !== 'highlight');
    let paragraphOneLead = defaultParts.map((part) => part.text).join(' ').trim();
    let paragraphOneHighlight = highlightPart?.text || '';

    if (!paragraphOneLead || !paragraphOneHighlight) {
      const inferred = splitHighlightClause(paragraphOneText || paragraphOneFallback);
      paragraphOneLead = paragraphOneLead || inferred.lead;
      paragraphOneHighlight = paragraphOneHighlight || inferred.highlight;
      if (inferred.usedHeuristic) {
        pushWarning('paragraphs[0] highlight inferred by canonicalizer');
      }
    }

    paragraphOneLead = ensureTrailingSpace(
      paragraphOneLead || CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_LEAD
    );
    paragraphOneHighlight = ensureWithinLimit(
      stripTrailingPunctuation(paragraphOneHighlight || CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH1_HIGHLIGHT),
      CONTENT_HIGHLIGHT_HIGHLIGHT_MAX,
      `${warningPrefix}paragraphs[0].parts[1].text`,
      warnings
    );

    const paragraphTwoRecord = toSafeRecord(incomingParagraphs[1]);
    const paragraphTwoParts = Array.isArray(paragraphTwoRecord?.parts)
      ? (paragraphTwoRecord?.parts as unknown[])
          .map((part) => normalizeContentHighlightPart(part))
          .filter((part): part is ContentHighlightPart => Boolean(part))
      : [];
    const paragraphTwoSource =
      paragraphTwoParts.map((part) => part.text).join(' ').trim() ||
      splitContentSentences(sourceContent || input.content)[1] ||
      input.subtitle ||
      CONTENT_HIGHLIGHT_DEFAULT_PARAGRAPH2;
    const paragraphTwoText = ensureWithinLimit(
      stripEmoji(stripTrailingPunctuation(paragraphTwoSource)),
      CONTENT_HIGHLIGHT_PARAGRAPH2_MAX,
      `${warningPrefix}paragraphs[1].parts[0].text`,
      warnings
    );

    const alignInput = toSafeString(incoming.align);
    const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};
    const alignSeed =
      alignInput || toSafeString(sourceLayout.align) || 'center';
    const align =
      alignSeed === 'left' || alignSeed === 'right' || alignSeed === 'center'
        ? alignSeed
        : 'center';

    if (paragraphOneParts.length !== 2 || paragraphOneParts.filter((part) => part.tone === 'highlight').length !== 1) {
      pushWarning('paragraphs[0].parts normalized to one highlight segment');
    }
    if (paragraphTwoParts.length !== 1 || paragraphTwoParts.some((part) => part.tone === 'highlight')) {
      pushWarning('paragraphs[1].parts normalized to single default segment');
    }

    return {
      paragraphs: [
        {
          parts: [
            { text: paragraphOneLead, tone: 'default' },
            { text: paragraphOneHighlight, tone: 'highlight' },
          ],
        },
        {
          parts: [{ text: paragraphTwoText, tone: 'default' }],
        },
      ],
      align,
    };
  }

  if (templateName === 'section.image') {
    const templateDef = getTemplateDef(input.templateKey, input.clientSlug);
    const defaultLayout = toSafeRecord(templateDef?.defaultLayoutSpec) ?? {};
    const defaultImage = toSafeRecord(defaultLayout.image) ?? {};
    const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};
    const sourceImage = toSafeRecord(sourceLayout.image) ?? {};
    const incomingImage = toSafeRecord(incoming.image) ?? {};
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = new Set(['image', 'linkUrl', 'align', 'maxWidth']);
    const extraKeys = incomingKeys.filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }
    if (
      ['title', 'subtitle', 'content', 'cta', 'ctaLabel', 'caption', 'body'].some(
        (key) => incomingKeys.includes(key)
      )
    ) {
      pushWarning('text content removed for image-only block');
    }

    const defaultSrc = toSafeString(defaultImage.src);
    const sourceSrc = toSafeString(sourceImage.src);
    const sourceAlt = toSafeString(sourceImage.alt);
    const isLogoCentrePreset =
      sourceSrc === SECTION_IMAGE_LOGO_CENTRE_URL ||
      sourceAlt.toLowerCase() === SECTION_IMAGE_LOGO_CENTRE_ALT.toLowerCase();
    const explicitBriefSrc =
      extractFirstUrl(input.sourceBlock.sourceContent || '') ||
      extractFirstUrl(input.sourceBlock.sourceTitle || '');
    const baselineSrc =
      isLogoCentrePreset && !explicitBriefSrc
        ? SECTION_IMAGE_LOGO_CENTRE_URL
        : sourceSrc || defaultSrc;
    const src = explicitBriefSrc || baselineSrc;
    const incomingSrc =
      toSafeString(incomingImage.src) || toSafeString(incoming.imageSrc);
    if (incomingSrc && incomingSrc !== src) {
      pushWarning('image.src reset to brief/preset value');
    }
    if (!src) {
      pushWarning('image.src missing and no default available');
    } else if (!sourceSrc && !explicitBriefSrc && defaultSrc) {
      pushWarning('image.src restored from default');
    }

    const altInput = toSafeString(sourceImage.alt);
    const defaultAlt = isLogoCentrePreset
      ? SECTION_IMAGE_LOGO_CENTRE_ALT
      : toSafeString(defaultImage.alt) || 'Visuel Saveurs et Vie';
    const alt = ensureWithinLimit(
      altInput || defaultAlt,
      40,
      `${warningPrefix}image.alt`,
      warnings
    );
    if (
      (toSafeString(incomingImage.alt) || toSafeString(incoming.imageAlt)) &&
      (toSafeString(incomingImage.alt) || toSafeString(incoming.imageAlt)) !== alt
    ) {
      pushWarning('image.alt reset to brief/default value');
    }

    const alignInput =
      toSafeString(sourceLayout.align) ||
      toSafeString(defaultLayout.align) ||
      'center';
    const align =
      alignInput === 'left' || alignInput === 'right' || alignInput === 'center'
        ? alignInput
        : 'center';
    const incomingAlign = toSafeString(incoming.align);
    if (incomingAlign && incomingAlign !== align) {
      pushWarning('align reset to brief/default value');
    }

    const maxWidth = Math.min(
      1200,
      Math.max(
        320,
        Math.round(
          toSafeNumber(
            sourceLayout.maxWidth ?? defaultLayout.maxWidth,
            800
          )
        )
      )
    );
    const incomingMaxWidth = toSafeNumber(incoming.maxWidth, maxWidth);
    if (incoming.maxWidth != null && incomingMaxWidth !== maxWidth) {
      pushWarning('maxWidth reset to brief/default value');
    }
    const linkUrl = toSafeString(sourceLayout.linkUrl) || toSafeString(input.sourceBlock.ctaUrl);
    const incomingLinkUrl = toSafeString(incoming.linkUrl);
    if (incomingLinkUrl && incomingLinkUrl !== linkUrl) {
      pushWarning('linkUrl removed because brief did not request it');
    }

    return {
      image: {
        src: src || defaultSrc,
        alt: alt || defaultAlt,
      },
      align,
      maxWidth,
      ...(linkUrl ? { linkUrl } : {}),
    };
  }

  if (templateName === 'mosaic.images5.centerHero') {
    const templateDef = getTemplateDef(input.templateKey, input.clientSlug);
    const defaultLayout = toSafeRecord(templateDef?.defaultLayoutSpec) ?? {};
    const sourceLayout = toSafeRecord(input.sourceBlock.layoutSpec) ?? {};
    const defaultImages = toSafeRecord(defaultLayout.images) ?? {};
    const sourceImages = toSafeRecord(sourceLayout.images) ?? {};
    const incomingImages = toSafeRecord(incoming.images) ?? {};
    const incomingKeys = Object.keys(incoming);
    const allowedKeys = new Set(['images', 'radiusPx']);
    const extraKeys = incomingKeys.filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }
    if (
      ['title', 'subtitle', 'content', 'cta', 'ctaLabel', 'caption', 'body', 'headline'].some(
        (key) => incomingKeys.includes(key)
      )
    ) {
      pushWarning('text content removed for image-only block');
    }

    const explicitUrls = [
      ...extractAllUrls(input.sourceBlock.sourceTitle || ''),
      ...extractAllUrls(input.sourceBlock.sourceContent || ''),
    ];
    const incomingImageKeys = Object.keys(incomingImages);
    if (incomingImageKeys.length > 0 && incomingImageKeys.length !== MOSAIC_IMAGE_KEYS.length) {
      pushWarning(`images normalized to ${MOSAIC_IMAGE_KEYS.length} fixed slots`);
    }

    const normalizedImages = MOSAIC_IMAGE_KEYS.reduce<Record<string, unknown>>((accumulator, key, index) => {
      const defaultImage = toSafeRecord(defaultImages[key]) ?? {};
      const sourceImage = toSafeRecord(sourceImages[key]) ?? {};
      const incomingImage = toSafeRecord(incomingImages[key]) ?? {};
      const defaultSrc = toSafeString(defaultImage.src) || MOSAIC_DEFAULT_IMAGES[key].src;
      const sourceSrc = toSafeString(sourceImage.src);
      const resolvedExplicitSrc = explicitUrls[index] || '';
      const resolvedSrc = resolvedExplicitSrc || sourceSrc || defaultSrc;
      const incomingSrc = toSafeString(incomingImage.src);
      if (incomingSrc && incomingSrc !== resolvedSrc) {
        pushWarning(`images.${key}.src reset to brief/default value`);
      }
      if (!resolvedSrc) {
        pushWarning(`images.${key}.src restored from default`);
      }

      const sourceAlt = toSafeString(sourceImage.alt);
      const incomingAlt = toSafeString(incomingImage.alt);
      const resolvedAlt = ensureWithinLimit(
        sourceAlt || incomingAlt || MOSAIC_DEFAULT_IMAGES[key].alt,
        12,
        `${warningPrefix}images.${key}.alt`,
        warnings
      );

      const sourceLinkUrl = toSafeString(sourceImage.linkUrl);
      const incomingLinkUrl = toSafeString(incomingImage.linkUrl);
      if (incomingLinkUrl && incomingLinkUrl !== sourceLinkUrl) {
        pushWarning(`images.${key}.linkUrl removed because brief did not request it`);
      }

      accumulator[key] = {
        src: resolvedSrc || MOSAIC_DEFAULT_IMAGES[key].src,
        ...(resolvedAlt ? { alt: resolvedAlt } : {}),
        ...(sourceLinkUrl ? { linkUrl: sourceLinkUrl } : {}),
      };
      return accumulator;
    }, {});

    const baselineRadius = Math.max(
      0,
      Math.min(
        24,
        Math.round(toSafeNumber(sourceLayout.radiusPx ?? defaultLayout.radiusPx, MOSAIC_RADIUS_DEFAULT))
      )
    );
    const incomingRadius = toSafeNumber(incoming.radiusPx, baselineRadius);
    if (incoming.radiusPx != null && incomingRadius !== baselineRadius) {
      pushWarning('radiusPx reset to brief/default value');
    }

    return {
      images: normalizedImages,
      radiusPx: baselineRadius,
    };
  }

  if (templateName === 'footer.beige') {
    const baseline = resolveFooterBeigeBaseline({
      templateKey: input.templateKey,
      sourceBlock: input.sourceBlock,
      clientSlug: input.clientSlug,
    });

    const incomingSocials = toSafeRecord(incoming.socials) ?? {};
    const incomingCompanyLines = toStringArray(incoming.companyLines);
    const incomingRecipient = toSafeString(incoming.recipientEmailLabel);
    const incomingGdpr = toSafeString(incoming.gdprParagraph);
    const incomingUnsubscribe = toSafeRecord(incoming.unsubscribe) ?? {};

    const normalizedIncomingCompanyLines = incomingCompanyLines.slice(0, 3);
    while (normalizedIncomingCompanyLines.length < 3 && incomingCompanyLines.length > 0) {
      normalizedIncomingCompanyLines.push(
        normalizedIncomingCompanyLines[normalizedIncomingCompanyLines.length - 1] || ''
      );
    }

    if (!baseline.hasBriefCompanyOverride) {
      if (
        incomingCompanyLines.length > 0 &&
        !sameStringArray(normalizedIncomingCompanyLines, baseline.companyLines)
      ) {
        pushWarning('companyLines reset to legal default lines');
      }
    } else if (
      incomingCompanyLines.length > 0 &&
      !sameStringArray(normalizedIncomingCompanyLines, baseline.companyLines)
    ) {
      pushWarning('companyLines reset to brief override lines');
    }
    if (incomingCompanyLines.length > 0 && incomingCompanyLines.length !== 3) {
      pushWarning('companyLines normalized to 3 lines');
    }

    if (!baseline.hasBriefGdprOverride) {
      if (incomingGdpr && incomingGdpr !== baseline.gdprParagraph) {
        pushWarning('gdprParagraph reset to legal default');
      }
    } else if (incomingGdpr && incomingGdpr !== baseline.gdprParagraph) {
      pushWarning('gdprParagraph reset to brief override');
    }

    if (!baseline.hasBriefRecipientOverride) {
      if (incomingRecipient && incomingRecipient !== baseline.recipientEmailLabel) {
        pushWarning('recipientEmailLabel reset to placeholder');
      }
    } else if (incomingRecipient && incomingRecipient !== baseline.recipientEmailLabel) {
      pushWarning('recipientEmailLabel reset to brief override');
    }

    const incomingInstagram = toSafeString(incomingSocials.instagramUrl);
    const incomingFacebook = toSafeString(incomingSocials.facebookUrl);
    const incomingShow = typeof incomingSocials.show === 'boolean' ? incomingSocials.show : null;
    if (!baseline.hasBriefSocialOverride) {
      if (
        (incomingInstagram && incomingInstagram !== baseline.socials.instagramUrl) ||
        (incomingFacebook && incomingFacebook !== baseline.socials.facebookUrl) ||
        (incomingShow !== null && incomingShow !== baseline.socials.show)
      ) {
        pushWarning('socials reset to approved brand links');
      }
    } else if (
      (incomingInstagram && incomingInstagram !== baseline.socials.instagramUrl) ||
      (incomingFacebook && incomingFacebook !== baseline.socials.facebookUrl) ||
      (incomingShow !== null && incomingShow !== baseline.socials.show)
    ) {
      pushWarning('socials reset to brief override links');
    }

    const incomingUnsubscribeLabel = toSafeString(incomingUnsubscribe.label);
    const incomingUnsubscribeUrl = toSafeString(incomingUnsubscribe.url);
    if (
      incomingUnsubscribeLabel &&
      incomingUnsubscribeLabel !== FOOTER_BEIGE_DEFAULT_UNSUBSCRIBE_LABEL
    ) {
      pushWarning('unsubscribe.label reset to fixed legal label');
    }
    if (incomingUnsubscribeUrl && incomingUnsubscribeUrl !== baseline.unsubscribe.url) {
      pushWarning('unsubscribe.url reset to brief/default value');
    }

    return {
      socials: {
        instagramUrl: baseline.socials.instagramUrl,
        facebookUrl: baseline.socials.facebookUrl,
        show: baseline.socials.show,
      },
      companyLines: baseline.companyLines.slice(0, 3),
      recipientEmailLabel: baseline.recipientEmailLabel,
      gdprParagraph: baseline.gdprParagraph,
      unsubscribe: {
        label: FOOTER_BEIGE_DEFAULT_UNSUBSCRIBE_LABEL,
        url: baseline.unsubscribe.url,
      },
    };
  }

  if (templateName === 'hero.imageTop') {
    const incomingImage = toSafeRecord(incoming.image);
    const incomingHeadline = toSafeRecord(incoming.headline);
    const incomingBody = toSafeRecord(incoming.body);
    const incomingCta = toSafeRecord(incoming.cta);

    const headlineSingle = toSafeString(incoming.headline);
    const headlineLine1Raw = toSafeString(incomingHeadline?.line1);
    const headlineLine2Raw = toSafeString(incomingHeadline?.line2);
    const headlineFromFields = cleanGeneratedText(
      `${headlineLine1Raw} ${headlineLine2Raw}`.trim()
    );
    const headlineSeed =
      headlineSingle ||
      headlineFromFields ||
      input.title ||
      'Bien plus qu’un service';
    const headlineSplit = splitHeroImageTopHeadline({
      headline: headlineSeed,
      fallbackLine2: input.subtitle || 'de portage de repas',
    });
    const usedHeadlineFallback =
      !!headlineSingle ||
      (!headlineLine1Raw && !headlineLine2Raw);
    if (usedHeadlineFallback && headlineSplit.usedHeuristic) {
      pushWarning('headline split into line1/line2 by canonicalizer');
    }

    const line1 = ensureWithinLimit(
      headlineLine1Raw || headlineSplit.line1,
      HERO_IMAGE_TOP_LINE1_MAX,
      `${warningPrefix}headline.line1`,
      warnings
    );
    const line2 = ensureWithinLimit(
      headlineLine2Raw || headlineSplit.line2,
      HERO_IMAGE_TOP_LINE2_MAX,
      `${warningPrefix}headline.line2`,
      warnings
    );

    const greetingInput = toSafeString(incomingBody?.greeting);
    const greeting =
      greetingInput &&
      /^bonjour/i.test(greetingInput) &&
      /\{\s*PRENOM\s*\}/i.test(greetingInput)
        ? trimToLimit(greetingInput, 90)
        : 'Bonjour {PRENOM},';
    if (greeting !== greetingInput && greetingInput) {
      pushWarning('body.greeting normalized to "Bonjour {PRENOM},"');
    }

    const paragraphs = normalizeHeroImageTopParagraphs({
      value: incomingBody?.paragraphs ?? incoming.body,
      fallbackText: sourceContent || input.content,
      warnings,
      warningPrefix,
    });

    const ctaLabel = ensureWithinLimit(
      toSafeString(incomingCta?.label) ||
        toSafeString(incoming.ctaLabel) ||
        input.ctaLabel,
      HERO_IMAGE_TOP_CTA_MAX,
      `${warningPrefix}cta.label`,
      warnings
    );

    return {
      image: {
        src: toSafeString(incomingImage?.src),
        alt: trimToLimit(
          toSafeString(incomingImage?.alt) || toSafeString(incoming.imageAlt) || 'Visuel Saveurs et Vie',
          90
        ),
      },
      headline: {
        line1,
        line2,
      },
      body: {
        greeting,
        paragraphs,
      },
      cta: {
        label: ctaLabel || 'Je découvre les menus',
      },
    };
  }

  if (templateName === 'twoCards.formule2') {
    const incomingCards = Array.isArray(incoming.cards) ? incoming.cards : [];
    const fallbackBullets = splitContentIntoBullets(
      sourceContent || input.content,
      FORMULE2_CARD_COUNT * FORMULE2_BULLETS_MAX,
      FORMULE2_BULLET_CHAR_MAX
    );
    const fallbackTitleBase = trimToLimit(input.title || 'Formule', FORMULE2_TITLE_MAX);

    let cards = incomingCards.map((entry, index) => {
      const cardIncoming = toSafeRecord(entry);
      const titleInput = toSafeString(cardIncoming?.title) || `${fallbackTitleBase} ${index + 1}`;
      const title = ensureWithinLimit(
        titleInput,
        FORMULE2_TITLE_MAX,
        `${warningPrefix}cards.${index}.title`,
        warnings
      );
      const bulletsFallbackSlice = fallbackBullets.slice(
        index * FORMULE2_BULLETS_MAX,
        index * FORMULE2_BULLETS_MAX + FORMULE2_BULLETS_MAX
      );
      const bullets = normalizeFormule2Bullets({
        value: cardIncoming?.bullets ?? cardIncoming?.text ?? cardIncoming?.body,
        fallback:
          bulletsFallbackSlice.length > 0
            ? bulletsFallbackSlice
            : [
                'Une formule flexible et sans engagement.',
                'Un service simple, humain et rassurant.',
              ],
        cardIndex: index,
        warnings,
        warningPrefix,
      });

      return { title, bullets };
    });

    if (cards.length === 0) {
      cards = Array.from({ length: FORMULE2_CARD_COUNT }, (_, index) => ({
        title: ensureWithinLimit(
          `${fallbackTitleBase} ${index + 1}`,
          FORMULE2_TITLE_MAX,
          `${warningPrefix}cards.${index}.title`,
          warnings
        ),
        bullets: normalizeFormule2Bullets({
          value: [],
          fallback: [
            'Une formule flexible et sans engagement.',
            'Un service simple, humain et rassurant.',
          ],
          cardIndex: index,
          warnings,
          warningPrefix,
        }),
      }));
      pushWarning('cards fallback applied');
    }

    if (cards.length < FORMULE2_CARD_COUNT) {
      const lastCard = cards[cards.length - 1];
      while (cards.length < FORMULE2_CARD_COUNT && lastCard) {
        cards.push({
          title: lastCard.title,
          bullets: [...lastCard.bullets],
        });
      }
      pushWarning(`cards duplicated to ${FORMULE2_CARD_COUNT}`);
    }

    if (cards.length > FORMULE2_CARD_COUNT) {
      cards = cards.slice(0, FORMULE2_CARD_COUNT);
      pushWarning(`cards truncated to ${FORMULE2_CARD_COUNT}`);
    }

    return {
      backgroundImageUrl:
        toSafeString(incoming.backgroundImageUrl) ||
        'https://img.mailinblue.com/2607945/images/content_library/original/686fd8c89addba0b7fd582a7.png',
      cards,
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

  if (templateName === 'twoColumns.imageLeft') {
    const allowedKeys = new Set(['title', 'bullets']);
    const extraKeys = Object.keys(incoming).filter((key) => !allowedKeys.has(key));
    if (extraKeys.length > 0) {
      pushWarning(`extra fields stripped (${extraKeys.join(', ')})`);
    }

    const incomingTitle = toSafeString(incoming.title);
    const titleSeed =
      stripEmoji(
        stripTrailingPunctuation(
          incomingTitle || input.title || input.sourceBlock.sourceTitle || IMAGE_LEFT_DEFAULT_TITLE
        )
      ) ||
      IMAGE_LEFT_DEFAULT_TITLE;
    const title = ensureWithinLimit(titleSeed, IMAGE_LEFT_TITLE_MAX, `${warningPrefix}title`, warnings);
    if (charCount(title) < 10 || charCount(title) > 18) {
      pushWarning('title outside preferred 10-18 chars');
    }

    const incomingBullets = toStringArray(incoming.bullets);
    const derivedBullets =
      incomingBullets.length > 0
        ? incomingBullets
        : splitContentIntoBullets(
            toSafeString(incoming.content) || sourceContent || input.content,
            8,
            IMAGE_LEFT_BULLET_MAX
          );

    const fallbackBullets = splitContentIntoBullets(
      `${input.sourceBlock.sourceTitle || ''}. ${sourceContent || input.content}`,
      8,
      IMAGE_LEFT_BULLET_MAX
    );

    const normalizedBullets = derivedBullets
      .map((entry, index) =>
        ensureWithinLimit(
          stripEmoji(stripTrailingPunctuation(stripArtifacts(entry))),
          IMAGE_LEFT_BULLET_MAX,
          `${warningPrefix}bullets.${index}`,
          warnings
        )
      )
      .filter(Boolean);

    let bullets = normalizedBullets.slice(0, IMAGE_LEFT_BULLET_COUNT);
    if (normalizedBullets.length > IMAGE_LEFT_BULLET_COUNT) {
      pushWarning(`bullets truncated to ${IMAGE_LEFT_BULLET_COUNT}`);
    }

    const padPool = [...fallbackBullets, ...IMAGE_LEFT_SAFE_FALLBACK_BULLETS]
      .map((entry) => stripTrailingPunctuation(stripArtifacts(entry)))
      .filter(Boolean);

    while (bullets.length < IMAGE_LEFT_BULLET_COUNT) {
      const next = padPool.find((entry) => !bullets.includes(entry));
      if (!next) break;
      bullets.push(trimToLimit(next, IMAGE_LEFT_BULLET_MAX));
    }

    if (bullets.length < IMAGE_LEFT_BULLET_COUNT) {
      while (bullets.length < IMAGE_LEFT_BULLET_COUNT) {
        bullets.push(IMAGE_LEFT_SAFE_FALLBACK_BULLETS[bullets.length]);
      }
    }

    if (normalizedBullets.length < IMAGE_LEFT_BULLET_COUNT) {
      pushWarning(`bullets completed to ${IMAGE_LEFT_BULLET_COUNT}`);
    }

    return {
      title,
      bullets,
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

  if (templateName === 'threeCards.menu3') {
    const incomingCards = Array.isArray(incoming.cards) ? incoming.cards : [];
    const fallbackTexts = splitCardsFromContent(sourceContent || input.content, MENU3_CARD_COUNT, MENU3_TEXT_MAX);
    const fallbackTitleBase = trimToLimit(input.title || 'Menu', MENU3_TITLE_MAX);
    const fallbackCta =
      trimToLimit(
        toSafeString(input.sourceBlock.ctaLabel) || input.ctaLabel || MENU3_DEFAULT_CTA_LABEL,
        MENU3_CTA_MAX
      ) || MENU3_DEFAULT_CTA_LABEL;

    let cards = incomingCards.map((entry, index) => {
      const cardIncoming = toSafeRecord(entry);
      const imageIncoming = toSafeRecord(cardIncoming?.image);
      const ctaIncoming = toSafeRecord(cardIncoming?.cta);
      const titleInput = toSafeString(cardIncoming?.title) || `${fallbackTitleBase} ${index + 1}`;
      const textInput =
        stripArtifacts(toSafeString(cardIncoming?.text) || toSafeString(cardIncoming?.body)) ||
        fallbackTexts[index] ||
        fallbackTexts[fallbackTexts.length - 1] ||
        input.content;

      const title = ensureWithinLimit(titleInput, MENU3_TITLE_MAX, `${warningPrefix}cards.${index}.title`, warnings);
      if (charCount(title) < 10 || charCount(title) > 18) {
        pushWarning(`cards.${index}.title outside preferred 10-18 chars`);
      }

      const text = ensureWithinLimit(textInput, MENU3_TEXT_MAX, `${warningPrefix}cards.${index}.text`, warnings);
      if (charCount(text) < MENU3_TEXT_MIN) {
        pushWarning(`cards.${index}.text below recommended ${MENU3_TEXT_MIN} chars`);
      }

      const ctaLabel =
        ensureWithinLimit(
          toSafeString(ctaIncoming?.label) || toSafeString(cardIncoming?.ctaLabel) || fallbackCta,
          MENU3_CTA_MAX,
          `${warningPrefix}cards.${index}.cta.label`,
          warnings
        ) || MENU3_DEFAULT_CTA_LABEL;

      return {
        image: {
          src: toSafeString(imageIncoming?.src),
          alt: trimToLimit(toSafeString(imageIncoming?.alt) || 'Visuel', 90),
        },
        title,
        text,
        cta: {
          label: ctaLabel,
        },
      };
    });

    if (cards.length === 0) {
      cards = Array.from({ length: MENU3_CARD_COUNT }, (_, index) => ({
        image: { src: '', alt: 'Visuel' },
        title: ensureWithinLimit(`${fallbackTitleBase} ${index + 1}`, MENU3_TITLE_MAX, `${warningPrefix}cards.${index}.title`, warnings),
        text: ensureWithinLimit(
          fallbackTexts[index] || fallbackTexts[0] || input.content,
          MENU3_TEXT_MAX,
          `${warningPrefix}cards.${index}.text`,
          warnings
        ),
        cta: { label: fallbackCta },
      }));
      pushWarning('cards fallback applied');
    }

    if (cards.length < MENU3_CARD_COUNT) {
      const lastCard = cards[cards.length - 1];
      while (cards.length < MENU3_CARD_COUNT && lastCard) {
        cards.push({
          image: { ...lastCard.image },
          title: lastCard.title,
          text: lastCard.text,
          cta: { ...lastCard.cta },
        });
      }
      pushWarning(`cards duplicated to ${MENU3_CARD_COUNT}`);
    }

    if (cards.length > MENU3_CARD_COUNT) {
      cards = cards.slice(0, MENU3_CARD_COUNT);
      pushWarning(`cards truncated to ${MENU3_CARD_COUNT}`);
    }

    return {
      bgColor: toSafeString(incoming.bgColor) || '#faf9f0',
      cards,
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
  brief: EmailCopyBrief,
  clientSlug: string
): EmailCopyGeneratedBlock {
  const warnings: string[] = [];
  const contentLimit = EMAIL_COPY_BLOCK_CONTENT_LIMITS[sourceBlock.blockType];
  const templateKey = resolveTemplateKeyForBlock('', sourceBlock, clientSlug);
  const isImageOnly = isImageOnlyTemplate(templateKey);
  const titleSeed = isImageOnly
    ? ''
    : stripArtifacts(sourceBlock.sourceTitle || 'Une solution adaptee pour vous');
  const subtitleSeed = isImageOnly ? '' : fallbackSubtitleByType(sourceBlock.blockType);
  const contentSeed = isImageOnly
    ? ''
    : stripArtifacts(sourceBlock.sourceContent || '') ||
      stripArtifacts(brief.offerSummary || brief.objective || brief.rawBriefText || '') ||
      'Decouvrez un accompagnement simple, des menus adaptes et une livraison a domicile en toute confiance.';
  const ctaSeed = isImageOnly ? '' : stripArtifacts(sourceBlock.ctaLabel || 'Je decouvre');

  const title = ensureWithinLimit(titleSeed, EMAIL_COPY_CHAR_LIMITS.title, `Block ${sourceBlock.id} title`, warnings);
  const subtitle = ensureWithinLimit(
    subtitleSeed,
    EMAIL_COPY_CHAR_LIMITS.subtitle,
    `Block ${sourceBlock.id} subtitle`,
    warnings
  );
  const content = ensureWithinLimit(contentSeed, contentLimit, `Block ${sourceBlock.id} content`, warnings);
  const ctaLabel = trimToLimit(ctaSeed, 40);
  const renderSlots = canonicalizeRenderSlots({
    clientSlug,
    templateKey,
    sourceBlock,
    brief,
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
        input.brief,
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
  brief: EmailCopyBrief,
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
  const isImageOnly = isImageOnlyTemplate(templateKey);
  const titleSeed = isImageOnly
    ? ''
    : stripArtifacts(rawTitle || sourceBlock.sourceTitle || 'Une solution adaptee pour vous');
  const subtitleSeed = isImageOnly
    ? ''
    : stripArtifacts(rawSubtitle || fallbackSubtitleByType(sourceBlock.blockType));
  const contentSeed = isImageOnly
    ? ''
    : stripArtifacts(
        rawContent ||
          sourceBlock.sourceContent ||
          'Decouvrez des menus adaptes et une livraison a domicile en toute confiance.'
      );
  const ctaSeed = isImageOnly ? '' : stripArtifacts(rawCta || sourceBlock.ctaLabel || 'Je decouvre');

  if (isImageOnly && (rawTitle || rawSubtitle || rawContent || rawCta)) {
    warnings.push(`Variant ${variantIndex} block ${sourceBlock.id} text fields stripped for image-only block.`);
  }

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
    clientSlug,
    templateKey,
    sourceBlock,
    brief,
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
    return normalizeBlock(byId ?? byIndex, sourceBlock, brief, variantIndex, warnings, clientSlug);
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
    'For templateKey "sv.title.titre.v1" OR templateName "title.titre":',
    '- renderSlots must be {"line1":{"text":""},"line2":{"text":""}}.',
    '- Always return both line1.text and line2.text (never missing).',
    '- Each line must be short and punchy, hard max 28 chars (prefer 18 to 24 chars).',
    '- Avoid trailing punctuation on both lines unless absolutely necessary.',
    '- Keep tone in French and aligned with vouvoiement style.',
    'For templateKey "sv.cta.pill354.v1" OR templateName "cta.pill354":',
    '- renderSlots must be {"label":"","url":""}.',
    '- label must stay short and action-oriented, hard max 28 chars.',
    '- Prefer uppercase (or title case if brand context requires it), with no trailing punctuation.',
    '- French only.',
    '- Use the brief to choose the action (menu, formule, offre, etc.).',
    '- Only include url when the brief explicitly provides a destination; otherwise omit it.',
    'For templateKey "sv.promo.codePill.v1" OR templateName "promo.codePill":',
    '- renderSlots must be {"textBefore":"","discountText":"","textAfter":"","codeText":""}.',
    '- Keep all segments short and on one line: textBefore <= 32, discountText <= 6, textAfter <= 14, codeText <= 12.',
    '- Use discountText and codeText from brief facts when provided (promo fields, subject, comments).',
    '- Do not add trailing punctuation or line breaks in any promo segment.',
    '- Keep French only and concise (no long promotional sentence).',
    'For templateKey "sv.promo.blueCodeCta.v1" OR templateName "promo.blueCodeCta":',
    '- renderSlots must be {"discountLine":"","codeLineLabel":"CODE :","codeValue":"","finePrint":"","cta":{"label":"","url":""}}.',
    '- discountLine must stay compact and include % (target <= 8 chars, example "-25 %*").',
    '- codeLineLabel must be exactly "CODE :".',
    '- codeValue must be <= 16 chars, uppercase preferred, and no spaces.',
    '- finePrint must be <= 70 chars and start with "*" when discountLine includes "*".',
    '- cta.label must be <= 24 chars, default "Je profite du code", and no trailing punctuation.',
    '- Use brief promo facts; do not invent legal conditions or long explanations.',
    '- French only, no emojis, no line breaks in fields.',
    'For templateKey "sv.reassurance.navLinks.v1" OR templateName "reassurance.navLinks":',
    '- renderSlots must be {"links":[{"label":"","url":""},{"label":"","url":""},{"label":"","url":""}],"gapPx":16}.',
    '- Always return exactly 3 links.',
    '- Keep each label concise (<= 18 chars). Default labels: "Nos services", "Qui sommes-nous", "Notre blog".',
    '- Use URLs from brief only when explicitly provided; otherwise keep "#". Never invent URLs.',
    '- gapPx must stay 16 unless brief explicitly requests another spacing.',
    'For templateKey "sv.text.beigeCta.v1" OR templateName "text.beigeCta":',
    '- renderSlots must be {"title":"","bodyParagraphs":["",""],"cta":{"label":"","url":""},"align":"left"}.',
    '- Title max 65 chars total and may include at most one "\\n" to control a two-line layout.',
    '- Return exactly 2 body paragraphs by default: paragraph 1 <= 220 chars, paragraph 2 <= 120 chars.',
    '- Keep tone informative and reassuring, with no medical promises or absolute claims.',
    '- cta.label must stay short (<= 20 chars), uppercase preferred, default "NOS ENGAGEMENTS", with no trailing punctuation.',
    '- Set cta.url only when brief provides a specific destination; otherwise omit.',
    '- French only and compact phrasing to fit the beige text block layout.',
    'For templateKey "sv.content.centerHighlight.v1" OR templateName "content.centerHighlight":',
    '- renderSlots must be {"paragraphs":[{"parts":[{"text":"","tone":"default"},{"text":"","tone":"highlight"}]},{"parts":[{"text":"","tone":"default"}]}]}.',
    '- Always return exactly 2 paragraphs.',
    '- Paragraph 1 must contain exactly 2 parts: first default text, second highlight text (tone="highlight").',
    '- Paragraph 1 highlight text must be short (<= 45 chars) and express the key benefit.',
    '- Paragraph 2 must contain exactly 1 default part and stay <= 90 chars.',
    '- French only, neutral informative tone, no emojis, no line breaks, no medical promises.',
    '- Avoid excessive punctuation and keep one concise sentence per paragraph.',
    'For templateKey "sv.section.image.v1" OR templateName "section.image":',
    '- This is image-only. renderSlots must be {"image":{"src":"","alt":""},"align":"center","maxWidth":800}.',
    '- Do not generate textual marketing copy for this block (title/subtitle/content/cta should stay empty).',
    `- For the "Image logo centre" preset, keep image.src as ${SECTION_IMAGE_LOGO_CENTRE_URL} unless the brief explicitly provides another URL for this block.`,
    '- image.alt must stay short and descriptive (<= 40 chars), default "Image logo centre" for that preset.',
    '- Only include linkUrl when the brief explicitly requests a linked image.',
    '- align should default to "center".',
    'For templateKey "sv.mosaic.images5.centerHero.v1" OR templateName "mosaic.images5.centerHero":',
    '- This is image-only. renderSlots must be {"images":{"img1":{"src":"","alt":""},"img2":{"src":"","alt":""},"img3":{"src":"","alt":""},"img4":{"src":"","alt":""},"img5":{"src":"","alt":""}},"radiusPx":8}.',
    '- Do not generate textual marketing copy for this block (title/subtitle/content/cta should stay empty).',
    '- Keep the 5 image src values from the preset defaults unless the brief explicitly provides replacement image URLs for this mosaic.',
    '- Do not fabricate or improve image URLs.',
    '- alt values are optional and should stay short generic labels when provided (example: "Plat 1").',
    '- linkUrl must be omitted unless the brief explicitly requests linked images.',
    '- radiusPx must stay 8 unless the brief explicitly requests another radius.',
    '- Always return exactly 5 image slots: img1, img2, img3, img4, img5.',
    'For templateKey "sv.footer.beige.v1" OR templateName "footer.beige":',
    '- renderSlots must be {"socials":{"instagramUrl":"","facebookUrl":"","show":true},"companyLines":["","",""],"recipientEmailLabel":"","gdprParagraph":"","unsubscribe":{"label":"Se désinscrire","url":""}}.',
    '- Keep legal content locked: do not rewrite gdprParagraph or legal company lines unless the brief explicitly provides updated legal text.',
    '- companyLines must keep exactly 3 lines and preserve legal structure.',
    '- recipientEmailLabel must keep the system placeholder token (for example "EMAIL") unless brief explicitly overrides it.',
    '- unsubscribe.label must stay exactly "Se désinscrire".',
    '- socials URLs must stay on approved brand pages unless brief explicitly overrides them.',
    '- No markdown, no invented legal claims, no invented URLs.',
    'For templateKey "sv.hero.imageTop.v1" OR templateName "hero.imageTop":',
    '- renderSlots must be {"image":{"src":"","alt":""},"headline":{"line1":"","line2":""},"body":{"greeting":"","paragraphs":[""]},"cta":{"label":""}}.',
    '- headline.line1 must be short and punchy (20 to 28 chars target).',
    '- headline.line2 must be short and punchy (20 to 32 chars target).',
    '- body.greeting must be exactly "Bonjour {PRENOM}," and keep vouvoiement style.',
    '- body.paragraphs must contain 2 to 3 short paragraphs, each about 140 to 220 chars, with no medical claims.',
    '- cta.label must be concise, action oriented, between 18 and 28 chars when possible.',
    '- Do not include URLs, template notes, or artifacts in headline/body/cta.',
    'For templateKey "sv.twoColumns.imageLeft.v1" OR templateName "twoColumns.imageLeft":',
    '- renderSlots must be {"title":"","bullets":["","",""]}.',
    '- Title hard max 22 chars (prefer 10 to 18 chars).',
    '- Bullets must contain exactly 3 items by default unless brief explicitly requests otherwise.',
    '- Each bullet hard max 42 chars and must stay concise and scannable.',
    '- French only, neutral informative tone, no emojis, no medical claims.',
    '- Avoid ending punctuation on bullets unless strictly needed.',
    'For templateKey "sv.twoCards.formule2.v1" OR templateName "twoCards.formule2":',
    '- renderSlots must be {"cards":[{"title":"","bullets":[""]},{"title":"","bullets":[""]}]}.',
    '- Always return exactly 2 cards in renderSlots.cards.',
    '- Each title must be concise and <= 28 chars.',
    '- Each card must have 1 to 2 bullet lines, each <= 110 chars.',
    '- Keep bullets short, concrete, and easy to scan.',
    '- Use French vouvoiement, no markdown, no URLs, and no medical claims.',
    'For templateKey "sv.threeCards.menu3.v1" OR templateName "threeCards.menu3":',
    '- renderSlots must be {"cards":[{"title":"","text":"","cta":{"label":""}},{"title":"","text":"","cta":{"label":""}},{"title":"","text":"","cta":{"label":""}}]}.',
    '- Always return exactly 3 cards in renderSlots.cards.',
    '- Card title should be concise (target 10 to 18 chars), readable in 1 to 2 lines.',
    '- Card text should be short and clear (target 60 to 95 chars), about 2 to 3 short lines.',
    '- cta.label should default to "En savoir plus" unless the brief explicitly requests another CTA.',
    '- Use French vouvoiement, no markdown, no URLs, no medical claims.',
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
