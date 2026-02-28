import type { BrevoBlockType } from "@/lib/crm/emailCopyConfig";

export const DEFAULT_TEMPLATE_CLIENT_SLUG = "saveurs-et-vie" as const;

export type TemplateName =
  | "header.image"
  | "section.image"
  | "mosaic.images5.centerHero"
  | "cta.pill354"
  | "footer.beige"
  | "reassurance.navLinks"
  | "title.titre"
  | "promo.codePill"
  | "promo.blueCodeCta"
  | "text.beigeCta"
  | "content.centerHighlight"
  | "hero.simple"
  | "hero.imageTop"
  | "twoCards.text"
  | "twoColumns.imageLeft"
  | "twoCards.formule2"
  | "twoCards.menuPastel"
  | "threeCards.text"
  | "threeCards.menu3"
  | "sideBySide.imageText"
  | "sideBySide.helpCta";

export type TemplateKey = `${string}.${TemplateName}.v1`;

export type TemplateSurfaceMode = "default" | "transparent";

export type TemplateDef = {
  key: TemplateKey;
  clientSlug: string;
  templateName: TemplateName;
  label: string;
  supportedTypes: BrevoBlockType[];
  slotsSchema: Record<string, unknown>;
  defaultLayoutSpec: Record<string, unknown>;
  surfaceMode: TemplateSurfaceMode;
};

const TEMPLATE_NAME_BY_TYPE: Record<BrevoBlockType, TemplateName> = {
  hero: "hero.simple",
  two_columns: "twoCards.text",
  three_columns: "threeCards.menu3",
  image_text_side_by_side: "sideBySide.imageText",
};

const LEGACY_TEMPLATE_ALIASES: Record<string, TemplateName> = {
  "sv.header.image.v1": "header.image",
  "sv.section.image.v1": "section.image",
  "sv.mosaic.images5.centerHero.v1": "mosaic.images5.centerHero",
  "sv.cta.pill354.v1": "cta.pill354",
  "sv.footer.beige.v1": "footer.beige",
  "sv.reassurance.navLinks.v1": "reassurance.navLinks",
  "sv.title.titre.v1": "title.titre",
  "sv.promo.codePill.v1": "promo.codePill",
  "sv.promo.blueCodeCta.v1": "promo.blueCodeCta",
  "sv.text.beigeCta.v1": "text.beigeCta",
  "sv.content.centerHighlight.v1": "content.centerHighlight",
  "sv.hero.simple.v1": "hero.simple",
  "sv.hero.imageTop.v1": "hero.imageTop",
  "sv.twoCards.text.v1": "twoCards.text",
  "sv.twoColumns.imageLeft.v1": "twoColumns.imageLeft",
  "sv.twoCards.formule2.v1": "twoCards.formule2",
  "sv.twoCards.menuPastel.v1": "twoCards.menuPastel",
  "sv.threeCards.text.v1": "threeCards.text",
  "sv.threeCards.menu3.v1": "threeCards.menu3",
  "sv.sideBySide.imageText.v1": "sideBySide.imageText",
  "sv.sideBySide.helpCta.v1": "sideBySide.helpCta",
};

function normalizeClientSlug(clientSlug: string | null | undefined): string {
  return (clientSlug || DEFAULT_TEMPLATE_CLIENT_SLUG).trim().toLowerCase();
}

