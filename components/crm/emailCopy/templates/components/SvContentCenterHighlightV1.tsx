"use client";

import { Fragment } from "react";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  parseContentForPreview,
  recordValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

type HighlightTone = "default" | "highlight";

type ParagraphPart = {
  text: string;
  tone: HighlightTone;
};

type Paragraph = {
  parts: ParagraphPart[];
};

const DEFAULT_PARAGRAPHS: Paragraph[] = [
  {
    parts: [
      { text: "Le portage de repas est une solution particulièrement adaptée afin de ", tone: "default" },
      { text: "favoriser le maintien à domicile.", tone: "highlight" },
    ],
  },
  {
    parts: [
      {
        text: "Vous pouvez commander nos formules directement sur notre site internet.",
        tone: "default",
      },
    ],
  },
];

function toTone(value: unknown): HighlightTone {
  return value === "highlight" ? "highlight" : "default";
}

function resolveParagraphs(data: TemplateComponentProps["data"]): Paragraph[] {
  const slotParagraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
  const fromSlots: Paragraph[] = slotParagraphs
    .map((entry) => {
      const paragraph = recordValue(entry);
      if (!paragraph) return { parts: [] };
      const parts = Array.isArray(paragraph.parts) ? paragraph.parts : [];
      const normalizedParts = parts.map((part) => {
        const parsedPart = recordValue(part);
        if (!parsedPart) return { text: "", tone: "default" as const };
        return {
          text: stringValue(parsedPart.text),
          tone: toTone(parsedPart.tone),
        };
      });
      return { parts: normalizedParts };
    })
    .filter((paragraph) => paragraph.parts.length > 0);

  if (fromSlots.length > 0) return fromSlots;

  const parsedContent = parseContentForPreview(stringValue(data.content));
  if (!parsedContent.isList && parsedContent.text) {
    const lines = parsedContent.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      return lines.map((line) => ({
        parts: [{ text: line, tone: "default" }],
      }));
    }
    return [
      {
        parts: [{ text: parsedContent.text, tone: "default" }],
      },
    ];
  }

  return DEFAULT_PARAGRAPHS;
}

function alignClass(align: string): string {
  if (align === "left") return "text-left";
  if (align === "right") return "text-right";
  return "text-center";
}

export function SvContentCenterHighlightV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);
  const align = stringValue(data.align) || stringValue(layout?.align) || "center";
  const paragraphs = resolveParagraphs(data);

  if (paragraphs.length === 0) {
    return (
      <EmailSectionSurface
        className="px-4 py-3 sm:px-5 sm:py-3"
        style={{
          fontFamily: "Tahoma, Arial, sans-serif",
          borderRadius: brandTheme.radius,
        }}
      >
        <p className={`text-[15px] leading-[1.5] text-[#314251]/60 ${alignClass(align)}`}>Contenu</p>
      </EmailSectionSurface>
    );
  }

  return (
    <EmailSectionSurface
      className="px-4 py-3 sm:px-5 sm:py-3"
      style={{
        fontFamily: "Tahoma, Arial, sans-serif",
        borderRadius: brandTheme.radius,
      }}
    >
      <div className={`space-y-3 text-[15px] leading-[1.5] text-[#314251] ${alignClass(align)}`}>
        {paragraphs.map((paragraph, paragraphIndex) => (
          <p key={`paragraph-${paragraphIndex}`}>
            {paragraph.parts.map((part, partIndex) => (
              <Fragment key={`paragraph-${paragraphIndex}-part-${partIndex}`}>
                <span className={part.tone === "highlight" ? "font-semibold text-[#0082ca]" : undefined}>
                  {part.text}
                </span>
              </Fragment>
            ))}
          </p>
        ))}
      </div>
    </EmailSectionSurface>
  );
}
