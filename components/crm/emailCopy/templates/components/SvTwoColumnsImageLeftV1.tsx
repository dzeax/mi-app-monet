"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import {
  parseContentForPreview,
  recordValue,
  stringArrayValue,
  stringValue,
} from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

const DEFAULT_IMAGE_SRC =
  "https://img.mailinblue.com/2607945/images/content_library/original/68fb4f54a6c24e719b5a8c93.jpeg";
const DEFAULT_IMAGE_ALT = "Le Nutritest";
const DEFAULT_TITLE = "Le Nutritest";
const DEFAULT_BULLETS = [
  "Auto-test gratuit",
  "Rapide à réaliser",
  "Contient 10 questions pour définir votre profil alimentaire",
];
const PLACEHOLDER_BULLETS = ["Point clé 1", "Point clé 2"];

function normalizeBullets(value: unknown): string[] {
  const fromArray = stringArrayValue(value);
  if (fromArray.length > 0) return fromArray.slice(0, 6);
  const fromText = stringValue(value);
  if (!fromText) return [];
  return fromText
    .split(/\r?\n|[•*-]\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mt-[3px] shrink-0"
    >
      <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" fill="#6ECC8C" />
      <path
        d="M4 8.3L6.6 10.8L12 5.4"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SvTwoColumnsImageLeftV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const imageSlot = recordValue(data.image);
  const layout = recordValue(layoutSpec);
  const layoutImage = recordValue(layout?.image);

  const imageSrc =
    stringValue(imageSlot?.src) ||
    stringValue(data.imageSrc) ||
    stringValue(layoutImage?.src) ||
    DEFAULT_IMAGE_SRC;
  const imageAlt =
    stringValue(imageSlot?.alt) ||
    stringValue(data.imageAlt) ||
    stringValue(layoutImage?.alt) ||
    DEFAULT_IMAGE_ALT;

  const title =
    stringValue(data.title) || stringValue(layout?.title) || DEFAULT_TITLE || "Titre";

  const slotBullets = normalizeBullets(data.bullets);
  const layoutBullets = normalizeBullets(layout?.bullets);
  const parsedContent = parseContentForPreview(stringValue(data.content));
  const contentBullets = parsedContent.isList ? parsedContent.items : [];
  const bullets =
    slotBullets.length > 0
      ? slotBullets
      : layoutBullets.length > 0
      ? layoutBullets
      : contentBullets.length > 0
      ? contentBullets
      : DEFAULT_BULLETS;
  const resolvedBullets =
    bullets.length > 0 ? bullets : PLACEHOLDER_BULLETS;

  return (
    <EmailSectionSurface
      className="px-5 py-5"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      <div className="grid grid-cols-1 gap-[30px] md:grid-cols-2">
        <div>
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={imageAlt}
              className="h-auto w-full rounded-[8px] object-cover"
            />
          ) : (
            <div className="flex min-h-[220px] w-full items-center justify-center rounded-[8px] bg-slate-100 text-sm text-slate-500">
              Image
            </div>
          )}
        </div>

        <div className="self-center">
          <h3
            className="text-[24px] font-semibold leading-[1.5] text-[#0082ca]"
            style={{ fontFamily: "Poppins, sans-serif" }}
          >
            {title || "Titre"}
          </h3>

          <ul className="mt-2.5 space-y-2.5">
            {resolvedBullets.map((bullet, index) => (
              <li
                key={`${bullet}-${index}`}
                className="flex items-start gap-2.5 text-[16px] leading-[1.5] text-[#414141]"
                style={{ fontFamily: "Tahoma, Arial, sans-serif" }}
              >
                <CheckIcon />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </EmailSectionSurface>
  );
}