function isTemplateName(value: string): value is TemplateName {
  return (
    value === "header.image" ||
    value === "section.image" ||
    value === "mosaic.images5.centerHero" ||
    value === "cta.pill354" ||
    value === "footer.beige" ||
    value === "reassurance.navLinks" ||
    value === "title.titre" ||
    value === "promo.codePill" ||
    value === "promo.blueCodeCta" ||
    value === "text.beigeCta" ||
    value === "content.centerHighlight" ||
    value === "hero.simple" ||
    value === "hero.imageTop" ||
    value === "twoCards.text" ||
    value === "twoColumns.imageLeft" ||
    value === "twoCards.formule2" ||
    value === "twoCards.menuPastel" ||
    value === "threeCards.text" ||
    value === "threeCards.menu3" ||
    value === "sideBySide.imageText" ||
    value === "sideBySide.helpCta"
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
  surfaceMode?: TemplateSurfaceMode;
}): TemplateDef {
  return {
    key: buildTemplateKey(input.clientSlug, input.templateName),
    clientSlug: normalizeClientSlug(input.clientSlug),
    templateName: input.templateName,
    label: input.label,
    supportedTypes: input.supportedTypes,
    slotsSchema: input.slotsSchema,
    defaultLayoutSpec: input.defaultLayoutSpec,
    surfaceMode: input.surfaceMode ?? "default",
  };
}

