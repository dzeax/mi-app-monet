"use client";

import { EmailSectionSurface } from "@/components/crm/emailCopy/templates/components/EmailSectionSurface";
import { recordValue, stringValue } from "@/components/crm/emailCopy/templates/components/contentUtils";
import type { TemplateComponentProps } from "@/components/crm/emailCopy/templates/types";

type MosaicImageKey = "img1" | "img2" | "img3" | "img4" | "img5";

type MosaicImageSlot = {
  src: string;
  alt: string;
  linkUrl?: string;
};

const DEFAULT_RADIUS = 8;

const DEFAULT_IMAGES: Record<MosaicImageKey, MosaicImageSlot> = {
  img1: {
    src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6207cc7c28f805fa1c9.jpg",
    alt: "Mosaïque image 1",
  },
  img2: {
    src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce62187ec1cf2e0721a41.jpg",
    alt: "Mosaïque image 2",
  },
  img3: {
    src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6217cc7c28f805fa1ca.jpg",
    alt: "Mosaïque image 3",
  },
  img4: {
    src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce6742b2cc887da6c4210.jpg",
    alt: "Mosaïque image 4",
  },
  img5: {
    src: "https://img.mailinblue.com/2607945/images/content_library/original/695ce62167fe85e2c79ac611.jpg",
    alt: "Mosaïque image 5",
  },
};

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function resolveImage(
  key: MosaicImageKey,
  dataImages: Record<string, unknown> | null,
  layoutImages: Record<string, unknown> | null
): MosaicImageSlot {
  const dataImage = recordValue(dataImages?.[key]);
  const layoutImage = recordValue(layoutImages?.[key]);
  const fallback = DEFAULT_IMAGES[key];
  return {
    src: stringValue(dataImage?.src) || stringValue(layoutImage?.src) || fallback.src,
    alt: stringValue(dataImage?.alt) || stringValue(layoutImage?.alt) || fallback.alt,
    linkUrl: stringValue(dataImage?.linkUrl) || stringValue(layoutImage?.linkUrl) || undefined,
  };
}

function MosaicTile(input: {
  image: MosaicImageSlot;
  radiusPx: number;
  className: string;
  center?: boolean;
}) {
  const { image, radiusPx, className, center = false } = input;
  const tileContent = image.src ? (
    <img
      src={image.src}
      alt={image.alt || "Image"}
      className="block h-full w-full object-cover"
      style={{ borderRadius: `${radiusPx}px` }}
    />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500"
      style={{ borderRadius: `${radiusPx}px` }}
    >
      Image
    </div>
  );

  return (
    <div className={`${className} ${center ? "min-h-[180px] md:min-h-[330px]" : "min-h-[112px] md:min-h-[156px]"}`}>
      {image.linkUrl ? (
        <a
          href={image.linkUrl}
          className="block h-full w-full"
          target={image.linkUrl !== "#" ? "_blank" : undefined}
          rel={image.linkUrl !== "#" ? "noreferrer" : undefined}
        >
          {tileContent}
        </a>
      ) : (
        tileContent
      )}
    </div>
  );
}

export function SvMosaicImages5CenterHeroV1({ brandTheme, data, layoutSpec }: TemplateComponentProps) {
  const layout = recordValue(layoutSpec);
  const dataImages = recordValue(data.images);
  const layoutImages = recordValue(layout?.images);

  const radiusPx = Math.max(0, Math.min(24, toNumber(data.radiusPx ?? layout?.radiusPx, DEFAULT_RADIUS)));

  const img1 = resolveImage("img1", dataImages, layoutImages);
  const img2 = resolveImage("img2", dataImages, layoutImages);
  const img3 = resolveImage("img3", dataImages, layoutImages);
  const img4 = resolveImage("img4", dataImages, layoutImages);
  const img5 = resolveImage("img5", dataImages, layoutImages);

  return (
    <EmailSectionSurface
      className="px-3 py-2 sm:px-4 sm:py-2.5"
      style={{ borderRadius: brandTheme.radius }}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_2fr_1fr] md:grid-rows-2 md:gap-3.5">
        <MosaicTile image={img3} radiusPx={radiusPx} center className="col-span-2 row-start-1 md:col-span-1 md:col-start-2 md:row-start-1 md:row-span-2" />
        <MosaicTile image={img1} radiusPx={radiusPx} className="col-start-1 row-start-2 md:col-start-1 md:row-start-1" />
        <MosaicTile image={img2} radiusPx={radiusPx} className="col-start-2 row-start-2 md:col-start-1 md:row-start-2" />
        <MosaicTile image={img4} radiusPx={radiusPx} className="col-start-1 row-start-3 md:col-start-3 md:row-start-1" />
        <MosaicTile image={img5} radiusPx={radiusPx} className="col-start-2 row-start-3 md:col-start-3 md:row-start-2" />
      </div>
    </EmailSectionSurface>
  );
}
