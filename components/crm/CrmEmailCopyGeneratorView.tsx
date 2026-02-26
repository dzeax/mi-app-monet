"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { parseEmailCopyBrief } from "@/lib/crm/emailCopyBriefParser";
import {
  DEFAULT_EMAIL_COPY_VARIANT_COUNT,
  EMAIL_COPY_BLOCK_CONTENT_LIMITS,
  EMAIL_COPY_CHAR_LIMITS,
  SAVEURS_DEFAULT_BRAND_PROFILE,
  type BrevoBlockType,
  type EmailCopyBrandProfile,
  type EmailCopyBrief,
  type EmailCopyVariant,
} from "@/lib/crm/emailCopyConfig";
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

type GenerationModel = "gpt-5-mini" | "gpt-4-turbo" | "gpt-4o-mini";
const BLOCK_TYPE_OPTIONS: Array<{ value: BrevoBlockType; label: string }> = [
  { value: "hero", label: "Hero" },
  { value: "three_columns", label: "3 columns" },
  { value: "two_columns", label: "2 columns" },
  { value: "image_text_side_by_side", label: "Image + text" },
];

function createEmptyBrief(): EmailCopyBrief {
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
      { id: "block-1", blockType: "hero", sourceTitle: null, sourceContent: null, ctaLabel: null, ctaUrl: null },
      {
        id: "block-2",
        blockType: "three_columns",
        sourceTitle: null,
        sourceContent: null,
        ctaLabel: null,
        ctaUrl: null,
      },
      { id: "block-3", blockType: "two_columns", sourceTitle: null, sourceContent: null, ctaLabel: null, ctaUrl: null },
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

function countChars(value: string | null | undefined): number {
  return value ? [...value].length : 0;
}

function normalizeBrief(brief: EmailCopyBrief): EmailCopyBrief {
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
      id: clean(block.id) || `block-${idx + 1}`,
      blockType: block.blockType,
      sourceTitle: block.sourceTitle ? block.sourceTitle.trim() : null,
      sourceContent: block.sourceContent ? block.sourceContent.trim() : null,
      ctaLabel: block.ctaLabel ? clean(block.ctaLabel) : null,
      ctaUrl: block.ctaUrl ? clean(block.ctaUrl) : null,
    })),
  };
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
    lines.push("", `Block ${index + 1} (${block.blockType})`, `Title: ${block.title}`);
    lines.push(`Subtitle: ${block.subtitle}`, `Content: ${block.content}`, `CTA: ${block.ctaLabel}`);
  });
  return lines.join("\n");
}

