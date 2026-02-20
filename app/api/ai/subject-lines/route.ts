import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateSubjectLines } from '@/lib/ai/subjectLineGenerator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  .default({ language: 'English' });

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
    if (process.env.NODE_ENV === 'development') {
      console.info('[api/ai/subject-lines] generation success', result?.debug ?? null);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/ai/subject-lines] generation error', error);
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
        error: 'Subject line generation failed',
        details: process.env.NODE_ENV === 'development' ? detailParts.join(' | ') || undefined : undefined,
      },
      { status: 500 }
    );
  }
}
