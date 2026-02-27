"use client";

import type { CSSProperties } from "react";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  parseContentForPreview,
  recordValue,
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

function alignmentClass(value: string): string {
  if (value === "start" || value === "top") return "items-start";
  if (value === "end" || value === "bottom") return "items-end";
  return "items-center";
}

export function SvSideBySideHelpCtaV1({
  brandTheme,
  data,
  layoutSpec,
  inlineEditing,
}: TemplateComponentProps) {
  const imageSlot = recordValue(data.image);
  const contentSlot = recordValue(data.content);
  const layout = recordValue(layoutSpec);

  const imageSrc = stringValue(imageSlot?.src) || stringValue(data.imageSrc);
  const imageAlt = stringValue(imageSlot?.alt) || stringValue(data.imageAlt) || "Visuel";
  const title =
    stringValue(contentSlot?.title) || stringValue(data.title) || "Besoin d'aide ?";
  const body =
    stringValue(contentSlot?.body) || stringValue(data.body) || stringValue(data.content);
  const ctaLabel =
    stringValue(contentSlot?.ctaLabel) ||
    stringValue(data.ctaLabel) ||
    "Contacter le service client";
  const parsedBody = parseContentForPreview(body);

  const imageSide = stringValue(layout?.imageSide) === "right" ? "right" : "left";
  const imageWidthPct = clamp(toNumber(layout?.imageWidthPct, 40), 30, 55);
  const gapPx = clamp(toNumber(layout?.gapPx, 24), 12, 36);
  const alignY = alignmentClass(stringValue(layout?.alignY) || "center");
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `${imageWidthPct}% minmax(0, 1fr)`,
    gap: `${gapPx}px`,
  };

  return (
    <EmailSectionSurface
      className="text-[color:var(--color-text)]"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      <div className={`grid ${alignY}`} style={gridStyle}>
        <div className={imageSide === "right" ? "order-2" : "order-1"}>
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={imageAlt}
              className="aspect-[4/3] w-full rounded-[13px] object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[13px] border border-[color:var(--color-border)]/55 bg-slate-100 text-xs font-medium text-slate-500">
              {imageAlt}
            </div>
          )}
        </div>

        <div className={[imageSide === "right" ? "order-1" : "order-2", "max-w-[420px]"].join(" ")}>
          {inlineEditing?.enabled ? (
            <input
              className="input w-full text-[26px] font-semibold leading-[1.34] sm:text-[28px]"
              defaultValue={inlineEditing.titleValue ?? title}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
            />
          ) : (
            <h4 className="text-[26px] font-semibold leading-[1.34] text-[#2AA7C9] sm:text-[28px]">
              {title}
            </h4>
          )}

          {inlineEditing?.enabled ? (
            <textarea
              className="input mt-5 min-h-[92px] w-full text-sm"
              defaultValue={inlineEditing.contentValue ?? body}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => inlineEditing.onContentCommit?.(event.currentTarget.value)}
            />
          ) : parsedBody.isList ? (
            <ul className="mt-5 max-w-[54ch] list-disc space-y-1.5 pl-5 text-[15px] leading-[1.7] text-[color:var(--color-text)]/90">
              {parsedBody.items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 max-w-[54ch] text-[15px] leading-[1.7] text-[color:var(--color-text)]/90">
              {parsedBody.text || "Ajoutez un texte d'accompagnement utile et rassurant."}
            </p>
          )}

          <span
            className="mt-7 inline-flex h-11 items-center justify-between gap-4 rounded-full py-1.5 pl-6 pr-2.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
            style={{ backgroundColor: "#0082ca", color: "#ffffff" }}
          >
            <span>{ctaLabel}</span>
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base leading-none"
              style={{ backgroundColor: "#F6C343", color: "#0E78A8" }}
              aria-hidden
            >
              {"\u2192"}
            </span>
          </span>
        </div>
      </div>
    </EmailSectionSurface>
  );
}
