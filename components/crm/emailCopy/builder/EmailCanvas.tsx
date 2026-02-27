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

function hasSourceInput(block: EmailCopyBrief["blocks"][number]): boolean {
  return clean(block.sourceTitle || "").length > 0 || clean(block.sourceContent || "").length > 0;
}

function InsertionIndicator() {
  return (
    <div className="px-0.5 py-0.5" aria-hidden>
      <div className="h-1 rounded-full bg-[color:var(--color-primary)]/75" />
    </div>
  );
}

type SortableCanvasBlockProps = {
  clientSlug: string;
  block: EmailCopyBrief["blocks"][number];
  index: number;
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
};

function SortableCanvasBlock({
  clientSlug,
  block,
  index,
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
}: SortableCanvasBlockProps) {
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
  const ready = hasSourceInput(block) && !overSoft;
  const templateKey = getTemplateDef(block.templateKey, clientSlug)?.key || getDefaultTemplateForType(block.blockType, clientSlug);
  const isInlineEditable = Boolean(inlineEditMode && isSelected && onInlineCommit);

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
        index={index}
        totalBlocks={totalBlocks}
        ready={ready}
        overSoft={overSoft}
        hardRisk={hardRisk}
        metaText={`${block.id} · title ${sourceTitleChars}/${EMAIL_COPY_CHAR_LIMITS.title} · content ${sourceContentChars}/${softContentLimit} soft`}
        isSelected={isSelected}
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
        onSelectBlock={onSelectBlock}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        showDivider={index > 0}
      >
        <EmailSectionSurface style={{ fontFamily: brandTheme.fontFamily }}>
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
        </EmailSectionSurface>
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
  const sortableIds = useMemo(() => blocks.map((block) => block.id), [blocks]);
  const { setNodeRef, isOver } = useDroppable({
    id: EMAIL_CANVAS_DROP_ZONE_ID,
    data: { source: "canvas-drop-zone" },
  });

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)]/90 bg-[color:var(--color-surface-2)]/55 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Canvas</p>
          <p className="mt-1 text-sm text-[color:var(--color-text)]/80">Composed email preview in campaign order.</p>
        </div>
      </div>

      <div className="mt-3 min-h-[560px] rounded-xl border border-dashed border-[color:var(--color-border)]/80 bg-[color:var(--color-surface-2)]/35 p-2.5 sm:p-4">
        <div className="mx-auto w-full max-w-[720px] rounded-lg border border-[color:var(--color-border)] bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between border-b border-[color:var(--color-border)]/75 px-4 py-3">
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
              "px-4 py-4 transition sm:px-5 sm:py-5",
              isOver ? "ring-2 ring-[color:var(--color-primary)]/35 ring-inset" : "",
            ].join(" ")}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {blocks.length === 0 ? (
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
              ) : (
                <div className="space-y-8 sm:space-y-9">
                  {blocks.map((block, index) => (
                    <div key={block.id}>
                      {insertionIndex === index ? <InsertionIndicator /> : null}
                      <SortableCanvasBlock
                        clientSlug={clientSlug}
                        block={block}
                        index={index}
                        totalBlocks={blocks.length}
                        selectedBlockId={selectedBlockId}
                        brandTheme={brandTheme}
                        inlineEditMode={inlineEditMode}
                        onInlineCommit={onInlineCommit}
                        onSelectBlock={onSelectBlock}
                        onMoveUp={onMoveUp}
                        onMoveDown={onMoveDown}
                        onDuplicate={onDuplicate}
                        onDelete={onDelete}
                      />
                    </div>
                  ))}
                </div>
              )}
              {insertionIndex === blocks.length ? <InsertionIndicator /> : null}
            </SortableContext>
          </div>
        </div>
      </div>
    </section>
  );
}
