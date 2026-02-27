"use client";

import type { CSSProperties } from "react";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  recordValue,
  splitToCards,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";

type Menu3Card = {
  imageSrc: string;
  imageAlt: string;
  title: string;
  text: string;
  ctaLabel: string;
};

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

function buildCards(data: TemplateComponentProps["data"]): Menu3Card[] {
  const cardsSlot = Array.isArray(data.cards) ? data.cards : [];
  const fallbackTitle = stringValue(data.title) || "Menu";
  const fallbackTextParts = splitToCards(stringValue(data.content), 3);
  const fallbackCta = stringValue(data.ctaLabel) || "Je découvre";

  return Array.from({ length: 3 }, (_, index) => {
    const card = recordValue(cardsSlot[index]);
    const image = recordValue(card?.image);
    const cta = recordValue(card?.cta);

    return {
      imageSrc: stringValue(image?.src),
      imageAlt: stringValue(image?.alt) || "Visuel",
      title: stringValue(card?.title) || `${fallbackTitle} ${index + 1}`,
      text:
        stringValue(card?.text) ||
        stringValue(card?.body) ||
        fallbackTextParts[index] ||
        fallbackTextParts[0] ||
        "Décrivez ce menu en quelques mots utiles.",
      ctaLabel: stringValue(cta?.label) || fallbackCta,
    };
  });
}

export function SvThreeCardsMenu3V1({ brandTheme, data, layoutSpec, inlineEditing }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);
  const cards = buildCards(data);

  const bgColor = stringValue(layout?.bgColor) || stringValue(data.bgColor) || "#faf9f0";
  const titleColor = stringValue(layout?.titleColor) || "#0082ca";
  const buttonColor = stringValue(layout?.buttonColor) || "#0082ca";
  const imageRadius = clamp(toNumber(layout?.imageRadius, 14), 8, 20);
  const imageStyle: CSSProperties = { borderRadius: `${imageRadius}px` };

  return (
    <EmailSectionSurface
      className="text-[color:var(--color-text)]"
      style={{
        borderRadius: brandTheme.radius,
        backgroundColor: bgColor,
        fontFamily: "Tahoma, Arial, sans-serif",
      }}
    >
      {inlineEditing?.enabled ? (
        <div className="space-y-3">
          <input
            className="input w-full text-sm"
            defaultValue={inlineEditing.titleValue ?? stringValue(data.title)}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
          />
          <textarea
            className="input min-h-[96px] w-full text-[15px] leading-[1.45]"
            defaultValue={inlineEditing.contentValue ?? stringValue(data.content)}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => inlineEditing.onContentCommit?.(event.currentTarget.value)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-7">
          {cards.map((card, index) => (
            <article key={`menu3-card-${index}`} className="mx-auto flex w-full max-w-[215px] flex-col items-center text-center">
              {card.imageSrc ? (
                <img
                  src={card.imageSrc}
                  alt={card.imageAlt}
                  className="aspect-square w-full max-w-[168px] object-cover"
                  style={imageStyle}
                />
              ) : (
                <div
                  className="flex aspect-square w-full max-w-[168px] items-center justify-center bg-slate-100 text-sm text-slate-500"
                  style={imageStyle}
                >
                  {card.imageAlt || "Visuel"}
                </div>
              )}

              <h4
                className="mt-4 text-center text-[16px] font-bold leading-[1.2]"
                style={{ color: titleColor, fontFamily: "'Poppins', sans-serif" }}
              >
                {card.title}
              </h4>

              <p className="mt-2 text-center text-[14px] leading-[1.45] text-[color:var(--color-text)]">
                {card.text}
              </p>

              <span
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg px-4 text-center text-[15px] font-semibold text-white"
                style={{ backgroundColor: buttonColor, fontFamily: "Tahoma, Arial, sans-serif" }}
              >
                {card.ctaLabel}
              </span>
            </article>
          ))}
        </div>
      )}
    </EmailSectionSurface>
  );
}
