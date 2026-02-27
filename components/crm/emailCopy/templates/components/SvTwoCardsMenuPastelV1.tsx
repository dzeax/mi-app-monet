"use client";

import type { CSSProperties } from "react";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  parseContentForPreview,
  recordValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

type BulletLine = {
  lead: string;
  text: string;
};

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function splitLeadText(input: string): BulletLine | null {
  const safe = stringValue(input);
  if (!safe) return null;
  const colonIndex = safe.indexOf(":");
  if (colonIndex > 0 && colonIndex < safe.length - 1) {
    return {
      lead: stringValue(safe.slice(0, colonIndex)),
      text: stringValue(safe.slice(colonIndex + 1)),
    };
  }
  return { lead: safe, text: "" };
}

function normalizeBullet(entry: unknown): BulletLine | null {
  const asRecord = recordValue(entry);
  if (asRecord) {
    const lead = stringValue(asRecord.lead);
    const text = stringValue(asRecord.text);
    if (lead || text) {
      return {
        lead: lead || text,
        text: lead ? text : "",
      };
    }
    return null;
  }
  if (typeof entry === "string") {
    return splitLeadText(entry);
  }
  return null;
}

function normalizeBullets(value: unknown): BulletLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeBullet(entry)).filter((entry): entry is BulletLine => Boolean(entry));
}

function fallbackBullets(sourceContent: string): BulletLine[] {
  const parsed = parseContentForPreview(sourceContent);
  const fromContent = (parsed.isList ? parsed.items : sourceContent.split(/\r?\n/))
    .map((entry) => splitLeadText(entry))
    .filter((entry): entry is BulletLine => Boolean(entry));
  if (fromContent.length >= 3) return fromContent.slice(0, 3);
  return [
    { lead: "Plats uniques", text: "prets a rechauffer, disponibles en packs de 5 ou 7" },
    { lead: "Solution simple", text: "et pratique pour votre quotidien" },
    { lead: "Recettes equilibrees", text: "elaborees avec nos dieteticiens" },
  ];
}

function renderBullet(item: BulletLine, index: number) {
  return (
    <li key={`${item.lead}-${item.text}-${index}`} className="flex items-start gap-1.5 text-[14px] leading-[1.55] text-slate-800">
      <span aria-hidden className="mt-[3px] text-[11px] text-slate-700">
        •
      </span>
      <span>
        <span className="font-semibold">{item.lead}</span>
        {item.text ? <span>{` ${item.text}`}</span> : null}
      </span>
    </li>
  );
}

export function SvTwoCardsMenuPastelV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const slotsLeft = recordValue(data.left);
  const slotsRight = recordValue(data.right);
  const layout = recordValue(layoutSpec);

  const sourceTitle = stringValue(data.title);
  const sourceContent = stringValue(data.content);
  const leftTitle = stringValue(slotsLeft?.title) || sourceTitle || "Menu 2";
  const rightTitle = stringValue(slotsRight?.title) || sourceTitle || "Menu 2";
  const leftBullets = normalizeBullets(slotsLeft?.bullets);
  const rightBullets = normalizeBullets(slotsRight?.bullets);
  const fallback = fallbackBullets(sourceContent);

  const gapPx = toNumber(layout?.gapPx, 28);
  const radiusPx = toNumber(layout?.radiusPx, 20);
  const paddingPx = toNumber(layout?.paddingPx, 26);
  const leftBg = stringValue(layout?.leftBg) || "#ffecb2";
  const rightBg = stringValue(layout?.rightBg) || "#ffc8dd";
  const titleColor = stringValue(layout?.titleColor) || "#0082ca";

  const cardBaseStyle: CSSProperties = {
    borderRadius: `${radiusPx}px`,
    padding: `${paddingPx}px`,
  };

  return (
    <EmailSectionSurface
      className="text-[color:var(--color-text)]"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: `${gapPx}px` }}>
        <section style={{ ...cardBaseStyle, backgroundColor: leftBg }}>
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-[34px] font-semibold leading-[1.08]" style={{ color: titleColor }}>
              {leftTitle}
            </h4>
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: titleColor, color: "#ffffff" }}
              aria-hidden
            >
              {"\u2192"}
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {(leftBullets.length ? leftBullets : fallback).slice(0, 4).map((entry, index) => renderBullet(entry, index))}
          </ul>
        </section>

        <section style={{ ...cardBaseStyle, backgroundColor: rightBg }}>
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-[34px] font-semibold leading-[1.08]" style={{ color: titleColor }}>
              {rightTitle}
            </h4>
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: titleColor, color: "#ffffff" }}
              aria-hidden
            >
              {"\u2192"}
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {(rightBullets.length ? rightBullets : fallback).slice(0, 4).map((entry, index) => renderBullet(entry, index))}
          </ul>
        </section>
      </div>
    </EmailSectionSurface>
  );
}
