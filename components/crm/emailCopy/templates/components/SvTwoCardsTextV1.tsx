"use client";

import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  recordValue,
  splitToCards,
  stringArrayValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";

export function SvTwoCardsTextV1({ brandTheme, data, inlineEditing }: TemplateComponentProps) {
  const leftSlot = recordValue(data.left);
  const rightSlot = recordValue(data.right);
  const title = stringValue(data.title) || "Two cards block";
  const subtitle = stringValue(data.subtitle);
  const ctaLabel = stringValue(data.ctaLabel) || "Call to action";
  const cards = splitToCards(stringValue(data.content), 2);
  const leftBullets = stringArrayValue(leftSlot?.bullets);
  const rightBullets = stringArrayValue(rightSlot?.bullets);
  const cardViews = [
    {
      title: stringValue(leftSlot?.title) || "Card 1",
      lines: leftBullets.length ? leftBullets : [cards[0] || "Card 1"],
    },
    {
      title: stringValue(rightSlot?.title) || "Card 2",
      lines: rightBullets.length ? rightBullets : [cards[1] || cards[0] || "Card 2"],
    },
  ];

  return (
    <EmailSectionSurface
      className="text-[color:var(--color-text)]"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      {inlineEditing?.enabled ? (
        <input
          className="input w-full text-lg font-semibold"
          defaultValue={inlineEditing.titleValue ?? title}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
        />
      ) : (
        <h4 className="text-lg font-semibold text-[color:var(--color-text)]">{title}</h4>
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
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {cardViews.map((card, index) => (
            <div key={`${card.title}-${index}`} className="rounded-md border border-[color:var(--color-border)]/70 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text)]/70">
                {card.title}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-[1.6] text-[color:var(--color-text)]">
                {card.lines.map((line, lineIndex) => (
                  <li key={`${line}-${lineIndex}`}>{line}</li>
                ))}
              </ul>
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
