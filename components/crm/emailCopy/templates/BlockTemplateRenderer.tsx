"use client";

import type { ReactElement } from "react";
import { SvHeroSimpleV1 } from "@/components/crm/emailCopy/templates/components/SvHeroSimpleV1";
import { SvSideBySideHelpCtaV1 } from "@/components/crm/emailCopy/templates/components/SvSideBySideHelpCtaV1";
import { SvSideBySideImageTextV1 } from "@/components/crm/emailCopy/templates/components/SvSideBySideImageTextV1";
import { SvTwoCardsMenuPastelV1 } from "@/components/crm/emailCopy/templates/components/SvTwoCardsMenuPastelV1";
import { SvThreeCardsTextV1 } from "@/components/crm/emailCopy/templates/components/SvThreeCardsTextV1";
import { SvTwoCardsTextV1 } from "@/components/crm/emailCopy/templates/components/SvTwoCardsTextV1";
import type { BlockPreviewData, BrandTheme, TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";
import {
  getDefaultTemplateForType,
  getTemplateDef,
  getTemplateNameFromKey,
  isTemplateCompatibleWithType,
  type TemplateName,
} from "@/lib/crm/emailCopy/templates/templateRegistry";
import type { BrevoBlockType } from "@/lib/crm/emailCopyConfig";

type BlockTemplateRendererProps = {
  templateKey?: string | null;
  blockType: BrevoBlockType;
  blockData: BlockPreviewData;
  brandTheme: BrandTheme;
  layoutSpec?: Record<string, unknown>;
  renderSlots?: unknown;
  inlineEditing?: {
    enabled?: boolean;
    titleValue?: string | null;
    contentValue?: string | null;
    onTitleCommit?: (value: string) => void;
    onContentCommit?: (value: string) => void;
  };
};

const COMPONENT_BY_TEMPLATE_NAME: Record<TemplateName, (props: TemplateComponentProps) => ReactElement> = {
  "hero.simple": SvHeroSimpleV1,
  "twoCards.text": SvTwoCardsTextV1,
  "twoCards.menuPastel": SvTwoCardsMenuPastelV1,
  "threeCards.text": SvThreeCardsTextV1,
  "sideBySide.imageText": SvSideBySideImageTextV1,
  "sideBySide.helpCta": SvSideBySideHelpCtaV1,
};

export function BlockTemplateRenderer({
  templateKey,
  blockType,
  blockData,
  brandTheme,
  layoutSpec,
  renderSlots,
  inlineEditing,
}: BlockTemplateRendererProps) {
  if (templateKey && !getTemplateDef(templateKey)) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Unknown template: {templateKey}
      </div>
    );
  }

  const selectedTemplateKey =
    templateKey && isTemplateCompatibleWithType(templateKey, blockType)
      ? (getTemplateDef(templateKey)?.key ?? templateKey)
      : getDefaultTemplateForType(blockType);
  const templateDef = getTemplateDef(selectedTemplateKey);
  const templateName = getTemplateNameFromKey(templateDef?.key ?? selectedTemplateKey);
  const Renderer = templateName ? COMPONENT_BY_TEMPLATE_NAME[templateName] : null;

  if (!Renderer) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Unknown template renderer: {selectedTemplateKey}
      </div>
    );
  }

  return (
    <Renderer
      brandTheme={brandTheme}
      data={(renderSlots && typeof renderSlots === "object" ? (renderSlots as BlockPreviewData) : blockData)}
      layoutSpec={layoutSpec && Object.keys(layoutSpec).length ? layoutSpec : templateDef?.defaultLayoutSpec}
      inlineEditing={inlineEditing}
    />
  );
}
