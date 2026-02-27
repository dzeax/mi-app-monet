import OpenAI from 'openai';
import type { EasyInputMessage, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';

import { parseEmailCopyBrief } from '@/lib/crm/emailCopyBriefParser';
import {
  getDefaultTemplateForType,
  getTemplateDef,
  getTemplateNameFromKey,
  isTemplateCompatibleWithType,
} from '@/lib/crm/emailCopy/templates/templateRegistry';
import {
  EMAIL_COPY_BLOCK_CONTENT_LIMITS,
  EMAIL_COPY_CHAR_LIMITS,
  SAVEURS_DEFAULT_BRAND_PROFILE,
  type BrevoBlockType,
  type EmailCopyAgentEvidence,
  type EmailCopyBrandProfile,
  type EmailCopyBrief,
  type EmailCopyBriefBlock,
  type EmailCopyCheckStatus,
  type EmailCopyOptimizeResult,
  type EmailCopyPlanChange,
  type EmailCopyQaResult,
  type EmailCopyVariant,
} from '@/lib/crm/emailCopyConfig';

type AgentModel = 'gpt-5.2' | 'gpt-4.1' | 'gpt-5-mini' | 'gpt-4-turbo' | 'gpt-4o-mini';

type SemanticCard = {
  title: string;
  content: string;
};

type CanonicalizeResult = {
  brief: EmailCopyBrief;
  changes: EmailCopyPlanChange[];
  warnings: string[];
  evidence: EmailCopyAgentEvidence[];
};

const OPENAI_MODEL_DEFAULT = process.env.OPENAI_EMAIL_COPY_MODEL ?? 'gpt-4.1';
const OPENAI_ALLOWED_MODELS = new Set(['gpt-5.2', 'gpt-4.1', 'gpt-5-mini', 'gpt-4-turbo', 'gpt-4o-mini']);
const OPENAI_TIMEOUT_MS = 20_000;
const INFORMAL_PATTERN = /(?:\btu\b|\btoi\b|\bton\b|\bta\b|\btes\b|\bt['â€™])/i;
const MEDICAL_PATTERN = /\b(gu[eé]rir|gu[eé]rison|remplace(?:r)?\s+un?\s+traitement)\b/i;

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 })
  : null;
const INSTRUCTION_NOISE_PATTERN =
  /(?:^\+|template|voir\s+bloc|inciter|newsletter|inscription|https?:\/\/|^\(|^\)|^\:)/i;
const FRAGMENT_PATTERN = /(?:\+$|\($|\:$|^\)|^\:|^\+|^\"|\"$)/;
const PLANNING_SOFT_TITLE_LIMIT = 96;
const PLANNING_SOFT_CONTENT_LIMITS: Record<BrevoBlockType, number> = {
  hero: 700,
  three_columns: 220,
  two_columns: 240,
  image_text_side_by_side: 320,
};
const MIN_SEMANTIC_CARD_CHARS = 24;
const MIN_SEMANTIC_CARD_WORDS = 4;

function clean(value: string): string {
  return value.replace(/\u2800+/g, ' ').replace(/\s+/g, ' ').trim();
}

function charCount(value: string | null | undefined): number {
  return value ? [...value].length : 0;
}

function wordCount(value: string): number {
  const normalized = clean(value);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function trimTo(value: string, limit: number): string {
  const safe = clean(value);
  if (charCount(safe) <= limit) return safe;
  const slice = [...safe].slice(0, limit).join('').trim();
  const lastWhitespace = slice.lastIndexOf(' ');
  if (lastWhitespace >= Math.floor(limit * 0.55)) {
    return slice.slice(0, lastWhitespace).replace(/[,:;.!?\"'`()\[]+$/g, '').trim();
  }
  return slice.replace(/[,:;.!?\"'`()\[]+$/g, '').trim();
}

function str(value: unknown): string {
  return typeof value === 'string' ? clean(value) : '';
}

function nullable(value: unknown): string | null {
  if (value == null) return null;
  const next = str(value);
  return next || null;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => str(entry)).filter(Boolean);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function uniqueEvidence(evidence: EmailCopyAgentEvidence[]): EmailCopyAgentEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((entry) => {
    if (!entry.field || !entry.sourceSnippet) return false;
    const key = `${entry.field}|${entry.sourceSnippet}|${entry.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizePlanningText(value: string): string {
  const noUrls = value.replace(/https?:\/\/[^\s)]+/gi, ' ');
  const lines = noUrls
    .split(/\r?\n/)
    .map((line) =>
      clean(
        line
          .replace(/^[-*•✅]+\s*/g, '')
          .replace(/^\"+|\"+$/g, '')
          .replace(/\s+\+\s+/g, ' ')
      )
    )
    .filter((line) => line && !INSTRUCTION_NOISE_PATTERN.test(line) && !/^[^\w]+$/.test(line));
  return lines.join('\n').trim();
}

function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const json = fenced?.[1] ?? raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  if (!json || json.indexOf('{') < 0 || json.lastIndexOf('}') < 0) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function promptInput(system: string, user: string): EasyInputMessage[] {
  return [
    { role: 'system', content: [{ type: 'input_text', text: system }] },
    { role: 'user', content: [{ type: 'input_text', text: user }] },
  ];
}

async function askJson(input: {
  model?: AgentModel;
  system: string;
  user: string;
}): Promise<{ data: Record<string, unknown> | null; model: string; warnings: string[] }> {
  const selected = input.model && OPENAI_ALLOWED_MODELS.has(input.model) ? input.model : OPENAI_MODEL_DEFAULT;
  const modelOrder = unique([selected, 'gpt-4.1', 'gpt-4o-mini']);
  if (!openaiClient) {
    return { data: null, model: selected, warnings: ['OpenAI unavailable. Local fallback used.'] };
  }
  const warnings: string[] = [];
  for (const modelName of modelOrder) {
    try {
      const request: ResponseCreateParamsNonStreaming = {
        model: modelName,
        input: promptInput(input.system, input.user),
      };
      const response = await openaiClient.responses.create(request, { timeout: OPENAI_TIMEOUT_MS });
      const parsed = extractJson(response.output_text ?? '');
      if (parsed) return { data: parsed, model: modelName, warnings };
      warnings.push(`${modelName} returned non-JSON output.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      warnings.push(`${modelName} failed (${message}).`);
    }
  }
  return { data: null, model: selected, warnings };
}

function blockType(value: unknown, fallback: BrevoBlockType): BrevoBlockType {
  if (value === 'hero' || value === 'three_columns' || value === 'two_columns' || value === 'image_text_side_by_side') {
    return value;
  }
  return fallback;
}

function resolveUniqueBlockId(
  candidate: string | null | undefined,
  fallback: string,
  usedIds: Set<string>
): string {
  const base = clean(candidate || '') || fallback;
  let next = base;
  let suffix = 2;
  while (usedIds.has(next.toLowerCase())) {
    next = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(next.toLowerCase());
  return next;
}

function normalizeBrief(
  value: unknown,
  fallback: EmailCopyBrief,
  clientSlug: string
): EmailCopyBrief {
  const objectValue = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawBlocks = Array.isArray(objectValue.blocks) ? objectValue.blocks : [];
  const usedBlockIds = new Set<string>();
  const blocks = (rawBlocks.length ? rawBlocks : fallback.blocks).map((entry, idx) => {
    const asObj = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const fallbackBlock = fallback.blocks[idx] ?? fallback.blocks[0];
    const type = blockType(asObj.blockType, fallbackBlock.blockType);
    const incomingTemplate = nullable(asObj.templateKey) ?? fallbackBlock.templateKey ?? null;
    const compatibleTemplateDef = getTemplateDef(incomingTemplate, clientSlug);
    const templateKey =
      isTemplateCompatibleWithType(incomingTemplate, type, clientSlug) &&
      compatibleTemplateDef &&
      compatibleTemplateDef.supportedTypes.includes(type)
        ? compatibleTemplateDef.key
        : getDefaultTemplateForType(type, clientSlug);
    const templateDef = getTemplateDef(templateKey, clientSlug);
    const layoutSpecFromInput = asObj.layoutSpec && typeof asObj.layoutSpec === 'object' ? (asObj.layoutSpec as Record<string, unknown>) : null;
    const layoutSpecFromFallback =
      fallbackBlock.layoutSpec && typeof fallbackBlock.layoutSpec === 'object'
        ? (fallbackBlock.layoutSpec as Record<string, unknown>)
        : null;
    const incomingId = nullable(asObj.id);
    const fallbackId = fallbackBlock?.id ?? `block-${idx + 1}`;
    const id = resolveUniqueBlockId(incomingId ?? fallbackId, `block-${idx + 1}`, usedBlockIds);
    return {
      id,
      blockType: type,
      sourceTitle: trimTo(
        sanitizePlanningText(nullable(asObj.sourceTitle) ?? fallbackBlock.sourceTitle ?? ''),
        PLANNING_SOFT_TITLE_LIMIT
      ) || null,
      sourceContent: trimTo(
        sanitizePlanningText(nullable(asObj.sourceContent) ?? fallbackBlock.sourceContent ?? ''),
        PLANNING_SOFT_CONTENT_LIMITS[type]
      ) || null,
      ctaLabel: trimTo(sanitizePlanningText(nullable(asObj.ctaLabel) ?? fallbackBlock.ctaLabel ?? ''), 60) || null,
      ctaUrl: nullable(asObj.ctaUrl) ?? fallbackBlock.ctaUrl ?? null,
      templateKey,
      layoutSpec: { ...(layoutSpecFromInput ?? layoutSpecFromFallback ?? templateDef?.defaultLayoutSpec ?? {}) },
    };
  });
  return {
    campaignName: str(objectValue.campaignName) || fallback.campaignName || 'Nouvelle campagne',
    sendDate: nullable(objectValue.sendDate) ?? fallback.sendDate ?? null,
    objective: nullable(objectValue.objective) ?? fallback.objective ?? null,
    offerSummary: nullable(objectValue.offerSummary) ?? fallback.offerSummary ?? null,
    visualLinks: strArray(objectValue.visualLinks).length ? strArray(objectValue.visualLinks) : fallback.visualLinks ?? [],
    promoCode: nullable(objectValue.promoCode) ?? fallback.promoCode ?? null,
    promoValidUntil: nullable(objectValue.promoValidUntil) ?? fallback.promoValidUntil ?? null,
    senderEmail: nullable(objectValue.senderEmail) ?? fallback.senderEmail ?? null,
    comments: nullable(objectValue.comments) ?? fallback.comments ?? null,
    sourceSubject: nullable(objectValue.sourceSubject) ?? fallback.sourceSubject ?? null,
    sourcePreheader: nullable(objectValue.sourcePreheader) ?? fallback.sourcePreheader ?? null,
    rawBriefText: nullable(objectValue.rawBriefText) ?? fallback.rawBriefText ?? null,
    blocks,
  };
}

function splitToLimit(value: string, limit: number): string[] {
  const safe = sanitizePlanningText(value);
  if (!safe) return [];
  const units = safe.split(/\n+|(?<=[.!?;:])\s+/).map((entry) => clean(entry)).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (charCount(candidate) <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (charCount(unit) <= limit) {
      current = unit;
      continue;
    }
    const words = unit.split(' ').filter(Boolean);
    let running = '';
    for (const word of words) {
      const next = running ? `${running} ${word}` : word;
      if (charCount(next) <= limit) {
        running = next;
      } else {
        if (running) chunks.push(running);
        running = charCount(word) > limit ? trimTo(word, limit) : word;
      }
    }
    if (running) chunks.push(running);
    current = '';
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean).map((entry) => trimTo(entry, limit));
}

function parseLabelValueCards(value: string): SemanticCard[] {
  const cards: SemanticCard[] = [];
  const cleaned = sanitizePlanningText(value);
  if (!cleaned) return cards;
  const matches = cleaned.matchAll(/(?:^|\n)\s*(?:[-*•✅]\s*)?([^:\n]{3,80})\s*:\s*([^\n]+)/g);
  for (const match of matches) {
    const title = trimTo(clean(match[1] || ''), EMAIL_COPY_CHAR_LIMITS.title);
    const content = clean(match[2] || '');
    if (!title || !content) continue;
    if (INSTRUCTION_NOISE_PATTERN.test(title) || INSTRUCTION_NOISE_PATTERN.test(content)) continue;
    cards.push({ title, content });
  }
  return cards;
}

function splitWordsIntoParts(value: string, count: number, limit: number): string[] {
  const words = sanitizePlanningText(value).split(' ').filter(Boolean);
  if (!words.length) return [];
  const size = Math.max(1, Math.ceil(words.length / count));
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * size;
    const end = i === count - 1 ? words.length : (i + 1) * size;
    const piece = words.slice(start, end).join(' ');
    if (piece) parts.push(trimTo(piece, limit));
  }
  return parts;
}

function hasSemanticDensity(value: string): boolean {
  return charCount(value) >= MIN_SEMANTIC_CARD_CHARS && wordCount(value) >= MIN_SEMANTIC_CARD_WORDS;
}

function reshapeSemanticParts(parts: string[], count: number, limit: number, source: string): string[] {
  const normalized = parts.map((entry) => trimTo(entry, limit)).filter(Boolean);
  if (!normalized.length) return splitWordsIntoParts(source, count, limit);

  const rich = normalized.filter((entry) => hasSemanticDensity(entry));
  if (rich.length >= count) return rich.slice(0, count);

  const merged: string[] = [];
  let buffer = '';
  normalized.forEach((entry) => {
    const candidate = buffer ? `${buffer} ${entry}` : entry;
    if (hasSemanticDensity(candidate) || charCount(candidate) >= Math.floor(limit * 0.9)) {
      merged.push(trimTo(candidate, limit));
      buffer = '';
      return;
    }
    buffer = candidate;
  });
  if (buffer) merged.push(trimTo(buffer, limit));

  const fallback = merged.length ? merged : splitWordsIntoParts(source, count, limit);
  if (fallback.length >= count) return fallback.slice(0, count);
  const padded = [...fallback];
  while (padded.length < count) padded.push(padded[padded.length - 1] || trimTo(source, limit));
  return padded.slice(0, count);
}

function semanticCards(value: string, count: number, limit: number, prefix: string): SemanticCard[] {
  const labeled = parseLabelValueCards(value)
    .slice(0, count)
    .map((entry) => ({ title: entry.title, content: trimTo(entry.content, limit) }));
  if (labeled.length === count) return labeled;

  const split = splitToLimit(value, limit);
  const fallback = reshapeSemanticParts(
    split.length >= count ? split.slice(0, count) : splitWordsIntoParts(value, count, limit),
    count,
    limit,
    value
  );
  const cards: SemanticCard[] = [];
  for (let index = 0; index < count; index += 1) {
    const content = trimTo(fallback[index] || fallback.at(-1) || value, limit);
    cards.push({
      title: trimTo(`${prefix} ${index + 1}`, EMAIL_COPY_CHAR_LIMITS.title),
      content,
    });
  }
  return cards;
}

function mergeOverflowGroupsByType(
  blocks: EmailCopyBriefBlock[],
  type: BrevoBlockType,
  maxGroups: number,
  changes: EmailCopyPlanChange[],
  warnings: string[]
): EmailCopyBriefBlock[] {
  if (!Number.isFinite(maxGroups)) return blocks;
  if (maxGroups <= 0) return blocks;

  const next: EmailCopyBriefBlock[] = [];
  const keptIndexes: number[] = [];
  for (const block of blocks) {
    if (block.blockType !== type) {
      next.push(block);
      continue;
    }

    if (keptIndexes.length < maxGroups) {
      next.push(block);
      keptIndexes.push(next.length - 1);
      continue;
    }

    const targetIndex = keptIndexes[keptIndexes.length - 1];
    const target = next[targetIndex];
    const mergedContent = [
      target.sourceContent || '',
      block.sourceTitle || '',
      block.sourceContent || '',
    ]
      .map((entry) => sanitizePlanningText(entry))
      .filter(Boolean)
      .join('\n');

    next[targetIndex] = {
      ...target,
      sourceContent: trimTo(mergedContent, PLANNING_SOFT_CONTENT_LIMITS[type]) || target.sourceContent || null,
    };
    changes.push({
      blockId: block.id,
      action: 'compress',
      detail: `Merged extra ${type} group to preserve semantic coherence.`,
    });
    warnings.push(`Extra ${type} groups were merged before canonical mapping.`);
  }

  return next;
}

function canonicalizeOptimizedBrief(
  brief: EmailCopyBrief,
  clientSlug: string,
  options?: { maxGroupsByType?: Partial<Record<BrevoBlockType, number>> }
): CanonicalizeResult {
  const changes: EmailCopyPlanChange[] = [];
  const warnings: string[] = [];
  const evidence: EmailCopyAgentEvidence[] = [];
  const maxGroupsByType = options?.maxGroupsByType ?? {};
  const preMerged = mergeOverflowGroupsByType(
    mergeOverflowGroupsByType(
      brief.blocks,
      'three_columns',
      maxGroupsByType.three_columns ?? Number.POSITIVE_INFINITY,
      changes,
      warnings
    ),
    'two_columns',
    maxGroupsByType.two_columns ?? Number.POSITIVE_INFINITY,
    changes,
    warnings
  );
  const expanded: EmailCopyBriefBlock[] = [];

  for (const block of preMerged) {
    const sourceText = block.sourceContent || block.sourceTitle || '';
    const cleaned = sanitizePlanningText(sourceText);
    if (sourceText && clean(sourceText) !== cleaned) {
      changes.push({ blockId: block.id, action: 'compress', detail: 'Removed template/instruction noise.' });
      evidence.push({
        field: `${block.id}.sourceContent`,
        sourceSnippet: trimTo(clean(sourceText), 140),
        reason: 'Contained template notes or implementation artifacts.',
      });
    }

    if (block.blockType === 'three_columns') {
      const cards = semanticCards(cleaned, 3, PLANNING_SOFT_CONTENT_LIMITS.three_columns, 'Menu');
      cards.forEach((card, index) => {
        const compatibleTemplateDef = getTemplateDef(block.templateKey ?? null, clientSlug);
        const templateKey =
          isTemplateCompatibleWithType(block.templateKey ?? null, 'three_columns', clientSlug) &&
          compatibleTemplateDef &&
          compatibleTemplateDef.supportedTypes.includes('three_columns')
            ? compatibleTemplateDef.key
            : getDefaultTemplateForType('three_columns', clientSlug);
        const templateDef = getTemplateDef(templateKey, clientSlug);
        expanded.push({
          ...block,
          blockType: 'three_columns',
          sourceTitle: trimTo(card.title, PLANNING_SOFT_TITLE_LIMIT),
          sourceContent: trimTo(card.content, PLANNING_SOFT_CONTENT_LIMITS.three_columns),
          templateKey,
          layoutSpec: { ...(block.layoutSpec ?? templateDef?.defaultLayoutSpec ?? {}) },
        });
        if (index === 0) {
          changes.push({ blockId: block.id, action: 'split', detail: 'Mapped to 3 coherent column cards.' });
        }
      });
      continue;
    }

    if (block.blockType === 'two_columns') {
      const cards = semanticCards(cleaned, 2, PLANNING_SOFT_CONTENT_LIMITS.two_columns, 'Formule');
      cards.forEach((card, index) => {
        const compatibleTemplateDef = getTemplateDef(block.templateKey ?? null, clientSlug);
        const templateKey =
          isTemplateCompatibleWithType(block.templateKey ?? null, 'two_columns', clientSlug) &&
          compatibleTemplateDef &&
          compatibleTemplateDef.supportedTypes.includes('two_columns')
            ? compatibleTemplateDef.key
            : getDefaultTemplateForType('two_columns', clientSlug);
        const templateDef = getTemplateDef(templateKey, clientSlug);
        expanded.push({
          ...block,
          blockType: 'two_columns',
          sourceTitle: trimTo(card.title, PLANNING_SOFT_TITLE_LIMIT),
          sourceContent: trimTo(card.content, PLANNING_SOFT_CONTENT_LIMITS.two_columns),
          templateKey,
          layoutSpec: { ...(block.layoutSpec ?? templateDef?.defaultLayoutSpec ?? {}) },
        });
        if (index === 0) {
          changes.push({ blockId: block.id, action: 'split', detail: 'Mapped to 2 coherent formula cards.' });
        }
      });
      continue;
    }

    const limit = PLANNING_SOFT_CONTENT_LIMITS[block.blockType];
    const firstChunk = splitToLimit(cleaned, limit)[0] || trimTo(cleaned, limit);
    const compatibleTemplateDef = getTemplateDef(block.templateKey ?? null, clientSlug);
    const templateKey =
      isTemplateCompatibleWithType(block.templateKey ?? null, block.blockType, clientSlug) &&
      compatibleTemplateDef &&
      compatibleTemplateDef.supportedTypes.includes(block.blockType)
        ? compatibleTemplateDef.key
        : getDefaultTemplateForType(block.blockType, clientSlug);
    const templateDef = getTemplateDef(templateKey, clientSlug);
    expanded.push({
      ...block,
      sourceTitle: block.sourceTitle ? trimTo(sanitizePlanningText(block.sourceTitle), PLANNING_SOFT_TITLE_LIMIT) : null,
      sourceContent: firstChunk || null,
      templateKey,
      layoutSpec: { ...(block.layoutSpec ?? templateDef?.defaultLayoutSpec ?? {}) },
    });
  }

  const normalized: EmailCopyBriefBlock[] = [];
  let hasHero = false;
  for (const block of expanded) {
    if (block.blockType !== 'hero') {
      normalized.push(block);
      continue;
    }
    if (!hasHero) {
      hasHero = true;
      normalized.push(block);
      continue;
    }
    normalized.push({
      ...block,
      blockType: 'image_text_side_by_side',
      templateKey: getDefaultTemplateForType('image_text_side_by_side', clientSlug),
      layoutSpec: {
        ...(getTemplateDef(getDefaultTemplateForType('image_text_side_by_side', clientSlug), clientSlug)?.defaultLayoutSpec ?? {}),
      },
    });
    changes.push({
      blockId: block.id,
      action: 'retag',
      detail: 'Converted extra hero block to image_text_side_by_side.',
    });
    warnings.push('More than one hero block detected. Extra heroes were retagged.');
  }

  if (!hasHero && normalized.length > 0) {
    normalized[0] = {
      ...normalized[0],
      blockType: 'hero',
      templateKey: getDefaultTemplateForType('hero', clientSlug),
      layoutSpec: {
        ...(getTemplateDef(getDefaultTemplateForType('hero', clientSlug), clientSlug)?.defaultLayoutSpec ?? {}),
      },
    };
    changes.push({
      blockId: normalized[0].id,
      action: 'retag',
      detail: 'Promoted first block to hero to keep hierarchy.',
    });
  }

  const usedBlockIds = new Set<string>();
  const capped = normalized.slice(0, 12).map((block, index) => ({
    ...block,
    id: resolveUniqueBlockId(block.id, `block-${index + 1}`, usedBlockIds),
  }));
  if (normalized.length > 12) warnings.push('Block list was capped to 12 blocks.');

  return {
    brief: { ...brief, blocks: capped },
    changes,
    warnings: unique(warnings),
    evidence: uniqueEvidence(evidence),
  };
}

export async function extractEmailCopyBriefWithAgent(input: {
  clientSlug: string;
  rawBriefText: string;
  brandProfile?: EmailCopyBrandProfile | null;
  model?: AgentModel;
}) {
  const parsed = parseEmailCopyBrief(input.rawBriefText);
  const fallbackBrief: EmailCopyBrief = normalizeBrief(
    { ...parsed.brief, rawBriefText: input.rawBriefText },
    { ...parsed.brief, rawBriefText: input.rawBriefText },
    input.clientSlug
  );
  const brand = { ...SAVEURS_DEFAULT_BRAND_PROFILE, ...(input.brandProfile ?? {}) };
  const ai = await askJson({
    model: input.model,
    system: 'You extract CRM email briefs. Return strict JSON only.',
    user: [
      'Extract brief fields and block mapping for Saveurs et Vie.',
      'Do not invent facts or offers.',
      'Remove URLs, template hints, and implementation instructions from source fields.',
      'Prioritize semantic completeness in source fields, even if text is over final Brevo limits.',
      'Output shape: {"status":"","warnings":[],"evidence":[{"field":"","sourceSnippet":"","reason":""}],"brief":{...}}',
      `Final generation hard limits (for copy step): ${JSON.stringify(EMAIL_COPY_BLOCK_CONTENT_LIMITS)}`,
      `Planning soft limits (for mapping step): ${JSON.stringify(PLANNING_SOFT_CONTENT_LIMITS)}`,
      `Brand: ${JSON.stringify(brand)}`,
      input.rawBriefText,
    ].join('\n\n'),
  });
  if (!ai.data) {
    return {
      brief: fallbackBrief,
      status: parsed.metadata.status ?? null,
      warnings: ai.warnings,
      evidence: [] as EmailCopyAgentEvidence[],
      model: ai.model,
      source: 'local-fallback' as const,
    };
  }
  const brief = normalizeBrief(ai.data.brief, fallbackBrief, input.clientSlug);
  return {
    brief: { ...brief, rawBriefText: input.rawBriefText },
    status: nullable(ai.data.status) ?? parsed.metadata.status ?? null,
    warnings: unique([...strArray(ai.data.warnings), ...ai.warnings]),
    evidence: [],
    model: ai.model,
    source: 'openai' as const,
  };
}

export async function optimizeEmailCopyBriefWithAgent(input: {
  clientSlug: string;
  brief: EmailCopyBrief;
  brandProfile?: EmailCopyBrandProfile | null;
  model?: AgentModel;
}): Promise<EmailCopyOptimizeResult> {
  const maxGroupsByType: Partial<Record<BrevoBlockType, number>> = {
    three_columns: (() => {
      const count = input.brief.blocks.filter((block) => block.blockType === 'three_columns').length;
      return count > 0 ? count : Number.POSITIVE_INFINITY;
    })(),
    two_columns: (() => {
      const count = input.brief.blocks.filter((block) => block.blockType === 'two_columns').length;
      return count > 0 ? count : Number.POSITIVE_INFINITY;
    })(),
  };
  const fallback = canonicalizeOptimizedBrief(input.brief, input.clientSlug, { maxGroupsByType });
  const brand = { ...SAVEURS_DEFAULT_BRAND_PROFILE, ...(input.brandProfile ?? {}) };
  const ai = await askJson({
    model: input.model,
    system: 'You optimize CRM block plans. Return strict JSON only.',
    user: [
      'Optimize block mapping. You can split/reorder/retag/compress blocks.',
      'Guarantee semantic structure: one hero max, three_columns -> 3 cards, two_columns -> 2 cards.',
      'Remove URLs and template instructions from source blocks.',
      'Prioritize semantic coherence and complete ideas in source blocks before enforcing final hard limits.',
      'Do not invent facts, offers or claims.',
      'Output shape: {"warnings":[],"changes":[{"blockId":"","action":"split|reorder|compress|retag|keep","detail":""}],"brief":{...}}',
      `Final generation hard limits: ${JSON.stringify(EMAIL_COPY_BLOCK_CONTENT_LIMITS)}`,
      `Planning soft limits: ${JSON.stringify(PLANNING_SOFT_CONTENT_LIMITS)}`,
      `Brand: ${JSON.stringify(brand)}`,
      `Brief: ${JSON.stringify(input.brief)}`,
    ].join('\n\n'),
  });
  if (!ai.data) {
    return {
      brief: fallback.brief,
      changes: fallback.changes,
      warnings: unique([...fallback.warnings, ...ai.warnings]),
      evidence: fallback.evidence,
      model: ai.model,
      source: 'local-fallback',
    };
  }
  const aiBrief = normalizeBrief(ai.data.brief, fallback.brief, input.clientSlug);
  const canonical = canonicalizeOptimizedBrief(aiBrief, input.clientSlug, { maxGroupsByType });
  const aiChanges = Array.isArray(ai.data.changes)
    ? (ai.data.changes as Array<Record<string, unknown>>).map((change) => ({
        blockId: str(change.blockId) || 'block-1',
        action: (['split', 'reorder', 'compress', 'retag', 'keep'].includes(str(change.action)) ? str(change.action) : 'keep') as EmailCopyPlanChange['action'],
        detail: str(change.detail) || 'AI optimizer update.',
      }))
    : [];
  return {
    brief: canonical.brief,
    changes: [...aiChanges, ...canonical.changes],
    warnings: unique([...strArray(ai.data.warnings), ...canonical.warnings, ...ai.warnings]),
    evidence: canonical.evidence,
    model: ai.model,
    source: 'openai',
  };
}

function maxSeverity(a: EmailCopyCheckStatus, b: EmailCopyCheckStatus): EmailCopyCheckStatus {
  const score = (value: EmailCopyCheckStatus) => (value === 'fail' ? 2 : value === 'warn' ? 1 : 0);
  return score(a) >= score(b) ? a : b;
}

function looksHardTruncated(value: string, limit: number): boolean {
  if (charCount(value) < limit) return false;
  const normalized = clean(value).toLowerCase();
  return /(?:\b[a-z]$|\b(a|de|du|des|et|pour|avec|sur)$)/i.test(normalized);
}

function collectBlockIssue(
  issues: string[],
  evidence: EmailCopyAgentEvidence[],
  variantIndex: number,
  blockIndex: number,
  field: string,
  value: string,
  detail: string,
  severity: 'FAIL' | 'WARN'
) {
  issues.push(`${severity} Block ${blockIndex + 1} ${field}: ${detail}`);
  evidence.push({
    field: `variant-${variantIndex}.block-${blockIndex + 1}.${field}`,
    sourceSnippet: trimTo(clean(value), 140),
    reason: detail,
  });
}

type MenuPastelBullet = {
  lead: string;
  text: string;
};

function menuPastelBulletsFromSlots(renderSlots: unknown, side: 'left' | 'right'): MenuPastelBullet[] {
  const root = renderSlots && typeof renderSlots === 'object' ? (renderSlots as Record<string, unknown>) : null;
  const sideObject =
    root?.[side] && typeof root[side] === 'object' && !Array.isArray(root[side])
      ? (root[side] as Record<string, unknown>)
      : null;
  const bullets = Array.isArray(sideObject?.bullets) ? sideObject?.bullets : [];
  return bullets
    .map((entry) => {
      const asObject = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
      return {
        lead: str(asObject?.lead),
        text: str(asObject?.text),
      };
    })
    .filter((entry) => entry.lead || entry.text);
}

function hasMarkdownBoldMarkers(value: string): boolean {
  return /(?:\*\*|__)/.test(value);
}

export async function reviewEmailCopyVariantsWithAgent(input: {
  clientSlug: string;
  brief: EmailCopyBrief;
  brandProfile?: EmailCopyBrandProfile | null;
  variants: EmailCopyVariant[];
  model?: AgentModel;
}): Promise<EmailCopyQaResult> {
  const brand = { ...SAVEURS_DEFAULT_BRAND_PROFILE, ...(input.brandProfile ?? {}) };
  const checks: EmailCopyQaResult['checks'] = [];
  const variantReports: EmailCopyQaResult['variantReports'] = [];
  let overall: EmailCopyCheckStatus = 'pass';
  let hardIssues = 0;
  let toneIssues = 0;
  let legalIssues = 0;
  let artifactIssues = 0;
  let structureIssues = 0;

  input.variants.forEach((variant) => {
    const issues: string[] = [];
    const evidence: EmailCopyAgentEvidence[] = [];
    let status: EmailCopyCheckStatus = 'pass';
    const merged = [variant.subject, variant.preheader, ...variant.blocks.map((block) => `${block.title} ${block.subtitle} ${block.content}`)].join(' ');
    if (charCount(variant.subject) > EMAIL_COPY_CHAR_LIMITS.subject) {
      hardIssues += 1;
      status = maxSeverity(status, 'fail');
      issues.push(`FAIL Subject > ${EMAIL_COPY_CHAR_LIMITS.subject}.`);
    } else if (looksHardTruncated(variant.subject, EMAIL_COPY_CHAR_LIMITS.subject)) {
      status = maxSeverity(status, 'warn');
      issues.push('WARN Subject may be hard-truncated.');
    }

    if (charCount(variant.preheader) > EMAIL_COPY_CHAR_LIMITS.preheader) {
      hardIssues += 1;
      status = maxSeverity(status, 'fail');
      issues.push(`FAIL Preheader > ${EMAIL_COPY_CHAR_LIMITS.preheader}.`);
    } else if (looksHardTruncated(variant.preheader, EMAIL_COPY_CHAR_LIMITS.preheader)) {
      status = maxSeverity(status, 'warn');
      issues.push('WARN Preheader may be hard-truncated.');
    }

    const subtitleSet = new Set<string>();
    variant.blocks.forEach((block, idx) => {
      const templateName = getTemplateNameFromKey(
        block.templateKey || getDefaultTemplateForType(block.blockType, input.clientSlug)
      );
      if (charCount(block.title) > EMAIL_COPY_CHAR_LIMITS.title) {
        hardIssues += 1;
        status = maxSeverity(status, 'fail');
        collectBlockIssue(issues, evidence, variant.index, idx, 'title', block.title, 'exceeds character limit.', 'FAIL');
      }
      if (charCount(block.subtitle) > EMAIL_COPY_CHAR_LIMITS.subtitle) {
        hardIssues += 1;
        status = maxSeverity(status, 'fail');
        collectBlockIssue(issues, evidence, variant.index, idx, 'subtitle', block.subtitle, 'exceeds character limit.', 'FAIL');
      }
      if (charCount(block.content) > EMAIL_COPY_BLOCK_CONTENT_LIMITS[block.blockType]) {
        hardIssues += 1;
        status = maxSeverity(status, 'fail');
        collectBlockIssue(
          issues,
          evidence,
          variant.index,
          idx,
          'content',
          block.content,
          `exceeds ${EMAIL_COPY_BLOCK_CONTENT_LIMITS[block.blockType]} chars.`,
          'FAIL'
        );
      }

      const signature = clean(block.subtitle).toLowerCase();
      if (signature) {
        if (subtitleSet.has(signature)) {
          structureIssues += 1;
          status = maxSeverity(status, 'warn');
          collectBlockIssue(
            issues,
            evidence,
            variant.index,
            idx,
            'subtitle',
            block.subtitle,
            'duplicate subtitle across blocks.',
            'WARN'
          );
        }
        subtitleSet.add(signature);
      }

      if (FRAGMENT_PATTERN.test(block.title) || FRAGMENT_PATTERN.test(block.content)) {
        artifactIssues += 1;
        status = maxSeverity(status, 'warn');
        collectBlockIssue(
          issues,
          evidence,
          variant.index,
          idx,
          'content',
          block.content,
          'looks like a sentence fragment or dangling punctuation.',
          'WARN'
        );
      }

      const noiseText = `${block.title} ${block.subtitle} ${block.content}`;
      if (INSTRUCTION_NOISE_PATTERN.test(noiseText)) {
        artifactIssues += 1;
        status = maxSeverity(status, 'fail');
        collectBlockIssue(
          issues,
          evidence,
          variant.index,
          idx,
          'content',
          noiseText,
          'contains raw template/instruction artifacts.',
          'FAIL'
        );
      }

      if (templateName === 'twoCards.menuPastel') {
        const leftBullets = menuPastelBulletsFromSlots(block.renderSlots, 'left');
        const rightBullets = menuPastelBulletsFromSlots(block.renderSlots, 'right');
        const sides = [
          { side: 'left' as const, bullets: leftBullets },
          { side: 'right' as const, bullets: rightBullets },
        ];

        sides.forEach(({ side, bullets }) => {
          if (bullets.length > 0 && (bullets.length < 3 || bullets.length > 5)) {
            structureIssues += 1;
            status = maxSeverity(status, 'warn');
            issues.push(`WARN Block ${idx + 1} ${side}.bullets count is ${bullets.length} (expected 3-5).`);
          }

          bullets.forEach((bullet, bulletIndex) => {
            const merged = `${bullet.lead} ${bullet.text}`.trim();
            if (hasMarkdownBoldMarkers(merged)) {
              structureIssues += 1;
              status = maxSeverity(status, 'warn');
              collectBlockIssue(
                issues,
                evidence,
                variant.index,
                idx,
                `${side}.bullets.${bulletIndex}`,
                merged,
                'contains markdown bold markers; expected plain text.',
                'WARN'
              );
            }

            if (charCount(bullet.lead) > 24 || wordCount(bullet.lead) > 4 || /[.!?]/.test(bullet.lead)) {
              structureIssues += 1;
              status = maxSeverity(status, 'warn');
              collectBlockIssue(
                issues,
                evidence,
                variant.index,
                idx,
                `${side}.bullets.${bulletIndex}.lead`,
                bullet.lead,
                'lead should be short and not a full sentence.',
                'WARN'
              );
            }
          });
        });
      }
    });

    const heuristicWarnings = variant.warnings.filter((warning) =>
      /heuristic conversion applied/i.test(warning)
    );
    if (heuristicWarnings.length > 0) {
      structureIssues += 1;
      status = maxSeverity(status, 'warn');
      issues.push(`WARN ${heuristicWarnings.length} heuristic slot conversions were applied.`);
    }

    const heroCount = variant.blocks.filter((block) => block.blockType === 'hero').length;
    const threeColumnsCount = variant.blocks.filter((block) => block.blockType === 'three_columns').length;
    const twoColumnsCount = variant.blocks.filter((block) => block.blockType === 'two_columns').length;
    if (heroCount > 1) {
      structureIssues += 1;
      status = maxSeverity(status, 'fail');
      issues.push(`FAIL ${heroCount} hero blocks detected (expected max 1).`);
    }
    if (threeColumnsCount > 0 && threeColumnsCount % 3 !== 0) {
      structureIssues += 1;
      status = maxSeverity(status, 'warn');
      issues.push(`WARN three_columns count (${threeColumnsCount}) is not a multiple of 3.`);
    }
    if (twoColumnsCount > 0 && twoColumnsCount % 2 !== 0) {
      structureIssues += 1;
      status = maxSeverity(status, 'warn');
      issues.push(`WARN two_columns count (${twoColumnsCount}) is not a multiple of 2.`);
    }

    if (INFORMAL_PATTERN.test(merged.toLowerCase())) {
      toneIssues += 1;
      status = maxSeverity(status, 'warn');
      issues.push('WARN Potential tutoiement detected.');
    }
    if (MEDICAL_PATTERN.test(merged.toLowerCase())) {
      legalIssues += 1;
      status = maxSeverity(status, 'fail');
      issues.push('FAIL Potential medical claim risk detected.');
    }
    const forbidden = (brand.forbiddenTerms || []).find((term) => term && merged.toLowerCase().includes(term.toLowerCase()));
    if (forbidden) {
      legalIssues += 1;
      status = maxSeverity(status, 'fail');
      issues.push(`FAIL Forbidden term detected: "${forbidden}".`);
    }

    const mandatoryTerms = brand.mandatoryTerms || [];
    if (mandatoryTerms.length > 0) {
      const hasMandatory = mandatoryTerms.some((term) => term && merged.toLowerCase().includes(term.toLowerCase()));
      if (!hasMandatory) {
        status = maxSeverity(status, 'warn');
        issues.push('WARN No mandatory brand term found in this variant.');
      }
    }

    overall = maxSeverity(overall, status);
    variantReports.push({ variantIndex: variant.index, status, issues: unique(issues), evidence: uniqueEvidence(evidence) });
  });

  checks.push({ id: 'hard_limits', label: 'Character limits', status: hardIssues > 0 ? 'fail' : 'pass', message: hardIssues > 0 ? `${hardIssues} hard limit issues found.` : 'All block limits respected.' });
  checks.push({ id: 'tone_vous', label: 'Vouvoiement', status: toneIssues > 0 ? 'warn' : 'pass', message: toneIssues > 0 ? `${toneIssues} variants may include tutoiement.` : 'Vouvoiement signal is clean.' });
  checks.push({ id: 'legal_claims', label: 'Legal claims', status: legalIssues > 0 ? 'fail' : 'pass', message: legalIssues > 0 ? `${legalIssues} legal risk signals found.` : 'No obvious legal risk signal.' });
  checks.push({ id: 'artifact_noise', label: 'Noise and artifacts', status: artifactIssues > 0 ? 'fail' : 'pass', message: artifactIssues > 0 ? `${artifactIssues} artifact signals found.` : 'No template or instruction artifacts detected.' });
  checks.push({ id: 'semantic_structure', label: 'Semantic structure', status: structureIssues > 0 ? 'warn' : 'pass', message: structureIssues > 0 ? `${structureIssues} block-structure warnings detected.` : 'Block hierarchy looks coherent.' });
  overall = checks.reduce<EmailCopyCheckStatus>((current, check) => maxSeverity(current, check.status), overall);

  const baseline: EmailCopyQaResult = { overall, checks, variantReports, model: OPENAI_MODEL_DEFAULT, source: 'local-fallback' };
  const ai = await askJson({
    model: input.model,
    system: 'You review CRM email quality. Return strict JSON only.',
    user: [
      'Review these variants for tone/legal/clarity fit.',
      'Flag sentence fragments, duplicate subtitles, and structure mismatch by block type.',
      'Output shape: {"overall":"pass|warn|fail","checks":[{"id":"","label":"","status":"pass|warn|fail","message":""}],"variantReports":[{"variantIndex":1,"status":"pass|warn|fail","issues":[""],"evidence":[{"field":"","sourceSnippet":"","reason":""}]}]}',
      `Brand: ${JSON.stringify(brand)}`,
      `Brief: ${JSON.stringify(input.brief)}`,
      `Variants: ${JSON.stringify(input.variants)}`,
      `Baseline checks: ${JSON.stringify(baseline)}`,
    ].join('\n\n'),
  });
  if (!ai.data) {
    return {
      ...baseline,
      checks: [...baseline.checks, { id: 'qa_ai_status', label: 'AI qualitative QA', status: 'warn', message: ai.warnings.join(' ') || 'AI QA unavailable.' }],
      model: ai.model,
      source: 'local-fallback',
    };
  }
  const aiChecks = Array.isArray(ai.data.checks) ? (ai.data.checks as Array<Record<string, unknown>>).map((check, idx) => ({
    id: str(check.id) || `ai_check_${idx + 1}`,
    label: str(check.label) || `AI check ${idx + 1}`,
    status: (['pass', 'warn', 'fail'].includes(str(check.status)) ? str(check.status) : 'warn') as EmailCopyCheckStatus,
    message: str(check.message) || 'AI reviewer note.',
  })) : [];
  const aiVariants = Array.isArray(ai.data.variantReports) ? (ai.data.variantReports as Array<Record<string, unknown>>) : [];
  const mergedReports = baseline.variantReports.map((report) => {
    const fromAi = aiVariants.find((entry) => Number(entry.variantIndex) === report.variantIndex);
    if (!fromAi) return report;
    const aiStatus = (['pass', 'warn', 'fail'].includes(str(fromAi.status)) ? str(fromAi.status) : report.status) as EmailCopyCheckStatus;
    const aiEvidence = Array.isArray(fromAi.evidence)
      ? (fromAi.evidence as Array<Record<string, unknown>>).map((entry) => ({
          field: str(entry.field),
          sourceSnippet: str(entry.sourceSnippet),
          reason: str(entry.reason),
        }))
      : [];
    return {
      ...report,
      status: maxSeverity(report.status, aiStatus),
      issues: unique([...report.issues, ...strArray(fromAi.issues)]),
      evidence: uniqueEvidence([...report.evidence, ...aiEvidence]),
    };
  });
  const aiOverall = (['pass', 'warn', 'fail'].includes(str(ai.data.overall)) ? str(ai.data.overall) : 'warn') as EmailCopyCheckStatus;
  const mergedOverall = [baseline.overall, aiOverall, ...mergedReports.map((report) => report.status)].reduce<EmailCopyCheckStatus>((current, status) => maxSeverity(current, status), 'pass');
  return {
    overall: mergedOverall,
    checks: [...baseline.checks, ...aiChecks],
    variantReports: mergedReports,
    model: ai.model,
    source: 'openai',
  };
}
