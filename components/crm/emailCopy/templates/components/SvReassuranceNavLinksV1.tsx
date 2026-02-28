"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import { recordValue, stringValue } from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

type NavLink = {
  label: string;
  url: string;
};

const DEFAULT_LINKS: NavLink[] = [
  { label: "Nos services", url: "#" },
  { label: "Qui sommes-nous", url: "#" },
  { label: "Notre blog", url: "#" },
];

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function resolveLinks(data: TemplateComponentProps["data"], layout: Record<string, unknown> | null): NavLink[] {
  const fromSlots = Array.isArray(data.links) ? data.links : [];
  const parsed = fromSlots
    .map((entry) => {
      const item = recordValue(entry);
      if (!item) return null;
      const label = stringValue(item.label);
      const url = stringValue(item.url) || "#";
      if (!label) return null;
      return { label, url };
    })
    .filter((entry): entry is NavLink => Boolean(entry));

  if (parsed.length > 0) return parsed.slice(0, 6);

  const layoutLinks = Array.isArray(layout?.links) ? layout.links : [];
  const parsedLayout = layoutLinks
    .map((entry) => {
      const item = recordValue(entry);
      if (!item) return null;
      const label = stringValue(item.label);
      const url = stringValue(item.url) || "#";
      if (!label) return null;
      return { label, url };
    })
    .filter((entry): entry is NavLink => Boolean(entry));

  return parsedLayout.length > 0 ? parsedLayout.slice(0, 6) : DEFAULT_LINKS;
}

function alignClasses(align: string): string {
  if (align === "left") return "justify-start";
  if (align === "right") return "justify-end";
  return "justify-center";
}

export function SvReassuranceNavLinksV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);
  const align = stringValue(data.align) || stringValue(layout?.align) || "center";
  const gapPx = Math.max(8, Math.min(32, toNumber(data.gapPx ?? layout?.gapPx, 16)));
  const links = resolveLinks(data, layout);

  return (
    <EmailSectionSurface
      className="px-5 py-3"
      style={{
        borderRadius: brandTheme.radius,
        backgroundColor: "#faf9f0",
      }}
    >
      <div className={`flex w-full ${alignClasses(align)}`}>
        <div
          className="flex flex-wrap items-center"
          style={{ gap: `${gapPx}px` }}
        >
          {links.map((link, index) => (
            <a
              key={`${link.label}-${index}`}
              href={link.url || "#"}
              className="text-[16px] font-normal leading-[1.35] underline"
              style={{ color: "#0082ca", fontFamily: "Tahoma, Arial, sans-serif" }}
              target={link.url && link.url !== "#" ? "_blank" : undefined}
              rel={link.url && link.url !== "#" ? "noreferrer" : undefined}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </EmailSectionSurface>
  );
}
