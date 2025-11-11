import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateSubjectLines } from '@/lib/ai/subjectLineGenerator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const metadataSchema = z
  .object({
    campaignName: z.string().optional(),
    partner: z.string().optional(),
    geo: z.string().optional(),
    language: z.string().default('English'),
    priceLabel: z.string().optional(),
    category: z.string().optional(),
    audience: z.string().optional(),
    objectives: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
  })
  .default({});

const requestSchema = z.object({
  html: z.string().min(1, 'HTML content is required'),
  metadata: metadataSchema,
  tone: z.string().default('Neutral'),
  maxLength: z.number().int().min(20).max(90).default(45),
  count: z.number().int().min(1).max(8).default(6),
  allowEmojis: z.boolean().default(false),
  usePersonalization: z.boolean().default(false),
  model: z.enum(['gpt-5-mini', 'gpt-4-turbo']).optional(),
  mode: z.enum(['subject', 'pair']).default('subject'),
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
    const result = await generateSubjectLines(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/ai/subject-lines] generation error', error);
    return NextResponse.json(
      {
        error: 'Subject line generation failed',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
