import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

const DEFAULT_CLIENT = 'emg';
const KINDS = ['owner', 'type'] as const;

const CreateCatalogZ = z.object({
  client: z.string().optional(),
  kind: z.enum(['owner', 'type']),
  label: z.string().min(1),
});

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
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
    const items = (data ?? []).map((row) => ({
      id: row.id,
      clientSlug: row.client_slug,
      kind: row.kind,
      label: row.label,
      isActive: row.is_active,
    }));
    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  try {
    const body = await request.json();
    const parsed = CreateCatalogZ.parse(body);
    const clientSlug = parsed.client || DEFAULT_CLIENT;

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
        label: parsed.label.trim(),
        created_by: userId,
      })
      .select('*')
      .single();

    if (error || !data) {
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
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
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

    const { error } = await supabase.from('crm_catalog_items').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
