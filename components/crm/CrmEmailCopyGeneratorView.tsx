"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  CheckCircle2,
  Copy,
  FileText,
  LayoutGrid,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Bot,
  ShieldCheck,
} from "lucide-react";

import { parseEmailCopyBrief } from "@/lib/crm/emailCopyBriefParser";
import { BlockLibraryPanel } from "@/components/crm/emailCopy/builder/BlockLibraryPanel";
import { EMAIL_CANVAS_DROP_ZONE_ID, EmailCanvas } from "@/components/crm/emailCopy/builder/EmailCanvas";
import { BlockInspectorPanel } from "@/components/crm/emailCopy/builder/BlockInspectorPanel";
import {
  getDefaultTemplateForType,
  getTemplateDef,
  isTemplateCompatibleWithType,
} from "@/lib/crm/emailCopy/templates/templateRegistry";
import { BlockTemplateRenderer } from "@/components/crm/emailCopy/templates/BlockTemplateRenderer";
import type { BrandTheme } from "@/components/crm/emailCopy/templates/types";
import {
  DEFAULT_EMAIL_COPY_VARIANT_COUNT,
  EMAIL_COPY_BLOCK_CONTENT_LIMITS,
  EMAIL_COPY_BLOCK_SOFT_CONTENT_LIMITS,
  EMAIL_COPY_CHAR_LIMITS,
  SAVEURS_DEFAULT_BRAND_PROFILE,
  type BrevoBlockType,
  type EmailCopyBrandProfile,
  type EmailCopyBrief,
  type EmailCopyExtractResult,
  type EmailCopyOptimizeResult,
  type EmailCopyQaResult,
  type EmailCopyVariant,
} from "@/lib/crm/emailCopyConfig";
import {
  runVisualQaForVariant,
  type VisualQaResult,
} from "@/lib/crm/emailCopy/qa/visualQa";
import { showError, showSuccess } from "@/utils/toast";

type CrmEmailCopyGeneratorViewProps = {
  clientSlug: string;
  clientLabel?: string;
};

type BriefSummary = {
  id: string;
  campaignName: string;
  status: string | null;
  sendDate: string | null;
};

type BriefRecord = {
  id: string;
  status: string | null;
  brief: EmailCopyBrief;
};

type DraftRecord = {
  id: string;
  briefId: string;
  variantIndex: number;
  draft: EmailCopyVariant;
  model: string;
  source: "openai" | "local-fallback";
};

type WorkspacePayload = {
  brandProfile: EmailCopyBrandProfile | null;
  briefs: BriefSummary[];
  selectedBrief: BriefRecord | null;
  drafts: DraftRecord[];
};

type AgentSource = "openai" | "local-fallback";

type ExtractApiPayload = EmailCopyExtractResult & {
  action: "extract";
  runGroupId: string;
  latencyMs: number;
};

type OptimizeApiPayload = EmailCopyOptimizeResult & {
  action: "optimize";
  runGroupId: string;
  latencyMs: number;
  selection?: {
    requestedBlockId: string | null;
    selectedBlockId: string | null;
    retained: boolean;
  };
  optimizeSummary?: {
    before?: { blockCount?: number; blockTypeCounts?: Record<string, number> };
    after?: { blockCount?: number; blockTypeCounts?: Record<string, number> };
    selection?: {
      requestedBlockId: string | null;
      selectedBlockId: string | null;
      retained: boolean;
    };
  };
};

type GenerateApiPayload = {
  action: "generate";
  runGroupId: string;
  latencyMs: number;
  variants: EmailCopyVariant[];
  model: string;
  source: AgentSource;
};

type QaApiPayload = {
  action: "qa";
  runGroupId: string;
  latencyMs: number;
  result: EmailCopyQaResult;
};

type BuilderDragState =
  | {
      source: "canvas";
      blockId: string;
      label: string;
    }
  | {
      source: "library";
      blockType: BrevoBlockType;
      label: string;
      itemId: string;
    };

type TrackStep = "parse" | "mapping";

type GenerationModel =
  | "gpt-5.2"
  | "gpt-4.1"
  | "gpt-5-mini"
  | "gpt-4-turbo"
  | "gpt-4o-mini";
type WizardStepId = "brief" | "blocks" | "generate";

const BLOCK_TYPE_OPTIONS: Array<{ value: BrevoBlockType; label: string }> = [
  { value: "hero", label: "Hero content" },
  { value: "three_columns", label: "3 columns content block" },
  { value: "two_columns", label: "2 columns content block" },
  { value: "image_text_side_by_side", label: "Image + text side-by-side block" },
];

const MODEL_OPTIONS: Array<{ value: GenerationModel; label: string }> = [
  { value: "gpt-5.2", label: "GPT-5.2 (quality)" },
  { value: "gpt-4.1", label: "GPT-4.1 (structured)" },
  { value: "gpt-4o-mini", label: "GPT-4o mini (recommended)" },
  { value: "gpt-5-mini", label: "GPT-5 mini (creative)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo (stable)" },
];

const VARIANT_OPTIONS = [1, 2, 3, 4, 5];
const FIELD_LABEL_CLASS = "text-[color:var(--color-text)]/72";
const FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-surface)]";
const CONTROL_BUTTON_CLASS = `h-9 px-3 text-xs sm:text-sm ${FOCUS_RING_CLASS}`;
const OUTPUT_META_CLASS = "text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text)]/72 sm:text-xs sm:tracking-[0.2em]";
const OUTPUT_CARD_CLASS = "rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/72 p-3 sm:p-3.5";
const DEFAULT_BLOCK_PREVIEW_THEME: BrandTheme = {
  primaryColor: "#0ea5a8",
  secondaryColor: "#1f2937",
  backgroundColor: "#f8fafc",
  radius: "0.75rem",
  fontFamily: "inherit",
};

function stringFromUnknown(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveBrandTheme(profile: EmailCopyBrandProfile): BrandTheme {
  const raw = profile as unknown as Record<string, unknown>;
  const nested = raw.brandTheme && typeof raw.brandTheme === "object"
    ? (raw.brandTheme as Record<string, unknown>)
    : {};
  return {
    primaryColor:
      stringFromUnknown(nested.primaryColor) ||
      stringFromUnknown(raw.primaryColor) ||
      DEFAULT_BLOCK_PREVIEW_THEME.primaryColor,
    secondaryColor:
      stringFromUnknown(nested.secondaryColor) ||
      stringFromUnknown(raw.secondaryColor) ||
      DEFAULT_BLOCK_PREVIEW_THEME.secondaryColor,
    backgroundColor:
      stringFromUnknown(nested.backgroundColor) ||
      stringFromUnknown(raw.backgroundColor) ||
      DEFAULT_BLOCK_PREVIEW_THEME.backgroundColor,
    radius:
      stringFromUnknown(nested.radius) ||
      stringFromUnknown(raw.radius) ||
      DEFAULT_BLOCK_PREVIEW_THEME.radius,
    fontFamily:
      stringFromUnknown(nested.fontFamily) ||
      stringFromUnknown(raw.fontFamily) ||
      DEFAULT_BLOCK_PREVIEW_THEME.fontFamily,
  };
}

function cloneLayoutSpec(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return { ...value };
}

function resolveTemplateState(input: {
  clientSlug: string;
  blockType: BrevoBlockType;
  templateKey?: string | null;
  layoutSpec?: Record<string, unknown> | null;
}) {
  const fallbackTemplate = getDefaultTemplateForType(input.blockType, input.clientSlug);
  const templateKey = isTemplateCompatibleWithType(input.templateKey, input.blockType, input.clientSlug)
    ? (getTemplateDef(input.templateKey, input.clientSlug)?.key ?? fallbackTemplate)
    : fallbackTemplate;
  const templateDef = getTemplateDef(templateKey, input.clientSlug);
  const layoutSpec =
    input.layoutSpec && typeof input.layoutSpec === "object"
      ? cloneLayoutSpec(input.layoutSpec)
      : cloneLayoutSpec(templateDef?.defaultLayoutSpec);
  return { templateKey, layoutSpec };
}

function createEmptyBrief(clientSlug: string): EmailCopyBrief {
  const heroTemplate = resolveTemplateState({ clientSlug, blockType: "hero" });
  const threeColumnsTemplate = resolveTemplateState({ clientSlug, blockType: "three_columns" });
  const twoColumnsTemplate = resolveTemplateState({ clientSlug, blockType: "two_columns" });
  return {
    campaignName: "Nouvelle campagne",
    sendDate: null,
    objective: null,
    offerSummary: null,
    visualLinks: [],
    promoCode: null,
    promoValidUntil: null,
    senderEmail: null,
    comments: null,
    sourceSubject: null,
    sourcePreheader: null,
    rawBriefText: null,
    blocks: [
      {
        id: "block-1",
        blockType: "hero",
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
        templateKey: heroTemplate.templateKey,
        layoutSpec: heroTemplate.layoutSpec,
      },
      {
        id: "block-2",
        blockType: "three_columns",
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
        templateKey: threeColumnsTemplate.templateKey,
        layoutSpec: threeColumnsTemplate.layoutSpec,
      },
      {
        id: "block-3",
        blockType: "two_columns",
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
        templateKey: twoColumnsTemplate.templateKey,
        layoutSpec: twoColumnsTemplate.layoutSpec,
      },
    ],
  };
}

function clean(value: string): string {
  return value.replace(/\u2800+/g, " ").replace(/\s+/g, " ").trim();
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter(Boolean);
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => clean(item))
    .filter(Boolean);
}

function countChars(value: string | null | undefined): number {
  return value ? [...value].length : 0;
}

function normalizeBrief(brief: EmailCopyBrief, clientSlug: string): EmailCopyBrief {
  return {
    ...brief,
    campaignName: clean(brief.campaignName || "Nouvelle campagne"),
    sendDate: brief.sendDate ? clean(brief.sendDate) : null,
    objective: brief.objective ? brief.objective.trim() : null,
    offerSummary: brief.offerSummary ? brief.offerSummary.trim() : null,
    visualLinks: (brief.visualLinks || []).map((line) => clean(line)).filter(Boolean),
    promoCode: brief.promoCode ? clean(brief.promoCode) : null,
    promoValidUntil: brief.promoValidUntil ? clean(brief.promoValidUntil) : null,
    senderEmail: brief.senderEmail ? clean(brief.senderEmail) : null,
    comments: brief.comments ? brief.comments.trim() : null,
    sourceSubject: brief.sourceSubject ? clean(brief.sourceSubject) : null,
    sourcePreheader: brief.sourcePreheader ? clean(brief.sourcePreheader) : null,
    blocks: brief.blocks.map((block, idx) => ({
      ...resolveTemplateState({
        clientSlug,
        blockType: block.blockType,
        templateKey: block.templateKey,
        layoutSpec: block.layoutSpec,
      }),
      id: clean(block.id) || `block-${idx + 1}`,
      blockType: block.blockType,
      sourceTitle: block.sourceTitle ? block.sourceTitle.trim() : null,
      sourceContent: block.sourceContent ? block.sourceContent.trim() : null,
      ctaLabel: block.ctaLabel ? clean(block.ctaLabel) : null,
      ctaUrl: block.ctaUrl ? clean(block.ctaUrl) : null,
    })),
  };
}

function summarizeBlockTypes(blocks: EmailCopyBrief["blocks"]): Record<string, number> {
  return blocks.reduce<Record<string, number>>((accumulator, block) => {
    accumulator[block.blockType] = (accumulator[block.blockType] ?? 0) + 1;
    return accumulator;
  }, {});
}

