"use client";

import type { CSSProperties } from "react";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import { recordValue, stringValue } from "@/components/crm/emailCopy/templates/components/contentUtils";

const DEFAULT_HEADER_IMAGE_URL =
  "https://img.mailinblue.com/2607945/images/content_library/original/6864f260ce04ba0eb2f03ec5.png";

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function alignClass(value: string): string {
  if (value === "left") return "justify-start";
  if (value === "right") return "justify-end";
  return "justify-center";
}

export function SvHeaderImageV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const imageSlot = recordValue(data.image);
  const layout = recordValue(layoutSpec);
  const layoutImage = recordValue(layout?.image);

  const imageSrc =
    stringValue(imageSlot?.src) ||
    stringValue(layoutImage?.src) ||
    stringValue(data.imageSrc) ||
    DEFAULT_HEADER_IMAGE_URL;
  const imageAlt =
    stringValue(imageSlot?.alt) ||
    stringValue(layoutImage?.alt) ||
    stringValue(data.imageAlt) ||
    "Saveurs et Vie";
  const linkUrl = stringValue(data.linkUrl) || stringValue(layout?.linkUrl);
  const alignValue = stringValue(data.align) || stringValue(layout?.align) || "center";
  const imageMaxWidthPx = toNumber(layout?.imageMaxWidthPx, 580);

  const imageElement = imageSrc ? (
    <img
      src={imageSrc}
      alt={imageAlt}
      className="block h-auto w-full max-w-full"
      style={{ maxWidth: `${imageMaxWidthPx}px` }}
    />
  ) : (
    <div
      className="flex w-full max-w-[580px] items-center justify-center bg-slate-100 px-4 py-6 text-sm text-slate-500"
      aria-label="Header image placeholder"
    >
      Header image
    </div>
  );

  const imageContainerStyle: CSSProperties = {
    maxWidth: `${imageMaxWidthPx}px`,
    width: "100%",
  };

  return (
    <EmailSectionSurface
      className="py-1 sm:py-1.5"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      <div className={["flex w-full", alignClass(alignValue)].join(" ")}>
        <div style={imageContainerStyle}>
          {linkUrl ? (
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
              {imageElement}
            </a>
          ) : (
            imageElement
          )}
        </div>
      </div>
    </EmailSectionSurface>
  );
}
