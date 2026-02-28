"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, LibraryBig, Plus } from "lucide-react";

import { BlockTemplateRenderer } from "@/components/crm/emailCopy/templates/BlockTemplateRenderer";
import type { BlockPreviewData, BrandTheme } from "@/components/crm/emailCopy/templates/types";
import {
  getDefaultTemplateForType,
  getTemplateDef,
} from "@/lib/crm/emailCopy/templates/templateRegistry";
import type { BrevoBlockType } from "@/lib/crm/emailCopyConfig";

type BlockLibraryPanelProps = {
  clientSlug: string;
  hasHeaderBlock?: boolean;
  collapsed?: boolean;
  showCollapseToggle?: boolean;
  onToggleCollapsed?: () => void;
  onAddBlock: (input: AddBlockPayload) => void;
};

export type AddBlockPayload = {
  blockType: BrevoBlockType;
  templateKey?: string | null;
  layoutSpec?: Record<string, unknown>;
};

type LibraryItem = {
  id: string;
  blockType: BrevoBlockType;
  templateKey: string;
  layoutSpec?: Record<string, unknown>;
  name: string;
  shortLabel: string;
  description: string;
  previewData: BlockPreviewData;
  singleInstance?: boolean;
};

const LIBRARY_PREVIEW_THEME: BrandTheme = {
  primaryColor: "#0ea5a8",
  secondaryColor: "#1f2937",
  backgroundColor: "#f8fafc",
  radius: "0.75rem",
  fontFamily: "inherit",
};

function resolveTemplateKeyForItem(input: {
  clientSlug: string;
  blockType: BrevoBlockType;
  preferredTemplateKey?: string | null;
}): string {
  const preferred = input.preferredTemplateKey
    ? getTemplateDef(input.preferredTemplateKey, input.clientSlug)?.key
    : null;
  if (preferred) return preferred;
  const defaultTemplate = getDefaultTemplateForType(input.blockType, input.clientSlug);
  return getTemplateDef(defaultTemplate, input.clientSlug)?.key || defaultTemplate;
}

