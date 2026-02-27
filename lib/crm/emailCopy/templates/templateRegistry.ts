import type { BrevoBlockType } from "@/lib/crm/emailCopyConfig";

export const DEFAULT_TEMPLATE_CLIENT_SLUG = "saveurs-et-vie" as const;

export type TemplateName =
  | "hero.simple"
  | "twoCards.text"
  | "threeCards.text"
  | "sideBySide.imageText";

export type TemplateKey = `${string}.${TemplateName}.v1`;

export type TemplateDef = {
  key: TemplateKey;
  clientSlug: string;
  templateName: TemplateName;
  label: string;
  supportedTypes: BrevoBlockType[];
  slotsSchema: Record<string, unknown>;
  defaultLayoutSpec: Record<string, unknown>;
};

const TEMPLATE_NAME_BY_TYPE: Record<BrevoBlockType, TemplateName> = {
  hero: "hero.simple",
  two_columns: "twoCards.text",
  three_columns: "threeCards.text",
  image_text_side_by_side: "sideBySide.imageText",
};

const LEGACY_TEMPLATE_ALIASES: Record<string, TemplateName> = {
  "sv.hero.simple.v1": "hero.simple",
  "sv.twoCards.text.v1": "twoCards.text",
  "sv.threeCards.text.v1": "threeCards.text",
  "sv.sideBySide.imageText.v1": "sideBySide.imageText",
};

function normalizeClientSlug(clientSlug: string | null | undefined): string {
  return (clientSlug || DEFAULT_TEMPLATE_CLIENT_SLUG).trim().toLowerCase();
}

function isTemplateName(value: string): value is TemplateName {
  return (
    value === "hero.simple" ||
    value === "twoCards.text" ||
    value === "threeCards.text" ||
    value === "sideBySide.imageText"
  );
}

function buildTemplateKey(clientSlug: string, templateName: TemplateName): TemplateKey {
  return `${normalizeClientSlug(clientSlug)}.${templateName}.v1` as TemplateKey;
}

function parseTemplateKey(
  key: string | null | undefined
): { clientSlug: string; templateName: TemplateName } | null {
  const normalized = key?.trim();
  if (!normalized) return null;
  if (LEGACY_TEMPLATE_ALIASES[normalized]) {
    return {
      clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
      templateName: LEGACY_TEMPLATE_ALIASES[normalized],
    };
  }
  const parts = normalized.split(".");
  if (parts.length < 3) return null;
  const clientSlug = normalizeClientSlug(parts[0]);
  const version = parts[parts.length - 1];
  const templateNameRaw = parts.slice(1, -1).join(".");
  if (!/^v\d+$/i.test(version)) return null;
  if (!isTemplateName(templateNameRaw)) return null;
  return { clientSlug, templateName: templateNameRaw };
}

function createTemplateDef(input: {
  clientSlug: string;
  templateName: TemplateName;
  label: string;
  supportedTypes: BrevoBlockType[];
  slotsSchema: Record<string, unknown>;
  defaultLayoutSpec: Record<string, unknown>;
}): TemplateDef {
  return {
    key: buildTemplateKey(input.clientSlug, input.templateName),
    clientSlug: normalizeClientSlug(input.clientSlug),
    templateName: input.templateName,
    label: input.label,
    supportedTypes: input.supportedTypes,
    slotsSchema: input.slotsSchema,
    defaultLayoutSpec: input.defaultLayoutSpec,
  };
}

