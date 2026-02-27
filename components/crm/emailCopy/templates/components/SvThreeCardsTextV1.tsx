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
      title: stringValue(slot?.title),
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
        <div className="mt-4 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {cards.map((card, index) => (
            <div key={`three-card-${index}`} className="rounded-sm border border-[color:var(--color-border)]/45 bg-white p-4">
              {card.title ? (
                <p className="text-[11px] font-medium tracking-[0.02em] text-[color:var(--color-text)]/58">
                  {card.title}
                </p>
              ) : null}
              <p className={[card.title ? "mt-2" : "", "text-[15px] leading-[1.6] text-[color:var(--color-text)]"].join(" ")}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      )}

      <span
        className="mt-6 inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
        style={{ backgroundColor: brandTheme.primaryColor, color: "#ffffff" }}
      >
        {ctaLabel}
      </span>
    </EmailSectionSurface>
  );
}
