"use client";

import {
  recordValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

function alignClass(value: string): string {
  if (value === "left") return "text-left";
  if (value === "right") return "text-right";
  return "text-center";
}

export function SvPromoCodePillV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const dataRecord = recordValue(data) ?? {};
  const layout = recordValue(layoutSpec) ?? {};

  const textBefore =
    stringValue(dataRecord.textBefore) ||
    stringValue(layout.textBefore);
  const discountText =
    stringValue(dataRecord.discountText) ||
    stringValue(layout.discountText);
  const textAfter =
    stringValue(dataRecord.textAfter) ||
    stringValue(layout.textAfter);
  const codeText =
    stringValue(dataRecord.codeText) ||
    stringValue(layout.codeText) ||
    "CODE";
  const align =
    stringValue(dataRecord.align) ||
    stringValue(layout.align) ||
    "center";

  const hasMainParts = Boolean(textBefore || discountText || textAfter || codeText);

  return (
    <section
      className={`w-full py-1 ${alignClass(align)}`}
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      <div className="inline-block w-fit max-w-full rounded-2xl bg-[#faf9f0] px-[18px] py-[8px]">
        {hasMainParts ? (
          <p
            className="m-0 text-[17px] leading-[1.35] text-[#414141]"
            style={{ fontFamily: "'Montserrat', Arial, sans-serif" }}
          >
            {textBefore ? <span>{textBefore} </span> : null}
            {discountText ? (
              <span className="font-semibold underline">{discountText}</span>
            ) : null}
            {textAfter ? <span>{discountText ? " " : ""}{textAfter} </span> : null}
            <span className="font-semibold text-[#0082ca]">{codeText || "CODE"}</span>
          </p>
        ) : (
          <p
            className="m-0 text-[17px] leading-[1.35] text-[#414141]"
            style={{ fontFamily: "'Montserrat', Arial, sans-serif" }}
          >
            Promo
          </p>
        )}
      </div>
    </section>
  );
}
