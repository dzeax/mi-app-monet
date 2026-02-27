"use client";

import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
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
    <div
      className="rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm"
      style={{
        backgroundColor: brandTheme.backgroundColor,
        borderRadius: brandTheme.radius,
        fontFamily: brandTheme.fontFamily,
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text)]/65">Three cards preview</p>
      {inlineEditing?.enabled ? (
        <input
          className="input mt-2 w-full text-base font-semibold"
          defaultValue={inlineEditing.titleValue ?? title}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
        />
      ) : (
        <h4 className="mt-2 text-base font-semibold text-[color:var(--color-text)]">{title}</h4>
      )}
      {subtitle ? (
        <p className="mt-1 text-sm text-[color:var(--color-text)]/70">{subtitle}</p>
      ) : null}

      {inlineEditing?.enabled ? (
        <textarea
          className="input mt-3 min-h-[92px] w-full text-sm"
          defaultValue={inlineEditing.contentValue ?? stringValue(data.content)}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onContentCommit?.(event.currentTarget.value)}
        />
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {cards.map((card, index) => (
            <div key={`${card.title}-${index}`} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text)]/70">
                {card.title}
              </p>
              <p className="mt-1 text-sm text-[color:var(--color-text)]">{card.body}</p>
            </div>
          ))}
        </div>
      )}

      <span
        className="mt-4 inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
        style={{ backgroundColor: brandTheme.primaryColor, color: "#ffffff" }}
      >
        {ctaLabel}
      </span>
    </div>
  );
}
