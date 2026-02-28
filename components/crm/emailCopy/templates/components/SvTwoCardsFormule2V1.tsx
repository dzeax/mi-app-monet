"use client";

import type { CSSProperties } from "react";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  recordValue,
  splitToCards,
  stringArrayValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";

type FormuleCard = {
  title: string;
  bullets: string[];
};

const DEFAULT_BACKGROUND_IMAGE =
  "https://img.mailinblue.com/2607945/images/content_library/original/686fd8c89addba0b7fd582a7.png";

function normalizeBullets(value: unknown): string[] {
  const asList = stringArrayValue(value);
  if (asList.length > 0) return asList.slice(0, 5);
  const asText = stringValue(value);
  if (!asText) return [];
  return asText
    .split(/\r?\n|[•*-]\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function buildCards(data: TemplateComponentProps["data"]): FormuleCard[] {
  const slots = Array.isArray(data.cards) ? data.cards : [];
  const fallbackTitle = stringValue(data.title) || "Formule";
  const fallbackBullets = splitToCards(stringValue(data.content), 4);

  const cards = Array.from({ length: 2 }, (_, index) => {
    const cardSlot = recordValue(slots[index]);
    const title = stringValue(cardSlot?.title) || `${fallbackTitle} ${index + 1}`;
    const bullets = normalizeBullets(cardSlot?.bullets);

    if (bullets.length > 0) {
      return { title, bullets: bullets.slice(0, 4) };
    }

    const seedStart = index * 2;
    const seeded = fallbackBullets.slice(seedStart, seedStart + 2).filter(Boolean);
    return {
      title,
      bullets:
        seeded.length > 0
          ? seeded
          : [
              "Une formule flexible et sans engagement",
              "Un service simple, humain et rassurant",
            ],
    };
  });

  return cards;
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <circle cx="9" cy="9" r="8" fill="#2FAA4B" />
      <path
        d="M5.2 9.1L7.7 11.5L12.8 6.6"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TitleIcon() {
  return (
    <svg
      aria-hidden
      width="19"
      height="19"
      viewBox="0 0 19 19"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <rect x="2" y="2" width="15" height="15" rx="3.5" stroke="#0082ca" strokeWidth="2" />
      <circle cx="9.5" cy="9.5" r="2.6" fill="#0082ca" />
    </svg>
  );
}

export function SvTwoCardsFormule2V1({ brandTheme, data, layoutSpec, inlineEditing }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);
  const cards = buildCards(data);

  const backgroundImageUrl =
    stringValue(data.backgroundImageUrl) ||
    stringValue(layout?.backgroundImageUrl) ||
    DEFAULT_BACKGROUND_IMAGE;
  const innerBg = "#FFF7E7";
  const borderColor = "#0082ca";

  const cardStyle: CSSProperties = {
    borderColor,
    backgroundColor: innerBg,
  };

  return (
    <EmailSectionSurface
      className="py-[60px] text-[color:var(--color-text)] sm:py-[60px]"
      style={{
        borderRadius: brandTheme.radius,
        backgroundImage: `url("${backgroundImageUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
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
        <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2 sm:gap-5 sm:py-5">
          {cards.map((card, index) => (
            <article
              key={`formule2-card-${index}`}
              className="rounded-[16px] border-[3px] px-4 py-4 sm:px-5 sm:py-5"
              style={cardStyle}
            >
              <div className="flex items-center gap-2">
                <TitleIcon />
                <h4
                  className="text-[15px] font-bold leading-[1.3]"
                  style={{ color: borderColor, fontFamily: "Tahoma, Arial, sans-serif" }}
                >
                  {card.title}
                </h4>
              </div>

              <ul className="mt-3 space-y-2.5">
                {card.bullets.map((bullet, bulletIndex) => (
                  <li
                    key={`${card.title}-${bullet}-${bulletIndex}`}
                    className="flex items-center gap-2.5 text-[15px] leading-[1.45] text-slate-900"
                    style={{ fontFamily: "Tahoma, Arial, sans-serif" }}
                  >
                    <CheckIcon />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </EmailSectionSurface>
  );
}
