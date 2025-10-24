import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

type AppUserRow = { role: 'admin' | 'editor'; is_active: boolean } | null;

export async function getSessionAndAppUser() {
  const store = cookies();
  const supabase = createServerComponentClient({ cookies: () => store });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return { session: null, appUser: null as AppUserRow };

  const { data, error } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', session.user.id)
    .single();

  // Si no hay fila en app_users, consideramos null (caerá en DEFAULT_ROLE en el cliente)
  const appUser: AppUserRow = error ? null : (data ?? null);

  return { session, appUser };
}
