import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { normaliseDatabaseKey, sanitizeDoctorSenderDefaultsInput, type DoctorSenderDefaultsUpdate } from '@/lib/doctorsender/defaults';

const ALLOWED_ROLES = new Set(['admin', 'editor']);

type HttpError = Error & { status?: number };

async function createSupabaseRouteClient() {
 const cookieStore = await cookies();
 return createRouteHandlerClient({ cookies: () => cookieStore as any });
}

async function ensureAuthorized() {
  const supabase = await createSupabaseRouteClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const user = session?.user ?? null;
  if (!user) {
    const error: HttpError = new Error('Not authenticated.');
    error.status = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile || profile.is_active === false || !ALLOWED_ROLES.has(String(profile.role))) {
    const error: HttpError = new Error('Forbidden.');
    error.status = 403;
    throw error;
  }

  return { admin: supabaseAdmin(), userId: user.id };
}

function ensureDatabaseParams(params?: { database?: string }): { name: string; key: string } {
  const database = (params?.database ?? '').trim();
  if (!database) {
    const error: HttpError = new Error('Database is required.');
    error.status = 400;
    throw error;
  }
  return { name: database, key: normaliseDatabaseKey(database) };
}

export async function GET(_request: Request, context: { params: Promise<{ database: string }> }) {
  try {
    const { admin } = await ensureAuthorized();
    const { name, key } = ensureDatabaseParams(await context.params);

    const { data, error } = await admin
      .from('doctor_sender_defaults')
      .select('database_name, config, updated_at')
      .eq('database_key', key)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ database: name, defaults: null });
    }

    return NextResponse.json({
      database: data.database_name,
      defaults: data.config,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    const status = (error as HttpError)?.status ?? 500;
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ database: string }> }) {
  try {
    const { admin, userId } = await ensureAuthorized();
    const { name, key } = ensureDatabaseParams(await context.params);
    const body = (await request.json().catch(() => ({}))) as {
      defaults?: unknown;
      databaseName?: string;
    };

    const databaseName = (body.databaseName ?? name).trim();
    if (!databaseName) {
      return NextResponse.json({ error: 'databaseName is required.' }, { status: 400 });
    }

    const defaultsInput =
      typeof body.defaults === 'object' && body.defaults !== null
        ? (body.defaults as DoctorSenderDefaultsUpdate)
        : undefined;
    const config = sanitizeDoctorSenderDefaultsInput(defaultsInput);
    const { error } = await admin
      .from('doctor_sender_defaults')
      .upsert(
        {
          database_key: key,
          database_name: databaseName,
          config,
          updated_by: userId,
        },
        { onConflict: 'database_key' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ database: databaseName, defaults: config });
  } catch (error) {
    const status = (error as HttpError)?.status ?? 500;
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status });
  }
}
