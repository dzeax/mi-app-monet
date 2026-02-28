"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { CanvasBlockFrame } from "@/components/crm/emailCopy/builder/CanvasBlockFrame";
import { BlockTemplateRenderer } from "@/components/crm/emailCopy/templates/BlockTemplateRenderer";
import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import type { BrandTheme } from "@/components/crm/emailCopy/templates/types";
import {
  getDefaultTemplateForType,
  getTemplateDef,
} from "@/lib/crm/emailCopy/templates/templateRegistry";
import {
  EMAIL_COPY_BLOCK_CONTENT_LIMITS,
  EMAIL_COPY_BLOCK_SOFT_CONTENT_LIMITS,
  EMAIL_COPY_CHAR_LIMITS,
  type EmailCopyBrief,
} from "@/lib/crm/emailCopyConfig";

export const EMAIL_CANVAS_DROP_ZONE_ID = "email-copy-canvas-drop-zone";
const EMAIL_PREVIEW_FONT_FAMILY = "Tahoma, Arial, sans-serif";

type EmailCanvasProps = {
  clientSlug: string;
  blocks: EmailCopyBrief["blocks"];
  selectedBlockId: string | null;
  brandTheme: BrandTheme;
  insertionIndex?: number | null;
  inlineEditMode?: boolean;
  onSelectBlock: (blockId: string) => void;
  onInlineCommit?: (input: {
    blockId: string;
    field: "sourceTitle" | "sourceContent";
    value: string;
  }) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onRequestAddBlock?: () => void;
};

type IndexedBlock = {
  index: number;
  block: EmailCopyBrief["blocks"][number];
};

const TYPE_LABELS: Record<EmailCopyBrief["blocks"][number]["blockType"], string> = {
  hero: "Hero content",
  two_columns: "2 columns content block",
  three_columns: "3 columns content block",
  image_text_side_by_side: "Image + text side-by-side block",
};

function clean(value: string): string {
  return value.replace(/\u2800+/g, " ").replace(/\s+/g, " ").trim();
}