function createCoreItems(clientSlug: string): LibraryItem[] {
  const items: Array<
    Omit<LibraryItem, "templateKey"> & {
      preferredTemplateKey?: string | null;
      layoutSpecOverride?: Record<string, unknown>;
    }
  > = [
    {
      id: "header-image",
      blockType: "hero",
      preferredTemplateKey: "sv.header.image.v1",
      name: "Header",
      shortLabel: "Hd",
      description: "Single image header block pinned to top.",
      previewData: {
        title: "Header image",
        subtitle: "Logo et signature de marque",
      },
      singleInstance: true,
    },
    {
      id: "hero",
      blockType: "hero",
      preferredTemplateKey: "sv.hero.imageTop.v1",
      name: "Hero",
      shortLabel: "H",
      description: "Primary headline, context, and CTA.",
      previewData: {
        title: "Un titre clair et rassurant",
        subtitle: "Un sous-titre pour cadrer l'offre",
        content: "Presentez la proposition principale et le benefice immediat.",
        ctaLabel: "Decouvrir",
      },
    },
    {
      id: "section-image",
      blockType: "hero",
      preferredTemplateKey: "sv.section.image.v1",
      name: "Section image",
      shortLabel: "Img",
      description: "Single image content section.",
      previewData: {
        image: {
          src: "https://img.mailinblue.com/2607945/images/content_library/original/69935409edfea40618a90d5b.png",
          alt: "Formule reconductible",
        },
      },
    },
    {
      id: "image-logo-centre",
      blockType: "hero",
      preferredTemplateKey: "sv.section.image.v1",
      name: "Image logo centre",
      shortLabel: "Logo",
      description: "Single centered image logo section.",
      previewData: {
        image: {
          src: "https://img.mailinblue.com/2607945/images/content_library/original/6993539aedfea40618a90d38.png",
          alt: "Image logo centre",
        },
      },
      layoutSpecOverride: {
        image: {
          src: "https://img.mailinblue.com/2607945/images/content_library/original/6993539aedfea40618a90d38.png",
          alt: "Image logo centre",
        },
        align: "center",
        maxWidth: 800,
      },
    },
    {
      id: "mosaic-images",
      blockType: "hero",
      preferredTemplateKey: "sv.mosaic.images5.centerHero.v1",
      name: "Mosaique images",
      shortLabel: "M5",
      description: "Five-image mosaic with a large center visual.",
      previewData: {
        images: {
          img1: {
            src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6207cc7c28f805fa1c9.jpg",
            alt: "Mosaïque image 1",
          },
          img2: {
            src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce62187ec1cf2e0721a41.jpg",
            alt: "Mosaïque image 2",
          },
          img3: {
            src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6217cc7c28f805fa1ca.jpg",
            alt: "Mosaïque image 3",
          },
          img4: {
            src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6742b2cc887da6c4210.jpg",
            alt: "Mosaïque image 4",
          },
          img5: {
            src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce62167fe85e2c79ac611.jpg",
            alt: "Mosaïque image 5",
          },
        },
        radiusPx: 8,
      },
      layoutSpecOverride: {
        radiusPx: 8,
      },
    },
    {
      id: "content-highlight",
      blockType: "hero",
      preferredTemplateKey: "sv.content.centerHighlight.v1",
      name: "Contenu",
      shortLabel: "Txt",
      description: "Centered text with highlighted key phrase.",
      previewData: {
        paragraphs: [
          {
            parts: [
              { text: "Le portage de repas est une solution particulièrement adaptée afin de " },
              { text: "favoriser le maintien à domicile.", tone: "highlight" },
            ],
          },
          {
            parts: [{ text: "Vous pouvez commander nos formules directement sur notre site internet." }],
          },
        ],
        align: "center",
      },
      layoutSpecOverride: {
        align: "center",
      },
    },
    {
      id: "promo-blue-code-cta",
      blockType: "hero",
      preferredTemplateKey: "sv.promo.blueCodeCta.v1",
      name: "Promo bleu CTA",
      shortLabel: "Pr",
      description: "Blue promo block with code and white CTA.",
      previewData: {
        discountLine: "-25 %*",
        codeLineLabel: "CODE :",
        codeValue: "BIENVENUE25",
        finePrint: "*offre applicable sur la première commande en ligne",
        cta: { label: "Je profite du code", url: "" },
        align: "center",
      },
      layoutSpecOverride: {
        discountLine: "-25 %*",
        codeLineLabel: "CODE :",
        codeValue: "BIENVENUE25",
        finePrint: "*offre applicable sur la première commande en ligne",
        cta: { label: "Je profite du code", url: "" },
        align: "center",
      },
    },
    {
      id: "cta-pill-354",
      blockType: "hero",
      preferredTemplateKey: "sv.cta.pill354.v1",
      name: "CTA",
      shortLabel: "CTA",
      description: "Centered fixed-width CTA pill.",
      previewData: {
        label: "DÉCOUVRIR LE MENU DUO",
        url: "",
        widthPx: 354,
        radiusPx: 25,
        align: "center",
      },
      layoutSpecOverride: {
        label: "DÉCOUVRIR LE MENU DUO",
        url: "",
        widthPx: 354,
        radiusPx: 25,
        align: "center",
      },
    },
    {
      id: "reassurance-links",
      blockType: "hero",
      preferredTemplateKey: "sv.reassurance.navLinks.v1",
      name: "Reassurance",
      shortLabel: "Nav",
      description: "Centered reassurance links on beige background.",
      previewData: {
        links: [
          { label: "Nos services", url: "#" },
          { label: "Qui sommes-nous", url: "#" },
          { label: "Notre blog", url: "#" },
        ],
        gapPx: 16,
        align: "center",
      },
      layoutSpecOverride: {
        links: [
          { label: "Nos services", url: "#" },
          { label: "Qui sommes-nous", url: "#" },
          { label: "Notre blog", url: "#" },
        ],
        gapPx: 16,
        align: "center",
      },
    },
    {
      id: "texte-beige-cta",
      blockType: "hero",
      preferredTemplateKey: "sv.text.beigeCta.v1",
      name: "Texte",
      shortLabel: "Tx",
      description: "Beige text section with centered CTA.",
      previewData: {
        title: "Découvrez les engagements au cœur\nde notre approche :",
        bodyParagraphs: [
          "Chez Saveurs et Vie, nous avons à coeur de proposer des recettes équilibrées et savoureuses.",
          "Découvrez les engagements qui sont au coeur de notre approche :",
        ],
        cta: { label: "NOS ENGAGEMENTS", url: "" },
        align: "left",
      },
      layoutSpecOverride: {
        title: "Découvrez les engagements au cœur\nde notre approche :",
        bodyParagraphs: [
          "Chez Saveurs et Vie, nous avons à coeur de proposer des recettes équilibrées et savoureuses.",
          "Découvrez les engagements qui sont au coeur de notre approche :",
        ],
        cta: { label: "NOS ENGAGEMENTS", url: "" },
        align: "left",
      },
    },
    {
      id: "two-columns",
      blockType: "two_columns",
      preferredTemplateKey: "sv.twoCards.menuPastel.v1",
      name: "2 cards",
      shortLabel: "2C",
      description: "Compare or split two propositions.",
      previewData: {
        title: "Deux axes de valeur",
        content: "Option A\nOption B",
        ctaLabel: "Voir les options",
      },
    },
    {
      id: "image-gauche",
      blockType: "two_columns",
      preferredTemplateKey: "sv.twoColumns.imageLeft.v1",
      name: "Image gauche",
      shortLabel: "IG",
      description: "Image left with title and check bullets.",
      previewData: {
        image: {
          src: "https://img.mailinblue.com/2607945/images/content_library/original/68fb4f54a6c24e719b5a8c93.jpeg",
          alt: "Le Nutritest",
        },
        title: "Le Nutritest",
        bullets: [
          "Auto-test gratuit",
          "Rapide à réaliser",
          "Contient 10 questions pour définir votre profil alimentaire",
        ],
      },
      layoutSpecOverride: {
        image: {
          src: "https://img.mailinblue.com/2607945/images/content_library/original/68fb4f54a6c24e719b5a8c93.jpeg",
          alt: "Le Nutritest",
        },
        title: "Le Nutritest",
        bullets: [
          "Auto-test gratuit",
          "Rapide à réaliser",
          "Contient 10 questions pour définir votre profil alimentaire",
        ],
        iconStyle: "checkGreen",
        align: "left",
      },
    },
    {
      id: "three-columns",
      blockType: "three_columns",
      preferredTemplateKey: "sv.threeCards.menu3.v1",
      name: "3 cards",
      shortLabel: "3C",
      description: "Highlight three concise points.",
      previewData: {
        title: "Trois points essentiels",
        content: "Point 1\nPoint 2\nPoint 3",
        ctaLabel: "En savoir plus",
      },
    },
    {
      id: "image-text",
      blockType: "image_text_side_by_side",
      preferredTemplateKey: "sv.sideBySide.helpCta.v1",
      name: "Image + text",
      shortLabel: "I+T",
      description: "Combine visual context with message.",
      previewData: {
        title: "Image et contenu alignes",
        content: "Associez l'image a un texte court oriente benefice.",
        ctaLabel: "Explorer",
      },
    },
    {
      id: "footer-beige",
      blockType: "hero",
      preferredTemplateKey: "sv.footer.beige.v1",
      name: "Footer beige",
      shortLabel: "Ft",
      description: "Social icons and legal footer content.",
      previewData: {
        companyLines: ["Saveurs et Vie", "Orly, France", "Cet email a été envoyé à EMAIL"],
        recipientEmailLabel: "EMAIL",
        gdprParagraph: "Informations RGPD",
        unsubscribe: { label: "Se désinscrire", url: "" },
      },
    },
  ];

  return items.map((item): LibraryItem => {
    const templateKey = resolveTemplateKeyForItem({
      clientSlug,
      blockType: item.blockType,
      preferredTemplateKey: item.preferredTemplateKey,
    });
    const templateDef = getTemplateDef(templateKey, clientSlug);
    const defaultLayoutSpec =
      templateDef?.defaultLayoutSpec && typeof templateDef.defaultLayoutSpec === "object"
        ? (templateDef.defaultLayoutSpec as Record<string, unknown>)
        : {};
    const overrideLayoutSpec =
      item.layoutSpecOverride && typeof item.layoutSpecOverride === "object"
        ? item.layoutSpecOverride
        : {};
    const mergedLayoutSpec = {
      ...defaultLayoutSpec,
      ...overrideLayoutSpec,
      image:
        defaultLayoutSpec.image && typeof defaultLayoutSpec.image === "object"
          ? {
              ...(defaultLayoutSpec.image as Record<string, unknown>),
              ...((overrideLayoutSpec.image && typeof overrideLayoutSpec.image === "object"
                ? (overrideLayoutSpec.image as Record<string, unknown>)
                : {}) as Record<string, unknown>),
            }
          : overrideLayoutSpec.image,
    } as Record<string, unknown>;
    return {
      ...item,
      templateKey: templateDef?.key || templateKey,
      layoutSpec: mergedLayoutSpec,
      previewData: {
        ...item.previewData,
        templateKey: templateDef?.key || item.preferredTemplateKey || templateKey,
      },
    };
  });
}

