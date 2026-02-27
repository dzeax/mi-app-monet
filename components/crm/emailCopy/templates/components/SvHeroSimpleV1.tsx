"use client";

import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import { parseContentForPreview, stringValue } from "@/components/crm/emailCopy/templates/components/contentUtils";

export function SvHeroSimpleV1({ brandTheme, data, inlineEditing }: TemplateComponentProps) {
  const title = stringValue(data.headline) || stringValue(data.title) || "Untitled hero";
  const subtitle = stringValue(data.subheadline) || stringValue(data.subtitle);
  const body = stringValue(data.body) || stringValue(data.content);
  const ctaLabel = stringValue(data.ctaLabel) || "Call to action";
  const content = parseContentForPreview(body);

  return (
    <EmailSectionSurface
      className="text-[color:var(--color-text)]"
      style={{ fontFamily: brandTheme.fontFamily, borderRadius: brandTheme.radius }}
    >
      {inlineEditing?.enabled ? (
        <input
          className="input w-full text-lg font-semibold sm:text-xl"
          defaultValue={inlineEditing.titleValue ?? title}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
        />
      ) : (
        <h4 className="text-lg font-semibold text-[color:var(--color-text)] sm:text-xl">{title}</h4>
      )}
      {subtitle ? (
        <p className="mt-3 text-[15px] text-[color:var(--color-text)]/72">{subtitle}</p>
      ) : null}

      {inlineEditing?.enabled ? (
        <textarea
          className="input mt-4 min-h-[92px] w-full text-sm"
          defaultValue={inlineEditing.contentValue ?? body}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onContentCommit?.(event.currentTarget.value)}
        />
      ) : (
        content.isList ? (
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px] leading-[1.6] text-[color:var(--color-text)]">
            {content.items.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] leading-[1.6] text-[color:var(--color-text)]">
            {content.text || "No content yet."}
          </p>
        )
      )}

      <span
        className="mt-5 inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
        style={{ backgroundColor: brandTheme.primaryColor, color: "#ffffff" }}
      >
        {ctaLabel}
      </span>
    </EmailSectionSurface>
  );
}
