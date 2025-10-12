import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export async function createServerSupabase() {
  const store = await cookies();
  // Next 15: evitar uso síncrono de cookies()
  return createServerComponentClient({ cookies: () => store });
}
