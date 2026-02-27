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
  collapsed?: boolean;
  showCollapseToggle?: boolean;
  onToggleCollapsed?: () => void;
  onAddBlock: (blockType: BrevoBlockType) => void;
};

type LibraryItem = {
  id: string;
  blockType: BrevoBlockType;
  name: string;
  shortLabel: string;
  description: string;
  previewData: BlockPreviewData;
};

type FutureItem = {
  id: string;
  name: string;
  description: string;
};

const LIBRARY_PREVIEW_THEME: BrandTheme = {
  primaryColor: "#0ea5a8",
  secondaryColor: "#1f2937",
  backgroundColor: "#f8fafc",
  radius: "0.75rem",
  fontFamily: "inherit",
};

const FUTURE_ITEMS: FutureItem[] = [
  {
    id: "image-grid",
    name: "Image grid",
    description: "Upcoming block for visual-heavy campaigns.",
  },
  {
    id: "faq",
    name: "FAQ fold",
    description: "Upcoming block for answer-driven sections.",
  },
];

function createCoreItems(clientSlug: string): LibraryItem[] {
  const items: LibraryItem[] = [
    {
      id: "hero",
      blockType: "hero",
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
      id: "two-columns",
      blockType: "two_columns",
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
      id: "three-columns",
      blockType: "three_columns",
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
      name: "Image + text",
      shortLabel: "I+T",
      description: "Combine visual context with message.",
      previewData: {
        title: "Image et contenu alignes",
        content: "Associez l'image a un texte court oriente benefice.",
        ctaLabel: "Explorer",
      },
    },
  ];

  return items.map((item): LibraryItem => {
    const templateKey = getDefaultTemplateForType(item.blockType, clientSlug);
    const templateDef = getTemplateDef(templateKey, clientSlug);
    return {
      ...item,
      previewData: {
        ...item.previewData,
        templateKey: templateDef?.key || templateKey,
      },
    };
  });
}

function LibraryDraggableButton(input: {
  item: LibraryItem;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const { item, className, onClick, children } = input;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-item:${item.id}`,
    data: {
      source: "library",
      blockType: item.blockType,
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
      onClick={onClick}
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
  clientSlug: string;
  onAddBlock: (blockType: BrevoBlockType) => void;
}) {
  const { item, clientSlug, onAddBlock } = input;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-item:${item.id}`,
    data: {
      source: "library",
      blockType: item.blockType,
      name: item.name,
      itemId: item.id,
    },
  });
  const templateKey = getDefaultTemplateForType(item.blockType, clientSlug);
  const templateDef = getTemplateDef(templateKey, clientSlug);
  return (
    <div
      ref={setNodeRef}
      className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/45 p-2.5"
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.72 : 1,
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
            onClick={() => onAddBlock(item.blockType)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </button>
          <button
            type="button"
            className="btn-ghost h-8 w-8 cursor-grab bg-[color:var(--color-surface)]/75 p-0 text-slate-600 active:cursor-grabbing hover:text-slate-900"
            onClick={(event) => event.stopPropagation()}
            aria-label={`Drag ${item.name} into canvas`}
            {...attributes}
            {...listeners}
          >
            <span aria-hidden className="text-[11px] font-semibold leading-none tracking-[-0.5px]">
              |||
            </span>
          </button>
        </div>
      </div>
      <div className="mt-2 h-[94px] overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <div className="origin-top-left scale-[0.55] pr-[72%]">
          <BlockTemplateRenderer
            templateKey={templateDef?.key || templateKey}
            blockType={item.blockType}
            blockData={item.previewData}
            brandTheme={LIBRARY_PREVIEW_THEME}
            layoutSpec={templateDef?.defaultLayoutSpec}
          />
        </div>
      </div>
    </div>
  );
}

export function BlockLibraryPanel({
  clientSlug,
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
        <div className="mt-2 space-y-2">
          {coreItems.map((item) => (
            <LibraryDraggableButton
              key={item.id}
              item={item}
              className="flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 text-xs font-semibold text-[color:var(--color-text)] transition hover:bg-[color:var(--color-surface-2)]"
              onClick={() => onAddBlock(item.blockType)}
            >
              {item.shortLabel}
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
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Core</p>
        {coreItems.map((item) => (
          <LibraryDraggableCard key={item.id} item={item} clientSlug={clientSlug} onAddBlock={onAddBlock} />
        ))}
      </div>

      <div className="mt-3 space-y-2.5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Coming next</p>
        {FUTURE_ITEMS.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface)]/50 px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[color:var(--color-text)]">{item.name}</p>
                <p className="text-xs text-[var(--color-muted)]">{item.description}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                Soon
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
