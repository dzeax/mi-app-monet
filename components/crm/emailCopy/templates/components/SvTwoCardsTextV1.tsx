"use client";

import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
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
    <div
      className="rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm"
      style={{
        backgroundColor: brandTheme.backgroundColor,
        borderRadius: brandTheme.radius,
        fontFamily: brandTheme.fontFamily,
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text)]/65">Two cards preview</p>
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
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {cardViews.map((card, index) => (
            <div key={`${card.title}-${index}`} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text)]/70">
                {card.title}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--color-text)]">
                {card.lines.map((line, lineIndex) => (
                  <li key={`${line}-${lineIndex}`}>{line}</li>
                ))}
              </ul>
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
