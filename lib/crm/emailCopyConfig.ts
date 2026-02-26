export const EMAIL_COPY_LOCALE = 'fr-FR';
export const EMAIL_COPY_PRONOUN_STYLE = 'vous';

export const EMAIL_COPY_CHAR_LIMITS = {
  subject: 35,
  preheader: 35,
  title: 33,
  subtitle: 70,
  heroContent: 275,
  threeColumnsContent: 65,
  twoColumnsContent: 75,
  imageTextSideBySideContent: 130,
} as const;

export type BrevoBlockType = 'hero' | 'three_columns' | 'two_columns' | 'image_text_side_by_side';

export const EMAIL_COPY_BLOCK_CONTENT_LIMITS: Record<BrevoBlockType, number> = {
  hero: EMAIL_COPY_CHAR_LIMITS.heroContent,
  three_columns: EMAIL_COPY_CHAR_LIMITS.threeColumnsContent,
  two_columns: EMAIL_COPY_CHAR_LIMITS.twoColumnsContent,
  image_text_side_by_side: EMAIL_COPY_CHAR_LIMITS.imageTextSideBySideContent,
};

export const DEFAULT_EMAIL_COPY_VARIANT_COUNT = 3;
export const MAX_EMAIL_COPY_VARIANT_COUNT = 5;

export type EmailCopyBrandProfile = {
  brandName: string;
  audience: string;
  toneSummary: string;
  toneDo: string[];
  toneDont: string[];
  mandatoryTerms: string[];
  forbiddenTerms: string[];
  proofPoints: string[];
  ctaStyle: string;
  legalGuardrails?: string | null;
  exampleEmails?: string[] | null;
};

export type EmailCopyBriefBlock = {
  id: string;
  blockType: BrevoBlockType;
  sourceTitle?: string | null;
  sourceContent?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

export type EmailCopyBrief = {
  campaignName: string;
  sendDate?: string | null;
  objective?: string | null;
  offerSummary?: string | null;
  visualLinks?: string[] | null;
  promoCode?: string | null;
  promoValidUntil?: string | null;
  senderEmail?: string | null;
  comments?: string | null;
  sourceSubject?: string | null;
  sourcePreheader?: string | null;
  rawBriefText?: string | null;
  blocks: EmailCopyBriefBlock[];
};

export type EmailCopyGeneratedBlock = {
  id: string;
  blockType: BrevoBlockType;
  title: string;
  subtitle: string;
  content: string;
  ctaLabel: string;
  charCount: {
    title: number;
    subtitle: number;
    content: number;
  };
};

export type EmailCopyVariant = {
  index: number;
  subject: string;
  preheader: string;
  blocks: EmailCopyGeneratedBlock[];
  warnings: string[];
};

export type EmailCopyGenerateResult = {
  variants: EmailCopyVariant[];
  model: string;
  fromCache: boolean;
  source: 'openai' | 'local-fallback';
};

export const SAVEURS_DEFAULT_BRAND_PROFILE: EmailCopyBrandProfile = {
  brandName: 'Saveurs et Vie',
  audience:
    'Personnes agees, personnes en situation de handicap, personnes en convalescence, et aidants.',
  toneSummary:
    'Ton rassurant, humain et professionnel. Toujours en francais avec vouvoiement. Promesse claire, jamais agressive.',
  toneDo: [
    'Mettre en avant la confiance, la proximite et la simplicite du service.',
    'Valoriser les menus adaptes et l expertise dietetique.',
    'Employer un ton bienveillant et concret.',
  ],
  toneDont: [
    'Ne jamais utiliser de tutoiement.',
    'Ne pas faire de promesse medicale absolue.',
    'Ne pas utiliser de vocabulaire anxiogene ou culpabilisant.',
  ],
  mandatoryTerms: ['Saveurs et Vie'],
  forbiddenTerms: ['gratuit a vie', 'garanti medical', 'miracle'],
  proofPoints: [
    'Menus elabores par des dieteticiens-nutritionnistes.',
    'Livraison de repas adaptes a domicile.',
    'Service pense pour le maintien a domicile.',
  ],
  ctaStyle: 'CTA courts, utiles et rassurants.',
  legalGuardrails:
    'Ne pas inventer de reduction, de date ou de condition. Respect strict du brief fourni.',
  exampleEmails: [],
};
