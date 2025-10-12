'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { SessionUser, Role } from '@/types/auth';
import { DEFAULT_ROLE } from '@/types/auth';
import { isAdmin, isEditor } from '@/lib/roles';

type AuthCtx = {
  user: SessionUser | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => Promise<void>;
  role: Role | null;
  isAdmin: boolean;
  isEditor: boolean;
};

const AuthContext = createContext<AuthCtx | null>(null);

/** Lee el rol desde la tabla app_users (por user_id).
 *  Si no hay fila, si está inactivo o hay error -> DEFAULT_ROLE.
 */
async function fetchRole(sb: SupabaseClient, userId: string): Promise<Role> {
  const { data, error } = await sb
    .from('app_users')
    .select('role, is_active')
    .eq('user_id', userId)
    .single();

  if (error || !data?.role || data.is_active === false) return DEFAULT_ROLE;

  const r = String(data.role).toLowerCase();
  return (r === 'admin' ? 'admin' : 'editor') as Role;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  // Cliente único y estable para todo el provider
  const supabase = useMemo(() => createClientComponentClient(), []);

  // Carga inicial de sesión + rol y suscripción a cambios
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!mounted) return;

      if (authUser) {
        const r = await fetchRole(supabase, authUser.id).catch(() => DEFAULT_ROLE);
        if (!mounted) return;
        setUser({ id: authUser.id, email: authUser.email, role: r });
        setRole(r);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const authUser = session?.user ?? null;
      if (authUser) {
        const r = await fetchRole(supabase, authUser.id).catch(() => DEFAULT_ROLE);
        setUser({ id: authUser.id, email: authUser.email, role: r });
        setRole(r);
      } else {
        setUser(null);
        setRole(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { ok: false as const, message: error.message || 'Unable to sign in' };
      }
      return { ok: true as const };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      role,
      loading,
      signIn,
      signOut,
      isAdmin: isAdmin(role),
      isEditor: isEditor(role),
    }),
    [user, role, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
