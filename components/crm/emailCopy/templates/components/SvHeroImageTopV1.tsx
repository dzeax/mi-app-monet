"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  parseContentForPreview,
  recordValue,
  stringArrayValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function splitHeadline(value: string): [string, string] {
  const safe = stringValue(value);
  if (!safe) return ["Bien plus qu'un service", "de portage de repas"];
  const breakByLine = safe.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (breakByLine.length >= 2) return [breakByLine[0], breakByLine.slice(1).join(" ")];
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length < 4) return [safe, "de portage de repas"];
  const mid = Math.max(2, Math.ceil(words.length / 2));
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function paragraphsFromContent(content: string): string[] {
  const safe = stringValue(content);
  if (!safe) return [];

  const byParagraph = content
    .split(/\r?\n\s*\r?\n/)
    .map((entry) => stringValue(entry))
    .filter(Boolean);
  if (byParagraph.length > 0) return byParagraph.slice(0, 3);

  const byLine = content
    .split(/\r?\n/)
    .map((entry) => stringValue(entry))
    .filter(Boolean);
  if (byLine.length > 1) return byLine.slice(0, 3);

  const parsed = parseContentForPreview(safe);
  if (parsed.isList && parsed.items.length > 0) return parsed.items.slice(0, 3);

  const bySentence = safe
    .split(/(?<=[.!?])\s+/)
    .map((entry) => stringValue(entry))
    .filter(Boolean);
  if (bySentence.length <= 2) return [safe];
  const first = bySentence.slice(0, 2).join(" ");
  const second = bySentence.slice(2).join(" ");
  return [first, second].filter(Boolean);
}

export function SvHeroImageTopV1({ brandTheme, data, layoutSpec, inlineEditing }: TemplateComponentProps) {
  const imageSlot = recordValue(data.image);
  const headlineSlot = recordValue(data.headline);
  const bodySlot = recordValue(data.body);
  const ctaSlot = recordValue(data.cta);
  const layout = recordValue(layoutSpec);

  const imageSrc = stringValue(imageSlot?.src) || stringValue(data.imageSrc);
  const imageAlt = stringValue(imageSlot?.alt) || "Visuel Saveurs et Vie";
  const fallbackHeadline = splitHeadline(stringValue(data.title));
  const line1 = stringValue(headlineSlot?.line1) || fallbackHeadline[0];
  const line2 = stringValue(headlineSlot?.line2) || fallbackHeadline[1] || stringValue(data.subtitle);
  const greeting = stringValue(bodySlot?.greeting) || "Bonjour {PRENOM},";
  const bodyParagraphs =
    stringArrayValue(bodySlot?.paragraphs).length > 0
      ? stringArrayValue(bodySlot?.paragraphs).slice(0, 3)
      : paragraphsFromContent(stringValue(data.content));
  const ctaLabel = stringValue(ctaSlot?.label) || stringValue(data.ctaLabel) || "Je découvre tous les menus";

  const headlineBlue = stringValue(layout?.headlineBlue) || "#0082ca";
  const headlineYellowRaw = stringValue(layout?.headlineYellow);
  const headlineYellow =
    !headlineYellowRaw || headlineYellowRaw.toLowerCase() === "#f2b200"
      ? "#fcbf00"
      : headlineYellowRaw;
  const bodyMaxWidthPx = clamp(toNumber(layout?.bodyMaxWidthPx, 520), 520, 520);
  const imageMaxWidthPct = clamp(toNumber(layout?.imageMaxWidthPct, 92), 60, 100);
  const imageRadiusPx = clamp(toNumber(layout?.imageRadiusPx, 0), 0, 24);
  const ctaBg = stringValue(layout?.ctaBg) || "#0082ca";
  const ctaRadiusClass = stringValue(layout?.ctaRadius) === "full" ? "rounded-full" : "rounded-lg";

  const headlineInlineValue = [line1, line2].filter(Boolean).join("\n");
  const bodyInlineValue = [greeting, ...bodyParagraphs].filter(Boolean).join("\n\n");

  return (
    <EmailSectionSurface
      className="pb-0 text-[color:var(--color-text)] sm:pb-0"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      <div className="mx-auto" style={{ maxWidth: `${imageMaxWidthPct}%` }}>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={imageAlt}
            className="mx-auto aspect-[16/9] w-full object-cover"
            style={{ borderRadius: `${imageRadiusPx}px` }}
          />
        ) : (
          <div
            className="mx-auto flex aspect-[16/9] w-full items-center justify-center bg-slate-100 text-sm text-slate-500"
            style={{ borderRadius: `${imageRadiusPx}px` }}
          >
            {imageAlt}
          </div>
        )}
      </div>

      {inlineEditing?.enabled ? (
        <textarea
          className="input mx-auto mt-6 mb-[18px] min-h-[76px] w-full max-w-[540px] text-center text-[30px] font-bold leading-[1.1] sm:text-[32px]"
          style={{ fontFamily: "'Poppins', sans-serif" }}
          defaultValue={inlineEditing.titleValue ?? headlineInlineValue}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
        />
      ) : (
        <div
          className="mt-6 mb-[18px] text-center leading-[1.1] [&>p]:m-0"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
          <p className="text-[30px] font-bold leading-[1.1] tracking-[-0.01em] sm:text-[32px]" style={{ color: headlineBlue }}>
            {line1}
          </p>
          <p className="text-[30px] font-bold leading-[1.1] tracking-[-0.01em] sm:text-[32px]" style={{ color: headlineYellow }}>
            {line2}
          </p>
        </div>
      )}

      {inlineEditing?.enabled ? (
        <div className="mx-auto px-[15px] pt-[27px]" style={{ maxWidth: `${bodyMaxWidthPx}px` }}>
          <textarea
            className="input min-h-[170px] w-full text-[15px] leading-[1.5]"
            style={{ fontFamily: "Tahoma, Arial, sans-serif" }}
            defaultValue={inlineEditing.contentValue ?? bodyInlineValue}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => inlineEditing.onContentCommit?.(event.currentTarget.value)}
          />
        </div>
      ) : (
        <div
          className="mx-auto px-[15px] pt-[27px] text-left text-[15px] leading-[1.5] text-[color:var(--color-text)]"
          style={{ maxWidth: `${bodyMaxWidthPx}px`, fontFamily: "Tahoma, Arial, sans-serif" }}
        >
          <p className="mb-4">{greeting}</p>
          {(bodyParagraphs.length > 0 ? bodyParagraphs : ["Ajoutez un texte d'accompagnement utile et rassurant."]).map(
            (paragraph, index, array) => (
              <p key={`${paragraph}-${index}`} className={index === array.length - 1 ? "" : "mb-4"}>
                {paragraph}
              </p>
            )
          )}
        </div>
      )}

      <div className="mt-6 text-center">
        <span
          className={`inline-flex h-11 items-center justify-center px-6 text-[16px] font-semibold text-white ${ctaRadiusClass}`}
          style={{ backgroundColor: ctaBg }}
        >
          {ctaLabel}
        </span>
      </div>
    </EmailSectionSurface>
  );
}
