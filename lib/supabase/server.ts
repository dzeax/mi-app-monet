import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export async function createServerSupabase() {
  // Next 15: evitar uso sincrono de cookies()
 const cookieStore = await cookies();
 return createServerComponentClient({ cookies: () => cookieStore as any });
}

