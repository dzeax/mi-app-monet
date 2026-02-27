import {
  getDefaultTemplateForType,
  getTemplateNameFromKey,
  type TemplateName,
} from '@/lib/crm/emailCopy/templates/templateRegistry';
import type { BrevoBlockType, EmailCopyVariant } from '@/lib/crm/emailCopyConfig';

export type VisualQaWarningCode =
  | 'TITLE_TOO_LONG_FOR_TEMPLATE'
  | 'BULLETS_TOO_MANY'
  | 'BULLET_TOO_LONG'
  | 'CTA_TOO_LONG'
  | 'RISK_3_LINES_MOBILE';

export type VisualQaWarning = {
  code: VisualQaWarningCode;
  message: string;
  blockId: string;
  blockIndex: number;
  field: string;
};

export type VisualQaBlockWarnings = {
  blockId: string;
  blockIndex: number;
  blockType: BrevoBlockType;
  templateKey: string;
  warnings: VisualQaWarning[];
};

export type VisualQaResult = {
  totalWarnings: number;
  warnings: VisualQaWarning[];
  blocks: VisualQaBlockWarnings[];
};

export type VisualQaTheme = {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  radius?: string;
  fontFamily?: string;
};

type GenericSlots = Record<string, unknown>;

const TITLE_LIMIT = 33;
const BULLET_LIMIT = 40;
const TWO_CARDS_MAX_BULLETS = 4;
const THREE_CARDS_MAX_BODY_LINES = 2;
const DEFAULT_MOBILE_CHARS_PER_LINE = 30;

const TEMPLATE_LINE_LIMITS: Record<TemplateName, number> = {
  'hero.simple': 32,
  'hero.imageTop': 32,
  'twoCards.text': 30,
  'twoCards.menuPastel': 30,
  'threeCards.text': 28,
  'threeCards.menu3': 28,
  'sideBySide.imageText': 30,
  'sideBySide.helpCta': 30,
};

const TEMPLATE_CTA_LIMITS: Record<TemplateName, number> = {
  'hero.simple': 26,
  'hero.imageTop': 26,
  'twoCards.text': 24,
  'twoCards.menuPastel': 24,
  'threeCards.text': 24,
  'threeCards.menu3': 24,
  'sideBySide.imageText': 24,
  'sideBySide.helpCta': 24,
};

function clean(value: string): string {
  return value.replace(/\u2800+/g, ' ').replace(/\s+/g, ' ').trim();
}

function charCount(value: string | null | undefined): number {
  return value ? [...value].length : 0;
}

function asRecord(value: unknown): GenericSlots | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as GenericSlots;
}

function str(value: unknown): string {
  return typeof value === 'string' ? clean(value) : '';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => str(entry)).filter(Boolean);
}

function estimateLineCount(value: string, charsPerLine: number): number {
  const size = Math.max(1, charsPerLine);
  const normalized = clean(value);
  if (!normalized) return 0;
  return Math.ceil(charCount(normalized) / size);
}

function splitBodyLines(value: string): string[] {
  const normalized = value.replace(/\u2800+/g, ' ').trim();
  if (!normalized) return [];

  const lines = normalized
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?;:])\s+/))
    .map((line) => clean(line.replace(/^[-*•✅]\s*/, '')))
    .filter(Boolean);

  return lines;
}

function extractBulletLines(value: string): string[] {
  const normalized = value.replace(/\u2800+/g, ' ').trim();
  if (!normalized) return [];

  const explicitBullets = normalized
    .split(/\r?\n+/)
    .map((line) => clean(line))
    .filter((line) => /^[-*•✅]/.test(line))
    .map((line) => clean(line.replace(/^[-*•✅]\s*/, '')));

  if (explicitBullets.length > 0) return explicitBullets;
  return splitBodyLines(normalized);
}

function pushWarning(
  list: VisualQaWarning[],
  blockId: string,
  blockIndex: number,
  code: VisualQaWarningCode,
  field: string,
  message: string
) {
  list.push({
    code,
    message,
    blockId,
    blockIndex,
    field,
  });
}

function extractTwoCardSlots(input: {
  slots: GenericSlots | null;
  fallbackTitle: string;
  fallbackContent: string;
}) {
  const left = asRecord(input.slots?.left) ?? {};
  const right = asRecord(input.slots?.right) ?? {};

  const fallbackBullets = extractBulletLines(input.fallbackContent);
  const midpoint = Math.ceil(fallbackBullets.length / 2);
  const leftFallbackBullets = fallbackBullets.slice(0, midpoint);
  const rightFallbackBullets = fallbackBullets.slice(midpoint);

  return {
    left: {
      title: str(left.title) || input.fallbackTitle,
      bullets: toStringArray(left.bullets).length ? toStringArray(left.bullets) : leftFallbackBullets,
    },
    right: {
      title: str(right.title) || input.fallbackTitle,
      bullets: toStringArray(right.bullets).length ? toStringArray(right.bullets) : rightFallbackBullets,
    },
  };
}