function countChars(value: string | null | undefined): number {
  return value ? [...value].length : 0;
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHeaderTemplateKey(templateKey: string | null | undefined, clientSlug: string): boolean {
  return getTemplateDef(templateKey, clientSlug)?.templateName === "header.image";
}

function isSectionImageTemplateKey(templateKey: string | null | undefined, clientSlug: string): boolean {
  return getTemplateDef(templateKey, clientSlug)?.templateName === "section.image";
}

function isFooterTemplateKey(templateKey: string | null | undefined, clientSlug: string): boolean {
  return getTemplateDef(templateKey, clientSlug)?.templateName === "footer.beige";
}

function hasSourceInput(
  block: EmailCopyBrief["blocks"][number],
  clientSlug: string
): boolean {
  if (
    isHeaderTemplateKey(block.templateKey, clientSlug) ||
    isSectionImageTemplateKey(block.templateKey, clientSlug)
  ) {
    const templateDef = getTemplateDef(block.templateKey, clientSlug);
    const layoutSpec =
      block.layoutSpec && typeof block.layoutSpec === "object"
        ? (block.layoutSpec as Record<string, unknown>)
        : {};
    const layoutImage =
      layoutSpec.image && typeof layoutSpec.image === "object"
        ? (layoutSpec.image as Record<string, unknown>)
        : {};
    const defaultLayout =
      templateDef?.defaultLayoutSpec && typeof templateDef.defaultLayoutSpec === "object"
        ? (templateDef.defaultLayoutSpec as Record<string, unknown>)
        : {};
    const defaultImage =
      defaultLayout.image && typeof defaultLayout.image === "object"
        ? (defaultLayout.image as Record<string, unknown>)
        : {};
    const src =
      stringFromUnknown(layoutImage.src) ||
      stringFromUnknown(defaultImage.src) ||
      stringFromUnknown(block.sourceContent);
    return clean(src).length > 0;
  }
  if (isFooterTemplateKey(block.templateKey, clientSlug)) {
    const layoutSpec =
      block.layoutSpec && typeof block.layoutSpec === "object"
        ? (block.layoutSpec as Record<string, unknown>)
        : {};
    const companyLines = Array.isArray(layoutSpec.companyLines)
      ? layoutSpec.companyLines.filter((entry) => typeof entry === "string" && clean(entry).length > 0)
      : [];
    if (companyLines.length > 0) return true;
    const templateDef = getTemplateDef(block.templateKey, clientSlug);
    const defaultLayout =
      templateDef?.defaultLayoutSpec && typeof templateDef.defaultLayoutSpec === "object"
        ? (templateDef.defaultLayoutSpec as Record<string, unknown>)
        : {};
    const defaultLines = Array.isArray(defaultLayout.companyLines)
      ? defaultLayout.companyLines.filter((entry) => typeof entry === "string" && clean(entry).length > 0)
      : [];
    return defaultLines.length > 0;
  }
  return clean(block.sourceTitle || "").length > 0 || clean(block.sourceContent || "").length > 0;
}

function InsertionIndicator() {
  return (
    <div className="px-0.5 py-0.5" aria-hidden>
      <div className="h-1 rounded-full bg-[color:var(--color-primary)]/75" />
    </div>
  );
}

type CanvasBlockNodeProps = {
  clientSlug: string;
  block: EmailCopyBrief["blocks"][number];
  blockIndex: number;
  displayOrder: number;
  sortableIndex: number;
  sortableTotal: number;
  totalBlocks: number;
  selectedBlockId: string | null;
  brandTheme: BrandTheme;
  inlineEditMode: boolean;
  onInlineCommit?: (input: {
    blockId: string;
    field: "sourceTitle" | "sourceContent";
    value: string;
  }) => void;
  onSelectBlock: (blockId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  showDivider?: boolean;
};

function CanvasBlockNode({
  clientSlug,
  block,
  blockIndex,
  displayOrder,
  sortableIndex,
  sortableTotal,
  totalBlocks,
  selectedBlockId,
  brandTheme,
  inlineEditMode,
  onInlineCommit,
  onSelectBlock,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  showDivider = false,
}: CanvasBlockNodeProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: {
      source: "canvas",
      blockId: block.id,
    },
  });

  const isSelected = selectedBlockId === block.id;
  const sourceTitleChars = countChars(block.sourceTitle);
  const sourceContentChars = countChars(block.sourceContent);
  const softContentLimit = EMAIL_COPY_BLOCK_SOFT_CONTENT_LIMITS[block.blockType];
  const hardContentLimit = EMAIL_COPY_BLOCK_CONTENT_LIMITS[block.blockType];
  const overSoft = sourceContentChars > softContentLimit;
  const hardRisk = sourceContentChars > hardContentLimit * 2;
  const ready = hasSourceInput(block, clientSlug) && !overSoft;
  const templateKey =
    getTemplateDef(block.templateKey, clientSlug)?.key ||
    getDefaultTemplateForType(block.blockType, clientSlug);
  const templateDef = getTemplateDef(templateKey, clientSlug);
  const surfaceMode = templateDef?.surfaceMode ?? "default";
  const isInlineEditable = Boolean(inlineEditMode && isSelected && onInlineCommit);
  const renderTemplate = (
    <BlockTemplateRenderer
      templateKey={templateKey}
      blockType={block.blockType}
      blockData={{
        title: block.sourceTitle,
        content: block.sourceContent,
        ctaLabel: block.ctaLabel,
      }}
      brandTheme={brandTheme}
      layoutSpec={block.layoutSpec}
      inlineEditing={
        isInlineEditable
          ? {
              enabled: true,
              titleValue: block.sourceTitle || "",
              contentValue: block.sourceContent || "",
              onTitleCommit: (value) =>
                onInlineCommit?.({
                  blockId: block.id,
                  field: "sourceTitle",
                  value,
                }),
              onContentCommit: (value) =>
                onInlineCommit?.({
                  blockId: block.id,
                  field: "sourceContent",
                  value,
                }),
            }
          : undefined
      }
    />
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <CanvasBlockFrame
        blockId={block.id}
        blockLabel={TYPE_LABELS[block.blockType]}
        displayOrder={displayOrder}
        ready={ready}
        overSoft={overSoft}
        hardRisk={hardRisk}
        metaText={`${block.id} · title ${sourceTitleChars}/${EMAIL_COPY_CHAR_LIMITS.title} · content ${sourceContentChars}/${softContentLimit} soft`}
        isSelected={isSelected}
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
        draggable
        canMoveUp={sortableIndex > 0}
        canMoveDown={sortableIndex < sortableTotal - 1}
        canDuplicate
        canDelete={totalBlocks > 1}
        onSelectBlock={onSelectBlock}
        onMoveUp={() => onMoveUp(blockIndex)}
        onMoveDown={() => onMoveDown(blockIndex)}
        onDuplicate={() => onDuplicate(blockIndex)}
        onDelete={() => onDelete(blockIndex)}
        showDivider={showDivider}
      >
        {surfaceMode === "transparent" ? (
          renderTemplate
        ) : (
          <EmailSectionSurface style={{ fontFamily: brandTheme.fontFamily }}>
            {renderTemplate}
          </EmailSectionSurface>
        )}
      </CanvasBlockFrame>
    </div>
  );
}

