"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  parseContentForPreview,
  recordValue,
  stringArrayValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

const DEFAULT_TITLE = "Découvrez les engagements au cœur\nde notre approche :";
const DEFAULT_BODY_PARAGRAPHS = [
  "Chez Saveurs et Vie, nous avons à coeur de proposer des recettes élaborées par nos diététiciens-nutritionnistes, qui allient équilibre alimentaire et plaisir gustatif pour favoriser le maintien à domicile.",
  "Découvrez les engagements qui sont au coeur de notre approche :",
];
const DEFAULT_CTA_LABEL = "NOS ENGAGEMENTS";

function alignClass(align: string): string {
  return align === "center" ? "text-center" : "text-left";
}

function resolveBodyParagraphs(data: TemplateComponentProps["data"], layout: Record<string, unknown> | null): string[] {
  const fromSlots = stringArrayValue(data.bodyParagraphs);
  if (fromSlots.length > 0) return fromSlots.slice(0, 4);

  const fromLayout = stringArrayValue(layout?.bodyParagraphs);
  if (fromLayout.length > 0) return fromLayout.slice(0, 4);

  const parsedContent = parseContentForPreview(stringValue(data.content));
  if (parsedContent.text) {
    return parsedContent.text
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  return DEFAULT_BODY_PARAGRAPHS;
}

export function SvTextBeigeCtaV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);
  const slotCta = recordValue(data.cta);
  const layoutCta = recordValue(layout?.cta);

  const title = stringValue(data.title) || stringValue(layout?.title) || "Titre";
  const bodyParagraphs = resolveBodyParagraphs(data, layout);
  const ctaLabel =
    stringValue(slotCta?.label) ||
    stringValue(layoutCta?.label) ||
    stringValue(data.ctaLabel) ||
    "CTA";
  const ctaUrl = stringValue(slotCta?.url) || stringValue(layoutCta?.url);
  const align = stringValue(data.align) || stringValue(layout?.align) || "left";

  return (
    <EmailSectionSurface
      className="px-5 py-5"
      style={{
        borderRadius: brandTheme.radius,
        backgroundColor: "#faf9f0",
      }}
    >
      <div className={alignClass(align)}>
        <h3
          className="whitespace-pre-line text-[20px] font-semibold leading-[1.5] text-[#0082ca]"
          style={{ fontFamily: "Montserrat, Arial, sans-serif" }}
        >
          {title || DEFAULT_TITLE}
        </h3>

        <div
          className="mt-4 space-y-4 text-[16px] leading-[1.5] text-[#414141]"
          style={{ fontFamily: "Montserrat, Arial, sans-serif" }}
        >
          {(bodyParagraphs.length > 0 ? bodyParagraphs : ["Contenu"]).map((paragraph, index) => (
            <p key={`beige-text-body-${index}`}>{paragraph}</p>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        {ctaUrl ? (
          <a
            href={ctaUrl}
            className="inline-flex h-auto w-[280px] max-w-full items-center justify-center py-[13px] text-center text-[16px] font-bold text-white no-underline"
            style={{ backgroundColor: "#0082ca", borderRadius: "25px", fontFamily: "Montserrat, Arial, sans-serif" }}
            target="_blank"
            rel="noreferrer"
          >
            {ctaLabel || DEFAULT_CTA_LABEL}
          </a>
        ) : (
          <span
            className="inline-flex h-auto w-[280px] max-w-full items-center justify-center py-[13px] text-center text-[16px] font-bold text-white"
            style={{ backgroundColor: "#0082ca", borderRadius: "25px", fontFamily: "Montserrat, Arial, sans-serif" }}
          >
            {ctaLabel || DEFAULT_CTA_LABEL}
          </span>
        )}
      </div>
    </EmailSectionSurface>
  );
}
