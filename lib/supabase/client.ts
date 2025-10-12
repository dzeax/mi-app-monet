// lib/supabase/client.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Singleton del cliente de Supabase para el NAVEGADOR.
 * Lo creamos una vez y lo reutilizamos en todo el cliente.
 */
let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createClient(url, anon, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}
