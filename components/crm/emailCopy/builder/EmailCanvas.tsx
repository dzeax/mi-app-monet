"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, CopyPlus, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";

import { BlockTemplateRenderer } from "@/components/crm/emailCopy/templates/BlockTemplateRenderer";
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
    <div className="px-1 py-0.5" aria-hidden>
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

type CanvasBlockHeaderProps = {
  blockId: string;
  blockLabel: string;
  index: number;
  totalBlocks: number;
  overSoft: boolean;
  hardRisk: boolean;
  ready: boolean;
  dragAttributes: ReturnType<typeof useSortable>["attributes"];
  dragListeners: ReturnType<typeof useSortable>["listeners"];
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
};

function CanvasBlockHeader(input: CanvasBlockHeaderProps) {
  const {
    blockId,
    blockLabel,
    index,
    totalBlocks,
    overSoft,
    hardRisk,
    ready,
    dragAttributes,
    dragListeners,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onDelete,
  } = input;

  const closeMenu = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    const details = target.closest("details");
    if (details instanceof HTMLDetailsElement) {
      details.open = false;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          type="button"
          className="btn-ghost h-7 w-7 cursor-grab p-0 active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Drag ${blockId}`}
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <p className="truncate text-sm font-semibold text-[color:var(--color-text)]">
          Block {index + 1} · {blockLabel}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {hardRisk ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            Hard risk
          </span>
        ) : null}
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            overSoft
              ? "bg-red-100 text-red-700"
              : ready
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600",
          ].join(" ")}
        >
          {overSoft ? "Over soft limit" : ready ? "Ready" : "Empty"}
        </span>
      </div>

      <details className="relative" onClick={(event) => event.stopPropagation()}>
        <summary
          className="btn-ghost flex h-7 w-7 cursor-pointer list-none items-center justify-center p-0 [&::-webkit-details-marker]:hidden"
          aria-label={`Actions for ${blockId}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </summary>
        <div
          role="menu"
          aria-label={`Block ${index + 1} actions`}
          className="absolute right-0 z-20 mt-1 min-w-[170px] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="btn-ghost flex h-8 w-full items-center justify-start gap-2 px-2 text-xs"
            disabled={index === 0}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMoveUp(index);
              closeMenu(event.target);
            }}
            aria-label={`Move ${blockId} up`}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            Move up
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn-ghost flex h-8 w-full items-center justify-start gap-2 px-2 text-xs"
            disabled={index === totalBlocks - 1}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMoveDown(index);
              closeMenu(event.target);
            }}
            aria-label={`Move ${blockId} down`}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Move down
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn-ghost flex h-8 w-full items-center justify-start gap-2 px-2 text-xs"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDuplicate(index);
              closeMenu(event.target);
            }}
            aria-label={`Duplicate ${blockId}`}
          >
            <CopyPlus className="h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn-ghost flex h-8 w-full items-center justify-start gap-2 px-2 text-xs"
            disabled={totalBlocks <= 1}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(index);
              closeMenu(event.target);
            }}
            aria-label={`Delete ${blockId}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </details>
    </div>
  );
}

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
    <article
      ref={setNodeRef}
      data-canvas-block-id={block.id}
      className={[
        "rounded-xl border bg-[color:var(--color-surface)] p-2.5 shadow-sm transition",
        isSelected
          ? "border-[color:var(--color-primary)] ring-2 ring-[color:var(--color-primary)]/20"
          : "border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]/35",
      ].join(" ")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.68 : 1,
      }}
      role="button"
      tabIndex={0}
      onClick={() => onSelectBlock(block.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectBlock(block.id);
        }
      }}
    >
      <CanvasBlockHeader
        blockId={block.id}
        blockLabel={TYPE_LABELS[block.blockType]}
        index={index}
        totalBlocks={totalBlocks}
        overSoft={overSoft}
        hardRisk={hardRisk}
        ready={ready}
        dragAttributes={attributes}
        dragListeners={listeners}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
      <p className="mt-1 hidden truncate text-[11px] text-[var(--color-muted)] sm:block">
        {block.id} · title {sourceTitleChars}/{EMAIL_COPY_CHAR_LIMITS.title} · content {sourceContentChars}/{softContentLimit} soft
      </p>

      <div className="mt-2 overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/25 p-2 sm:p-2.5">
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
      </div>
    </article>
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
    <section className="rounded-2xl border border-[color:var(--color-border)]/90 bg-[color:var(--color-surface-2)]/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] sm:p-5">
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--color-border)]/75 pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Canvas</p>
          <p className="mt-1 text-sm text-[color:var(--color-text)]/80">Composed email preview in campaign order.</p>
        </div>
        <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] shadow-sm">
          {blocks.length} block(s)
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/85 p-3 shadow-sm sm:p-4">
        <div
          ref={setNodeRef}
          className={[
            "w-full space-y-4 rounded-xl p-2 transition sm:space-y-5 sm:p-3",
            isOver ? "ring-2 ring-[color:var(--color-primary)]/35" : "",
          ].join(" ")}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {blocks.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/45 px-4 py-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">Your canvas is empty</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Add content blocks to compose this campaign in order.
                  </p>
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
              <>
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
              </>
            )}
            {insertionIndex === blocks.length ? <InsertionIndicator /> : null}
          </SortableContext>
        </div>
      </div>
    </section>
  );
}