export const TEMPLATE_REGISTRY: Record<string, TemplateDef> = {
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "header.image")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "header.image",
    label: "SV Header (image)",
    supportedTypes: ["hero"],
    slotsSchema: {
      image: {
        type: "object",
        fields: {
          src: { type: "string", optional: true },
          alt: { type: "string", maxChars: 90 },
        },
      },
      linkUrl: { type: "string", optional: true },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
    },
    defaultLayoutSpec: {
      image: {
        src: "https://img.mailinblue.com/2607945/images/content_library/original/6864f260ce04ba0eb2f03ec5.png",
        alt: "Saveurs et Vie",
      },
      align: "center",
      imageMaxWidthPx: 580,
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "section.image")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "section.image",
    label: "SV Section Image",
    supportedTypes: ["hero"],
    surfaceMode: "transparent",
    slotsSchema: {
      image: {
        type: "object",
        fields: {
          src: { type: "string", optional: true },
          alt: { type: "string", maxChars: 120 },
        },
      },
      linkUrl: { type: "string", optional: true },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
      maxWidth: { type: "number", optional: true },
    },
    defaultLayoutSpec: {
      image: {
        src: "https://img.mailinblue.com/2607945/images/content_library/original/69935409edfea40618a90d5b.png",
        alt: "Formule reconductible",
      },
      align: "center",
      maxWidth: 800,
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "mosaic.images5.centerHero")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "mosaic.images5.centerHero",
    label: "SV Mosaique images (5)",
    supportedTypes: ["hero"],
    slotsSchema: {
      images: {
        type: "object",
        fields: {
          img1: { type: "object", fields: { src: { type: "string" }, alt: { type: "string", optional: true }, linkUrl: { type: "string", optional: true } } },
          img2: { type: "object", fields: { src: { type: "string" }, alt: { type: "string", optional: true }, linkUrl: { type: "string", optional: true } } },
          img3: { type: "object", fields: { src: { type: "string" }, alt: { type: "string", optional: true }, linkUrl: { type: "string", optional: true } } },
          img4: { type: "object", fields: { src: { type: "string" }, alt: { type: "string", optional: true }, linkUrl: { type: "string", optional: true } } },
          img5: { type: "object", fields: { src: { type: "string" }, alt: { type: "string", optional: true }, linkUrl: { type: "string", optional: true } } },
        },
      },
      radiusPx: { type: "number", optional: true },
    },
    defaultLayoutSpec: {
      radiusPx: 8,
      images: {
        img1: { src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6207cc7c28f805fa1c9.jpg", alt: "Mosaïque image 1" },
        img2: { src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce62187ec1cf2e0721a41.jpg", alt: "Mosaïque image 2" },
        img3: { src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6217cc7c28f805fa1ca.jpg", alt: "Mosaïque image 3" },
        img4: { src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6742b2cc887da6c4210.jpg", alt: "Mosaïque image 4" },
        img5: { src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce62167fe85e2c79ac611.jpg", alt: "Mosaïque image 5" },
      },
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "cta.pill354")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "cta.pill354",
    label: "SV CTA (pill 354)",
    supportedTypes: ["hero"],
    slotsSchema: {
      label: { type: "string", maxChars: 120 },
      url: { type: "string", optional: true },
      widthPx: { type: "number", optional: true },
      radiusPx: { type: "number", optional: true },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
    },
    defaultLayoutSpec: {
      label: "DÉCOUVRIR LE MENU DUO",
      url: "",
      widthPx: 354,
      radiusPx: 25,
      align: "center",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "footer.beige")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "footer.beige",
    label: "SV Footer Beige",
    supportedTypes: ["hero"],
    surfaceMode: "transparent",
    slotsSchema: {
      socials: {
        type: "object",
        fields: {
          instagramUrl: { type: "string", optional: true },
          facebookUrl: { type: "string", optional: true },
          show: { type: "boolean", optional: true },
        },
      },
      companyLines: { type: "array", itemMaxChars: 160 },
      recipientEmailLabel: { type: "string", maxChars: 80 },
      gdprParagraph: { type: "string", maxChars: 1200 },
      unsubscribe: {
        type: "object",
        fields: {
          label: { type: "string", maxChars: 80 },
          url: { type: "string", optional: true },
        },
      },
    },
    defaultLayoutSpec: {
      socials: {
        show: true,
        instagramUrl: "https://www.instagram.com/saveursetvieofficiel",
        facebookUrl: "https://www.facebook.com/SaveursEtVie",
      },
      companyLines: [
        "Saveurs et Vie - SAS au capital de 106 477, 50 €- N° Siret : 43467677100091",
        "Rue de la Soie Bât. 285 Cellule C8 C9, 94310 ORLY",
        "Cet email a été envoyé à EMAIL",
      ],
      recipientEmailLabel: "EMAIL",
      gdprParagraph:
        "Vous disposez d’un droit d’accès, de rectification, d’effacement sur vos données, ainsi qu’un droit de limitation et d’opposition du traitement. Vous avez la possibilité d’exercer ces droits sur simple demande par courrier électronique à l’adresse suivante : dpo@saveursetvie.fr ou en cliquant sur le lien de désabonnement pour ne plus recevoir de mails de notre part. En cas de difficultés liées à la gestion de vos données, vous avez la possibilité de saisir la CNIL (www.cnil.fr).",
      unsubscribe: {
        label: "Se désinscrire",
        url: "",
      },
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "reassurance.navLinks")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "reassurance.navLinks",
    label: "SV Reassurance (links)",
    supportedTypes: ["hero"],
    slotsSchema: {
      links: {
        type: "array",
        item: {
          label: { type: "string", maxChars: 60 },
          url: { type: "string", maxChars: 300 },
        },
      },
      gapPx: { type: "number", optional: true },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
    },
    defaultLayoutSpec: {
      links: [
        { label: "Nos services", url: "#" },
        { label: "Qui sommes-nous", url: "#" },
        { label: "Notre blog", url: "#" },
      ],
      gapPx: 16,
      align: "center",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "title.titre")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "title.titre",
    label: "SV Titre (2 lines)",
    supportedTypes: ["hero"],
    slotsSchema: {
      line1: {
        type: "object",
        fields: {
          text: { type: "string", maxChars: 80 },
        },
      },
      line2: {
        type: "object",
        fields: {
          text: { type: "string", maxChars: 80 },
        },
      },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
    },
    defaultLayoutSpec: {
      align: "center",
      line1Text: "À chaque besoin",
      line2Text: "sa formule adaptée",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "promo.codePill")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "promo.codePill",
    label: "SV Promo (code pill)",
    supportedTypes: ["hero"],
    slotsSchema: {
      textBefore: { type: "string", maxChars: 140 },
      discountText: { type: "string", maxChars: 40 },
      textAfter: { type: "string", maxChars: 120 },
      codeText: { type: "string", maxChars: 40 },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
    },
    defaultLayoutSpec: {
      textBefore: "N'oubliez pas de profiter de vos",
      discountText: "-15%",
      textAfter: "avec le code",
      codeText: "CODE",
      align: "center",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "promo.blueCodeCta")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "promo.blueCodeCta",
    label: "SV Promo (blue code CTA)",
    supportedTypes: ["hero"],
    slotsSchema: {
      discountLine: { type: "string", maxChars: 80 },
      codeLineLabel: { type: "string", maxChars: 30 },
      codeValue: { type: "string", maxChars: 40 },
      finePrint: { type: "string", maxChars: 180 },
      cta: {
        type: "object",
        fields: {
          label: { type: "string", maxChars: 60 },
          url: { type: "string", optional: true },
        },
      },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
    },
    defaultLayoutSpec: {
      discountLine: "-25 %*",
      codeLineLabel: "CODE :",
      codeValue: "BIENVENUE25",
      finePrint: "*offre applicable sur la première commande en ligne",
      cta: {
        label: "Je profite du code",
        url: "",
      },
      align: "center",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "text.beigeCta")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "text.beigeCta",
    label: "SV Texte (beige + CTA)",
    supportedTypes: ["hero"],
    slotsSchema: {
      title: { type: "string", maxChars: 180 },
      bodyParagraphs: { type: "array", itemMaxChars: 420 },
      cta: {
        type: "object",
        fields: {
          label: { type: "string", maxChars: 60 },
          url: { type: "string", optional: true },
        },
      },
      align: { type: "string", enum: ["left", "center"], optional: true },
    },
    defaultLayoutSpec: {
      title: "Découvrez les engagements au cœur\nde notre approche :",
      bodyParagraphs: [
        "Chez Saveurs et Vie, nous avons à coeur de proposer des recettes élaborées par nos diététiciens-nutritionnistes, qui allient équilibre alimentaire et plaisir gustatif pour favoriser le maintien à domicile.",
        "Découvrez les engagements qui sont au coeur de notre approche :",
      ],
      cta: {
        label: "NOS ENGAGEMENTS",
        url: "",
      },
      align: "left",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "content.centerHighlight")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "content.centerHighlight",
    label: "SV Contenu (highlight)",
    supportedTypes: ["hero"],
    slotsSchema: {
      paragraphs: {
        type: "array",
        item: {
          parts: {
            type: "array",
            item: {
              text: { type: "string", maxChars: 500 },
              tone: { type: "string", enum: ["default", "highlight"], optional: true },
            },
          },
        },
      },
      align: { type: "string", enum: ["center", "left", "right"], optional: true },
    },
    defaultLayoutSpec: {
      align: "center",
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
    },
  }),
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
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "hero.imageTop")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "hero.imageTop",
    label: "SV Hero image top",
    supportedTypes: ["hero"],
    slotsSchema: {
      image: {
        type: "object",
        fields: {
          src: { type: "string", optional: true },
          alt: { type: "string", maxChars: 90 },
        },
      },
      headline: {
        type: "object",
        fields: {
          line1: { type: "string", maxChars: 45 },
          line2: { type: "string", maxChars: 45 },
        },
      },
      body: {
        type: "object",
        fields: {
          greeting: { type: "string", maxChars: 90 },
          paragraphs: { type: "array", itemMaxChars: 275 },
        },
      },
      cta: {
        type: "object",
        fields: {
          label: { type: "string", maxChars: 40 },
        },
      },
    },
    defaultLayoutSpec: {
      headlineBlue: "#0082ca",
      headlineYellow: "#fcbf00",
      bodyMaxWidthPx: 520,
      imageMaxWidthPct: 92,
      imageRadiusPx: 0,
      ctaBg: "#0082ca",
      ctaRadius: "full",
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
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "twoColumns.imageLeft")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "twoColumns.imageLeft",
    label: "SV Image gauche (2 cols)",
    supportedTypes: ["two_columns"],
    slotsSchema: {
      image: {
        type: "object",
        fields: {
          src: { type: "string", optional: true },
          alt: { type: "string", maxChars: 120 },
        },
      },
      title: { type: "string", maxChars: 120 },
      bullets: { type: "array", itemMaxChars: 180 },
      iconStyle: { type: "string", enum: ["checkGreen"], optional: true },
      align: { type: "string", enum: ["left", "center"], optional: true },
    },
    defaultLayoutSpec: {
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
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "twoCards.formule2")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "twoCards.formule2",
    label: "SV Formule 2 (bg image + checks)",
    supportedTypes: ["two_columns"],
    slotsSchema: {
      backgroundImageUrl: { type: "string", optional: true },
      cards: {
        type: "array",
        count: 2,
        item: {
          title: { type: "string", maxChars: 33 },
          bullets: { type: "array", itemMaxChars: 110 },
        },
      },
    },
    defaultLayoutSpec: {
      backgroundImageUrl:
        "https://img.mailinblue.com/2607945/images/content_library/original/686fd8c89addba0b7fd582a7.png",
      innerBg: "#FFF7E7",
      borderColor: "#0082ca",
      titleFont: "Tahoma 15",
      bulletFont: "Tahoma 15",
    },
  }),
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "twoCards.menuPastel")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "twoCards.menuPastel",
    label: "SV Menu 2 pastel cards",
    supportedTypes: ["two_columns"],
    slotsSchema: {
      left: {
        type: "object",
        fields: {
          title: { type: "string", maxChars: 33 },
          bullets: {
            type: "array",
            count: 6,
            item: {
              lead: { type: "string", maxChars: 24 },
              text: { type: "string", maxChars: 64 },
            },
          },
        },
      },
      right: {
        type: "object",
        fields: {
          title: { type: "string", maxChars: 33 },
          bullets: {
            type: "array",
            count: 6,
            item: {
              lead: { type: "string", maxChars: 24 },
              text: { type: "string", maxChars: 64 },
            },
          },
        },
      },
    },
    defaultLayoutSpec: {
      gapPx: 28,
      radiusPx: 20,
      paddingPx: 26,
      leftBg: "#ffecb2",
      rightBg: "#ffc8dd",
      titleColor: "#0082ca",
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
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "threeCards.menu3")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "threeCards.menu3",
    label: "SV Menu 3 (3 cards w/ image)",
    supportedTypes: ["three_columns"],
    slotsSchema: {
      bgColor: { type: "string", optional: true },
      cards: {
        type: "array",
        count: 3,
        item: {
          image: {
            type: "object",
            fields: {
              src: { type: "string", optional: true },
              alt: { type: "string", maxChars: 90 },
            },
          },
          title: { type: "string", maxChars: 33 },
          text: { type: "string", maxChars: 130 },
          cta: {
            type: "object",
            fields: {
              label: { type: "string", maxChars: 40 },
            },
          },
        },
      },
    },
    defaultLayoutSpec: {
      bgColor: "#faf9f0",
      titleColor: "#0082ca",
      buttonColor: "#0082ca",
      imageRadius: 14,
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
  [buildTemplateKey(DEFAULT_TEMPLATE_CLIENT_SLUG, "sideBySide.helpCta")]: createTemplateDef({
    clientSlug: DEFAULT_TEMPLATE_CLIENT_SLUG,
    templateName: "sideBySide.helpCta",
    label: "SV Help side-by-side CTA",
    supportedTypes: ["image_text_side_by_side"],
    slotsSchema: {
      image: {
        type: "object",
        fields: {
          src: { type: "string", optional: true },
          alt: { type: "string", maxChars: 90 },
        },
      },
      content: {
        type: "object",
        fields: {
          title: { type: "string", maxChars: 33 },
          body: { type: "string", maxChars: 130 },
          ctaLabel: { type: "string", maxChars: 40 },
        },
      },
    },
    defaultLayoutSpec: {
      imageSide: "left",
      imageWidthPct: 40,
      gapPx: 24,
      alignY: "center",
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
