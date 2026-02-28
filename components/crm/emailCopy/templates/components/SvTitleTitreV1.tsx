"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
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

function splitTitleLines(value: string): [string, string] {
  const safe = stringValue(value);
  if (!safe) return ["", ""];
  const lineBreakSplit = safe
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (lineBreakSplit.length >= 2) return [lineBreakSplit[0], lineBreakSplit.slice(1).join(" ")];
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length < 4) return [safe, ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

export function SvTitleTitreV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const line1Slot = recordValue(data.line1);
  const line2Slot = recordValue(data.line2);
  const layout = recordValue(layoutSpec);
  const fallbackLines = splitTitleLines(stringValue(data.title));

  const line1 =
    stringValue(line1Slot?.text) ||
    stringValue(data.line1Text) ||
    stringValue(layout?.line1Text) ||
    fallbackLines[0] ||
    "Titre - ligne 1";
  const line2 =
    stringValue(line2Slot?.text) ||
    stringValue(data.line2Text) ||
    stringValue(layout?.line2Text) ||
    fallbackLines[1] ||
    "Titre - ligne 2";
  const align = stringValue(data.align) || stringValue(layout?.align) || "center";

  return (
    <EmailSectionSurface
      className={`px-[20px] py-[20px] ${alignClass(align)}`}
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      <p
        className="m-0 text-[24px] font-semibold leading-[1.5]"
        style={{ fontFamily: "'Poppins', sans-serif", color: "#0082ca", fontWeight: 600 }}
      >
        {line1}
      </p>
      <p
        className="m-0 text-[24px] font-semibold leading-[1.5]"
        style={{ fontFamily: "'Poppins', sans-serif", color: "#fcbf00", fontWeight: 600 }}
      >
        {line2}
      </p>
    </EmailSectionSurface>
  );
}
