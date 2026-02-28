"use client";

import {
  recordValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

function alignmentClass(value: string): string {
  if (value === "left") return "justify-start";
  if (value === "right") return "justify-end";
  return "justify-center";
}

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

export function SvSectionImageV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const dataRecord = recordValue(data) ?? {};
  const layout = recordValue(layoutSpec) ?? {};
  const dataImage = recordValue(dataRecord.image) ?? {};
  const layoutImage = recordValue(layout.image) ?? {};

  const imageSrc =
    stringValue(dataImage.src) ||
    stringValue(dataRecord.imageSrc) ||
    stringValue(layoutImage.src);
  const imageAlt =
    stringValue(dataImage.alt) ||
    stringValue(dataRecord.imageAlt) ||
    stringValue(layoutImage.alt) ||
    "Formule reconductible";
  const linkUrl =
    stringValue(dataRecord.linkUrl) ||
    stringValue(layout.linkUrl);
  const align =
    stringValue(dataRecord.align) ||
    stringValue(layout.align) ||
    "center";
  const maxWidth = clamp(
    toNumber(dataRecord.maxWidth ?? layout.maxWidth, 800),
    320,
    1200
  );

  const imageNode = imageSrc ? (
    <img
      src={imageSrc}
      alt={imageAlt}
      className="h-auto w-full max-w-full object-contain"
      style={{ maxWidth: `${maxWidth}px` }}
    />
  ) : (
    <p className="m-0 text-sm text-slate-500">Image section</p>
  );

  return (
    <section
      className={`flex w-full py-0 ${alignmentClass(align)}`}
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      {linkUrl && imageSrc ? (
        <a href={linkUrl} target="_blank" rel="noopener noreferrer">
          {imageNode}
        </a>
      ) : (
        imageNode
      )}
    </section>
  );
}
