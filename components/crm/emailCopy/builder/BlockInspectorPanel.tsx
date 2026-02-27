"use client";

import { Copy, CopyPlus, Trash2 } from "lucide-react";

import {
  getDefaultTemplateForType,
  getTemplateDef,
  getTemplatesForType,
} from "@/lib/crm/emailCopy/templates/templateRegistry";
import {
  EMAIL_COPY_BLOCK_CONTENT_LIMITS,
  EMAIL_COPY_BLOCK_SOFT_CONTENT_LIMITS,
  EMAIL_COPY_CHAR_LIMITS,
  type BrevoBlockType,
  type EmailCopyBrief,
} from "@/lib/crm/emailCopyConfig";

type BlockInspectorPanelProps = {
  clientSlug: string;
  selectedBlock: EmailCopyBrief["blocks"][number] | null;
  selectedBlockIndex: number;
  totalBlocks: number;
  onUpdateBlockField: <K extends keyof EmailCopyBrief["blocks"][number]>(
    blockIndex: number,
    key: K,
    value: EmailCopyBrief["blocks"][number][K]
  ) => void;
  onDuplicateBlock: (blockIndex: number) => void;
  onRemoveBlock: (blockIndex: number) => void;
  onCopyBlockId: (blockId: string) => void;
};

const BLOCK_TYPE_OPTIONS: Array<{ value: BrevoBlockType; label: string }> = [
  { value: "hero", label: "Hero content" },
  { value: "three_columns", label: "3 columns content block" },
  { value: "two_columns", label: "2 columns content block" },
  { value: "image_text_side_by_side", label: "Image + text side-by-side block" },
];

const LAYOUT_SELECT_OPTIONS: Record<string, string[]> = {
  align: ["left", "center", "right"],
  emphasis: ["balanced", "soft", "strong"],
  imagePosition: ["left", "right"],
  imageRatio: ["1:1", "4:3", "16:9"],
  style: ["text-only", "mixed"],
};

function countChars(value: string | null | undefined): number {
  return value ? [...value].length : 0;
}

function clean(value: string | null | undefined): string {
  return (value || "").replace(/\u2800+/g, " ").replace(/\s+/g, " ").trim();
}

function hasSourceInput(block: EmailCopyBrief["blocks"][number]): boolean {
  return clean(block.sourceTitle).length > 0 || clean(block.sourceContent).length > 0;
}

