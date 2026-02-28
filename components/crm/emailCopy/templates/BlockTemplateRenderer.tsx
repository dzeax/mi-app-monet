"use client";

import type { ReactElement } from "react";
import { SvHeaderImageV1 } from "@/components/crm/emailCopy/templates/components/SvHeaderImageV1";
import { SvSectionImageV1 } from "@/components/crm/emailCopy/templates/components/SvSectionImageV1";
import { SvMosaicImages5CenterHeroV1 } from "@/components/crm/emailCopy/templates/components/SvMosaicImages5CenterHeroV1";
import { SvCtaPill354V1 } from "@/components/crm/emailCopy/templates/components/SvCtaPill354V1";
import { SvFooterBeigeV1 } from "@/components/crm/emailCopy/templates/components/SvFooterBeigeV1";
import { SvReassuranceNavLinksV1 } from "@/components/crm/emailCopy/templates/components/SvReassuranceNavLinksV1";
import { SvTitleTitreV1 } from "@/components/crm/emailCopy/templates/components/SvTitleTitreV1";
import { SvPromoCodePillV1 } from "@/components/crm/emailCopy/templates/components/SvPromoCodePillV1";
import { SvPromoBlueCodeCtaV1 } from "@/components/crm/emailCopy/templates/components/SvPromoBlueCodeCtaV1";
import { SvTextBeigeCtaV1 } from "@/components/crm/emailCopy/templates/components/SvTextBeigeCtaV1";
import { SvContentCenterHighlightV1 } from "@/components/crm/emailCopy/templates/components/SvContentCenterHighlightV1";
import { SvHeroImageTopV1 } from "@/components/crm/emailCopy/templates/components/SvHeroImageTopV1";
import { SvHeroSimpleV1 } from "@/components/crm/emailCopy/templates/components/SvHeroSimpleV1";
import { SvSideBySideHelpCtaV1 } from "@/components/crm/emailCopy/templates/components/SvSideBySideHelpCtaV1";
import { SvSideBySideImageTextV1 } from "@/components/crm/emailCopy/templates/components/SvSideBySideImageTextV1";
import { SvTwoCardsFormule2V1 } from "@/components/crm/emailCopy/templates/components/SvTwoCardsFormule2V1";
import { SvTwoColumnsImageLeftV1 } from "@/components/crm/emailCopy/templates/components/SvTwoColumnsImageLeftV1";
import { SvThreeCardsMenu3V1 } from "@/components/crm/emailCopy/templates/components/SvThreeCardsMenu3V1";
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
  "header.image": SvHeaderImageV1,
  "section.image": SvSectionImageV1,
  "mosaic.images5.centerHero": SvMosaicImages5CenterHeroV1,
  "cta.pill354": SvCtaPill354V1,
  "footer.beige": SvFooterBeigeV1,
  "reassurance.navLinks": SvReassuranceNavLinksV1,
  "title.titre": SvTitleTitreV1,
  "promo.codePill": SvPromoCodePillV1,
  "promo.blueCodeCta": SvPromoBlueCodeCtaV1,
  "text.beigeCta": SvTextBeigeCtaV1,
  "content.centerHighlight": SvContentCenterHighlightV1,
  "hero.simple": SvHeroSimpleV1,
  "hero.imageTop": SvHeroImageTopV1,
  "twoCards.text": SvTwoCardsTextV1,
  "twoColumns.imageLeft": SvTwoColumnsImageLeftV1,
  "twoCards.formule2": SvTwoCardsFormule2V1,
  "twoCards.menuPastel": SvTwoCardsMenuPastelV1,
  "threeCards.text": SvThreeCardsTextV1,
  "threeCards.menu3": SvThreeCardsMenu3V1,
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
