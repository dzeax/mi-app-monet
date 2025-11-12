'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

type ProfileDetails = {
  role: Role;
  displayName: string | null;
  avatarUrl: string | null;
};

const FALLBACK_PROFILE: ProfileDetails = {
  role: DEFAULT_ROLE,
  displayName: null,
  avatarUrl: null,
};

/** Lee el perfil desde app_users (por user_id).
 *  Si no hay fila, si está inactivo o hay error -> valores por defecto.
 */
async function fetchProfile(sb: SupabaseClient, userId: string): Promise<ProfileDetails> {
  const { data, error } = await sb
    .from('app_users')
    .select('role, is_active, display_name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data || !data.role || data.is_active === false) {
    return FALLBACK_PROFILE;
  }

  const normalizedRole = String(data.role).toLowerCase() === 'admin' ? 'admin' : 'editor';

  return {
    role: normalizedRole as Role,
    displayName: data.display_name ? String(data.display_name) : null,
    avatarUrl: data.avatar_url ? String(data.avatar_url) : null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  // Cliente único y estable para todo el provider
  const supabase = useMemo(() => createClientComponentClient<any, 'public'>(), []);

  // Carga inicial de sesión + perfil y suscripción a cambios
  useEffect(() => {
    let mounted = true;

    const applyAuthenticatedUser = async () => {
      if (!mounted) return;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!mounted) return;
        const authUser = error ? null : data?.user ?? null;
        if (authUser) {
          const profile = await fetchProfile(supabase, authUser.id).catch(() => FALLBACK_PROFILE);
          if (!mounted) return;
          setUser({
            id: authUser.id,
            email: authUser.email ?? null,
            role: profile.role,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          });
          setRole(profile.role);
        } else {
          setUser(null);
          setRole(null);
        }
      } catch (error) {
        if (!mounted) return;
        console.warn('Failed to resolve authenticated user', error);
        setUser(null);
        setRole(null);
      }
    };

    (async () => {
      await applyAuthenticatedUser();
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event, session }),
        });
      } catch (error) {
        console.warn('Failed to sync auth session', error);
      }

      await applyAuthenticatedUser();
      setLoading(false);
    });

    const ensureSession = async () => {
      await applyAuthenticatedUser();
      setLoading(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void ensureSession();
      }
    };
    const onFocus = () => {
      void ensureSession();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
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