function getPreviewScale(item: LibraryItem): number {
  if (item.id === "footer-beige") return 0.58;
  if (item.id === "header-image") return 0.74;
  if (item.id === "section-image") return 0.78;
  if (item.id === "image-logo-centre") return 0.82;
  if (item.id === "mosaic-images") return 0.48;
  if (item.id === "content-highlight") return 0.7;
  if (item.id === "promo-blue-code-cta") return 0.72;
  if (item.id === "cta-pill-354") return 0.82;
  if (item.id === "reassurance-links") return 0.76;
  if (item.id === "texte-beige-cta") return 0.62;
  if (item.id === "image-gauche") return 0.6;
  if (item.blockType === "hero") return 0.7;
  if (item.blockType === "three_columns") return 0.68;
  return 0.7;
}

function LibraryDraggableButton(input: {
  item: LibraryItem;
  disabled?: boolean;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const { item, disabled = false, className, onClick, children } = input;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-item:${item.id}`,
    disabled,
    data: {
      source: "library",
      blockType: item.blockType,
      templateKey: item.templateKey,
      layoutSpec: item.layoutSpec,
      name: item.name,
      itemId: item.id,
    },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={className}
      title={`Add ${item.name}`}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      disabled={disabled}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.72 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </button>
  );
}

function LibraryDraggableCard(input: {
  item: LibraryItem;
  disabled?: boolean;
  onAddBlock: (input: AddBlockPayload) => void;
}) {
  const { item, disabled = false, onAddBlock } = input;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-item:${item.id}`,
    disabled,
    data: {
      source: "library",
      blockType: item.blockType,
      templateKey: item.templateKey,
      layoutSpec: item.layoutSpec,
      name: item.name,
      itemId: item.id,
    },
  });
  const templateDef = getTemplateDef(item.templateKey);
  const previewScale = getPreviewScale(item);
  return (
    <div
      ref={setNodeRef}
      className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/45 p-2.5"
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: disabled ? 0.62 : isDragging ? 0.72 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--color-text)]">{item.name}</p>
          <p className="text-xs text-[var(--color-muted)]">{item.description}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost h-8 px-2 text-xs"
            onClick={() =>
              onAddBlock({
                blockType: item.blockType,
                templateKey: item.templateKey,
                layoutSpec: item.layoutSpec,
              })
            }
            disabled={disabled}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {disabled ? "Added" : "Add"}
          </button>
          <button
            type="button"
            className="btn-ghost h-8 w-8 cursor-grab bg-[color:var(--color-surface)]/75 p-0 text-slate-600 active:cursor-grabbing hover:text-slate-900"
            onClick={(event) => event.stopPropagation()}
            aria-label={`Drag ${item.name} into canvas`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <span aria-hidden className="text-[11px] font-semibold leading-none tracking-[-0.5px]">
              |||
            </span>
          </button>
        </div>
      </div>
      <div className="mt-2 h-[120px] overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-white">
        <div className="h-full w-full overflow-hidden">
          <div
            className="origin-top-left"
            style={{
              transform: `scale(${previewScale})`,
              width: `${100 / previewScale}%`,
            }}
          >
            <BlockTemplateRenderer
              templateKey={templateDef?.key || item.templateKey}
              blockType={item.blockType}
              blockData={item.previewData}
              brandTheme={LIBRARY_PREVIEW_THEME}
              layoutSpec={item.layoutSpec || templateDef?.defaultLayoutSpec}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BlockLibraryPanel({
  clientSlug,
  hasHeaderBlock = false,
  collapsed = false,
  showCollapseToggle = true,
  onToggleCollapsed,
  onAddBlock,
}: BlockLibraryPanelProps) {
  const coreItems = createCoreItems(clientSlug);

  if (collapsed) {
    return (
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2">
        <div className="flex items-center justify-between gap-2 px-1 py-1.5">
          <LibraryBig className="h-4 w-4 text-[color:var(--color-text)]/70" />
          {showCollapseToggle ? (
            <button
              type="button"
              className="btn-ghost h-7 w-7 p-0"
              onClick={onToggleCollapsed}
              aria-label="Expand block library"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="mt-2 max-h-[calc(100vh-320px)] space-y-2 overflow-y-auto pr-0.5">
          {coreItems.map((item) => (
            <LibraryDraggableButton
              key={item.id}
              item={item}
              disabled={Boolean(item.singleInstance && hasHeaderBlock)}
              className="flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 text-xs font-semibold text-[color:var(--color-text)] transition hover:bg-[color:var(--color-surface-2)]"
              onClick={() =>
                onAddBlock({
                  blockType: item.blockType,
                  templateKey: item.templateKey,
                  layoutSpec: item.layoutSpec,
                })
              }
            >
              {item.singleInstance && hasHeaderBlock ? "OK" : item.shortLabel}
            </LibraryDraggableButton>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Block Library</p>
          <p className="mt-1 text-sm text-[color:var(--color-text)]/80">
            Add reusable blocks into the canvas.
          </p>
        </div>
        {showCollapseToggle ? (
          <button
            type="button"
            className="btn-ghost h-8 px-2 text-xs"
            onClick={onToggleCollapsed}
            aria-label="Collapse block library"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Core</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {coreItems.length}
          </span>
        </div>
        <div className="max-h-[calc(100vh-360px)] space-y-2.5 overflow-y-auto pr-1">
          {coreItems.map((item) => (
            <LibraryDraggableCard
              key={item.id}
              item={item}
              disabled={Boolean(item.singleInstance && hasHeaderBlock)}
              onAddBlock={onAddBlock}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
