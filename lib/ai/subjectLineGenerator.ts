import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import type {
  EasyInputMessage,
  ResponseCreateParamsNonStreaming,
  ResponseInputContent,
} from 'openai/resources/responses/responses';

import { captureEmailScreenshot } from '@/lib/ai/screenshot';

type SubjectLineMetadata = {
  campaignName?: string | null;
  partner?: string | null;
  geo?: string | null;
  language?: string | null;
  priceLabel?: string | null;
  category?: string | null;
  audience?: string | null;
  objectives?: string[] | null;
  keywords?: string[] | null;
};

type GenerationMode = 'subject' | 'pair';

type GenerateSubjectLinesParams = {
  html: string;
  metadata: SubjectLineMetadata;
  tone: string;
  maxLength: number;
  count: number;
  allowEmojis: boolean;
  usePersonalization: boolean;
  model?: 'gpt-5-mini' | 'gpt-4-turbo';
  mode: GenerationMode;
};

type SubjectLineSuggestion = {
  text: string;
  rationale?: string;
  emoji: boolean;
  personalization: boolean;
  length: number;
  sender?: string;
};

type RawSuggestion = {
  text?: unknown;
  rationale?: unknown;
  emoji?: unknown;
  personalization?: unknown;
  length?: unknown;
  sender?: unknown;
};

type SubjectLineResponse = {
  suggestions: SubjectLineSuggestion[];
  fromCache: boolean;
};

const SUBJECT_LINE_CACHE = new Map<string, SubjectLineResponse>();

