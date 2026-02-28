"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import { recordValue, stringValue } from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

function alignClass(align: string): string {
  if (align === "left") return "justify-start text-left";
  if (align === "right") return "justify-end text-right";
  return "justify-center text-center";
}

export function SvCtaPill354V1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);

  const label = stringValue(data.label) || stringValue(data.ctaLabel) || stringValue(layout?.label) || "CTA";
  const url = stringValue(data.url) || stringValue(layout?.url);
  const align = stringValue(data.align) || stringValue(layout?.align) || "center";

  const widthSeed = Number(data.widthPx ?? layout?.widthPx ?? 354);
  const radiusSeed = Number(data.radiusPx ?? layout?.radiusPx ?? 25);
  const widthPx = Number.isFinite(widthSeed) ? Math.max(220, Math.min(420, widthSeed)) : 354;
  const radiusPx = Number.isFinite(radiusSeed) ? Math.max(16, Math.min(40, radiusSeed)) : 25;

  const buttonClass =
    "inline-flex max-w-full items-center justify-center px-4 py-[13px] text-center text-[16px] font-bold leading-[1.2] text-white no-underline";

  return (
    <EmailSectionSurface className="px-3 py-3 sm:px-3 sm:py-3" style={{ borderRadius: brandTheme.radius }}>
      <div className={`flex w-full ${alignClass(align)}`}>
        {url ? (
          <a
            href={url}
            className={buttonClass}
            style={{
              width: `${widthPx}px`,
              borderRadius: `${radiusPx}px`,
              backgroundColor: "#0082ca",
              fontFamily: "Montserrat, Arial, sans-serif",
            }}
            target="_blank"
            rel="noreferrer"
          >
            {label}
          </a>
        ) : (
          <span
            className={buttonClass}
            style={{
              width: `${widthPx}px`,
              borderRadius: `${radiusPx}px`,
              backgroundColor: "#0082ca",
              fontFamily: "Montserrat, Arial, sans-serif",
            }}
          >
            {label}
          </span>
        )}
      </div>
    </EmailSectionSurface>
  );
}
