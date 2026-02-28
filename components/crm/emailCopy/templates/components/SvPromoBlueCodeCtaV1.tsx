"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import { recordValue, stringValue } from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

function alignClass(align: string): string {
  if (align === "left") return "items-start text-left";
  if (align === "right") return "items-end text-right";
  return "items-center text-center";
}

export function SvPromoBlueCodeCtaV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);
  const slotCta = recordValue(data.cta);
  const layoutCta = recordValue(layout?.cta);

  const discountLine =
    stringValue(data.discountLine) || stringValue(layout?.discountLine) || "-XX %*";
  const codeLineLabel =
    stringValue(data.codeLineLabel) || stringValue(layout?.codeLineLabel) || "CODE :";
  const codeValue = stringValue(data.codeValue) || stringValue(layout?.codeValue) || "CODE";
  const finePrint =
    stringValue(data.finePrint) ||
    stringValue(layout?.finePrint) ||
    "*offre applicable sur la première commande en ligne";
  const ctaLabel =
    stringValue(slotCta?.label) ||
    stringValue(layoutCta?.label) ||
    stringValue(data.ctaLabel) ||
    "Je profite du code";
  const ctaUrl = stringValue(slotCta?.url) || stringValue(layoutCta?.url);
  const align = stringValue(data.align) || stringValue(layout?.align) || "center";

  return (
    <EmailSectionSurface
      className="px-5 py-5"
      style={{
        borderRadius: brandTheme.radius,
        backgroundColor: "#0082ca",
      }}
    >
      <div className={`flex flex-col ${alignClass(align)} font-['Tahoma',Arial,sans-serif] text-white`}>
        <p className="text-[20px] leading-[1.35]">{discountLine}</p>
        <p className="mt-1 text-[20px] leading-[1.35]">
          <span className="font-medium">{codeLineLabel} </span>
          <span className="font-bold">{codeValue}</span>
        </p>
        <p className="mt-2 text-[9px] leading-[1.4] text-white/95">{finePrint}</p>

        {ctaUrl ? (
          <a
            href={ctaUrl}
            className="mt-6 inline-flex rounded-full bg-white px-8 py-3 text-[16px] font-bold leading-none text-[#0082ca] no-underline"
            target="_blank"
            rel="noreferrer"
          >
            {ctaLabel}
          </a>
        ) : (
          <span className="mt-6 inline-flex rounded-full bg-white px-8 py-3 text-[16px] font-bold leading-none text-[#0082ca]">
            {ctaLabel}
          </span>
        )}
      </div>
    </EmailSectionSurface>
  );
}
