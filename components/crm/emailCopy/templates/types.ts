export type BrandTheme = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  radius: string;
  fontFamily: string;
};

export type BlockPreviewData = {
  title?: string | null;
  subtitle?: string | null;
  content?: string | null;
  ctaLabel?: string | null;
  [key: string]: unknown;
};

export type TemplateComponentProps = {
  brandTheme: BrandTheme;
  data: BlockPreviewData;
  layoutSpec?: Record<string, unknown>;
};
