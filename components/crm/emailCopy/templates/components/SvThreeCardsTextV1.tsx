"use client";

import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  recordValue,
  splitToCards,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";

export function SvThreeCardsTextV1({ brandTheme, data, inlineEditing }: TemplateComponentProps) {
  const title = stringValue(data.title) || "Three cards block";
  const subtitle = stringValue(data.subtitle);
  const ctaLabel = stringValue(data.ctaLabel) || "Call to action";
  const cardsSlot = Array.isArray(data.cards) ? data.cards : [];
  const fallbackBodies = splitToCards(stringValue(data.content), 3);
  const cards = Array.from({ length: 3 }, (_, index) => {
    const slot = recordValue(cardsSlot[index]);
    return {
      title: stringValue(slot?.title) || `Card ${index + 1}`,
      body: stringValue(slot?.body) || fallbackBodies[index] || fallbackBodies[0] || "",
    };
  });

  return (
    <EmailSectionSurface
      className="text-[color:var(--color-text)]"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      {inlineEditing?.enabled ? (
        <input
          className="input w-full text-lg font-semibold sm:text-xl"
          defaultValue={inlineEditing.titleValue ?? title}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
        />
      ) : (
        <h4 className="text-lg font-semibold text-[color:var(--color-text)] sm:text-xl">{title}</h4>
      )}
      {subtitle ? (
        <p className="mt-3 text-[15px] text-[color:var(--color-text)]/72">{subtitle}</p>
      ) : null}

      {inlineEditing?.enabled ? (
        <textarea
          className="input mt-4 min-h-[92px] w-full text-sm"
          defaultValue={inlineEditing.contentValue ?? stringValue(data.content)}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onContentCommit?.(event.currentTarget.value)}
        />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {cards.map((card, index) => (
            <div key={`${card.title}-${index}`} className="rounded-md border border-[color:var(--color-border)]/70 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text)]/70">
                {card.title}
              </p>
              <p className="mt-2 text-[15px] leading-[1.6] text-[color:var(--color-text)]">{card.body}</p>
            </div>
          ))}
        </div>
      )}

      <span
        className="mt-5 inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
        style={{ backgroundColor: brandTheme.primaryColor, color: "#ffffff" }}
      >
        {ctaLabel}
      </span>
    </EmailSectionSurface>
  );
}
