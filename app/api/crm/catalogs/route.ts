/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WORKSTREAM_DEFAULTS } from '@/lib/crm/workstreams';

const DEFAULT_CLIENT = 'emg';
const KINDS = ['owner', 'type', 'workstream'] as const;

const CreateCatalogZ = z.object({
  client: z.string().optional(),
  kind: z.enum(['owner', 'type', 'workstream']),
  label: z.string().min(1),
});

export const runtime = 'nodejs';

export async function GET(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client') || DEFAULT_CLIENT;
  const kind = searchParams.get('kind');

  try {
    const query = supabase.from('crm_catalog_items').select('*').eq('client_slug', client).eq('is_active', true);
    if (kind && KINDS.includes(kind as any)) {
      query.eq('kind', kind);
    }
    const { data, error } = await query.order('label', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    let items = (data ?? []).map((row) => ({
      id: row.id,
      clientSlug: row.client_slug,
      kind: row.kind,
      label: row.label,
      isActive: row.is_active,
    }));

    if (kind === 'workstream') {
      // Seed defaults only if the label doesn't exist at all (active OR inactive).
      // This lets users deactivate defaults per-client without them being reinserted.
      const { data: allRows, error: allError } = await supabase
        .from('crm_catalog_items')
        .select('label')
        .eq('client_slug', client)
        .eq('kind', 'workstream');
      if (allError) return NextResponse.json({ error: allError.message }, { status: 500 });

      const existing = new Set((allRows ?? []).map((row) => String(row.label).toLowerCase()));
      const missing = WORKSTREAM_DEFAULTS.filter(
        (label) => !existing.has(label.toLowerCase()),
      );
      if (missing.length > 0) {
        const admin = supabaseAdmin();
        const { error: seedError } = await admin
          .from('crm_catalog_items')
          .insert(
            missing.map((label) => ({
              client_slug: client,
              kind: 'workstream',
              label,
            })),
          );
        if (!seedError) {
          const seedQuery = supabase
            .from('crm_catalog_items')
            .select('*')
            .eq('client_slug', client)
            .eq('is_active', true)
            .eq('kind', 'workstream');
          const { data: seeded, error: seededError } = await seedQuery.order('label', { ascending: true });
          if (!seededError) {
            items = (seeded ?? []).map((row) => ({
              id: row.id,
              clientSlug: row.client_slug,
              kind: row.kind,
              label: row.label,
              isActive: row.is_active,
            }));
          }
        }
      }
    }

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  try {
    const body = await request.json();
    const parsed = CreateCatalogZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;
    const label = parsed.label.trim();

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data, error } = await supabase
      .from('crm_catalog_items')
      .insert({
        client_slug: clientSlug,
        kind: parsed.kind,
        label,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error || !data) {
      // Reactivate soft-deleted rows when the label already exists for this client/kind.
      if ((error as any)?.code === '23505') {
        const { data: reactivated, error: reactivateError } = await supabase
          .from('crm_catalog_items')
          .update({ is_active: true, label })
          .eq('client_slug', clientSlug)
          .eq('kind', parsed.kind)
          .ilike('label', label)
          .select('*')
          .single();
        if (!reactivateError && reactivated) {
          return NextResponse.json({
            item: {
              id: reactivated.id,
              clientSlug: reactivated.client_slug,
              kind: reactivated.kind,
              label: reactivated.label,
              isActive: reactivated.is_active,
            },
          });
        }
      }

      return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({
      item: {
        id: data.id,
        clientSlug: data.client_slug,
        kind: data.kind,
        label: data.label,
        isActive: data.is_active,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
 const cookieStore = await cookies();
 const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    const userId = sessionData.session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Soft-delete catalog items. This prevents default workstreams from being re-seeded
    // when a client intentionally hides them.
    const { error } = await supabase.from('crm_catalog_items').update({ is_active: false }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

