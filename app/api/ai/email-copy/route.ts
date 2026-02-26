import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  DEFAULT_EMAIL_COPY_VARIANT_COUNT,
  MAX_EMAIL_COPY_VARIANT_COUNT,
  SAVEURS_DEFAULT_BRAND_PROFILE,
} from '@/lib/crm/emailCopyConfig';
import { generateEmailCopy } from '@/lib/ai/emailCopyGenerator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const blockTypeSchema = z.enum(['hero', 'three_columns', 'two_columns', 'image_text_side_by_side']);

const brandProfileSchema = z
  .object({
    brandName: z.string().min(1),
    audience: z.string().min(1),
    toneSummary: z.string().min(1),
    toneDo: z.array(z.string()).default([]),
    toneDont: z.array(z.string()).default([]),
    mandatoryTerms: z.array(z.string()).default([]),
    forbiddenTerms: z.array(z.string()).default([]),
    proofPoints: z.array(z.string()).default([]),
    ctaStyle: z.string().default('CTA courts, utiles et rassurants.'),
    legalGuardrails: z.string().nullable().optional(),
    exampleEmails: z.array(z.string()).nullable().optional(),
  })
  .default(SAVEURS_DEFAULT_BRAND_PROFILE);

const briefBlockSchema = z.object({
  id: z.string().min(1),
  blockType: blockTypeSchema,
  sourceTitle: z.string().nullable().optional(),
  sourceContent: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().url().nullable().optional(),
});

const briefSchema = z.object({
  campaignName: z.string().min(1),
  sendDate: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  offerSummary: z.string().nullable().optional(),
  visualLinks: z.array(z.string().url()).nullable().optional(),
  promoCode: z.string().nullable().optional(),
  promoValidUntil: z.string().nullable().optional(),
  senderEmail: z.string().email().nullable().optional(),
  comments: z.string().nullable().optional(),
  sourceSubject: z.string().nullable().optional(),
  sourcePreheader: z.string().nullable().optional(),
  rawBriefText: z.string().nullable().optional(),
  blocks: z.array(briefBlockSchema).min(1),
});

const requestSchema = z.object({
  clientSlug: z.string().default('saveurs-et-vie'),
  brandProfile: brandProfileSchema.optional(),
  brief: briefSchema,
  variantCount: z
    .number()
    .int()
    .min(1)
    .max(MAX_EMAIL_COPY_VARIANT_COUNT)
    .default(DEFAULT_EMAIL_COPY_VARIANT_COUNT),
  model: z.enum(['gpt-5-mini', 'gpt-4-turbo', 'gpt-4o-mini']).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload', details: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const result = await generateEmailCopy(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/ai/email-copy] generation error', error);
    const err = error as {
      message?: unknown;
      requestID?: unknown;
      status?: unknown;
      code?: unknown;
      type?: unknown;
    };
    const detailParts: string[] = [];
    if (typeof err.message === 'string' && err.message.trim()) {
      detailParts.push(err.message.trim());
    }
    if (typeof err.requestID === 'string' && err.requestID.trim()) {
      detailParts.push(`request_id=${err.requestID.trim()}`);
    }
    if (typeof err.status === 'number') {
      detailParts.push(`status=${err.status}`);
    }
    if (typeof err.code === 'string' && err.code.trim()) {
      detailParts.push(`code=${err.code.trim()}`);
    }
    if (typeof err.type === 'string' && err.type.trim()) {
      detailParts.push(`type=${err.type.trim()}`);
    }

    return NextResponse.json(
      {
        error: 'Email copy generation failed',
        details: process.env.NODE_ENV === 'development' ? detailParts.join(' | ') || undefined : undefined,
      },
      { status: 500 }
    );
  }
}