const OPENAI_MODEL_DEFAULT = process.env.OPENAI_SUBJECT_LINES_MODEL ?? 'gpt-4o-mini';
const SUBJECT_LINES_DEBUG = process.env.SUBJECT_LINES_DEBUG === '1';
const SUBJECT_LINES_DEBUG_DIR = '.ds-debug';
const SUBJECT_LINE_ALLOWED_MODELS = new Set(['gpt-5-mini', 'gpt-4-turbo']);
const FALLBACK_SENDERS_BY_TONE: Record<string, string[]> = {
  neutral: ['Info Desk', 'Support Team', 'Atención Cliente', 'Equipo Soporte'],
  promotional: ['Equipo Tarifas', 'Centro Energía', 'Club Ventas', 'Equipo Comercial'],
  friendly: ['Tu Equipo', 'Equipo Cercano', 'Comunidad Desk', 'Crew Creativo'],
  bold: ['Equipo Impacto', 'Desk Prioridad', 'Equipo Acción'],
  urgent: ['Aviso Cliente', 'Desk Alerta', 'Equipo Urgente'],
  playful: ['Equipo Ideas', 'Spark Team', 'Crew Inspiración'],
};
const GENERIC_FALLBACK_SENDERS = ['Equipo Cliente', 'Support Team', 'Info Desk', 'Centro Servicio'];
const GENERIC_SENDER_BANNED_TERMS = new Set([
  'ahorro',
  'ahorros',
  'gratis',
  'regalo',
  'regalos',
  'oferta',
  'ofertas',
  'precio',
  'precios',
  'gana',
  'ganar',
  'ganá',
  'promo',
  'promos',
]);

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function sanitizeWhitespace(value: string): string {
  return value.replace(/\u2800+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractPlainText(html: string): string {
  return sanitizeWhitespace(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<!--[^\0]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#x2800;/gi, ' ')
  );
}

function buildMetadataSummary(metadata: SubjectLineMetadata): string {
  const chunks: string[] = [];

  if (metadata.campaignName) chunks.push(`Campaign name: ${metadata.campaignName}`);
  if (metadata.geo) chunks.push(`Geo or target market: ${metadata.geo}`);
  if (metadata.language) chunks.push(`Language: ${metadata.language}`);
  if (metadata.objectives?.length) chunks.push(`Objectives: ${metadata.objectives.join(', ')}`);
  if (metadata.keywords?.length) chunks.push(`Keywords to highlight: ${metadata.keywords.join(', ')}`);

  return chunks.join('\n');
}

function dedupeByText(suggestions: SubjectLineSuggestion[]): SubjectLineSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectBannedSenderTerms(metadata: SubjectLineMetadata): Set<string> {
  const terms = new Set<string>();
  const addTerms = (source?: string | null) => {
    if (!source) return;
    const normalized = source.trim().toLowerCase();
    if (normalized) terms.add(normalized);
    source
      .split(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
      .forEach((token) => terms.add(token.toLowerCase()));
  };

  addTerms(metadata.partner ?? undefined);
  addTerms(metadata.campaignName ?? undefined);
  GENERIC_SENDER_BANNED_TERMS.forEach((term) => terms.add(term));

  return terms;
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ')
    .trim();
}

function sanitizeSenderCandidate(
  raw: string | undefined,
  bannedTerms: Set<string>
): string | null {
  if (!raw) return null;

  let cleaned = raw.normalize('NFKC').replace(/[^\p{Letter}\s]+/gu, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  const words = cleaned.split(' ').filter(Boolean);
  if (!words.length || words.length > 2) return null;
  if (!words.every((word) => /^[\p{Letter}]+$/u.test(word))) return null;

  const loweredFull = cleaned.toLowerCase();
  if (bannedTerms.has(loweredFull)) return null;
  if (words.some((word) => bannedTerms.has(word.toLowerCase()))) return null;

  if (cleaned.length > 24) {
    cleaned = cleaned.slice(0, 24).trim();
  }

  return titleCase(cleaned);
}

function generateFallbackSender(
  tone: string,
  bannedTerms: Set<string>,
  usedSenders?: Set<string>
): string {
  const disallowed = new Set<string>([...bannedTerms]);
  if (usedSenders) {
    usedSenders.forEach((value) => disallowed.add(value.toLowerCase()));
  }

  const toneKey = tone.toLowerCase();
  const candidates = [
    ...(FALLBACK_SENDERS_BY_TONE[toneKey] ?? []),
    ...GENERIC_FALLBACK_SENDERS,
  ];

  for (const candidate of candidates) {
    const lowered = candidate.toLowerCase();
    if (disallowed.has(lowered)) continue;
    return candidate;
  }

  const defaultCandidate = 'Campaign Team';
  if (!disallowed.has(defaultCandidate.toLowerCase())) {
    return defaultCandidate;
  }

  return 'Support Team';
}

function extractJsonBlock(raw: string): string | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function parseSuggestionsFromText(raw: string): RawSuggestion[] {
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) return [];
  try {
    const parsed = JSON.parse(jsonBlock);
    if (Array.isArray(parsed?.suggestions)) {
      return parsed.suggestions as RawSuggestion[];
    }
  } catch {
    // Swallow parse errors – caller will handle empty result.
  }
  return [];
}

function fallbackSuggestionsFromText(raw: string): RawSuggestion[] {
  return raw
    .split(/\r?\n+/)
    .map((line) => sanitizeWhitespace(line.replace(/^[-*•]\s*/, '')))
    .filter((line) => line.length > 0)
    .map((text) => ({ text }));
}

export async function generateSubjectLines({
  html,
  metadata,
  tone,
  maxLength,
  count,
  allowEmojis,
  usePersonalization,
  model,
  mode,
}: GenerateSubjectLinesParams): Promise<SubjectLineResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const plainText = extractPlainText(html);
  const metadataSummary = buildMetadataSummary(metadata);
  const bannedSenderTerms = collectBannedSenderTerms(metadata);

  const selectedModel =
    model && SUBJECT_LINE_ALLOWED_MODELS.has(model) ? model : OPENAI_MODEL_DEFAULT;

  const cacheKey = createHash('sha256')
    .update(
      JSON.stringify({
        html,
        metadataSummary,
        tone,
        maxLength,
        count,
        allowEmojis,
        usePersonalization,
        selectedModel,
        mode,
      })
    )
    .digest('hex');

  const cached = SUBJECT_LINE_CACHE.get(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const screenshotBase64 = await captureEmailScreenshot(html);

  const allowEmojiText = allowEmojis
    ? 'You may include at most one emoji per subject line when it adds value.'
    : 'Do not use emojis.';
  const personalizationText = usePersonalization
    ? 'You may use lightweight personalization tokens like {{first_name}} when it feels natural. Do not invent unsupported tokens.'
    : 'Do not use personalization tokens.';

  const stepThreeInstruction =
    mode === 'pair'
      ? `3. Craft ${count} aligned sender + subject pairs that spotlight the strongest hooks.`
      : `3. Craft ${count} high-engagement, creatively varied subject lines that spotlight the strongest hooks.`;

  const senderRuleLines =
    mode === 'pair'
      ? [
          'Sender rules: use 1-2 plain words (prefer two-word combos) that sound like a real team, desk, or service. Examples: "Equipo Tarifas", "Centro Energía", "Support Team".',
          'Never include advertiser brand names, generic promo words (ahorro, gratis, regalo, ofertas, precio, gana), emojis, or odd punctuation.',
          'Keep the sender aligned with the subject tone and audience while remaining trustworthy and inbox-friendly.',
        ]
      : [];

  const responseSchemaInstruction =
    mode === 'pair'
      ? 'Respond strictly with JSON {"suggestions":[{"sender":string,"text":string,"emoji":boolean,"personalization":boolean,"length":number,"rationale":string?}]} - no commentary or code fences.'
      : 'Respond strictly with JSON {"suggestions":[{"text":string,"emoji":boolean,"personalization":boolean,"length":number,"rationale":string?}]} - no commentary or code fences.';

  const prompt = [
    metadataSummary ? `Campaign signal:\n${metadataSummary}` : '',
    plainText
      ? `Plain-text excerpt (validate against the screenshot to avoid hallucinations):\n${plainText.slice(0, 1500)}`
      : '',
    'Workflow:',
    '1. Examine the HTML screenshot (if present) to detect the main offer, differentiators, visuals, CTA, urgency cues, social proof, and tone.',
    '2. Cross-check those findings with the plain-text excerpt. Prioritise overlaps and refuse to invent unsupported claims.',
    stepThreeInstruction,
    `Language: ${metadata.language ?? 'English'}.`,
    `Tone guidance: ${tone}.`,
    `Maximum length: ${maxLength} characters.`,
    `${allowEmojiText}`,
    `${personalizationText}`,
    'Lean into concrete value (benefits, savings, timelines, unique perks) surfaced during the analysis.',
    'Avoid all caps, spammy wording, or excessive punctuation.',
    ...senderRuleLines,
    'Return concise copy that would increase open rates.',
    responseSchemaInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemInstruction =
    mode === 'pair'
      ? 'You are an elite performance email copywriter. Your workflow: (1) study the supplied campaign assets (screenshot plus text excerpt) to understand the offer, positioning, CTA, urgency, and tone; (2) extract the most compelling hooks and differentiators; (3) write compliant, brand-safe sender + subject pairs that maximise opens, stay concise, and feel fresh. Sender policy: 1-2 natural words (prefer two-word combinations) that sound like a real team/desk/service, no emojis, no brand names, no generic promo nouns such as ahorro, gratis, regalo, ofertas, precio, gana. Ground every idea in the provided assets - no hallucinated claims.'
      : 'You are an elite performance email copywriter. Your workflow: (1) study the supplied campaign assets (screenshot plus text excerpt) to understand the offer, positioning, CTA, urgency, and tone; (2) extract the most compelling hooks and differentiators; (3) write compliant, brand-safe subject lines that maximise opens, stay concise, and feel fresh. Ground every idea in the provided assets - no hallucinated claims.';

  const userContent: ResponseInputContent[] = [{ type: 'input_text', text: prompt }];
  if (screenshotBase64) {
    userContent.push({
      type: 'input_image',
      detail: 'auto',
      image_url: `data:image/png;base64,${screenshotBase64}`,
    });
  }

  const input: EasyInputMessage[] = [
    {
      role: 'system',
      content: [{ type: 'input_text', text: systemInstruction }],
    },
    {
      role: 'user',
      content: userContent,
    },
  ];

  const openAiRequest: ResponseCreateParamsNonStreaming = {
    model: selectedModel,
    input,
  };

  let debugScreenshotPath: string | null = null;
  if (SUBJECT_LINES_DEBUG) {
    if (screenshotBase64) {
      try {
        mkdirSync(SUBJECT_LINES_DEBUG_DIR, { recursive: true });
        debugScreenshotPath = join(
          SUBJECT_LINES_DEBUG_DIR,
          `subjectlines-${Date.now()}-${Math.round(Math.random() * 1e6)}.png`
        );
        writeFileSync(debugScreenshotPath, Buffer.from(screenshotBase64, 'base64'));
      } catch (error) {
        console.warn('[ai:subject-lines] Unable to persist debug screenshot', error);
        debugScreenshotPath = null;
      }
    }

    console.log('[ai:subject-lines] OpenAI request preview', {
      metadataSummary,
      prompt,
      includesScreenshot: Boolean(screenshotBase64),
      model: selectedModel,
      mode,
      screenshotBytes: screenshotBase64 ? Math.round((screenshotBase64.length * 3) / 4) : 0,
      screenshotSample: screenshotBase64 ? `${screenshotBase64.slice(0, 80)}...` : null,
      plainTextExcerpt: plainText.slice(0, 200),
      screenshotPath: debugScreenshotPath,
    });
  }

  const response = await openaiClient.responses.create(openAiRequest);

  const rawOutput = response.output_text ?? '';
  let suggestionsArray = parseSuggestionsFromText(rawOutput);
  if (!suggestionsArray.length) {
    suggestionsArray = fallbackSuggestionsFromText(rawOutput);
  }
  if (!suggestionsArray.length) {
    throw new Error('The AI response did not include subject line suggestions.');
  }

  const usedSenders = mode === 'pair' ? new Set<string>() : null;

  const suggestions: SubjectLineSuggestion[] = dedupeByText(
    suggestionsArray
      .slice(0, count * 2)
      .map((entry: RawSuggestion) => {
        const text = typeof entry?.text === 'string' ? sanitizeWhitespace(entry.text) : '';
        const rationale =
          typeof entry?.rationale === 'string' && entry.rationale.trim().length > 0
            ? entry.rationale.trim()
            : undefined;
        const emojiFlag =
          typeof entry?.emoji === 'boolean' ? entry.emoji : /[\p{Extended_Pictographic}]/u.test(text);
        const personalizationFlag =
          typeof entry?.personalization === 'boolean' ? entry.personalization : /\{\{.+?\}\}/.test(text);

        let sender: string | undefined;
        if (mode === 'pair') {
          const rawSender =
            typeof entry?.sender === 'string' ? entry.sender : undefined;
          let candidate = sanitizeSenderCandidate(rawSender, bannedSenderTerms);
          if (!candidate) {
            candidate = generateFallbackSender(tone, bannedSenderTerms, usedSenders ?? undefined);
          }
          let attempts = 0;
          while (candidate && usedSenders?.has(candidate.toLowerCase()) && attempts < 5) {
            candidate = generateFallbackSender(tone, bannedSenderTerms, usedSenders ?? undefined);
            attempts += 1;
          }
          if (!candidate) {
            candidate = generateFallbackSender(tone, bannedSenderTerms, usedSenders ?? undefined);
          }
          sender = candidate;
          usedSenders?.add(candidate.toLowerCase());
        }

        return {
          text,
          rationale,
          emoji: emojiFlag,
          personalization: personalizationFlag,
          length: [...text].length,
          sender,
        };
      })
      .filter(
        (suggestion) =>
          suggestion.text.length > 0 &&
          suggestion.length <= maxLength &&
          (mode !== 'pair' || Boolean(suggestion.sender))
      )
  ).slice(0, count);

  const payload: SubjectLineResponse = {
    suggestions,
    fromCache: false,
  };

  SUBJECT_LINE_CACHE.set(cacheKey, payload);

  return payload;
}

export type { SubjectLineSuggestion, SubjectLineMetadata, SubjectLineResponse };
