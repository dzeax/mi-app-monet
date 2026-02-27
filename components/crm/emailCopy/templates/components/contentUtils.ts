function clean(value: string): string {
  return value.replace(/\u2800+/g, " ").replace(/\s+/g, " ").trim();
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? clean(value) : "";
}

export function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => stringValue(entry)).filter(Boolean);
}

function linesFromContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripBulletPrefix(value: string): string {
  return value.replace(/^\s*(?:[-*•]+\s*)/, "").trim();
}

export function parseContentForPreview(content: string | null | undefined): {
  isList: boolean;
  items: string[];
  text: string;
} {
  const safe = clean(content || "");
  if (!safe) return { isList: false, items: [], text: "" };

  const rawLines = linesFromContent(content || "");
  const bulletLines = rawLines
    .filter((line) => /^\s*(?:[-*•]+\s*)/.test(line))
    .map((line) => stripBulletPrefix(line))
    .filter(Boolean);
  if (bulletLines.length >= 2) {
    return { isList: true, items: bulletLines, text: safe };
  }

  if (safe.includes("•")) {
    const bullets = safe
      .split("•")
      .map((entry) => clean(entry))
      .filter(Boolean);
    if (bullets.length >= 2) {
      return { isList: true, items: bullets, text: safe };
    }
  }

  return { isList: false, items: [], text: safe };
}

export function splitToCards(content: string | null | undefined, count: number): string[] {
  const parsed = parseContentForPreview(content);
  if (parsed.isList && parsed.items.length >= count) return parsed.items.slice(0, count);

  const safe = clean(content || "");
  if (!safe) return Array.from({ length: count }, (_, index) => `Card ${index + 1}`);

  const sentenceParts = safe
    .split(/(?<=[.!?;:])\s+/)
    .map((entry) => clean(entry))
    .filter(Boolean);

  if (sentenceParts.length >= count) {
    return sentenceParts.slice(0, count);
  }

  const words = safe.split(/\s+/).filter(Boolean);
  const chunkSize = Math.max(1, Math.ceil(words.length / count));
  const cards: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * chunkSize;
    const end = index === count - 1 ? words.length : (index + 1) * chunkSize;
    const chunk = words.slice(start, end).join(" ").trim();
    cards.push(chunk || cards[cards.length - 1] || "");
  }
  return cards.map((entry, index) => entry || `Card ${index + 1}`);
}
