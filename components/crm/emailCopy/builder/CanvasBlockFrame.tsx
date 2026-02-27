"use client";

import type { ReactNode } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import {
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Trash2,
} from "lucide-react";

type CanvasBlockFrameProps = {
  blockId: string;
  blockLabel: string;
  index: number;
  totalBlocks: number;
  ready: boolean;
  overSoft: boolean;
  hardRisk: boolean;
  metaText?: string;
  isSelected: boolean;
  isDragging: boolean;
  transform?: string;
  transition?: string;
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableSyntheticListeners;
  onSelectBlock: (blockId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  showDivider?: boolean;
  children: ReactNode;
};

export function CanvasBlockFrame({
  blockId,
  blockLabel,
  index,
  totalBlocks,
  ready,
  overSoft,
  hardRisk,
  metaText,
  isSelected,
  isDragging,
  transform,
  transition,
  dragAttributes,
  dragListeners,
  onSelectBlock,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  showDivider = false,
  children,
}: CanvasBlockFrameProps) {
  const closeMenu = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    const details = target.closest("details");
    if (details instanceof HTMLDetailsElement) {
      details.open = false;
    }
  };

  return (
    <div className={showDivider ? "pt-1" : ""}>
      {showDivider ? <div className="mb-5 h-px bg-[color:var(--color-border)]/65" aria-hidden /> : null}
      <article
        data-canvas-block-id={blockId}
        className={[
          "group rounded-lg border p-1.5 transition",
          isSelected
            ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/6 ring-1 ring-[color:var(--color-primary)]/30"
            : "border-transparent bg-transparent hover:border-[color:var(--color-border)]/70",
        ].join(" ")}
        style={{
          transform,
          transition,
          opacity: isDragging ? 0.68 : 1,
        }}
        role="button"
        tabIndex={0}
        onClick={() => onSelectBlock(blockId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectBlock(blockId);
          }
        }}
      >
        <div
          className={[
            "overflow-hidden transition-all duration-150",
            isSelected
              ? "mb-2 max-h-12 opacity-100 pointer-events-auto"
              : "mb-0 max-h-0 opacity-0 pointer-events-none group-hover:mb-2 group-hover:max-h-12 group-hover:opacity-100 group-hover:pointer-events-auto",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              className="btn-ghost h-7 w-7 cursor-grab bg-[color:var(--color-surface)]/78 p-0 text-slate-600 active:cursor-grabbing hover:text-slate-900"
              onClick={(event) => event.stopPropagation()}
              aria-label={`Drag ${blockId}`}
              {...dragAttributes}
              {...dragListeners}
            >
              <span aria-hidden className="text-[10px] font-semibold leading-none tracking-[-0.5px]">
                |||
              </span>
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
              className="btn-ghost flex h-7 w-7 cursor-pointer list-none items-center justify-center bg-[color:var(--color-surface)]/78 p-0 text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden"
              aria-label={`Actions for ${blockId}`}
            >
              <span aria-hidden className="text-sm font-semibold leading-none">
                ...
              </span>
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
        </div>

        {metaText ? (
          <p
            className={[
              "hidden truncate text-[11px] text-[var(--color-muted)] sm:block transition-all duration-150",
              isSelected
                ? "mb-0 max-h-6 opacity-100"
                : "mb-0 max-h-0 opacity-0 group-hover:max-h-6 group-hover:opacity-100",
            ].join(" ")}
          >
            {metaText}
          </p>
        ) : null}

        <div>{children}</div>
      </article>
    </div>
  );
}