export const TEMPLATE_REGISTRY: Record<string, TemplateDef> = {
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "hero.simple")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "hero.simple",
    label: "SV Hero Simple v1",
    supportedTypes: ["hero"],
    slotsSchema: {
      headline: { type: "string", maxChars: 33 },
      subheadline: { type: "string", maxChars: 70 },
      body: { type: "string", maxChars: 275 },
      ctaLabel: { type: "string", maxChars: 40 },
    },
    defaultLayoutSpec: {
      align: "left",
      emphasis: "balanced",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "twoCards.text")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "twoCards.text",
    label: "SV Two Cards Text v1",
    supportedTypes: ["two_columns"],
    slotsSchema: {
      left: {
        type: "object",
        fields: {
          title: { type: "string", maxChars: 33 },
          bullets: { type: "array", itemMaxChars: 40 },
          emphasis: { type: "string", optional: true, maxChars: 40 },
        },
      },
      right: {
        type: "object",
        fields: {
          title: { type: "string", maxChars: 33 },
          bullets: { type: "array", itemMaxChars: 40 },
          emphasis: { type: "string", optional: true, maxChars: 40 },
        },
      },
    },
    defaultLayoutSpec: {
      cards: 2,
      style: "text-only",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "threeCards.text")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "threeCards.text",
    label: "SV Three Cards Text v1",
    supportedTypes: ["three_columns"],
    slotsSchema: {
      cards: {
        type: "array",
        count: 3,
        item: {
          title: { type: "string", maxChars: 33 },
          body: { type: "string", maxChars: 65 },
        },
      },
    },
    defaultLayoutSpec: {
      cards: 3,
      style: "text-only",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "sideBySide.imageText")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "sideBySide.imageText",
    label: "SV Side By Side Image/Text v1",
    supportedTypes: ["image_text_side_by_side"],
    slotsSchema: {
      title: { type: "string", maxChars: 33 },
      body: { type: "string", maxChars: 130 },
      ctaLabel: { type: "string", maxChars: 40 },
      imageAlt: { type: "string", optional: true, maxChars: 90 },
    },
    defaultLayoutSpec: {
      imagePosition: "left",
      imageRatio: "4:3",
    },
  }),
};

export function getTemplatesForType(
  type: BrevoBlockType,
  clientSlug: string = DEFAULT_TEMPLATE_CLIENT_SLUG
): TemplateDef[] {
  const normalizedClient = normalizeClientSlug(clientSlug);
  return Object.values(TEMPLATE_REGISTRY).filter(
    (template) =>
      template.clientSlug === normalizedClient && template.supportedTypes.includes(type)
  );
}

export function getDefaultTemplateForType(
  type: BrevoBlockType,
  clientSlug: string = DEFAULT_TEMPLATE_CLIENT_SLUG
): TemplateKey {
  const normalizedClient = normalizeClientSlug(clientSlug);
  const defaultTemplateName = TEMPLATE_NAME_BY_TYPE[type];
  const templates = getTemplatesForType(type, normalizedClient);
  const preferred =
    templates.find((template) => template.templateName === defaultTemplateName) ??
    templates[0];
  return preferred?.key ?? buildTemplateKey(normalizedClient, defaultTemplateName);
}

export function getTemplateNameFromKey(key: string | null | undefined): TemplateName | null {
  const parsed = parseTemplateKey(key);
  return parsed?.templateName ?? null;
}

export function getTemplateDef(
  key: string | null | undefined,
  clientSlug?: string
): TemplateDef | null {
  const normalizedKey = key?.trim();
  if (!normalizedKey) return null;
  const byKey = TEMPLATE_REGISTRY[normalizedKey];
  if (byKey) return byKey;

  const parsed = parseTemplateKey(normalizedKey);
  if (!parsed) return null;
  const preferredClient = normalizeClientSlug(clientSlug || parsed.clientSlug);
  const namespacedKey = buildTemplateKey(preferredClient, parsed.templateName);
  if (TEMPLATE_REGISTRY[namespacedKey]) return TEMPLATE_REGISTRY[namespacedKey];

  const defaultKey = buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, parsed.templateName);
  return TEMPLATE_REGISTRY[defaultKey] ?? null;
}

export function isTemplateCompatibleWithType(
  templateKey: string | null | undefined,
  type: BrevoBlockType,
  clientSlug?: string
): boolean {
  const templateDef = getTemplateDef(templateKey, clientSlug);
  if (!templateDef) return false;
  if (!templateDef.supportedTypes.includes(type)) return false;
  if (!clientSlug) return true;
  return templateDef.clientSlug === normalizeClientSlug(clientSlug);
}