export function EmailCanvas({
  clientSlug,
  blocks,
  selectedBlockId,
  brandTheme,
  insertionIndex = null,
  inlineEditMode = false,
  onSelectBlock,
  onInlineCommit,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onRequestAddBlock,
}: EmailCanvasProps) {
  const indexedBlocks = useMemo<IndexedBlock[]>(
    () => blocks.map((block, index) => ({ block, index })),
    [blocks]
  );

  const fixedHeaderBlock = useMemo<IndexedBlock | null>(
    () =>
      indexedBlocks.find((entry) => isHeaderTemplateKey(entry.block.templateKey, clientSlug)) ||
      null,
    [clientSlug, indexedBlocks]
  );

  const draggableBlocks = useMemo<IndexedBlock[]>(
    () =>
      indexedBlocks.filter(
        (entry) => !(fixedHeaderBlock && entry.block.id === fixedHeaderBlock.block.id)
      ),
    [fixedHeaderBlock, indexedBlocks]
  );

  const sortableIds = useMemo(
    () => draggableBlocks.map((entry) => entry.block.id),
    [draggableBlocks]
  );

  const previewTheme = useMemo<BrandTheme>(
    () => ({
      ...brandTheme,
      fontFamily: EMAIL_PREVIEW_FONT_FAMILY,
    }),
    [brandTheme]
  );

  const insertionOffset = fixedHeaderBlock ? 1 : 0;
  const draggableInsertionIndex =
    insertionIndex === null
      ? null
      : Math.max(
          0,
          Math.min(draggableBlocks.length, Number(insertionIndex || 0) - insertionOffset)
        );

  const { setNodeRef, isOver } = useDroppable({
    id: EMAIL_CANVAS_DROP_ZONE_ID,
    data: { source: "canvas-drop-zone" },
  });

  const renderEmptyState = !fixedHeaderBlock && draggableBlocks.length === 0;
  const renderHeaderOnlyState = Boolean(fixedHeaderBlock && draggableBlocks.length === 0);

  const headerTitleChars = countChars(fixedHeaderBlock?.block.sourceTitle);
  const headerContentChars = countChars(fixedHeaderBlock?.block.sourceContent);
  const headerSoftLimit = EMAIL_COPY_BLOCK_SOFT_CONTENT_LIMITS.hero;
  const headerReady = fixedHeaderBlock
    ? hasSourceInput(fixedHeaderBlock.block, clientSlug)
    : false;
  const headerTemplateKey = fixedHeaderBlock
    ? getTemplateDef(fixedHeaderBlock.block.templateKey, clientSlug)?.key ||
      getDefaultTemplateForType(fixedHeaderBlock.block.blockType, clientSlug)
    : null;

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)]/90 bg-[color:var(--color-surface-2)]/55 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Canvas</p>
          <p className="mt-1 text-sm text-[color:var(--color-text)]/80">Composed email preview in campaign order.</p>
        </div>
      </div>

      <div className="mt-3 min-h-[560px] rounded-xl border border-dashed border-[color:var(--color-border)]/80 bg-[color:var(--color-surface-2)]/35 p-2.5 sm:p-4">
        <div
          className="mx-auto w-full max-w-[800px] rounded-lg border border-[color:var(--color-border)] bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]"
          style={{ fontFamily: EMAIL_PREVIEW_FONT_FAMILY }}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--color-border)]/75 px-3 py-3 sm:px-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Email document preview
            </p>
            <span className="rounded-full border border-[color:var(--color-border)] bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
              {blocks.length} block(s)
            </span>
          </div>

          <div
            ref={setNodeRef}
            className={[
              "px-3 py-4 transition sm:px-4 sm:py-5",
              isOver ? "ring-2 ring-[color:var(--color-primary)]/35 ring-inset" : "",
            ].join(" ")}
          >
            {fixedHeaderBlock && headerTemplateKey ? (
              <div className="mb-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                  Fixed header
                </p>
                <section
                  className={[
                    "overflow-hidden rounded-lg border transition-all duration-150",
                    selectedBlockId === fixedHeaderBlock.block.id
                      ? "border-[color:var(--color-primary)] ring-1 ring-[color:var(--color-primary)]/40"
                      : "border-[color:var(--color-border)]/75 hover:border-[color:var(--color-primary)]/45",
                  ].join(" ")}
                  role="button"
                  tabIndex={0}
                  title={`${fixedHeaderBlock.block.id} · fixed header image · title ${headerTitleChars}/${EMAIL_COPY_CHAR_LIMITS.title} · content ${headerContentChars}/${headerSoftLimit} soft`}
                  onClick={() => onSelectBlock(fixedHeaderBlock.block.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectBlock(fixedHeaderBlock.block.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between border-b border-[color:var(--color-border)]/70 px-3 py-1.5">
                    <p className="truncate text-[11px] font-semibold text-[color:var(--color-text)]">
                      Block 1 · Header image block
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                          headerReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {headerReady ? "Ready" : "Empty"}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost h-6 px-2 text-[10px]"
                        disabled={blocks.length <= 1}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDelete(fixedHeaderBlock.index);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <EmailSectionSurface className="py-1 sm:py-1.5" style={{ fontFamily: previewTheme.fontFamily }}>
                    <BlockTemplateRenderer
                      templateKey={headerTemplateKey}
                      blockType={fixedHeaderBlock.block.blockType}
                      blockData={{
                        title: fixedHeaderBlock.block.sourceTitle,
                        content: fixedHeaderBlock.block.sourceContent,
                        ctaLabel: fixedHeaderBlock.block.ctaLabel,
                      }}
                      brandTheme={previewTheme}
                      layoutSpec={fixedHeaderBlock.block.layoutSpec}
                    />
                  </EmailSectionSurface>
                </section>
              </div>
            ) : null}

            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {renderEmptyState ? (
                <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-[color:var(--color-border)] bg-slate-50 px-4 py-7 text-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">No blocks yet. Add blocks from the library.</p>
                    <button
                      type="button"
                      className="btn-primary mt-3 h-8 px-3 text-xs"
                      onClick={onRequestAddBlock}
                    >
                      Add a block from the library
                    </button>
                  </div>
                </div>
              ) : renderHeaderOnlyState ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-[color:var(--color-border)] bg-slate-50 px-4 py-7 text-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Header is configured. Add content blocks from the library.
                    </p>
                    <button
                      type="button"
                      className="btn-primary mt-3 h-8 px-3 text-xs"
                      onClick={onRequestAddBlock}
                    >
                      Add content block
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 sm:space-y-8 lg:space-y-8">
                  {draggableBlocks.map((entry, sortableIndex) => (
                    <div key={entry.block.id}>
                      {draggableInsertionIndex === sortableIndex ? <InsertionIndicator /> : null}
                      <CanvasBlockNode
                        clientSlug={clientSlug}
                        block={entry.block}
                        blockIndex={entry.index}
                        displayOrder={sortableIndex + 1 + insertionOffset}
                        sortableIndex={sortableIndex}
                        sortableTotal={draggableBlocks.length}
                        totalBlocks={blocks.length}
                        selectedBlockId={selectedBlockId}
                        brandTheme={previewTheme}
                        inlineEditMode={inlineEditMode}
                        onInlineCommit={onInlineCommit}
                        onSelectBlock={onSelectBlock}
                        onMoveUp={onMoveUp}
                        onMoveDown={onMoveDown}
                        onDuplicate={onDuplicate}
                        onDelete={onDelete}
                        showDivider={sortableIndex > 0}
                      />
                    </div>
                  ))}
                </div>
              )}
              {draggableInsertionIndex === draggableBlocks.length ? <InsertionIndicator /> : null}
            </SortableContext>
          </div>
        </div>
      </div>
    </section>
  );
}