function extractThreeCardSlots(input: {
  slots: GenericSlots | null;
  fallbackTitle: string;
  fallbackContent: string;
}) {
  const cardsFromSlots = Array.isArray(input.slots?.cards)
    ? (input.slots?.cards as unknown[])
        .map((entry) => {
          const card = asRecord(entry) ?? {};
          return {
            title: str(card.title),
            body: str(card.body) || str(card.text),
          };
        })
        .filter((entry) => entry.title || entry.body)
    : [];

  if (cardsFromSlots.length >= 3) return cardsFromSlots.slice(0, 3);

  const fallbackLines = splitBodyLines(input.fallbackContent);
  const fallbackCards = [
    { title: input.fallbackTitle || 'Carte 1', body: fallbackLines[0] || input.fallbackContent },
    { title: input.fallbackTitle || 'Carte 2', body: fallbackLines[1] || fallbackLines[0] || input.fallbackContent },
    { title: input.fallbackTitle || 'Carte 3', body: fallbackLines[2] || fallbackLines[1] || input.fallbackContent },
  ];
  return fallbackCards;
}

export function runVisualQaForVariant(input: {
  variant: EmailCopyVariant;
  theme?: VisualQaTheme | null;
}): VisualQaResult {
  const variant = input.variant;
  const fontFamily = clean(input.theme?.fontFamily || '');
  const fontAdjustment = /serif/i.test(fontFamily) ? -1 : 0;
  const blocks: VisualQaBlockWarnings[] = variant.blocks.map((block, blockIndex) => {
    const templateKey = block.templateKey || getDefaultTemplateForType(block.blockType);
    const templateName =
      getTemplateNameFromKey(templateKey) ||
      getTemplateNameFromKey(getDefaultTemplateForType(block.blockType)) ||
      'hero.simple';
    const charsPerLine = Math.max(
      24,
      (TEMPLATE_LINE_LIMITS[templateName] ?? DEFAULT_MOBILE_CHARS_PER_LINE) + fontAdjustment
    );
    const ctaLimit = TEMPLATE_CTA_LIMITS[templateName] ?? 24;

    const warnings: VisualQaWarning[] = [];
    const title = str(block.title);
    const subtitle = str(block.subtitle);
    const content = str(block.content);
    const ctaLabel = str(block.ctaLabel);
    const slots = asRecord(block.renderSlots);

    if (templateName === 'hero.simple' || templateName === 'hero.imageTop') {
      const headlineRecord = asRecord(slots?.headline);
      const headline =
        templateName === 'hero.imageTop'
          ? str(headlineRecord?.line1) || title
          : str(slots?.headline) || title;
      const subheadline =
        templateName === 'hero.imageTop'
          ? str(headlineRecord?.line2) || subtitle
          : str(slots?.subheadline) || subtitle;

      if (charCount(headline) > TITLE_LIMIT) {
        pushWarning(
          warnings,
          block.id,
          blockIndex,
          'TITLE_TOO_LONG_FOR_TEMPLATE',
          'headline',
          `Headline has ${charCount(headline)} chars (max ${TITLE_LIMIT}).`
        );
      }
      if (charCount(headline) > 0 && estimateLineCount(headline, charsPerLine) >= 3) {
        pushWarning(
          warnings,
          block.id,
          blockIndex,
          'RISK_3_LINES_MOBILE',
          'headline',
          'Headline may wrap to 3+ lines on mobile.'
        );
      }
      if (charCount(subheadline) > 0 && estimateLineCount(subheadline, charsPerLine) >= 3) {
        pushWarning(
          warnings,
          block.id,
          blockIndex,
          'RISK_3_LINES_MOBILE',
          'subheadline',
          'Subheadline may wrap to 3+ lines on mobile.'
        );
      }
    } else if (templateName === 'twoCards.text' || templateName === 'twoCards.menuPastel') {
      const cards = extractTwoCardSlots({ slots, fallbackTitle: title, fallbackContent: content });
      [
        { key: 'left', value: cards.left },
        { key: 'right', value: cards.right },
      ].forEach((card) => {
        if (charCount(card.value.title) > TITLE_LIMIT) {
          pushWarning(
            warnings,
            block.id,
            blockIndex,
            'TITLE_TOO_LONG_FOR_TEMPLATE',
            `${card.key}.title`,
            `${card.key} title has ${charCount(card.value.title)} chars (max ${TITLE_LIMIT}).`
          );
        }
        if (card.value.bullets.length > TWO_CARDS_MAX_BULLETS) {
          pushWarning(
            warnings,
            block.id,
            blockIndex,
            'BULLETS_TOO_MANY',
            `${card.key}.bullets`,
            `${card.key} card has ${card.value.bullets.length} bullets (max ${TWO_CARDS_MAX_BULLETS}).`
          );
        }
        if (charCount(card.value.title) > 0 && estimateLineCount(card.value.title, charsPerLine) >= 3) {
          pushWarning(
            warnings,
            block.id,
            blockIndex,
            'RISK_3_LINES_MOBILE',
            `${card.key}.title`,
            `${card.key} title may wrap to 3+ lines on mobile.`
          );
        }
        card.value.bullets.forEach((bullet, bulletIndex) => {
          if (charCount(bullet) > BULLET_LIMIT) {
            pushWarning(
              warnings,
              block.id,
              blockIndex,
              'BULLET_TOO_LONG',
              `${card.key}.bullets.${bulletIndex}`,
              `${card.key} bullet ${bulletIndex + 1} has ${charCount(bullet)} chars (target <= ${BULLET_LIMIT}).`
            );
          }
          if (estimateLineCount(bullet, charsPerLine) >= 3) {
            pushWarning(
              warnings,
              block.id,
              blockIndex,
              'RISK_3_LINES_MOBILE',
              `${card.key}.bullets.${bulletIndex}`,
              `${card.key} bullet ${bulletIndex + 1} may wrap to 3+ lines on mobile.`
            );
          }
        });
      });
    } else if (templateName === 'threeCards.text' || templateName === 'threeCards.menu3') {
      const cards = extractThreeCardSlots({ slots, fallbackTitle: title, fallbackContent: content });
      cards.forEach((card, cardIndex) => {
        if (charCount(card.title) > TITLE_LIMIT) {
          pushWarning(
            warnings,
            block.id,
            blockIndex,
            'TITLE_TOO_LONG_FOR_TEMPLATE',
            `cards.${cardIndex}.title`,
            `Card ${cardIndex + 1} title has ${charCount(card.title)} chars (max ${TITLE_LIMIT}).`
          );
        }
        const lines = splitBodyLines(card.body);
        if (lines.length > THREE_CARDS_MAX_BODY_LINES) {
          pushWarning(
            warnings,
            block.id,
            blockIndex,
            'BULLETS_TOO_MANY',
            `cards.${cardIndex}.body`,
            `Card ${cardIndex + 1} body has ${lines.length} lines (max ${THREE_CARDS_MAX_BODY_LINES}).`
          );
        }
        lines.forEach((line, lineIndex) => {
          if (charCount(line) > BULLET_LIMIT) {
            pushWarning(
              warnings,
              block.id,
              blockIndex,
              'BULLET_TOO_LONG',
              `cards.${cardIndex}.body.${lineIndex}`,
              `Card ${cardIndex + 1} line ${lineIndex + 1} has ${charCount(line)} chars (target <= ${BULLET_LIMIT}).`
            );
          }
          if (estimateLineCount(line, charsPerLine) >= 3) {
            pushWarning(
              warnings,
              block.id,
              blockIndex,
              'RISK_3_LINES_MOBILE',
              `cards.${cardIndex}.body.${lineIndex}`,
              `Card ${cardIndex + 1} line ${lineIndex + 1} may wrap to 3+ lines on mobile.`
            );
          }
        });
      });
    } else {
      const slotTitle = str(slots?.title) || title;
      const slotBody = str(slots?.body) || content;
      if (charCount(slotTitle) > TITLE_LIMIT) {
        pushWarning(
          warnings,
          block.id,
          blockIndex,
          'TITLE_TOO_LONG_FOR_TEMPLATE',
          'title',
          `Title has ${charCount(slotTitle)} chars (max ${TITLE_LIMIT}).`
        );
      }
      if (charCount(slotTitle) > 0 && estimateLineCount(slotTitle, charsPerLine) >= 3) {
        pushWarning(
          warnings,
          block.id,
          blockIndex,
          'RISK_3_LINES_MOBILE',
          'title',
          'Title may wrap to 3+ lines on mobile.'
        );
      }
      if (charCount(slotBody) > 0 && estimateLineCount(slotBody, charsPerLine) >= 3) {
        pushWarning(
          warnings,
          block.id,
          blockIndex,
          'RISK_3_LINES_MOBILE',
          'body',
          'Body may wrap to 3+ lines on mobile.'
        );
      }
    }

    if (charCount(ctaLabel) > ctaLimit) {
      pushWarning(
        warnings,
        block.id,
        blockIndex,
        'CTA_TOO_LONG',
        'ctaLabel',
        `CTA has ${charCount(ctaLabel)} chars (target <= ${ctaLimit}).`
      );
    }
    if (charCount(ctaLabel) > 0 && estimateLineCount(ctaLabel, charsPerLine) >= 3) {
      pushWarning(
        warnings,
        block.id,
        blockIndex,
        'RISK_3_LINES_MOBILE',
        'ctaLabel',
        'CTA may wrap to 3+ lines on mobile.'
      );
    }

    return {
      blockId: block.id,
      blockIndex,
      blockType: block.blockType,
      templateKey,
      warnings,
    };
  });

  const warnings = blocks.flatMap((block) => block.warnings);
  return {
    totalWarnings: warnings.length,
    warnings,
    blocks,
  };
}
