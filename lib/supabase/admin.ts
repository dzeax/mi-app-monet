import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con Service Role para uso EXCLUSIVO en servidor
 * (route handlers / server actions). NO importar desde componentes cliente.
 */
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Faltan variables de entorno de Supabase (URL o SERVICE_ROLE_KEY).');
  }

  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