function ensureUniqueBriefBlockIds(blocks: EmailCopyBrief["blocks"]): EmailCopyBrief["blocks"] {
  const used = new Set<string>();
  return blocks.map((block, index) => {
    const base = clean(block.id || "") || `block-${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    if (candidate === block.id) return block;
    return { ...block, id: candidate };
  });
}

function canonicalizeOptimizedBriefForBuilder(input: {
  optimizedBrief: EmailCopyBrief;
  previousBrief: EmailCopyBrief;
  clientSlug: string;
}): EmailCopyBrief {
  const normalized = normalizeBrief(input.optimizedBrief, input.clientSlug);
  const previousCount = Math.max(input.previousBrief.blocks.length, 1);
  const maxBlocks = Math.min(24, Math.max(12, previousCount * 3));
  let blocks = ensureUniqueBriefBlockIds(normalized.blocks).slice(0, maxBlocks);

  blocks = blocks.map((block) => {
    const templateState = resolveTemplateState({
      clientSlug: input.clientSlug,
      blockType: block.blockType,
      templateKey: block.templateKey,
      layoutSpec: block.layoutSpec,
    });
    return {
      ...block,
      templateKey: templateState.templateKey,
      layoutSpec: templateState.layoutSpec,
    };
  });

  const heroIndexes = blocks
    .map((block, index) => (block.blockType === "hero" ? index : -1))
    .filter((index) => index >= 0);
  if (heroIndexes.length === 0 && blocks.length > 0) {
    const templateState = resolveTemplateState({
      clientSlug: input.clientSlug,
      blockType: "hero",
      templateKey: blocks[0].templateKey,
      layoutSpec: blocks[0].layoutSpec,
    });
    blocks[0] = {
      ...blocks[0],
      blockType: "hero",
      templateKey: templateState.templateKey,
      layoutSpec: templateState.layoutSpec,
    };
  } else if (heroIndexes.length > 1) {
    heroIndexes.slice(1).forEach((index) => {
      const templateState = resolveTemplateState({
        clientSlug: input.clientSlug,
        blockType: "image_text_side_by_side",
        templateKey: blocks[index].templateKey,
        layoutSpec: blocks[index].layoutSpec,
      });
      blocks[index] = {
        ...blocks[index],
        blockType: "image_text_side_by_side",
        templateKey: templateState.templateKey,
        layoutSpec: templateState.layoutSpec,
      };
    });
  }

  const normalizeGroupRemainder = (type: BrevoBlockType, expectedGroup: number) => {
    const indexes = blocks
      .map((block, index) => (block.blockType === type ? index : -1))
      .filter((index) => index >= 0);
    const remainder = indexes.length % expectedGroup;
    if (remainder === 0) return;
    indexes.slice(-remainder).forEach((index) => {
      const templateState = resolveTemplateState({
        clientSlug: input.clientSlug,
        blockType: "image_text_side_by_side",
        templateKey: blocks[index].templateKey,
        layoutSpec: blocks[index].layoutSpec,
      });
      blocks[index] = {
        ...blocks[index],
        blockType: "image_text_side_by_side",
        templateKey: templateState.templateKey,
        layoutSpec: templateState.layoutSpec,
      };
    });
  };

  normalizeGroupRemainder("three_columns", 3);
  normalizeGroupRemainder("two_columns", 2);

  return { ...normalized, blocks: ensureUniqueBriefBlockIds(blocks) };
}

function normalizeBrand(profile: EmailCopyBrandProfile): EmailCopyBrandProfile {
  return {
    ...profile,
    brandName: clean(profile.brandName || SAVEURS_DEFAULT_BRAND_PROFILE.brandName),
    audience: profile.audience.trim(),
    toneSummary: profile.toneSummary.trim(),
    toneDo: profile.toneDo.map((entry) => clean(entry)).filter(Boolean),
    toneDont: profile.toneDont.map((entry) => clean(entry)).filter(Boolean),
    mandatoryTerms: profile.mandatoryTerms.map((entry) => clean(entry)).filter(Boolean),
    forbiddenTerms: profile.forbiddenTerms.map((entry) => clean(entry)).filter(Boolean),
    proofPoints: profile.proofPoints.map((entry) => clean(entry)).filter(Boolean),
    ctaStyle: clean(profile.ctaStyle || ""),
    legalGuardrails: profile.legalGuardrails ? profile.legalGuardrails.trim() : null,
    exampleEmails: (profile.exampleEmails || []).map((entry) => clean(entry)).filter(Boolean),
  };
}

function formatVariantClipboard(variant: EmailCopyVariant): string {
  const lines = [`Subject: ${variant.subject}`, `Preheader: ${variant.preheader}`];
  variant.blocks.forEach((block, index) => {
    lines.push("", `Block ${index + 1} (${block.blockType})`);
    lines.push(`Title: ${block.title}`);
    lines.push(`Subtitle: ${block.subtitle}`);
    lines.push(`Content: ${block.content}`);
    lines.push(`CTA: ${block.ctaLabel}`);
  });
  return lines.join("\n");
}

function briefLooksStarted(brief: EmailCopyBrief, rawBriefInput: string): boolean {
  if (clean(rawBriefInput).length > 0) return true;
  if (clean(brief.campaignName).length > 0 && clean(brief.campaignName) !== "Nouvelle campagne") return true;
  if (clean(brief.sourceSubject || "").length > 0) return true;
  if (clean(brief.sourcePreheader || "").length > 0) return true;
  if (clean(brief.objective || "").length > 0) return true;
  if (clean(brief.offerSummary || "").length > 0) return true;
  return false;
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    showSuccess(`${label} copied.`);
  } catch {
    showError(`Unable to copy ${label.toLowerCase()}.`);
  }
}

function isTypingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function createRunGroupId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function createNextBlockId(blocks: EmailCopyBrief["blocks"]): string {
  const takenIds = new Set(blocks.map((block) => clean(block.id).toLowerCase()).filter(Boolean));
  let nextIndex = blocks.length + 1;
  let candidate = `block-${nextIndex}`;
  while (takenIds.has(candidate.toLowerCase())) {
    nextIndex += 1;
    candidate = `block-${nextIndex}`;
  }
  return candidate;
}

function cloneBlockLayoutSpec(
  layoutSpec: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!layoutSpec || typeof layoutSpec !== "object") return undefined;
  try {
    return JSON.parse(JSON.stringify(layoutSpec)) as Record<string, unknown>;
  } catch {
    return { ...layoutSpec };
  }
}

export default function CrmEmailCopyGeneratorView({ clientSlug, clientLabel }: CrmEmailCopyGeneratorViewProps) {
  const [rawBriefInput, setRawBriefInput] = useState("");
  const [brief, setBrief] = useState<EmailCopyBrief>(() => createEmptyBrief(clientSlug));
  const [briefStatus, setBriefStatus] = useState("");
  const [brandProfile, setBrandProfile] = useState<EmailCopyBrandProfile>(SAVEURS_DEFAULT_BRAND_PROFILE);

  const [variantCount, setVariantCount] = useState(DEFAULT_EMAIL_COPY_VARIANT_COUNT);
  const [model, setModel] = useState<GenerationModel>("gpt-4.1");
  const [variants, setVariants] = useState<EmailCopyVariant[]>([]);
  const [activeVariant, setActiveVariant] = useState(1);
  const [generatedModel, setGeneratedModel] = useState<string | null>(null);
  const [generatedSource, setGeneratedSource] = useState<"openai" | "local-fallback" | null>(null);
  const [runGroupId, setRunGroupId] = useState<string>(() => createRunGroupId());
  const [extractResult, setExtractResult] = useState<EmailCopyExtractResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<EmailCopyOptimizeResult | null>(null);
  const [qaResult, setQaResult] = useState<EmailCopyQaResult | null>(null);

  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [selectedBriefId, setSelectedBriefId] = useState("");

  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runningQa, setRunningQa] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [qaDetailsOpen, setQaDetailsOpen] = useState(false);
  const [previewVisibilityByBlock, setPreviewVisibilityByBlock] = useState<Record<string, boolean>>({});
  const [warningVisibilityByBlock, setWarningVisibilityByBlock] = useState<Record<string, boolean>>({});
  const [activeStep, setActiveStep] = useState<WizardStepId>("brief");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [transitioningToGenerate, setTransitioningToGenerate] = useState(false);
  const [step3EntryMounted, setStep3EntryMounted] = useState(false);
  const [brandDrawerOpen, setBrandDrawerOpen] = useState(false);
  const [mobileOutputOpen, setMobileOutputOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>("block-1");
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [canvasInlineEditMode, setCanvasInlineEditMode] = useState(false);
  const [activeDragState, setActiveDragState] = useState<BuilderDragState | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const brandKitButtonRef = useRef<HTMLButtonElement | null>(null);
  const brandDrawerRef = useRef<HTMLElement | null>(null);
  const brandDrawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const drawerOpenedRef = useRef(false);
  const stepTransitionTimerRef = useRef<number | null>(null);

  const currentVariant = useMemo(
    () => variants.find((variant) => variant.index === activeVariant) || null,
    [variants, activeVariant]
  );
  const blockPreviewTheme = useMemo(() => resolveBrandTheme(brandProfile), [brandProfile]);
  const visualQaByVariant = useMemo<Record<number, VisualQaResult>>(() => {
    const map: Record<number, VisualQaResult> = {};
    variants.forEach((variant) => {
      map[variant.index] = runVisualQaForVariant({ variant, theme: blockPreviewTheme });
    });
    return map;
  }, [variants, blockPreviewTheme]);
  const currentVisualQa = useMemo(
    () => (currentVariant ? visualQaByVariant[currentVariant.index] || null : null),
    [currentVariant, visualQaByVariant]
  );
  const selectedBlockIndex = useMemo(
    () => (selectedBlockId ? brief.blocks.findIndex((block) => block.id === selectedBlockId) : -1),
    [brief.blocks, selectedBlockId]
  );
  const selectedBlock = useMemo(
    () => (selectedBlockIndex >= 0 ? brief.blocks[selectedBlockIndex] : null),
    [brief.blocks, selectedBlockIndex]
  );
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const briefReady = useMemo(() => briefLooksStarted(brief, rawBriefInput), [brief, rawBriefInput]);
  const blocksReady = useMemo(
    () =>
      brief.blocks.length > 0 &&
      brief.blocks.every((block) => clean(block.id).length > 0 && clean(block.sourceContent || block.sourceTitle || "").length > 0),
    [brief.blocks]
  );
  const generatedReady = variants.length > 0;
  const mappedBlocksCount = useMemo(
    () =>
      brief.blocks.filter(
        (block) => clean(block.id).length > 0 && clean(block.sourceContent || block.sourceTitle || "").length > 0
      ).length,
    [brief.blocks]
  );
  const incompleteBlockIds = useMemo(
    () =>
      brief.blocks
        .filter(
          (block) => !(clean(block.id).length > 0 && clean(block.sourceContent || block.sourceTitle || "").length > 0)
        )
        .map((block) => block.id),
    [brief.blocks]
  );
  const readinessPercent = useMemo(() => {
    if (!brief.blocks.length) return 0;
    return Math.max(0, Math.min(100, Math.round((mappedBlocksCount / brief.blocks.length) * 100)));
  }, [brief.blocks.length, mappedBlocksCount]);

  useEffect(() => {
    if (!brief.blocks.length) {
      if (selectedBlockId !== null) setSelectedBlockId(null);
      return;
    }
    if (!selectedBlockId || !brief.blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(brief.blocks[0].id);
    }
  }, [brief.blocks, selectedBlockId]);

  useEffect(() => {
    if (activeStep === "blocks") return;
    setActiveDragState(null);
    setDragInsertIndex(null);
    if (stepTransitionTimerRef.current !== null) {
      window.clearTimeout(stepTransitionTimerRef.current);
      stepTransitionTimerRef.current = null;
    }
    if (transitioningToGenerate) setTransitioningToGenerate(false);
  }, [activeStep, transitioningToGenerate]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    syncPreference();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncPreference);
      return () => mediaQuery.removeEventListener("change", syncPreference);
    }
    mediaQuery.addListener(syncPreference);
    return () => mediaQuery.removeListener(syncPreference);
  }, []);

  useEffect(() => {
    if (activeStep !== "generate") {
      setStep3EntryMounted(false);
      return;
    }
    if (prefersReducedMotion) {
      setStep3EntryMounted(true);
      return;
    }
    setStep3EntryMounted(false);
    const animationFrame = window.requestAnimationFrame(() => setStep3EntryMounted(true));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeStep, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (stepTransitionTimerRef.current !== null) {
        window.clearTimeout(stepTransitionTimerRef.current);
      }
    };
  }, []);

  const stepMeta = useMemo(
    () => [
      {
        id: "brief" as const,
        title: "Brief Intake",
        helper: "Paste and normalize campaign brief",
        ready: briefReady,
        icon: FileText,
      },
      {
        id: "blocks" as const,
        title: "Block Mapping",
        helper: "Map content to Brevo sections",
        ready: blocksReady,
        icon: LayoutGrid,
      },
      {
        id: "generate" as const,
        title: "Generate & Review",
        helper: "Produce variants and copy to Brevo",
        ready: generatedReady,
        icon: Sparkles,
      },
    ],
    [briefReady, blocksReady, generatedReady]
  );

  const openBrandDrawer = useCallback(() => {
    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : brandKitButtonRef.current;
    setBrandDrawerOpen(true);
  }, []);

  const closeBrandDrawer = useCallback(() => {
    setBrandDrawerOpen(false);
  }, []);

  useEffect(() => {
    if (brandDrawerOpen) {
      drawerOpenedRef.current = true;
      const timer = window.setTimeout(() => {
        brandDrawerCloseButtonRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (!drawerOpenedRef.current) return;
    const focusTarget = lastFocusedElementRef.current ?? brandKitButtonRef.current;
    const timer = window.setTimeout(() => {
      focusTarget?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [brandDrawerOpen]);

  useEffect(() => {
    if (!brandDrawerOpen) return;

    const handleDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBrandDrawer();
        return;
      }
      if (event.key !== "Tab") return;

      const drawerElement = brandDrawerRef.current;
      if (!drawerElement) return;

      const focusable = drawerElement.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!active || !drawerElement.contains(active) || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!active || !drawerElement.contains(active) || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDrawerKeys);
    return () => document.removeEventListener("keydown", handleDrawerKeys);
  }, [brandDrawerOpen, closeBrandDrawer]);

  const fetchWorkspace = useCallback(
    async (briefId?: string) => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ client: clientSlug });
        if (briefId) query.set("briefId", briefId);
        const response = await fetch(`/api/crm/email-copy?${query.toString()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as WorkspacePayload | null;
        if (!response.ok || !payload) {
          throw new Error((payload as { error?: string } | null)?.error || `Load failed (${response.status})`);
        }

        setBrandProfile({
          ...SAVEURS_DEFAULT_BRAND_PROFILE,
          ...(payload.brandProfile ?? {}),
        });
        setBriefs(payload.briefs || []);

        if (payload.selectedBrief?.id) {
          const loadedBriefRaw =
            (payload.selectedBrief.brief as EmailCopyBrief | null) || createEmptyBrief(clientSlug);
          const loadedBrief = normalizeBrief(loadedBriefRaw, clientSlug);
          setActiveBriefId(payload.selectedBrief.id);
          setSelectedBriefId(payload.selectedBrief.id);
          setBrief(loadedBrief);
          setBriefStatus(payload.selectedBrief.status || "");
          setRawBriefInput(loadedBrief.rawBriefText || "");
          setSelectedBlockId(loadedBrief.blocks[0]?.id || null);
          setRunGroupId(createRunGroupId());
          setExtractResult(null);
          setOptimizeResult(null);
          setQaResult(null);
          setQaDetailsOpen(false);
          setPreviewVisibilityByBlock({});
          setWarningVisibilityByBlock({});
          setActiveStep("blocks");
        }

        const sortedDrafts = (payload.drafts || []).sort((a, b) => a.variantIndex - b.variantIndex);
        if (sortedDrafts.length > 0) {
          setVariants(sortedDrafts.map((entry) => entry.draft));
          setGeneratedModel(sortedDrafts[0].model);
          setGeneratedSource(sortedDrafts[0].source);
          setActiveVariant(sortedDrafts[0].draft.index || 1);
          setActiveStep("generate");
          setMobileOutputOpen(true);
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to load workspace");
      } finally {
        setLoading(false);
      }
    },
    [clientSlug]
  );

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  const updateBriefField = <K extends keyof EmailCopyBrief>(key: K, value: EmailCopyBrief[K]) => {
    setBrief((prev) => ({ ...prev, [key]: value }));
  };

  const updateBlockField = <K extends keyof EmailCopyBrief["blocks"][number]>(
    blockIndex: number,
    key: K,
    value: EmailCopyBrief["blocks"][number][K]
  ) => {
    setBrief((prev) => {
      const nextBlocks = [...prev.blocks];
      if (!nextBlocks[blockIndex]) return prev;
      const currentBlock = nextBlocks[blockIndex];

      if (key === "blockType") {
        const nextType = value as BrevoBlockType;
        const nextTemplate = resolveTemplateState({
          clientSlug,
          blockType: nextType,
          templateKey: currentBlock.templateKey,
          layoutSpec: currentBlock.layoutSpec,
        });
        nextBlocks[blockIndex] = {
          ...currentBlock,
          blockType: nextType,
          templateKey: nextTemplate.templateKey,
          layoutSpec: nextTemplate.layoutSpec,
        };
        return { ...prev, blocks: nextBlocks };
      }

      if (key === "templateKey") {
        const templateKey =
          (value as string | null) || getDefaultTemplateForType(currentBlock.blockType, clientSlug);
        const templateDef = getTemplateDef(templateKey, clientSlug);
        nextBlocks[blockIndex] = {
          ...currentBlock,
          templateKey: templateDef?.key || templateKey,
          layoutSpec: cloneLayoutSpec(templateDef?.defaultLayoutSpec),
        };
        return { ...prev, blocks: nextBlocks };
      }

      if (key === "id" && currentBlock.id === selectedBlockId) {
        const nextId = String(value || "").trim();
        setSelectedBlockId(nextId || currentBlock.id);
      }

      nextBlocks[blockIndex] = { ...currentBlock, [key]: value };
      return { ...prev, blocks: nextBlocks };
    });
  };

  const getPreviewStateKey = useCallback(
    (variantIndex: number, blockId: string, blockIndex: number) => `${variantIndex}:${blockId}:${blockIndex}`,
    []
  );
  const getWarningStateKey = useCallback(
    (variantIndex: number, blockId: string, blockIndex: number) => `warn:${variantIndex}:${blockId}:${blockIndex}`,
    []
  );
  const getOutputBlockAnchorId = useCallback(
    (variantIndex: number, blockId: string, blockIndex: number) =>
      `email-copy-output-block-${variantIndex}-${blockIndex}-${blockId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    []
  );

  const toggleBlockPreview = useCallback((stateKey: string) => {
    setPreviewVisibilityByBlock((prev) => ({ ...prev, [stateKey]: !prev[stateKey] }));
  }, []);
  const toggleBlockWarnings = useCallback((stateKey: string) => {
    setWarningVisibilityByBlock((prev) => ({ ...prev, [stateKey]: !prev[stateKey] }));
  }, []);
  const scrollToOutputBlock = useCallback(
    (variantIndex: number, blockId: string, blockIndex: number) => {
      setActiveStep("generate");
      setActiveVariant(variantIndex);
      setMobileOutputOpen(true);
      const targetId = getOutputBlockAnchorId(variantIndex, blockId, blockIndex);
      window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    },
    [getOutputBlockAnchorId]
  );

  const trackStepEvent = useCallback(
    async (input: {
      step: TrackStep;
      brief?: EmailCopyBrief;
      rawBriefText?: string | null;
      context?: Record<string, unknown>;
      runGroupId?: string;
    }) => {
      const trackedRawBriefText =
        input.rawBriefText ?? rawBriefInput ?? input.brief?.rawBriefText ?? brief.rawBriefText ?? null;
      const briefToTrack = normalizeBrief({
        ...(input.brief ?? brief),
        rawBriefText: trackedRawBriefText,
      }, clientSlug);

      try {
        const response = await fetch("/api/ai/email-copy", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "track",
            clientSlug,
            model,
            briefId: activeBriefId,
            runGroupId: input.runGroupId || runGroupId,
            step: input.step,
            rawBriefText: trackedRawBriefText,
            brief: briefToTrack,
            context: input.context || {},
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          console.warn("[email-copy] track event rejected", response.status, payload);
        }
      } catch (error) {
        console.warn("[email-copy] track event failed", error);
      }
    },
    [activeBriefId, brief, clientSlug, model, rawBriefInput, runGroupId]
  );

  const startNewBrief = () => {
    const nextBrief = createEmptyBrief(clientSlug);
    setActiveBriefId(null);
    setSelectedBriefId("");
    setBriefStatus("");
    setRawBriefInput("");
    setBrief(nextBrief);
    setVariants([]);
    setGeneratedModel(null);
    setGeneratedSource(null);
    setRunGroupId(createRunGroupId());
    setExtractResult(null);
    setOptimizeResult(null);
    setQaResult(null);
    setQaDetailsOpen(false);
    setPreviewVisibilityByBlock({});
    setWarningVisibilityByBlock({});
    setActiveVariant(1);
    setActiveStep("brief");
    setMobileOutputOpen(false);
    setSelectedBlockId(nextBrief.blocks[0]?.id || null);
    setActiveDragState(null);
    setDragInsertIndex(null);
  };

  const insertBlockAt = (blockType: BrevoBlockType, insertAtIndex?: number | null) => {
    setBrief((prev) => {
      const nextId = createNextBlockId(prev.blocks);
      const preferredTemplateKey =
        clientSlug === "saveurs-et-vie"
          ? blockType === "image_text_side_by_side"
            ? "sv.sideBySide.helpCta.v1"
            : blockType === "two_columns"
              ? "sv.twoCards.menuPastel.v1"
              : null
          : null;
      const templateState = resolveTemplateState({
        clientSlug,
        blockType,
        templateKey: preferredTemplateKey,
      });
      const nextIndex =
        typeof insertAtIndex === "number"
          ? Math.min(Math.max(insertAtIndex, 0), prev.blocks.length)
          : prev.blocks.length;
      const nextBlocks = [...prev.blocks];
      nextBlocks.splice(nextIndex, 0, {
        id: nextId,
        blockType,
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
        templateKey: templateState.templateKey,
        layoutSpec: templateState.layoutSpec,
      });
      setSelectedBlockId(nextId);
      return {
        ...prev,
        blocks: nextBlocks,
      };
    });
  };

  const addBlock = (blockType: BrevoBlockType = "image_text_side_by_side") => {
    insertBlockAt(blockType, null);
  };

  const removeBlock = (blockIndex: number) => {
    setBrief((prev) => {
      if (prev.blocks.length <= 1) return prev;
      const removed = prev.blocks[blockIndex];
      const remaining = prev.blocks.filter((_, index) => index !== blockIndex);
      if (removed?.id === selectedBlockId) {
        const nearestIndex = Math.min(blockIndex, Math.max(remaining.length - 1, 0));
        setSelectedBlockId(remaining[nearestIndex]?.id || null);
      }
      return {
        ...prev,
        blocks: remaining,
      };
    });
  };

  const moveBlock = (fromIndex: number, toIndex: number) => {
    setBrief((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.blocks.length ||
        toIndex >= prev.blocks.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const nextBlocks = arrayMove(prev.blocks, fromIndex, toIndex);
      return { ...prev, blocks: nextBlocks };
    });
  };

  const duplicateBlock = (blockIndex: number) => {
    setBrief((prev) => {
      const source = prev.blocks[blockIndex];
      if (!source) return prev;
      const nextId = createNextBlockId(prev.blocks);
      const duplicate = {
        ...source,
        id: nextId,
        layoutSpec: cloneBlockLayoutSpec(source.layoutSpec) ?? source.layoutSpec,
      };
      const nextBlocks = [...prev.blocks];
      nextBlocks.splice(blockIndex + 1, 0, duplicate);
      setSelectedBlockId(nextId);
      return { ...prev, blocks: nextBlocks };
    });
  };

  const getBlockIndexById = useCallback(
    (blockId: string) => brief.blocks.findIndex((block) => block.id === blockId),
    [brief.blocks]
  );

  const handleInlineCanvasCommit = useCallback(
    (input: { blockId: string; field: "sourceTitle" | "sourceContent"; value: string }) => {
      const blockIndex = getBlockIndexById(input.blockId);
      if (blockIndex < 0) return;
      const nextValue = input.value.trim();
      updateBlockField(
        blockIndex,
        input.field,
        nextValue.length ? nextValue : null
      );
    },
    [getBlockIndexById]
  );

  const resolveLibraryInsertionIndex = useCallback(
    (event: DragOverEvent | DragEndEvent) => {
      const over = event.over;
      const overId = over ? String(over.id) : "";
      if (!overId) return null;
      if (overId === EMAIL_CANVAS_DROP_ZONE_ID) return brief.blocks.length;
      const overIndex = getBlockIndexById(overId);
      if (overIndex < 0) return null;
      if (!over) return null;
      const translatedTop = event.active.rect.current.translated?.top;
      const overMiddle = over.rect.top + over.rect.height / 2;
      const afterTarget = typeof translatedTop === "number" ? translatedTop > overMiddle : false;
      return overIndex + (afterTarget ? 1 : 0);
    },
    [brief.blocks.length, getBlockIndexById]
  );

  const handleBuilderDragStart = useCallback(
    (event: DragStartEvent) => {
      const currentData = (event.active.data.current ?? {}) as {
        source?: "canvas" | "library";
        blockId?: string;
        blockType?: BrevoBlockType;
        name?: string;
        itemId?: string;
      };
      if (currentData.source === "canvas") {
        const blockId = currentData.blockId || String(event.active.id);
        const block = brief.blocks.find((entry) => entry.id === blockId);
        setActiveDragState({
          source: "canvas",
          blockId,
          label: block ? `Block ${block.id}` : "Block",
        });
        setDragInsertIndex(null);
        return;
      }
      if (currentData.source === "library" && currentData.blockType) {
        setActiveDragState({
          source: "library",
          blockType: currentData.blockType,
          itemId: currentData.itemId || String(event.active.id),
          label: currentData.name || "New block",
        });
        setDragInsertIndex(brief.blocks.length);
      }
    },
    [brief.blocks]
  );

  const handleBuilderDragOver = useCallback(
    (event: DragOverEvent) => {
      if (activeDragState?.source !== "library") return;
      const nextIndex = resolveLibraryInsertionIndex(event);
      setDragInsertIndex(nextIndex);
    },
    [activeDragState?.source, resolveLibraryInsertionIndex]
  );

  const handleBuilderDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveDragState(null);
    setDragInsertIndex(null);
  }, []);

  const handleBuilderDragEnd = useCallback(
    (event: DragEndEvent) => {
      const finalizedDrag = activeDragState;
      setActiveDragState(null);
      const insertIndexFromEvent = resolveLibraryInsertionIndex(event);
      if (finalizedDrag?.source === "library") {
        const overId = event.over ? String(event.over.id) : "";
        const droppedOnCanvas =
          overId === EMAIL_CANVAS_DROP_ZONE_ID || getBlockIndexById(overId) >= 0;
        const insertionIndex =
          dragInsertIndex ??
          insertIndexFromEvent ??
          (droppedOnCanvas ? brief.blocks.length : null);
        if (droppedOnCanvas && insertionIndex !== null) {
          insertBlockAt(finalizedDrag.blockType, insertionIndex);
          setMobileLibraryOpen(false);
        }
        setDragInsertIndex(null);
        return;
      }

      if (finalizedDrag?.source === "canvas") {
        const overId = event.over ? String(event.over.id) : "";
        if (!overId || overId === EMAIL_CANVAS_DROP_ZONE_ID) {
          setDragInsertIndex(null);
          return;
        }
        const fromIndex = getBlockIndexById(finalizedDrag.blockId);
        const toIndex = getBlockIndexById(overId);
        if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
          moveBlock(fromIndex, toIndex);
          setSelectedBlockId(finalizedDrag.blockId);
        }
      }
      setDragInsertIndex(null);
    },
    [
      activeDragState,
      brief.blocks.length,
      dragInsertIndex,
      getBlockIndexById,
      resolveLibraryInsertionIndex,
    ]
  );

  const saveBrief = useCallback(async () => {
    setSavingBrief(true);
    try {
      const briefPayload = normalizeBrief(
        { ...brief, rawBriefText: rawBriefInput || brief.rawBriefText || null },
        clientSlug
      );
      void trackStepEvent({
        step: "mapping",
        brief: briefPayload,
        rawBriefText: rawBriefInput || brief.rawBriefText || null,
        context: {
          event: "manual_save_snapshot",
          status: briefStatus || null,
        },
      });

      const response = await fetch("/api/crm/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveBrief",
          client: clientSlug,
          briefId: activeBriefId,
          status: briefStatus || null,
          brief: briefPayload,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Save failed (${response.status})`);
      const nextId = payload?.briefRecord?.id as string | undefined;
      if (nextId) {
        setActiveBriefId(nextId);
        setSelectedBriefId(nextId);
        await fetchWorkspace(nextId);
      }
      showSuccess("Brief saved.");
      return nextId || null;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save brief");
      return null;
    } finally {
      setSavingBrief(false);
    }
  }, [activeBriefId, brief, briefStatus, clientSlug, fetchWorkspace, rawBriefInput, trackStepEvent]);

  const saveBrandProfile = async () => {
    setSavingBrand(true);
    try {
      const response = await fetch("/api/crm/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveBrandProfile",
          client: clientSlug,
          profile: normalizeBrand(brandProfile),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Save failed (${response.status})`);
      showSuccess("Brand profile saved.");
      closeBrandDrawer();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save brand profile");
    } finally {
      setSavingBrand(false);
    }
  };

  const handleParseBrief = () => {
    if (!clean(rawBriefInput).length) {
      showError("Paste a brief before parsing.");
      return;
    }
    const parsed = parseEmailCopyBrief(rawBriefInput);
    const nextRunGroupId = createRunGroupId();
    setBrief(normalizeBrief(parsed.brief, clientSlug));
    setBriefStatus(parsed.metadata.status || "");
    setSelectedBlockId(parsed.brief.blocks[0]?.id || null);
    setExtractResult(null);
    setOptimizeResult(null);
    setQaResult(null);
    setQaDetailsOpen(false);
    setVariants([]);
    setGeneratedModel(null);
    setGeneratedSource(null);
    setRunGroupId(nextRunGroupId);
    setActiveStep("blocks");
    void trackStepEvent({
      step: "parse",
      runGroupId: nextRunGroupId,
      rawBriefText: rawBriefInput,
      brief: parsed.brief,
      context: {
        event: "manual_parse",
        parser: "local",
        status: parsed.metadata.status || null,
      },
    });
    showSuccess("Brief parsed.");
  };

  const runAiExtract = async () => {
    if (!clean(rawBriefInput).length) {
      showError("Paste a brief before running AI extract.");
      return;
    }
    setExtracting(true);
    try {
      const response = await fetch("/api/ai/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "extract",
          clientSlug,
          model,
          briefId: activeBriefId,
          runGroupId,
          rawBriefText: rawBriefInput,
          brandProfile: normalizeBrand(brandProfile),
        }),
      });
      const payload = (await response.json().catch(() => null)) as ExtractApiPayload | null;
      if (!response.ok || !payload) throw new Error((payload as { error?: string } | null)?.error || `AI extract failed (${response.status})`);

      setBrief(normalizeBrief(payload.brief, clientSlug));
      setBriefStatus(payload.status || "");
      setSelectedBlockId(payload.brief.blocks[0]?.id || null);
      setExtractResult(payload);
      setOptimizeResult(null);
      setQaResult(null);
      setQaDetailsOpen(false);
      setPreviewVisibilityByBlock({});
      setWarningVisibilityByBlock({});
      setVariants([]);
      setGeneratedModel(null);
      setGeneratedSource(null);
      const nextRunGroupId = payload.runGroupId || runGroupId;
      setRunGroupId(nextRunGroupId);
      setActiveStep("blocks");
      void trackStepEvent({
        step: "mapping",
        runGroupId: nextRunGroupId,
        rawBriefText: rawBriefInput,
        brief: payload.brief,
        context: {
          event: "post_extract",
          source: payload.source,
          model: payload.model,
          status: payload.status || null,
          warningCount: payload.warnings?.length || 0,
          evidenceCount: payload.evidence?.length || 0,
        },
      });
      showSuccess(payload.source === "local-fallback" ? "AI extract completed with local fallback." : "AI extract completed.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to run AI extract");
    } finally {
      setExtracting(false);
    }
  };

  const runAiOptimize = async () => {
    if (!briefReady) {
      showError("Complete brief intake before optimization.");
      setActiveStep("brief");
      return;
    }
    setOptimizing(true);
    try {
      const previousSelectedBlockId = selectedBlockId;
      const briefForOptimize = normalizeBrief(
        { ...brief, rawBriefText: rawBriefInput || brief.rawBriefText || null },
        clientSlug
      );
      const response = await fetch("/api/ai/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "optimize",
          clientSlug,
          model,
          briefId: activeBriefId,
          runGroupId,
          selectedBlockId: previousSelectedBlockId,
          brandProfile: normalizeBrand(brandProfile),
          brief: briefForOptimize,
        }),
      });
      const payload = (await response.json().catch(() => null)) as OptimizeApiPayload | null;
      if (!response.ok || !payload) throw new Error((payload as { error?: string } | null)?.error || `AI optimize failed (${response.status})`);

      const canonicalBrief = canonicalizeOptimizedBriefForBuilder({
        optimizedBrief: payload.brief,
        previousBrief: briefForOptimize,
        clientSlug,
      });
      const apiSelectedBlockId = payload.selection?.selectedBlockId ?? null;
      const retainedPreviousSelection =
        Boolean(previousSelectedBlockId) &&
        canonicalBrief.blocks.some((block) => block.id === previousSelectedBlockId);
      const nextSelectedBlockId = retainedPreviousSelection
        ? previousSelectedBlockId
        : apiSelectedBlockId && canonicalBrief.blocks.some((block) => block.id === apiSelectedBlockId)
          ? apiSelectedBlockId
          : canonicalBrief.blocks[0]?.id || null;

      setBrief(canonicalBrief);
      setSelectedBlockId(nextSelectedBlockId);
      setOptimizeResult({ ...payload, brief: canonicalBrief });
      setQaResult(null);
      setQaDetailsOpen(false);
      setPreviewVisibilityByBlock({});
      setWarningVisibilityByBlock({});
      setVariants([]);
      setGeneratedModel(null);
      setGeneratedSource(null);
      const nextRunGroupId = payload.runGroupId || runGroupId;
      setRunGroupId(nextRunGroupId);
      void trackStepEvent({
        step: "mapping",
        runGroupId: nextRunGroupId,
        rawBriefText: rawBriefInput,
        brief: payload.brief,
        context: {
          event: "post_optimize",
          source: payload.source,
          model: payload.model,
          warningCount: payload.warnings?.length || 0,
          changeCount: payload.changes?.length || 0,
          evidenceCount: payload.evidence?.length || 0,
          optimizeSummary: {
            before: {
              blockCount: briefForOptimize.blocks.length,
              blockTypeCounts: summarizeBlockTypes(briefForOptimize.blocks),
            },
            after: {
              blockCount: canonicalBrief.blocks.length,
              blockTypeCounts: summarizeBlockTypes(canonicalBrief.blocks),
            },
            selection: {
              requestedBlockId: previousSelectedBlockId || null,
              selectedBlockId: nextSelectedBlockId,
              retained: retainedPreviousSelection,
            },
          },
        },
      });
      showSuccess(payload.source === "local-fallback" ? "AI optimize completed with local fallback." : "AI optimize completed.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to run AI optimize");
    } finally {
      setOptimizing(false);
    }
  };

  const runQa = useCallback(
    async (variantsInput?: EmailCopyVariant[]) => {
      const toReview = variantsInput && variantsInput.length ? variantsInput : variants;
      if (!toReview.length) {
        showError("Generate variants before QA.");
        return null;
      }
      setRunningQa(true);
      try {
        const response = await fetch("/api/ai/email-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "qa",
            clientSlug,
            model,
            briefId: activeBriefId,
            runGroupId,
            brandProfile: normalizeBrand(brandProfile),
            brief: normalizeBrief(
              { ...brief, rawBriefText: rawBriefInput || brief.rawBriefText || null },
              clientSlug
            ),
            variants: toReview,
          }),
        });
        const payload = (await response.json().catch(() => null)) as QaApiPayload | null;
        if (!response.ok || !payload) throw new Error((payload as { error?: string } | null)?.error || `QA failed (${response.status})`);
        setQaResult(payload.result);
        setRunGroupId(payload.runGroupId || runGroupId);
        setQaDetailsOpen(false);
        return payload.result;
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to run QA");
        return null;
      } finally {
        setRunningQa(false);
      }
    },
    [activeBriefId, brief, brandProfile, clientSlug, model, rawBriefInput, runGroupId, variants]
  );

  const generateCopy = async () => {
    if (!briefReady) {
      showError("Complete brief intake before generation.");
      setActiveStep("brief");
      return;
    }
    if (!blocksReady) {
      showError("Complete block mapping before generation.");
      setActiveStep("blocks");
      return;
    }

    setQaResult(null);
    setQaDetailsOpen(false);
    setGenerating(true);
    try {
      const mappingSnapshot = normalizeBrief(
        { ...brief, rawBriefText: rawBriefInput || brief.rawBriefText || null },
        clientSlug
      );
      void trackStepEvent({
        step: "mapping",
        brief: mappingSnapshot,
        rawBriefText: rawBriefInput || brief.rawBriefText || null,
        context: {
          event: "pre_generate_snapshot",
          mappedBlocksCount,
          totalBlocks: mappingSnapshot.blocks.length,
          blocksWithTemplateKey: mappingSnapshot.blocks.filter((block) => Boolean(block.templateKey)).length,
          blocksWithLayoutSpec: mappingSnapshot.blocks.filter(
            (block) => Boolean(block.layoutSpec && typeof block.layoutSpec === "object")
          ).length,
          variantCount,
        },
      });

      const response = await fetch("/api/ai/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          clientSlug,
          model,
          briefId: activeBriefId,
          runGroupId,
          variantCount,
          brandProfile: normalizeBrand(brandProfile),
          brief: mappingSnapshot,
        }),
      });
      const payload = (await response.json().catch(() => null)) as GenerateApiPayload | null;
      if (!response.ok || !payload) throw new Error((payload as { error?: string } | null)?.error || `Generation failed (${response.status})`);
      const generated = Array.isArray(payload?.variants) ? payload.variants : [];
      if (!generated.length) throw new Error("No variants generated.");
      setVariants(generated);
      setPreviewVisibilityByBlock({});
      setWarningVisibilityByBlock({});
      setGeneratedModel(payload.model || model);
      setGeneratedSource(payload.source || "openai");
      setRunGroupId(payload.runGroupId || runGroupId);
      setActiveVariant(generated[0].index);
      setActiveStep("generate");
      setMobileOutputOpen(true);
      const qa = await runQa(generated);
      if (qa) {
        showSuccess("Variants generated and QA completed.");
      } else {
        showSuccess("Variants generated.");
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to generate");
    } finally {
      setGenerating(false);
    }
  };

  const saveDrafts = async () => {
    if (!variants.length) {
      showError("Generate variants before saving drafts.");
      return;
    }
    setSavingDrafts(true);
    try {
      let briefId = activeBriefId;
      if (!briefId) briefId = await saveBrief();
      if (!briefId) throw new Error("Brief is required before saving drafts.");

      const response = await fetch("/api/crm/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveDrafts",
          client: clientSlug,
          briefId,
          variants,
          model: generatedModel || model,
          source: generatedSource || "openai",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Save failed (${response.status})`);
      await fetchWorkspace(briefId);
      showSuccess("Drafts saved.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save drafts");
    } finally {
      setSavingDrafts(false);
    }
  };

  const scrollToOutput = useCallback(() => {
    document.getElementById("email-copy-output-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOutputOpen(true);
  }, []);

  const focusFirstIncompleteBlock = useCallback(() => {
    if (!incompleteBlockIds.length) return;
    const targetId = incompleteBlockIds[0];
    setSelectedBlockId(targetId);
    const targetElement = Array.from(
      document.querySelectorAll<HTMLElement>("[data-canvas-block-id]")
    ).find((element) => element.dataset.canvasBlockId === targetId);
    targetElement?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [incompleteBlockIds]);

  const goToGenerateStep = useCallback(() => {
    if (!blocksReady || transitioningToGenerate) return;

    if (prefersReducedMotion) {
      setActiveStep("generate");
      return;
    }

    setTransitioningToGenerate(true);
    if (stepTransitionTimerRef.current !== null) {
      window.clearTimeout(stepTransitionTimerRef.current);
    }
    stepTransitionTimerRef.current = window.setTimeout(() => {
      setTransitioningToGenerate(false);
      stepTransitionTimerRef.current = null;
      setActiveStep("generate");
    }, 350);
  }, [blocksReady, prefersReducedMotion, transitioningToGenerate]);

  useEffect(() => {
    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;

      if (brandDrawerOpen && event.key !== "Escape") return;

      const key = event.key.toLowerCase();
      const withCmdOrCtrl = event.metaKey || event.ctrlKey;

      if (withCmdOrCtrl && !event.altKey && !event.shiftKey && key === "s") {
        event.preventDefault();
        void saveBrief();
        return;
      }

      if (withCmdOrCtrl && !event.altKey && !event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        void generateCopy();
        return;
      }

      if (isTypingElement(event.target)) return;
      if (!event.altKey || event.ctrlKey || event.metaKey) return;

      if (key === "1") {
        event.preventDefault();
        setActiveStep("brief");
        return;
      }
      if (key === "2") {
        event.preventDefault();
        setActiveStep("blocks");
        return;
      }
      if (key === "3") {
        event.preventDefault();
        setActiveStep("generate");
        return;
      }
      if (key === "b") {
        event.preventDefault();
        openBrandDrawer();
        return;
      }
      if (key === "o") {
        event.preventDefault();
        scrollToOutput();
      }
    };

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [brandDrawerOpen, generateCopy, openBrandDrawer, saveBrief, scrollToOutput]);

  const stepNavigation = (
    <div className="card p-3 sm:p-5">
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        {stepMeta.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = activeStep === step.id;
          const complete = step.ready;
          return (
            <button
              key={step.id}
              type="button"
              className={[
                `flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors sm:min-w-[220px] sm:flex-1 sm:px-4 sm:py-3.5 ${FOCUS_RING_CLASS}`,
                isActive
                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10"
                  : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-surface-2)]",
              ].join(" ")}
              onClick={() => setActiveStep(step.id)}
              aria-current={isActive ? "step" : undefined}
              aria-keyshortcuts={`Alt+${index + 1}`}
            >
              <div
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                  complete
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]/70",
                ].join(" ")}
              >
                {complete ? <CheckCircle2 className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">Step {index + 1}</p>
                <p className="mt-0.5 text-sm font-semibold text-[color:var(--color-text)]">{step.title}</p>
                <p className="mt-1 hidden text-xs text-[var(--color-muted)] sm:block">{step.helper}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const inspectorPanel = (
    <BlockInspectorPanel
      clientSlug={clientSlug}
      selectedBlock={selectedBlock}
      selectedBlockIndex={selectedBlockIndex}
      totalBlocks={brief.blocks.length}
      onUpdateBlockField={updateBlockField}
      onDuplicateBlock={duplicateBlock}
      onRemoveBlock={removeBlock}
      onCopyBlockId={(blockId) => void copyText(blockId, "Block ID")}
    />
  );
  const showOutputPanel = activeStep === "generate";
  const compactBuilderHeader = activeStep === "blocks";
  const step3EntryClass = prefersReducedMotion
    ? ""
    : step3EntryMounted
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-1";
  const step2ButtonsDisabled = transitioningToGenerate;
  const headerPrimaryTooltip =
    activeStep === "blocks" && !blocksReady
      ? "Complete block sources to enable generation"
      : undefined;
  const headerPrimaryDisabled =
    activeStep === "blocks"
      ? !blocksReady || transitioningToGenerate
      : activeStep === "generate"
        ? generating
        : false;
  const headerPrimaryLabel =
    activeStep === "brief"
      ? "Continue to mapping"
      : activeStep === "blocks"
        ? transitioningToGenerate
          ? "Switching"
          : "Go to Generate"
        : generating
          ? "Generating"
          : "Generate variants";

  const handleHeaderPrimaryAction = () => {
    if (activeStep === "brief") {
      setActiveStep("blocks");
      return;
    }
    if (activeStep === "blocks") {
      goToGenerateStep();
      return;
    }
    void generateCopy();
  };

  return (
    <section className="space-y-4 sm:space-y-6" data-page="crm-email-copy-generator">
      <a
        href="#email-copy-main-panel"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[260] focus:rounded-md focus:bg-[color:var(--color-surface)] focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-[color:var(--color-text)]"
      >
        Skip to form
      </a>
      {showOutputPanel ? (
        <a
          href="#email-copy-output-panel"
          className="sr-only focus:not-sr-only focus:fixed focus:left-36 focus:top-4 focus:z-[260] focus:rounded-md focus:bg-[color:var(--color-surface)] focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-[color:var(--color-text)]"
        >
          Skip to output
        </a>
      ) : null}
      <header
        className={[
          "relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 shadow-sm sm:rounded-3xl sm:px-6",
          compactBuilderHeader ? "py-3 sm:py-4" : "py-4 sm:py-6",
        ].join(" ")}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(14,165,233,0.18),transparent_60%),radial-gradient(120%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%)]" />
        <div
          className={[
            "relative z-10",
            compactBuilderHeader ? "space-y-3 sm:space-y-4" : "space-y-4 sm:space-y-5",
          ].join(" ")}
        >
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-text)]/65">CRM</p>
            <div className={compactBuilderHeader ? "mt-1.5 flex flex-wrap items-center gap-2 sm:gap-2.5" : "mt-2 flex flex-wrap items-center gap-2.5 sm:gap-3"}>
              <h1 className="text-xl font-semibold text-[color:var(--color-text)] sm:text-2xl">Email Copy Generator</h1>
              <span className="rounded-full border border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--color-primary)]">
                {clientLabel ?? clientSlug}
              </span>
            </div>
            <p className={compactBuilderHeader ? "mt-1.5 text-xs text-[color:var(--color-text)]/72 sm:text-sm" : "mt-2 text-xs text-[color:var(--color-text)]/72 sm:text-sm"}>
              Create and optimize Saveurs et Vie CRM email copy aligned with Brevo block structure.
            </p>
          </div>

          <div className={compactBuilderHeader ? "w-full overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-sm" : "w-full overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-sm"}>
            <div className="flex min-w-max items-center gap-2 whitespace-nowrap">
              <select className="input h-8 min-w-[240px] text-xs sm:min-w-[280px] sm:text-sm" value={selectedBriefId} onChange={(event) => setSelectedBriefId(event.target.value)}>
                <option value="">{loading ? "Loading briefs..." : "Select saved brief"}</option>
                {briefs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.campaignName}
                    {item.sendDate ? ` | ${item.sendDate}` : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs sm:text-sm" disabled={!selectedBriefId} onClick={() => void fetchWorkspace(selectedBriefId)}>
                Load
              </button>
              <div className="mx-1 h-5 w-px shrink-0 bg-[var(--color-border)]" />
              <button type="button" className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs sm:text-sm" onClick={startNewBrief}>
                New
              </button>
              <button
                ref={brandKitButtonRef}
                type="button"
                className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs sm:text-sm"
                onClick={openBrandDrawer}
                aria-keyshortcuts="Alt+B"
              >
                Brand Kit
              </button>
              <button
                type="button"
                className="btn-ghost flex h-8 items-center gap-2 px-3 text-xs sm:text-sm"
                disabled={savingBrief}
                onClick={() => void saveBrief()}
                aria-keyshortcuts="Control+S Meta+S"
              >
                {savingBrief ? "Saving..." : "Save Brief"}
              </button>
              <div className="mx-1 h-5 w-px shrink-0 bg-[var(--color-border)]" />
              <span className="inline-flex" title={headerPrimaryDisabled ? headerPrimaryTooltip : undefined}>
                <button
                  type="button"
                  className="btn-primary flex h-8 items-center gap-2 px-4 text-xs shadow-sm sm:text-sm"
                  disabled={headerPrimaryDisabled}
                  onClick={handleHeaderPrimaryAction}
                  aria-keyshortcuts={activeStep === "generate" ? "Control+Enter Meta+Enter" : undefined}
                  aria-label={headerPrimaryLabel}
                >
                  {(activeStep === "generate" && generating) || (activeStep === "blocks" && transitioningToGenerate) ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {headerPrimaryLabel}
                    </span>
                  ) : (
                    headerPrimaryLabel
                  )}
                </button>
              </span>
            </div>
          </div>
        </div>
      </header>

      {transitioningToGenerate ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-4 top-[calc(var(--content-sticky-top)+0.75rem)] z-[250] max-w-[320px] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 px-3 py-2 shadow-lg backdrop-blur-sm"
        >
          <p className="text-sm font-semibold text-[color:var(--color-text)]">Switching to Generate &amp; Review</p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Preparing your draft workspace…</p>
        </div>
      ) : null}

      <div id="email-copy-main-panel" className="space-y-4 sm:space-y-5">
        {stepNavigation}

          {activeStep === "brief" ? (
            <article className="card p-3.5 ring-1 ring-[color:var(--color-primary)]/40 sm:p-5 lg:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Step 1</p>
                <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Brief Intake</h2>
              </div>
              <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center">
                <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={handleParseBrief} disabled={!clean(rawBriefInput).length}>
                  Parse brief
                </button>
                <button
                  type="button"
                  className={`btn-primary ${CONTROL_BUTTON_CLASS}`}
                  onClick={() => void runAiExtract()}
                  disabled={extracting || !clean(rawBriefInput).length}
                >
                  {extracting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      AI Extract
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Bot className="h-4 w-4" />
                      AI Extract
                    </span>
                  )}
                </button>
                <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={() => setActiveStep("blocks")} disabled={!briefReady}>
                  Next
                </button>
              </div>
            </div>

            <label className="mt-3 block space-y-1 text-sm sm:mt-4">
              <span className={FIELD_LABEL_CLASS}>Raw client brief</span>
              <textarea
                className="input min-h-[140px] w-full sm:min-h-[170px]"
                value={rawBriefInput}
                onChange={(event) => setRawBriefInput(event.target.value)}
                placeholder="Paste full client brief here..."
                lang="fr"
                spellCheck
              />
            </label>

            {!clean(rawBriefInput).length ? (
              <div className="mt-3 rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/45 px-3 py-2 text-xs text-[var(--color-muted)]">
                Paste the full brief first, then use Parse brief to prefill campaign and blocks.
              </div>
            ) : null}

            {extractResult ? (
              <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[color:var(--color-text)]">
                    AI Extract · {extractResult.source === "local-fallback" ? "Fallback" : "OpenAI"}
                  </p>
                  <p className="text-[var(--color-muted)]">{extractResult.model}</p>
                </div>
                {extractResult.warnings.length > 0 ? (
                  <p className="mt-1 text-amber-700">{extractResult.warnings[0]}</p>
                ) : (
                  <p className="mt-1 text-emerald-700">Extraction completed with structured fields ready for mapping.</p>
                )}
              </div>
            ) : null}

            <div className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm md:col-span-2">
                <span className={FIELD_LABEL_CLASS}>Campaign name</span>
                <input className="input w-full" value={brief.campaignName} onChange={(event) => updateBriefField("campaignName", event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className={FIELD_LABEL_CLASS}>Status</span>
                <input className="input w-full" value={briefStatus} onChange={(event) => setBriefStatus(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className={FIELD_LABEL_CLASS}>Send date</span>
                <input className="input w-full" value={brief.sendDate || ""} onChange={(event) => updateBriefField("sendDate", event.target.value || null)} lang="fr" />
              </label>
              <label className="space-y-1 text-sm">
                <span className={FIELD_LABEL_CLASS}>
                  Subject ({countChars(brief.sourceSubject)}/{EMAIL_COPY_CHAR_LIMITS.subject})
                </span>
                <input className="input w-full" value={brief.sourceSubject || ""} onChange={(event) => updateBriefField("sourceSubject", event.target.value || null)} lang="fr" />
              </label>
              <label className="space-y-1 text-sm">
                <span className={FIELD_LABEL_CLASS}>
                  Preheader ({countChars(brief.sourcePreheader)}/{EMAIL_COPY_CHAR_LIMITS.preheader})
                </span>
                <input className="input w-full" value={brief.sourcePreheader || ""} onChange={(event) => updateBriefField("sourcePreheader", event.target.value || null)} lang="fr" />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className={FIELD_LABEL_CLASS}>Offer summary</span>
                <textarea className="input min-h-[74px] w-full" value={brief.offerSummary || ""} onChange={(event) => updateBriefField("offerSummary", event.target.value || null)} lang="fr" spellCheck />
              </label>
            </div>
            </article>
          ) : null}

          {activeStep === "blocks" ? (
            <article className="card p-3.5 ring-1 ring-[color:var(--color-primary)]/40 sm:p-5 lg:p-6" aria-busy={transitioningToGenerate}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Step 2</p>
                <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Block Mapping Builder</h2>
              </div>
              <div className="grid w-full grid-cols-4 gap-2 sm:flex sm:w-auto sm:items-center">
                <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={() => setActiveStep("brief")} disabled={step2ButtonsDisabled}>
                  Back
                </button>
                <button
                  type="button"
                  className={`btn-primary ${CONTROL_BUTTON_CLASS}`}
                  onClick={() => void runAiOptimize()}
                  disabled={optimizing || !briefReady || step2ButtonsDisabled}
                >
                  {optimizing ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      AI Optimize
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Bot className="h-4 w-4" />
                      AI Optimize
                    </span>
                  )}
                </button>
                <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={() => addBlock()} disabled={step2ButtonsDisabled}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add block
                </button>
                <button type="button" className={`btn-primary ${CONTROL_BUTTON_CLASS}`} onClick={goToGenerateStep} disabled={!blocksReady || step2ButtonsDisabled}>
                  {transitioningToGenerate ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Switching
                    </span>
                  ) : (
                    "Next"
                  )}
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={[
                  `btn-ghost ${CONTROL_BUTTON_CLASS}`,
                  canvasInlineEditMode
                    ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/12 text-[color:var(--color-primary)]"
                    : "",
                ].join(" ")}
                onClick={() => setCanvasInlineEditMode((prev) => !prev)}
                aria-pressed={canvasInlineEditMode}
                disabled={step2ButtonsDisabled}
              >
                Inline edit: {canvasInlineEditMode ? "On" : "Off"}
              </button>
              <span className="text-xs text-[var(--color-muted)]">
                {canvasInlineEditMode
                  ? "Click title/content in selected canvas block to edit."
                  : "Enable inline edit to modify text directly on canvas."}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 lg:hidden">
              <button
                type="button"
                className={`btn-ghost ${CONTROL_BUTTON_CLASS}`}
                onClick={() => setMobileLibraryOpen(true)}
                disabled={step2ButtonsDisabled}
              >
                Library
              </button>
              <button
                type="button"
                className={`btn-ghost ${CONTROL_BUTTON_CLASS}`}
                onClick={() => setMobileInspectorOpen(true)}
                disabled={!selectedBlock || step2ButtonsDisabled}
              >
                Inspector
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[color:var(--color-text)]/86">Blocks ready</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {mappedBlocksCount}/{brief.blocks.length}
                    </p>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 w-full rounded-full bg-[color:var(--color-border)]/70"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={readinessPercent}
                    aria-label="Blocks readiness"
                  >
                    <div
                      className={[
                        "h-full rounded-full transition-all",
                        readinessPercent === 100
                          ? "bg-emerald-500"
                          : readinessPercent === 0
                            ? "bg-slate-400"
                            : "bg-amber-500",
                      ].join(" ")}
                      style={{ width: `${readinessPercent}%` }}
                      aria-hidden
                    />
                  </div>
                </div>

                {!blocksReady ? (
                  <button
                    type="button"
                    className="btn-ghost h-8 px-2.5 text-xs"
                    onClick={focusFirstIncompleteBlock}
                  >
                    Show incomplete blocks
                  </button>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    All ready
                  </span>
                )}
              </div>
            </div>

            {optimizeResult ? (
              <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[color:var(--color-text)]">
                    AI Optimize · {optimizeResult.source === "local-fallback" ? "Fallback" : "OpenAI"}
                  </p>
                  <p className="text-[var(--color-muted)]">
                    {optimizeResult.model} · {optimizeResult.changes.length} changes
                  </p>
                </div>
                {optimizeResult.warnings.length > 0 ? (
                  <p className="mt-1 text-amber-700">{optimizeResult.warnings[0]}</p>
                ) : (
                  <p className="mt-1 text-emerald-700">Blocks optimized for limits and generation quality.</p>
                )}
              </div>
            ) : null}

            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragStart={handleBuilderDragStart}
              onDragOver={handleBuilderDragOver}
              onDragCancel={handleBuilderDragCancel}
              onDragEnd={handleBuilderDragEnd}
            >
              <div
                className={[
                  "mt-3 grid gap-3",
                  libraryCollapsed
                    ? "lg:grid-cols-[84px_minmax(0,1fr)_360px]"
                    : "lg:grid-cols-[280px_minmax(0,1fr)_360px]",
                ].join(" ")}
              >
                <aside id="email-copy-block-library" className="hidden lg:block">
                  <BlockLibraryPanel
                    clientSlug={clientSlug}
                    collapsed={libraryCollapsed}
                    onToggleCollapsed={() => setLibraryCollapsed((prev) => !prev)}
                    onAddBlock={(blockType) => addBlock(blockType)}
                  />
                </aside>

                <EmailCanvas
                  clientSlug={clientSlug}
                  blocks={brief.blocks}
                  selectedBlockId={selectedBlockId}
                  brandTheme={blockPreviewTheme}
                  insertionIndex={activeDragState?.source === "library" ? dragInsertIndex : null}
                  inlineEditMode={canvasInlineEditMode}
                  onSelectBlock={(blockId) => setSelectedBlockId(blockId)}
                  onInlineCommit={handleInlineCanvasCommit}
                  onMoveUp={(index) => moveBlock(index, index - 1)}
                  onMoveDown={(index) => moveBlock(index, index + 1)}
                  onDuplicate={duplicateBlock}
                  onDelete={removeBlock}
                  onRequestAddBlock={() => {
                    if (window.matchMedia("(max-width: 1023px)").matches) {
                      setMobileLibraryOpen(true);
                      return;
                    }
                    document.getElementById("email-copy-block-library")?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    });
                  }}
                />

                <aside className="hidden lg:block">{inspectorPanel}</aside>
              </div>

              {mobileLibraryOpen ? (
              <div className="fixed inset-0 z-[215] lg:hidden">
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute inset-0 bg-slate-950/45"
                  onClick={() => setMobileLibraryOpen(false)}
                  aria-label="Close block library"
                />
                <aside className="absolute left-0 top-0 h-full w-full max-w-[320px] border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-[color:var(--color-text)]">Block Library</p>
                    <button
                      type="button"
                      className={`btn-ghost h-8 px-2 text-xs ${FOCUS_RING_CLASS}`}
                      onClick={() => setMobileLibraryOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                  <BlockLibraryPanel
                    clientSlug={clientSlug}
                    showCollapseToggle={false}
                    onAddBlock={(blockType) => {
                      addBlock(blockType);
                      setMobileLibraryOpen(false);
                    }}
                  />
                </aside>
              </div>
              ) : null}

              {mobileInspectorOpen ? (
              <div className="fixed inset-0 z-[216] lg:hidden">
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute inset-0 bg-slate-950/45"
                  onClick={() => setMobileInspectorOpen(false)}
                  aria-label="Close block inspector"
                />
                <aside className="absolute right-0 top-0 h-full w-full max-w-[380px] border-l border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-[color:var(--color-text)]">Inspector</p>
                    <button
                      type="button"
                      className={`btn-ghost h-8 px-2 text-xs ${FOCUS_RING_CLASS}`}
                      onClick={() => setMobileInspectorOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-[calc(100vh-84px)] overflow-y-auto pr-1">{inspectorPanel}</div>
                </aside>
              </div>
              ) : null}

              <DragOverlay dropAnimation={null}>
                {activeDragState ? (
                  <div className="rounded-lg border border-[color:var(--color-primary)]/40 bg-[color:var(--color-surface)] px-3 py-2 text-xs font-semibold text-[color:var(--color-text)] shadow-lg">
                    {activeDragState.source === "library"
                      ? `+ ${activeDragState.label}`
                      : activeDragState.label}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            </article>
          ) : null}

          {activeStep === "generate" ? (
            <article
              className={[
                "card p-3.5 ring-1 ring-[color:var(--color-primary)]/40 sm:p-5 lg:p-6",
                prefersReducedMotion ? "" : "transition-[opacity,transform] duration-250 ease-out",
                step3EntryClass,
              ].join(" ")}
            >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Step 3</p>
                <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Generate & Review</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)] sm:text-sm">
                  Generate variants, run QA, and review copy output before exporting to Brevo.
                </p>
              </div>
              <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS} w-full sm:w-auto`} onClick={() => setActiveStep("blocks")}>
                Back
              </button>
            </div>

            <div className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className={FIELD_LABEL_CLASS}>Variants</span>
                <select className="input w-full" value={variantCount} onChange={(event) => setVariantCount(Number(event.target.value) || 1)}>
                  {VARIANT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className={FIELD_LABEL_CLASS}>Model</span>
                <select className="input w-full" value={model} onChange={(event) => setModel(event.target.value as GenerationModel)}>
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!generatedReady ? (
              <div className="mt-3 rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/45 px-3 py-2 text-xs text-[var(--color-muted)]">
                Generate variants to populate the review workspace and enable Save drafts.
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                className={`btn-primary ${CONTROL_BUTTON_CLASS}`}
                disabled={generating}
                onClick={() => void generateCopy()}
                aria-keyshortcuts="Control+Enter Meta+Enter"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating
                  </span>
                ) : (
                  "Generate variants"
                )}
              </button>
              <button
                type="button"
                className={`btn-ghost ${CONTROL_BUTTON_CLASS}`}
                disabled={runningQa || !variants.length}
                onClick={() => void runQa()}
              >
                {runningQa ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running QA
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" />
                    Run QA
                  </span>
                )}
              </button>
              <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} disabled={savingDrafts || !variants.length} onClick={() => void saveDrafts()}>
                {savingDrafts ? "Saving..." : "Save drafts"}
              </button>
            </div>

            {qaResult ? (
              <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[color:var(--color-text)]">QA snapshot</p>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
                      qaResult.overall === "fail"
                        ? "bg-red-100 text-red-700"
                        : qaResult.overall === "warn"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700",
                    ].join(" ")}
                  >
                    {qaResult.overall}
                  </span>
                </div>
                <p className="mt-1 text-[var(--color-muted)]">
                  {qaResult.model} · {qaResult.source} ·{" "}
                  {qaResult.checks.filter((check) => check.status === "pass").length}/{qaResult.checks.length} checks pass
                </p>
                {currentVisualQa ? (
                  <p className="mt-1 text-[var(--color-muted)]">
                    Active variant visual warnings: {currentVisualQa.totalWarnings}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={`btn-ghost mt-2 h-8 px-2.5 text-xs ${FOCUS_RING_CLASS}`}
                  onClick={scrollToOutput}
                >
                  Open full review
                </button>
              </div>
            ) : null}
            </article>
          ) : null}

        {showOutputPanel ? (
          <article
            id="email-copy-output-panel"
            className={[
              "card overflow-hidden",
              prefersReducedMotion ? "" : "transition-[opacity,transform] duration-250 ease-out",
              step3EntryClass,
            ].join(" ")}
          >
            <header className="border-b border-[color:var(--color-border)] px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Review</p>
                  <h2 className="text-base font-semibold text-[color:var(--color-text)] sm:text-lg">Review Output</h2>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="text-right text-[11px] text-[var(--color-muted)] sm:text-xs">
                    {generatedModel ? (
                      <>
                        <p className="font-medium text-[color:var(--color-text)]/80">{generatedModel}</p>
                        <p className="uppercase tracking-[0.08em]">{generatedSource}</p>
                      </>
                    ) : (
                      "No generation yet"
                    )}
                  </div>
                  <button
                    type="button"
                    className={`btn-ghost ${CONTROL_BUTTON_CLASS} px-2.5`}
                    onClick={() => setMobileOutputOpen((prev) => !prev)}
                    aria-expanded={mobileOutputOpen}
                    aria-controls="email-copy-output-content"
                  >
                    {mobileOutputOpen ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </header>

            <div
              id="email-copy-output-content"
              className={[
                "p-4 sm:p-5",
                mobileOutputOpen ? "block" : "hidden xl:block",
              ].join(" ")}
            >
              {!variants.length ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/45 p-4 text-[13px] leading-5 text-[var(--color-muted)] sm:p-5">
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">No variants generated yet.</p>
                  <p className="mt-1.5">Complete Step 1 and Step 2, then run generation from Step 3.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={() => setActiveStep("brief")}>
                      Go to Step 1
                    </button>
                    <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={() => setActiveStep("blocks")}>
                      Go to Step 2
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5 sm:space-y-4">
                  {runningQa ? (
                    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/65 px-3 py-2 text-xs text-[color:var(--color-text)]/80">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running QA checks...
                      </span>
                    </div>
                  ) : null}

                  {qaResult ? (
                    <div className={OUTPUT_CARD_CLASS}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={OUTPUT_META_CLASS}>QA Summary</p>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
                            qaResult.overall === "fail"
                              ? "bg-red-100 text-red-700"
                              : qaResult.overall === "warn"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700",
                          ].join(" ")}
                        >
                          {qaResult.overall}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--color-text)]/70">
                        {qaResult.model} · {qaResult.source}
                      </p>
                      <div className="mt-2 space-y-1 text-xs">
                        {qaResult.checks.slice(0, 3).map((check) => (
                          <p key={check.id} className="text-[color:var(--color-text)]/80">
                            {check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✕"} {check.label}: {check.message}
                          </p>
                        ))}
                      </div>
                      {currentVisualQa ? (
                        <p className="mt-1.5 text-xs text-[color:var(--color-text)]/72">
                          Visual QA (active variant): {currentVisualQa.totalWarnings} warning(s).
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className={`btn-ghost mt-2 h-8 px-2.5 text-xs ${FOCUS_RING_CLASS}`}
                        onClick={() => setQaDetailsOpen((prev) => !prev)}
                      >
                        {qaDetailsOpen ? "Hide details" : "Show details"}
                      </button>
                      {qaDetailsOpen ? (
                        <div className="mt-2 space-y-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2.5 text-xs">
                          {qaResult.variantReports.map((report) => (
                            <div key={report.variantIndex}>
                              <p className="font-semibold text-[color:var(--color-text)]">
                                Variant {report.variantIndex} · {report.status}
                              </p>
                              {report.issues.length > 0 ? (
                                <div className="mt-1 space-y-0.5 text-[color:var(--color-text)]/80">
                                  {report.issues.map((issue, idx) => (
                                    <p key={`${issue}-${idx}`}>- {issue}</p>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-1 text-emerald-700">No issues detected.</p>
                              )}
                            </div>
                          ))}
                          <div className="border-t border-[color:var(--color-border)] pt-2">
                            <p className="font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text)]/72">
                              Visual QA
                            </p>
                            <div className="mt-1.5 space-y-2">
                              {variants.map((variant) => {
                                const visualReport = visualQaByVariant[variant.index];
                                const warnings = visualReport?.warnings || [];
                                return (
                                  <div key={`visual-${variant.index}`}>
                                    <p className="font-medium text-[color:var(--color-text)]/86">
                                      Variant {variant.index} - {warnings.length} warning(s)
                                    </p>
                                    {warnings.length > 0 ? (
                                      <div className="mt-1 space-y-1">
                                        {warnings.map((warning, idx) => (
                                          <button
                                            key={`${warning.code}-${warning.blockId}-${idx}`}
                                            type="button"
                                            className={`block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/55 px-2 py-1 text-left text-[11px] text-[color:var(--color-text)]/82 ${FOCUS_RING_CLASS}`}
                                            onClick={() =>
                                              scrollToOutputBlock(variant.index, warning.blockId, warning.blockIndex)
                                            }
                                          >
                                            [{warning.code}] Block {warning.blockIndex + 1}: {warning.message}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="mt-1 text-emerald-700">No visual warnings.</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <p className={OUTPUT_META_CLASS}>
                    Variants ({variants.length}){currentVariant ? ` - Active ${currentVariant.index}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2" role="tablist" aria-label="Generated variants">
                    {variants.map((variant) => (
                      <button
                        key={variant.index}
                        type="button"
                        className={[
                          `rounded-lg border h-9 px-3 text-xs font-medium sm:text-sm ${FOCUS_RING_CLASS}`,
                          activeVariant === variant.index
                            ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/12 text-[color:var(--color-text)] shadow-sm"
                            : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/72",
                        ].join(" ")}
                        onClick={() => setActiveVariant(variant.index)}
                        role="tab"
                        aria-selected={activeVariant === variant.index}
                      >
                        Variant {variant.index}
                      </button>
                    ))}
                  </div>

                  {currentVariant ? (
                    <>
                      <div className={OUTPUT_CARD_CLASS}>
                        <div className="flex items-center justify-between gap-2">
                          <p className={OUTPUT_META_CLASS}>
                            Subject ({countChars(currentVariant.subject)}/{EMAIL_COPY_CHAR_LIMITS.subject})
                          </p>
                          <button type="button" className={`btn-ghost h-9 px-2.5 text-xs sm:text-sm ${FOCUS_RING_CLASS}`} onClick={() => void copyText(currentVariant.subject, "Subject")}>
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy
                          </button>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--color-text)] sm:text-sm">{currentVariant.subject}</p>
                      </div>

                      <div className={OUTPUT_CARD_CLASS}>
                        <div className="flex items-center justify-between gap-2">
                          <p className={OUTPUT_META_CLASS}>
                            Preheader ({countChars(currentVariant.preheader)}/{EMAIL_COPY_CHAR_LIMITS.preheader})
                          </p>
                          <button type="button" className={`btn-ghost h-9 px-2.5 text-xs sm:text-sm ${FOCUS_RING_CLASS}`} onClick={() => void copyText(currentVariant.preheader, "Preheader")}>
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy
                          </button>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--color-text)] sm:text-sm">{currentVariant.preheader}</p>
                      </div>

                      {currentVariant.blocks.map((block, index) => {
                        const briefBlockForPreview =
                          brief.blocks.find((entry) => entry.id === block.id) || brief.blocks[index];
                        const resolvedTemplateKey =
                          getTemplateDef(block.templateKey, clientSlug)?.key ||
                          getTemplateDef(briefBlockForPreview?.templateKey, clientSlug)?.key ||
                          getDefaultTemplateForType(block.blockType, clientSlug);
                        const resolvedLayoutSpec =
                          (block.layoutSpec as Record<string, unknown> | undefined) ||
                          (briefBlockForPreview?.layoutSpec as Record<string, unknown> | undefined) ||
                          getTemplateDef(resolvedTemplateKey, clientSlug)?.defaultLayoutSpec;
                        const previewStateKey = getPreviewStateKey(currentVariant.index, block.id, index);
                        const previewEnabled = Boolean(previewVisibilityByBlock[previewStateKey]);
                        const outputBlockAnchorId = getOutputBlockAnchorId(currentVariant.index, block.id, index);
                        const visualBlockWarnings =
                          currentVisualQa?.blocks.find(
                            (entry) => entry.blockId === block.id && entry.blockIndex === index
                          )?.warnings || [];
                        const warningStateKey = getWarningStateKey(currentVariant.index, block.id, index);
                        const warningsExpanded = Boolean(warningVisibilityByBlock[warningStateKey]);

                        return (
                          <div id={outputBlockAnchorId} key={`${block.id}-${index}`} className={OUTPUT_CARD_CLASS}>
                            <div className="flex items-center justify-between gap-2">
                              <p className={OUTPUT_META_CLASS}>
                                Block {index + 1} - {BLOCK_TYPE_OPTIONS.find((entry) => entry.value === block.blockType)?.label ?? block.blockType}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={[
                                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    visualBlockWarnings.length > 0
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-100 text-slate-600",
                                  ].join(" ")}
                                >
                                  {visualBlockWarnings.length} warning{visualBlockWarnings.length === 1 ? "" : "s"}
                                </span>
                                {visualBlockWarnings.length > 0 ? (
                                  <button
                                    type="button"
                                    className={`btn-ghost h-9 px-2.5 text-xs sm:text-sm ${FOCUS_RING_CLASS}`}
                                    onClick={() => toggleBlockWarnings(warningStateKey)}
                                    aria-expanded={warningsExpanded}
                                  >
                                    {warningsExpanded ? "Hide warnings" : "Warnings"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={`btn-ghost h-9 px-2.5 text-xs sm:text-sm ${FOCUS_RING_CLASS}`}
                                  onClick={() => toggleBlockPreview(previewStateKey)}
                                  aria-pressed={previewEnabled}
                                >
                                  {previewEnabled ? "Hide preview" : "Preview"}
                                </button>
                                <button type="button" className={`btn-ghost h-9 px-2.5 text-xs sm:text-sm ${FOCUS_RING_CLASS}`} onClick={() => void copyText(`${block.title}\n${block.subtitle}\n${block.content}\nCTA: ${block.ctaLabel}`, `Block ${index + 1}`)}>
                                  <Copy className="mr-1 h-3.5 w-3.5" />
                                  Copy
                                </button>
                              </div>
                            </div>
                            {previewEnabled ? (
                              <div className="mt-2.5">
                                <BlockTemplateRenderer
                                  templateKey={resolvedTemplateKey}
                                  blockType={block.blockType}
                                  blockData={{
                                    title: block.title,
                                    subtitle: block.subtitle,
                                    content: block.content,
                                    ctaLabel: block.ctaLabel,
                                  }}
                                  brandTheme={blockPreviewTheme}
                                  layoutSpec={resolvedLayoutSpec}
                                  renderSlots={block.renderSlots}
                                />
                              </div>
                            ) : null}
                            {warningsExpanded && visualBlockWarnings.length > 0 ? (
                              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                                {visualBlockWarnings.map((warning, warningIndex) => (
                                  <p key={`${warning.code}-${warning.field}-${warningIndex}`}>
                                    [{warning.code}] {warning.message}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                            <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[color:var(--color-text)] sm:text-sm">{block.title}</p>
                            <p className="mt-1 text-[13px] leading-5 text-[color:var(--color-text)]/70 sm:text-sm">{block.subtitle}</p>
                            <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--color-text)] sm:text-sm">{block.content}</p>
                            <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--color-text)]/64 sm:text-xs">CTA: {block.ctaLabel}</p>
                          </div>
                        );
                      })}

                      {currentVariant.warnings.length > 0 ? (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          <p className="mb-1 font-semibold uppercase tracking-[0.12em]">Warnings</p>
                          {currentVariant.warnings.map((warning, idx) => (
                            <p key={`${warning}-${idx}`}>- {warning}</p>
                          ))}
                        </div>
                      ) : null}

                      <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS} w-full`} onClick={() => void copyText(formatVariantClipboard(currentVariant), "Variant")}>
                        <Copy className="mr-1 h-4 w-4" />
                        Copy full variant
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </article>
        ) : null}
      </div>

      {brandDrawerOpen ? (
        <div className="fixed inset-0 z-[220]">
          <button type="button" tabIndex={-1} className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={closeBrandDrawer} aria-label="Close brand kit drawer" />
          <aside
            ref={brandDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="saveurs-brand-kit-title"
            className="absolute right-0 top-0 h-full w-full max-w-[520px] border-l border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-[color:var(--color-primary)]" />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Brand</p>
                  <h3 id="saveurs-brand-kit-title" className="text-lg font-semibold text-[color:var(--color-text)]">Saveurs Brand Kit</h3>
                </div>
              </div>
              <button ref={brandDrawerCloseButtonRef} type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={closeBrandDrawer}>
                Close
              </button>
            </header>

            <div className="h-[calc(100%-124px)] overflow-y-auto px-4 py-3.5 sm:h-[calc(100%-132px)] sm:px-5 sm:py-4">
              <div className="space-y-2.5 sm:space-y-3">
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Brand name</span>
                  <input className="input w-full" value={brandProfile.brandName} onChange={(event) => setBrandProfile((prev) => ({ ...prev, brandName: event.target.value }))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Audience</span>
                  <textarea className="input min-h-[70px] w-full" value={brandProfile.audience} onChange={(event) => setBrandProfile((prev) => ({ ...prev, audience: event.target.value }))} lang="fr" spellCheck />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Tone summary</span>
                  <textarea className="input min-h-[70px] w-full" value={brandProfile.toneSummary} onChange={(event) => setBrandProfile((prev) => ({ ...prev, toneSummary: event.target.value }))} lang="fr" spellCheck />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Tone do (line by line)</span>
                  <textarea className="input min-h-[88px] w-full" value={brandProfile.toneDo.join("\n")} onChange={(event) => setBrandProfile((prev) => ({ ...prev, toneDo: splitLines(event.target.value) }))} lang="fr" spellCheck />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Tone don't (line by line)</span>
                  <textarea className="input min-h-[88px] w-full" value={brandProfile.toneDont.join("\n")} onChange={(event) => setBrandProfile((prev) => ({ ...prev, toneDont: splitLines(event.target.value) }))} lang="fr" spellCheck />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Mandatory terms (comma separated)</span>
                  <input className="input w-full" value={brandProfile.mandatoryTerms.join(", ")} onChange={(event) => setBrandProfile((prev) => ({ ...prev, mandatoryTerms: splitCsv(event.target.value) }))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Forbidden terms (comma separated)</span>
                  <input className="input w-full" value={brandProfile.forbiddenTerms.join(", ")} onChange={(event) => setBrandProfile((prev) => ({ ...prev, forbiddenTerms: splitCsv(event.target.value) }))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Proof points (line by line)</span>
                  <textarea className="input min-h-[88px] w-full" value={brandProfile.proofPoints.join("\n")} onChange={(event) => setBrandProfile((prev) => ({ ...prev, proofPoints: splitLines(event.target.value) }))} lang="fr" spellCheck />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>CTA style</span>
                  <input className="input w-full" value={brandProfile.ctaStyle} onChange={(event) => setBrandProfile((prev) => ({ ...prev, ctaStyle: event.target.value }))} lang="fr" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={FIELD_LABEL_CLASS}>Legal guardrails</span>
                  <textarea className="input min-h-[88px] w-full" value={brandProfile.legalGuardrails || ""} onChange={(event) => setBrandProfile((prev) => ({ ...prev, legalGuardrails: event.target.value || null }))} lang="fr" spellCheck />
                </label>
              </div>
            </div>

            <footer className="sticky bottom-0 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3 sm:px-5">
              <div className="flex items-center justify-end gap-2">
                <button type="button" className={`btn-ghost ${CONTROL_BUTTON_CLASS}`} onClick={closeBrandDrawer}>
                  Cancel
                </button>
                <button type="button" className={`btn-primary ${CONTROL_BUTTON_CLASS}`} disabled={savingBrand} onClick={() => void saveBrandProfile()}>
                  {savingBrand ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving
                    </span>
                  ) : (
                    "Save Brand Kit"
                  )}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
