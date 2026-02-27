"use client";

import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import { parseContentForPreview, stringValue } from "@/components/crm/emailCopy/templates/components/contentUtils";

export function SvHeroSimpleV1({ brandTheme, data, inlineEditing }: TemplateComponentProps) {
  const title = stringValue(data.headline) || stringValue(data.title) || "Untitled hero";
  const subtitle = stringValue(data.subheadline) || stringValue(data.subtitle);
  const body = stringValue(data.body) || stringValue(data.content);
  const ctaLabel = stringValue(data.ctaLabel) || "Call to action";
  const content = parseContentForPreview(body);

  return (
    <div
      className="rounded-xl border border-[color:var(--color-border)] p-4 shadow-sm"
      style={{
        backgroundColor: brandTheme.backgroundColor,
        borderRadius: brandTheme.radius,
        fontFamily: brandTheme.fontFamily,
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text)]/65">Hero preview</p>
      {inlineEditing?.enabled ? (
        <input
          className="input mt-2 w-full text-base font-semibold"
          defaultValue={inlineEditing.titleValue ?? title}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onTitleCommit?.(event.currentTarget.value)}
        />
      ) : (
        <h4 className="mt-2 text-base font-semibold text-[color:var(--color-text)]">{title}</h4>
      )}
      {subtitle ? (
        <p className="mt-1 text-sm text-[color:var(--color-text)]/70">{subtitle}</p>
      ) : null}

      {inlineEditing?.enabled ? (
        <textarea
          className="input mt-3 min-h-[92px] w-full text-sm"
          defaultValue={inlineEditing.contentValue ?? body}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => inlineEditing.onContentCommit?.(event.currentTarget.value)}
        />
      ) : (
        content.isList ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]">
            {content.items.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[color:var(--color-text)]">{content.text || "No content yet."}</p>
        )
      )}

      <span
        className="mt-4 inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
        style={{ backgroundColor: brandTheme.primaryColor, color: "#ffffff" }}
      >
        {ctaLabel}
      </span>
    </div>
  );
}
