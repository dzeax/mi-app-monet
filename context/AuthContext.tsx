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
  const lastEnsureRef = useRef(0);
  const lastSyncedKeyRef = useRef<string | null>(null);
  const lastSyncedAtRef = useRef(0);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const signInInFlightRef = useRef<
    Promise<{ ok: true } | { ok: false; message: string }> | null
  >(null);
  const localCleanupRef = useRef(false);

  // Carga inicial de sesión + perfil y suscripción a cambios
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { hash, pathname } = window.location;
      if (hash && pathname !== '/set-password' && pathname !== '/auth/callback') {
        const hashString = hash.startsWith('#') ? hash.slice(1) : hash;
        const hashParams = new URLSearchParams(hashString);
        const flow = hashParams.get('type');
        const hasImplicitTokens =
          hashParams.has('access_token') || hashParams.has('refresh_token');

        if (flow === 'recovery' && hasImplicitTokens) {
          window.location.replace(`/set-password#${hashString}`);
          return;
        }
      }
    }

    let mounted = true;
    let inFlight: Promise<void> | null = null;

    const isRefreshTokenNotFound = (error: unknown) => {
      const code = (error as any)?.code;
      if (code === 'refresh_token_not_found') return true;
      const message = String((error as any)?.message ?? '');
      return /refresh token not found/i.test(message);
    };

    const syncAuthSession = (event: string, session: unknown) => {
      const sessionObj = (session ?? null) as
        | { access_token?: string; refresh_token?: string; user?: { id?: string } }
        | null;
      const accessToken = sessionObj?.access_token ?? '';
      const refreshToken = sessionObj?.refresh_token ?? '';
      const userId = sessionObj?.user?.id ?? '';
      const key = `${event}:${userId}:${accessToken.slice(-12)}:${refreshToken.slice(-12)}`;
      const now = Date.now();
      const minIntervalMs = event === 'TOKEN_REFRESHED' ? 3000 : 750;

      if (key === lastSyncedKeyRef.current && now - lastSyncedAtRef.current < minIntervalMs) {
        return;
      }

      const started = Date.now();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);

      lastSyncedKeyRef.current = key;
      lastSyncedAtRef.current = now;

      const run = async () => {
        try {
          await fetch('/api/auth/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ event, session }),
            signal: controller.signal,
          });
        } catch (error) {
          console.warn('[auth] Failed to sync auth session', {
            event,
            message: error instanceof Error ? error.message : String(error),
            ms: Date.now() - started,
          });
        } finally {
          window.clearTimeout(timeout);
        }
      };

      const previous = syncInFlightRef.current;
      const next = (previous ? previous.catch(() => {}) : Promise.resolve()).then(run);
      syncInFlightRef.current = next.finally(() => {
        if (syncInFlightRef.current === next) syncInFlightRef.current = null;
      });
    };

    const clearLocalSession = async (reason: string, error?: unknown) => {
      if (localCleanupRef.current) return;
      localCleanupRef.current = true;
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}

      syncAuthSession('SIGNED_OUT', null);

      if (mounted) {
        setUser(null);
        setRole(null);
        setLoading(false);
      }

      console.warn('[auth] Cleared local session', {
        reason,
        code: (error as any)?.code ?? null,
        message: error instanceof Error ? error.message : String(error ?? ''),
      });

      localCleanupRef.current = false;
    };

    const applyAuthenticatedUser = async () => {
      if (!mounted) return;
      if (localCleanupRef.current) return;
      if (inFlight) {
        await inFlight;
        return;
      }

      const task = (async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (!mounted) return;

          if (error) {
            if (isRefreshTokenNotFound(error)) {
              await clearLocalSession('refresh_token_not_found', error);
              return;
            }
            console.warn('[auth] getSession returned error', {
              code: (error as any)?.code ?? null,
              message: error.message,
            });
          }

          const session = error ? null : data?.session ?? null;
          const authUser = session?.user ?? null;

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
          if (isRefreshTokenNotFound(error)) {
            await clearLocalSession('refresh_token_not_found_throw', error);
            return;
          }
          console.warn('[auth] Failed to resolve authenticated user', error);
          setUser(null);
          setRole(null);
        }
      })();

      inFlight = task;
      try {
        await task;
      } finally {
        if (inFlight === task) inFlight = null;
      }
    };

    (async () => {
      await applyAuthenticatedUser();
      lastEnsureRef.current = Date.now();
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      syncAuthSession(event, session);
      void applyAuthenticatedUser();
      setLoading(false);
    });

    const ensureSession = async () => {
      const now = Date.now();
      if (now - lastEnsureRef.current < 4000) return;
      lastEnsureRef.current = now;
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
      if (signInInFlightRef.current) {
        return signInInFlightRef.current;
      }

      const task = (async () => {
        try {
          const response = await Promise.race([
            supabase.auth.signInWithPassword({ email, password }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Sign in timed out. Please try again.')), 12000)
            ),
          ]);

          const { error } = response;
          if (error) {
            return { ok: false as const, message: error.message || 'Unable to sign in' };
          }
          return { ok: true as const };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to sign in';
          return { ok: false as const, message };
        }
      })();

      signInInFlightRef.current = task.finally(() => {
        if (signInInFlightRef.current === task) signInInFlightRef.current = null;
      });

      return signInInFlightRef.current;
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('[auth] signOut failed, forcing local cleanup', error);
    } finally {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
      setUser(null);
      setRole(null);
      setLoading(false);
    }
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