export default function CrmEmailCopyGeneratorView({ clientSlug, clientLabel }: CrmEmailCopyGeneratorViewProps) {
  const [rawBriefInput, setRawBriefInput] = useState("");
  const [brief, setBrief] = useState<EmailCopyBrief>(() => createEmptyBrief());
  const [briefStatus, setBriefStatus] = useState("");
  const [brandProfile, setBrandProfile] = useState<EmailCopyBrandProfile>(SAVEURS_DEFAULT_BRAND_PROFILE);

  const [variantCount, setVariantCount] = useState(DEFAULT_EMAIL_COPY_VARIANT_COUNT);
  const [model, setModel] = useState<GenerationModel>("gpt-4o-mini");
  const [variants, setVariants] = useState<EmailCopyVariant[]>([]);
  const [activeVariant, setActiveVariant] = useState(1);
  const [generatedModel, setGeneratedModel] = useState<string | null>(null);
  const [generatedSource, setGeneratedSource] = useState<"openai" | "local-fallback" | null>(null);

  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [selectedBriefId, setSelectedBriefId] = useState("");

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingDrafts, setSavingDrafts] = useState(false);

  const currentVariant = useMemo(
    () => variants.find((variant) => variant.index === activeVariant) || null,
    [variants, activeVariant]
  );

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
          setActiveBriefId(payload.selectedBrief.id);
          setSelectedBriefId(payload.selectedBrief.id);
          setBrief((payload.selectedBrief.brief as EmailCopyBrief) || createEmptyBrief());
          setBriefStatus(payload.selectedBrief.status || "");
          setRawBriefInput((payload.selectedBrief.brief as EmailCopyBrief | null)?.rawBriefText || "");
        }

        const sortedDrafts = (payload.drafts || []).sort((a, b) => a.variantIndex - b.variantIndex);
        if (sortedDrafts.length > 0) {
          setVariants(sortedDrafts.map((entry) => entry.draft));
          setGeneratedModel(sortedDrafts[0].model);
          setGeneratedSource(sortedDrafts[0].source);
          setActiveVariant(sortedDrafts[0].draft.index || 1);
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
      nextBlocks[blockIndex] = { ...nextBlocks[blockIndex], [key]: value };
      return { ...prev, blocks: nextBlocks };
    });
  };

  const addBlock = () => {
    setBrief((prev) => ({
      ...prev,
      blocks: [
        ...prev.blocks,
        {
          id: `block-${prev.blocks.length + 1}`,
          blockType: "image_text_side_by_side",
          sourceTitle: null,
          sourceContent: null,
          ctaLabel: null,
          ctaUrl: null,
        },
      ],
    }));
  };

  const removeBlock = (blockIndex: number) => {
    setBrief((prev) => {
      if (prev.blocks.length <= 1) return prev;
      return {
        ...prev,
        blocks: prev.blocks.filter((_, index) => index !== blockIndex),
      };
    });
  };

  const saveBrief = useCallback(async () => {
    setSavingBrief(true);
    try {
      const response = await fetch("/api/crm/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveBrief",
          client: clientSlug,
          briefId: activeBriefId,
          status: briefStatus || null,
          brief: normalizeBrief({ ...brief, rawBriefText: rawBriefInput || brief.rawBriefText || null }),
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
  }, [activeBriefId, brief, briefStatus, clientSlug, fetchWorkspace, rawBriefInput]);

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
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save brand profile");
    } finally {
      setSavingBrand(false);
    }
  };

  const generateCopy = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/ai/email-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSlug,
          model,
          variantCount,
          brandProfile: normalizeBrand(brandProfile),
          brief: normalizeBrief({ ...brief, rawBriefText: rawBriefInput || brief.rawBriefText || null }),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Generation failed (${response.status})`);
      const generated = Array.isArray(payload?.variants) ? (payload.variants as EmailCopyVariant[]) : [];
      if (!generated.length) throw new Error("No variants generated.");
      setVariants(generated);
      setGeneratedModel((payload?.model as string | undefined) || model);
      setGeneratedSource((payload?.source as "openai" | "local-fallback" | undefined) || "openai");
      setActiveVariant(generated[0].index);
      showSuccess("Variants generated.");
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

  return (
    <section className="space-y-5" data-page="crm-email-copy-generator">
      <header className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-[color:var(--color-text)]">Email Copy Generator</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
          {clientLabel ?? clientSlug}: French only, always vouvoiement, and Brevo block limits enforced.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-5">
          <article className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[color:var(--color-text)]">Saved briefs</h2>
              <span className="text-xs text-[color:var(--color-text-muted)]">{loading ? "Loading..." : `${briefs.length} item(s)`}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <select className="input flex-1" value={selectedBriefId} onChange={(event) => setSelectedBriefId(event.target.value)}>
                <option value="">Select brief</option>
                {briefs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.campaignName} {item.sendDate ? `| ${item.sendDate}` : ""}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost" disabled={!selectedBriefId} onClick={() => void fetchWorkspace(selectedBriefId)}>
                Load
              </button>
            </div>
          </article>

          <article className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[color:var(--color-text)]">Brand profile</h2>
              <button type="button" className="btn-ghost" disabled={savingBrand} onClick={() => void saveBrandProfile()}>
                {savingBrand ? "Saving..." : "Save profile"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-[color:var(--color-text-muted)]">Tone summary</span>
                <textarea className="input min-h-[64px]" value={brandProfile.toneSummary} onChange={(event) => setBrandProfile((prev) => ({ ...prev, toneSummary: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[color:var(--color-text-muted)]">Tone do (line by line)</span>
                <textarea className="input min-h-[96px]" value={brandProfile.toneDo.join("\n")} onChange={(event) => setBrandProfile((prev) => ({ ...prev, toneDo: splitLines(event.target.value) }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[color:var(--color-text-muted)]">Tone don't (line by line)</span>
                <textarea className="input min-h-[96px]" value={brandProfile.toneDont.join("\n")} onChange={(event) => setBrandProfile((prev) => ({ ...prev, toneDont: splitLines(event.target.value) }))} />
              </label>
            </div>
          </article>

          <article className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[color:var(--color-text)]">Brief builder</h2>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" disabled={!rawBriefInput.trim()} onClick={() => { const parsed = parseEmailCopyBrief(rawBriefInput); setBrief(parsed.brief); setBriefStatus(parsed.metadata.status || ""); showSuccess("Brief parsed."); }}>
                  Parse
                </button>
                <button type="button" className="btn-ghost" disabled={savingBrief} onClick={() => void saveBrief()}>
                  {savingBrief ? "Saving..." : "Save brief"}
                </button>
              </div>
            </div>
            <textarea className="input mt-3 min-h-[150px]" value={rawBriefInput} onChange={(event) => setRawBriefInput(event.target.value)} placeholder="Paste the client brief here..." />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm md:col-span-2"><span className="text-[color:var(--color-text-muted)]">Campaign</span><input className="input" value={brief.campaignName} onChange={(event) => updateBriefField("campaignName", event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Status</span><input className="input" value={briefStatus} onChange={(event) => setBriefStatus(event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Send date</span><input className="input" value={brief.sendDate || ""} onChange={(event) => updateBriefField("sendDate", event.target.value || null)} /></label>
              <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Subject ({countChars(brief.sourceSubject)}/{EMAIL_COPY_CHAR_LIMITS.subject})</span><input className="input" value={brief.sourceSubject || ""} onChange={(event) => updateBriefField("sourceSubject", event.target.value || null)} /></label>
              <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Preheader ({countChars(brief.sourcePreheader)}/{EMAIL_COPY_CHAR_LIMITS.preheader})</span><input className="input" value={brief.sourcePreheader || ""} onChange={(event) => updateBriefField("sourcePreheader", event.target.value || null)} /></label>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-end">
                <button type="button" className="btn-ghost" onClick={addBlock}>
                  Add block
                </button>
              </div>
              {brief.blocks.map((block, blockIndex) => (
                <div key={`${block.id}-${blockIndex}`} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)] p-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Block ID</span><input className="input" value={block.id} onChange={(event) => updateBlockField(blockIndex, "id", event.target.value)} /></label>
                    <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Type</span><select className="input" value={block.blockType} onChange={(event) => updateBlockField(blockIndex, "blockType", event.target.value as BrevoBlockType)}>{BLOCK_TYPE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}</select></label>
                    <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Title ({countChars(block.sourceTitle)}/{EMAIL_COPY_CHAR_LIMITS.title})</span><input className="input" value={block.sourceTitle || ""} onChange={(event) => updateBlockField(blockIndex, "sourceTitle", event.target.value || null)} /></label>
                    <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">CTA</span><input className="input" value={block.ctaLabel || ""} onChange={(event) => updateBlockField(blockIndex, "ctaLabel", event.target.value || null)} /></label>
                    <label className="space-y-1 text-sm md:col-span-2"><span className="text-[color:var(--color-text-muted)]">Content ({countChars(block.sourceContent)}/{EMAIL_COPY_BLOCK_CONTENT_LIMITS[block.blockType]})</span><textarea className="input min-h-[84px]" value={block.sourceContent || ""} onChange={(event) => updateBlockField(blockIndex, "sourceContent", event.target.value || null)} /></label>
                    <div className="md:col-span-2 flex justify-end">
                      <button type="button" className="btn-ghost" disabled={brief.blocks.length <= 1} onClick={() => removeBlock(blockIndex)}>
                        Remove block
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <label className="space-y-1 text-sm"><span className="text-[color:var(--color-text-muted)]">Variants</span><select className="input" value={variantCount} onChange={(event) => setVariantCount(Number(event.target.value) || 1)}>{[1,2,3,4,5].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
              <label className="space-y-1 text-sm md:col-span-2"><span className="text-[color:var(--color-text-muted)]">Model</span><select className="input" value={model} onChange={(event) => setModel(event.target.value as GenerationModel)}><option value="gpt-4o-mini">GPT-4o mini</option><option value="gpt-5-mini">GPT-5 mini</option><option value="gpt-4-turbo">GPT-4 Turbo</option></select></label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn" disabled={generating} onClick={() => void generateCopy()}>{generating ? "Generating..." : "Generate variants"}</button>
              <button type="button" className="btn-ghost" disabled={savingDrafts || !variants.length} onClick={() => void saveDrafts()}>{savingDrafts ? "Saving..." : "Save drafts"}</button>
            </div>
          </article>
        </div>

        <article className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[color:var(--color-text)]">Output</h2>
            <span className="text-xs text-[color:var(--color-text-muted)]">{generatedModel ? `${generatedModel} | ${generatedSource}` : "No generation yet"}</span>
          </div>

          {!variants.length ? (
            <p className="mt-3 text-sm text-[color:var(--color-text-muted)]">Generate variants to copy/paste into Brevo.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => (
                  <button key={variant.index} type="button" className={["rounded-lg border px-3 py-1.5 text-sm", activeVariant === variant.index ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary-soft)]" : "border-[color:var(--color-border)]"].join(" ")} onClick={() => setActiveVariant(variant.index)}>
                    Variant {variant.index}
                  </button>
                ))}
              </div>

              {currentVariant ? (
                <>
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)] p-3">
                    <p className="text-xs text-[color:var(--color-text-muted)]">Subject ({countChars(currentVariant.subject)}/{EMAIL_COPY_CHAR_LIMITS.subject})</p>
                    <p className="mt-1 text-sm">{currentVariant.subject}</p>
                  </div>
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)] p-3">
                    <p className="text-xs text-[color:var(--color-text-muted)]">Preheader ({countChars(currentVariant.preheader)}/{EMAIL_COPY_CHAR_LIMITS.preheader})</p>
                    <p className="mt-1 text-sm">{currentVariant.preheader}</p>
                  </div>
                  {currentVariant.blocks.map((block, index) => (
                    <div key={`${block.id}-${index}`} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)] p-3">
                      <p className="text-xs text-[color:var(--color-text-muted)]">Block {index + 1} ({block.blockType}) | Title {countChars(block.title)}/{EMAIL_COPY_CHAR_LIMITS.title} | Subtitle {countChars(block.subtitle)}/{EMAIL_COPY_CHAR_LIMITS.subtitle} | Content {countChars(block.content)}/{EMAIL_COPY_BLOCK_CONTENT_LIMITS[block.blockType]}</p>
                      <p className="mt-2 text-sm font-medium">{block.title}</p>
                      <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{block.subtitle}</p>
                      <p className="mt-2 text-sm">{block.content}</p>
                      <p className="mt-2 text-xs uppercase tracking-wide text-[color:var(--color-text-muted)]">CTA: {block.ctaLabel}</p>
                    </div>
                  ))}
                  {currentVariant.warnings.length > 0 ? (
                    <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {currentVariant.warnings.map((warning, idx) => (
                        <p key={`${warning}-${idx}`}>- {warning}</p>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" className="btn-ghost w-full" onClick={async () => { try { await navigator.clipboard.writeText(formatVariantClipboard(currentVariant)); showSuccess("Variant copied."); } catch { showError("Unable to copy variant."); } }}>
                    Copy full variant
                  </button>
                </>
              ) : null}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