export function BlockInspectorPanel({
  clientSlug,
  selectedBlock,
  selectedBlockIndex,
  totalBlocks,
  onUpdateBlockField,
  onDuplicateBlock,
  onRemoveBlock,
  onCopyBlockId,
}: BlockInspectorPanelProps) {
  if (!selectedBlock || selectedBlockIndex < 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Inspector</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Select a block in the canvas to edit type, template, and source mapping fields.
        </p>
      </div>
    );
  }

  const templateOptions = getTemplatesForType(selectedBlock.blockType, clientSlug);
  const selectedTemplateKey =
    getTemplateDef(selectedBlock.templateKey, clientSlug)?.key ||
    getDefaultTemplateForType(selectedBlock.blockType, clientSlug);
  const templateDef = getTemplateDef(selectedTemplateKey, clientSlug);
  const layoutSpec =
    selectedBlock.layoutSpec && typeof selectedBlock.layoutSpec === "object"
      ? (selectedBlock.layoutSpec as Record<string, unknown>)
      : (templateDef?.defaultLayoutSpec as Record<string, unknown>) || {};
  const layoutKeys = Object.keys(layoutSpec || {});

  const titleChars = countChars(selectedBlock.sourceTitle);
  const titleHard = EMAIL_COPY_CHAR_LIMITS.title;
  const titleSoftExceeded = titleChars > titleHard;
  const titleHardRisk = titleChars > titleHard * 2;

  const contentChars = countChars(selectedBlock.sourceContent);
  const contentSoft = EMAIL_COPY_BLOCK_SOFT_CONTENT_LIMITS[selectedBlock.blockType];
  const contentHard = EMAIL_COPY_BLOCK_CONTENT_LIMITS[selectedBlock.blockType];
  const contentSoftExceeded = contentChars > contentSoft;
  const contentHardRisk = contentChars > contentHard * 2;

  const blockReady = hasSourceInput(selectedBlock) && !contentSoftExceeded;
  const blockHardRisk = titleHardRisk || contentHardRisk;

  const sectionLabelClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]";
  const fieldLabelClass = "text-[color:var(--color-text)]/72";

  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Inspector</p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--color-text)]">
            Block {selectedBlockIndex + 1}/{totalBlocks}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn-ghost h-8 px-2 text-xs"
            onClick={() => onDuplicateBlock(selectedBlockIndex)}
          >
            <CopyPlus className="mr-1 h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            className="btn-ghost h-8 px-2 text-xs"
            disabled={totalBlocks <= 1}
            onClick={() => onRemoveBlock(selectedBlockIndex)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              contentSoftExceeded
                ? "bg-red-100 text-red-700"
                : blockReady
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {contentSoftExceeded ? "Over soft limit" : blockReady ? "Ready" : "Empty"}
          </span>
          {blockHardRisk ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              Hard risk
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Title {titleChars}/{titleHard} · Content {contentChars}/{contentSoft} soft · {contentHard} hard
        </p>
      </div>

      <div className="mt-3 space-y-3">
        <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/35 p-3">
          <p className={sectionLabelClass}>Structure</p>
          <div className="mt-2.5 space-y-2.5">
            <div className="space-y-1 text-sm">
              <span className={fieldLabelClass}>Block ID</span>
              <div className="flex items-center gap-2">
                <input className="input w-full" value={selectedBlock.id} readOnly />
                <button
                  type="button"
                  className="btn-ghost h-9 px-2 text-xs"
                  onClick={() => onCopyBlockId(selectedBlock.id)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            </div>

            <label className="space-y-1 text-sm">
              <span className={fieldLabelClass}>Type</span>
              <select
                className="input w-full"
                value={selectedBlock.blockType}
                onChange={(event) =>
                  onUpdateBlockField(selectedBlockIndex, "blockType", event.target.value as BrevoBlockType)
                }
              >
                {BLOCK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className={fieldLabelClass}>Template</span>
              <select
                className="input w-full"
                value={selectedTemplateKey}
                onChange={(event) =>
                  onUpdateBlockField(
                    selectedBlockIndex,
                    "templateKey",
                    event.target.value || getDefaultTemplateForType(selectedBlock.blockType, clientSlug)
                  )
                }
              >
                {templateOptions.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/35 p-3">
          <p className={sectionLabelClass}>Layout</p>
          <div className="mt-2.5">
            {layoutKeys.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {layoutKeys.map((layoutKey) => {
                  const currentValue = layoutSpec[layoutKey];
                  const options = LAYOUT_SELECT_OPTIONS[layoutKey];
                  if (typeof currentValue === "boolean") {
                    return (
                      <label key={layoutKey} className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-2 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(currentValue)}
                          onChange={(event) =>
                            onUpdateBlockField(selectedBlockIndex, "layoutSpec", {
                              ...layoutSpec,
                              [layoutKey]: event.target.checked,
                            })
                          }
                        />
                        <span className="text-xs text-[color:var(--color-text)]">{layoutKey}</span>
                      </label>
                    );
                  }
                  if (typeof currentValue === "number") {
                    return (
                      <label key={layoutKey} className="space-y-1">
                        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]">{layoutKey}</span>
                        <input
                          type="number"
                          className="input w-full"
                          value={String(currentValue)}
                          onChange={(event) =>
                            onUpdateBlockField(selectedBlockIndex, "layoutSpec", {
                              ...layoutSpec,
                              [layoutKey]: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </label>
                    );
                  }
                  if (Array.isArray(options)) {
                    return (
                      <label key={layoutKey} className="space-y-1">
                        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]">{layoutKey}</span>
                        <select
                          className="input w-full"
                          value={String(currentValue || "")}
                          onChange={(event) =>
                            onUpdateBlockField(selectedBlockIndex, "layoutSpec", {
                              ...layoutSpec,
                              [layoutKey]: event.target.value,
                            })
                          }
                        >
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  return (
                    <label key={layoutKey} className="space-y-1">
                      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]">{layoutKey}</span>
                      <input
                        className="input w-full"
                        value={String(currentValue || "")}
                        onChange={(event) =>
                          onUpdateBlockField(selectedBlockIndex, "layoutSpec", {
                            ...layoutSpec,
                            [layoutKey]: event.target.value,
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">No layout options for this template.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/35 p-3">
          <p className={sectionLabelClass}>Content</p>
          <div className="mt-2.5 space-y-2.5">
            <label className="space-y-1 text-sm">
              <span className={fieldLabelClass}>
                Source title ({titleChars}/{titleHard})
              </span>
              <input
                className="input w-full"
                value={selectedBlock.sourceTitle || ""}
                onChange={(event) => onUpdateBlockField(selectedBlockIndex, "sourceTitle", event.target.value || null)}
                lang="fr"
              />
              <p className="text-[11px] text-[var(--color-muted)]">
                Used by the generator to craft final title (hard limit {titleHard}).
              </p>
              {titleSoftExceeded ? (
                <p className="text-xs text-amber-700">Title exceeds recommended limit ({titleHard}).</p>
              ) : null}
              {titleHardRisk ? (
                <p className="text-xs text-red-700">Hard risk: title is above 2x hard limit.</p>
              ) : null}
            </label>

            <label className="space-y-1 text-sm">
              <span className={fieldLabelClass}>
                Source content ({contentChars}/{contentSoft} soft · {contentHard} hard)
              </span>
              <textarea
                className="input min-h-[130px] w-full"
                value={selectedBlock.sourceContent || ""}
                onChange={(event) => onUpdateBlockField(selectedBlockIndex, "sourceContent", event.target.value || null)}
                lang="fr"
                spellCheck
              />
              <p className="text-[11px] text-[var(--color-muted)]">
                Soft limit guides readability in canvas; hard limit is enforced during generation.
              </p>
              {contentSoftExceeded ? (
                <p className="text-xs text-amber-700">Content exceeds soft limit and may be compressed in generation.</p>
              ) : null}
              {contentHardRisk ? (
                <p className="text-xs text-red-700">Hard risk: source content is above 2x hard limit.</p>
              ) : null}
            </label>

            <label className="space-y-1 text-sm">
              <span className={fieldLabelClass}>CTA label</span>
              <input
                className="input w-full"
                value={selectedBlock.ctaLabel || ""}
                onChange={(event) => onUpdateBlockField(selectedBlockIndex, "ctaLabel", event.target.value || null)}
                lang="fr"
              />
              <p className="text-[11px] text-[var(--color-muted)]">Keep CTA concise and action-oriented.</p>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
