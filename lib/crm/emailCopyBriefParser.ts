import type { BrevoBlockType, EmailCopyBrief, EmailCopyBriefBlock } from '@/lib/crm/emailCopyConfig';

type ParsedBriefMetadata = {
  status?: string;
  visualLinks: string[];
};

const DEFAULT_BLOCK_TYPE_BY_INDEX: BrevoBlockType[] = [
  'hero',
  'three_columns',
  'two_columns',
  'image_text_side_by_side',
  'image_text_side_by_side',
];

function sanitizeWhitespace(value: string): string {
  return value.replace(/\u2800+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function splitKeyValue(line: string): { key: string; value: string } | null {
  if (!line.trim()) return null;
  if (line.includes('\t')) {
    const [rawKey, ...rest] = line.split('\t');
    const key = sanitizeWhitespace(rawKey || '');
    const value = sanitizeWhitespace(rest.join(' '));
    if (!key) return null;
    return { key, value };
  }

  const colonIndex = line.indexOf(':');
  if (colonIndex > 0 && colonIndex < 50) {
    const key = sanitizeWhitespace(line.slice(0, colonIndex));
    const value = sanitizeWhitespace(line.slice(colonIndex + 1));
    if (!key) return null;
    return { key, value };
  }

  const spaced = line.match(/^([A-Za-zÀ-ÿ'()\- ]{3,40})\s{2,}(.+)$/);
  if (spaced) {
    return { key: sanitizeWhitespace(spaced[1]), value: sanitizeWhitespace(spaced[2]) };
  }

  return null;
}

function extractUrls(input: string): string[] {
  const urls = input.match(/https?:\/\/[^\s"']+/g) || [];
  return Array.from(new Set(urls.map((url) => sanitizeWhitespace(url))));
}

function parsePromoCode(raw: string): string | null {
  const codeMatch = raw.match(/\bcode(?:\s+promotionnel)?\s+([A-Z0-9_-]{4,20})\b/i);
  if (!codeMatch?.[1]) return null;
  return codeMatch[1].toUpperCase();
}

function parseValidUntil(raw: string): string | null {
  const lineMatch = raw.match(/valable\s+jusqu[’']au?\s+([^\n\r]+)/i);
  if (!lineMatch?.[1]) return null;
  return sanitizeWhitespace(lineMatch[1]);
}

function defaultBlockType(index: number): BrevoBlockType {
  return DEFAULT_BLOCK_TYPE_BY_INDEX[index] || 'image_text_side_by_side';
}

export type ParsedEmailCopyBrief = {
  brief: EmailCopyBrief;
  metadata: ParsedBriefMetadata;
};

export function parseEmailCopyBrief(rawInput: string): ParsedEmailCopyBrief {
  const raw = rawInput.replace(/\r/g, '');
  const lines = raw.split('\n');

  const metadata: ParsedBriefMetadata = {
    visualLinks: extractUrls(raw),
  };

  const brief: EmailCopyBrief = {
    campaignName: 'Nouvelle campagne',
    objective: null,
    offerSummary: null,
    visualLinks: metadata.visualLinks,
    promoCode: parsePromoCode(raw),
    promoValidUntil: parseValidUntil(raw),
    senderEmail: null,
    comments: null,
    sendDate: null,
    sourceSubject: null,
    sourcePreheader: null,
    rawBriefText: rawInput,
    blocks: [],
  };

  const introLines: string[] = [];
  const offerLines: string[] = [];
  let currentBlock: EmailCopyBriefBlock | null = null;
  let currentField: 'sourceTitle' | 'sourceContent' | 'ctaLabel' | 'ctaUrl' | null = null;

  const flushBlock = () => {
    if (!currentBlock) return;
    const hasContent =
      Boolean(currentBlock.sourceTitle?.trim()) ||
      Boolean(currentBlock.sourceContent?.trim()) ||
      Boolean(currentBlock.ctaLabel?.trim());
    if (hasContent) {
      brief.blocks.push(currentBlock);
    }
    currentBlock = null;
    currentField = null;
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx] || '';
    const line = rawLine.trim();
    if (!line) continue;

    const blockHeader = line.match(/^bloc\s*(\d+)/i);
    if (blockHeader) {
      flushBlock();
      const blockIndex = Math.max(0, Number(blockHeader[1]) - 1);
      currentBlock = {
        id: `block-${blockIndex + 1}`,
        blockType: defaultBlockType(blockIndex),
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
      };
      continue;
    }

    const parsed = splitKeyValue(rawLine);
    if (!parsed) {
      if (currentBlock && currentField) {
        const previous = currentBlock[currentField] ? `${currentBlock[currentField]}\n` : '';
        currentBlock[currentField] = `${previous}${sanitizeWhitespace(line)}`;
      } else if (currentBlock) {
        currentBlock.sourceContent = [currentBlock.sourceContent, sanitizeWhitespace(line)]
          .filter(Boolean)
          .join('\n');
        currentField = 'sourceContent';
      } else if (!brief.campaignName || brief.campaignName === 'Nouvelle campagne') {
        introLines.push(sanitizeWhitespace(line));
      } else {
        offerLines.push(sanitizeWhitespace(line));
      }
      continue;
    }

    const key = normalizeKey(parsed.key);
    const value = sanitizeWhitespace(parsed.value);
    if (!value && !key.startsWith('liens visuels')) {
      continue;
    }

    if (currentBlock) {
      if (key.startsWith('titre')) {
        currentBlock.sourceTitle = value || null;
        currentField = 'sourceTitle';
        continue;
      }
      if (key.startsWith('contenu')) {
        currentBlock.sourceContent = value || null;
        currentField = 'sourceContent';
        continue;
      }
      if (key === 'cta') {
        currentBlock.ctaLabel = value || null;
        currentField = 'ctaLabel';
        continue;
      }
      if (key.startsWith('lien')) {
        currentBlock.ctaUrl = value || null;
        currentField = 'ctaUrl';
        continue;
      }
    }

    if (key === 'status') {
      metadata.status = value || undefined;
      continue;
    }
    if (key.startsWith("date d'envoi") || key.startsWith('date denvoi')) {
      brief.sendDate = value || null;
      continue;
    }
    if (key === 'objet') {
      brief.sourceSubject = value || null;
      continue;
    }
    if (key.startsWith('sous-objet') || key.startsWith('sous objet')) {
      brief.sourcePreheader = value || null;
      continue;
    }
    if (key.startsWith('liens visuels')) {
      const inlineLinks = extractUrls(value);
      metadata.visualLinks = Array.from(new Set([...metadata.visualLinks, ...inlineLinks]));
      continue;
    }
    if (key.startsWith('commentaires')) {
      brief.comments = value || null;
      continue;
    }
    if (key.startsWith('mail envoye par')) {
      brief.senderEmail = value || null;
      continue;
    }

    offerLines.push(`${parsed.key}: ${value}`);
  }

  flushBlock();

  if (introLines.length > 0) {
    brief.campaignName = introLines[0];
  }

  if (!brief.offerSummary && offerLines.length > 0) {
    brief.offerSummary = offerLines.slice(0, 5).join(' ');
  }

  if (!brief.objective && brief.blocks[0]?.sourceContent) {
    brief.objective = sanitizeWhitespace(brief.blocks[0]?.sourceContent || '');
  }

  if (!brief.blocks.length) {
    brief.blocks = [
      {
        id: 'block-1',
        blockType: 'hero',
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
      },
      {
        id: 'block-2',
        blockType: 'three_columns',
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
      },
      {
        id: 'block-3',
        blockType: 'two_columns',
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
      },
    ];
  }

  brief.visualLinks = metadata.visualLinks;

  return { brief, metadata };
}
