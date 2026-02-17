import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

type AppUserRow = { role: 'admin' | 'editor'; is_active: boolean } | null;

export async function getUserAndAppUser() {
 const cookieStore = await cookies();
 const supabase = createServerComponentClient({ cookies: () => cookieStore as any });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (userError || !user) {
    const code = (userError as any)?.code;
    if (code === 'refresh_token_not_found') {
      await supabase.auth.signOut({ scope: 'local' });
    }
    return { user: null, appUser: null as AppUserRow };
  }

  const { data: appData, error: appError } = await supabase
    .from('app_users')
    .select('role,is_active')
    .eq('user_id', user.id)
    .single();

  // Si no hay fila en app_users, consideramos null (caera en DEFAULT_ROLE en el cliente)
  const appUser: AppUserRow = appError ? null : (appData ?? null);

  return { user, appUser };
}

