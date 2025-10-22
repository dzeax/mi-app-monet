'use client';

import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Image from 'next/image';
import type { Session } from '@supabase/supabase-js';

type InviteParams = {
  accessToken: string | null;
  refreshToken: string | null;
  redirect: string;
  email: string;
};

function readInviteParams(): InviteParams {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null, redirect: '/', email: '' };
  }

  const hashString = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hashString);
  const searchParams = new URLSearchParams(window.location.search);

  const fromParams = (key: string) => hashParams.get(key) ?? searchParams.get(key);

  const redirect = fromParams('redirect') || '/';
  const email = fromParams('email') || '';
  const accessToken = fromParams('at') ?? fromParams('access_token') ?? null;
  const refreshToken = fromParams('rt') ?? fromParams('refresh_token') ?? null;

  return { accessToken, refreshToken, redirect, email };
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <SetPasswordContent />
    </Suspense>
  );
}

function SetPasswordContent() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;
  type SetSessionResult = Awaited<ReturnType<typeof supabase.auth.setSession>>;

  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timer = window.setTimeout(() => resolve('timeout'), ms);
    });

    try {
      return (await Promise.race([promise, timeoutPromise])) as T | 'timeout';
    } finally {
      if (timer) {
        window.clearTimeout(timer);
      }
    }
  };

  const [inviteParams, setInviteParams] = useState<InviteParams>(() => readInviteParams());
  const [tokensReady, setTokensReady] = useState(false);

  const { accessToken, refreshToken, redirect, email: userEmail } = inviteParams;
  const redirectTarget = redirect || '/';

  useEffect(() => {
    const syncTokens = () => {
      const next = readInviteParams();
      setInviteParams((prev) => {
        if (
          prev.accessToken === next.accessToken &&
          prev.refreshToken === next.refreshToken &&
          prev.redirect === next.redirect &&
          prev.email === next.email
        ) {
          return prev;
        }
        return next;
      });
      setTokensReady(true);
    };

    syncTokens();
    window.addEventListener('hashchange', syncTokens);
    return () => window.removeEventListener('hashchange', syncTokens);
  }, []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializingSession, setInitializingSession] = useState(false);

  useEffect(() => {
    if (!tokensReady) return;

    let mounted = true;
    const ensureSession = async () => {
      if (!mounted) return;
      const hasTokens = Boolean(accessToken && refreshToken);

      setInitializingSession(hasTokens);
      console.debug('[set-password] ensureSession()', {
        tokensReady,
        hasTokens,
        accessToken: accessToken ? `${accessToken.slice(0, 6)}…` : null,
        refreshToken: refreshToken ? `${refreshToken.slice(0, 6)}…` : null,
      });

      if (hasTokens) {
        try {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          });
          if (sessErr) throw sessErr;
          if (!mounted) return;
          setError(null);
          console.debug('[set-password] setSession success');
        } catch (err: unknown) {
          if (!mounted) return;
          const message = err instanceof Error ? err.message : 'Unable to initialize your session.';
          setError(message);
          console.error('[set-password] setSession error', err);
        } finally {
          if (mounted) setInitializingSession(false);
        }
        return;
      }

      if (mounted) setInitializingSession(false);

      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (data.session) {
          setError(null);
          console.debug('[set-password] existing session detected');
        } else {
          setError((prev) => prev ?? 'Your session is not initialized. Please request a fresh invitation.');
          console.warn('[set-password] no active session available');
        }
      } catch (err: unknown) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Unable to initialize your session.';
        setError(message);
        console.error('[set-password] getSession error', err);
      }
    };
    ensureSession();
    return () => {
      mounted = false;
    };
  }, [accessToken, refreshToken, supabase, tokensReady]);

  useEffect(() => {
    if (!initializingSession) return;
    const timer = window.setTimeout(() => setInitializingSession(false), 8000);
    return () => window.clearTimeout(timer);
  }, [initializingSession]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    console.log('[set-password] submit:start', {
      tokensReady,
      initializingSession,
      hasTokens: Boolean(accessToken && refreshToken),
    });

    if (!tokensReady) {
      setError('Still preparing your invitation. Please try again in a moment.');
      console.warn('[set-password] submit:abort tokens not ready');
      return;
    }

    if (!password.trim() || password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Try to read current session, but do not hang if the helper is slow
      console.log('[set-password] submit:getSession:start');
      const sessionOrTimeout = await withTimeout<GetSessionResult>(supabase.auth.getSession(), 1500);
      let activeSession: Session | null =
        sessionOrTimeout !== 'timeout' ? sessionOrTimeout.data.session : null;
      console.log('[set-password] submit:getSession:done', {
        timedOut: sessionOrTimeout === 'timeout',
        hasSession: Boolean(activeSession),
      });

      // If no session, try to establish with tokens; but keep a short timeout as well
      if (!activeSession && accessToken && refreshToken) {
        console.debug('[set-password] retrying setSession inside submit');
        const setOrTimeout = await withTimeout<SetSessionResult>(
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
          1500,
        );
        if (setOrTimeout !== 'timeout' && setOrTimeout.error) {
          throw setOrTimeout.error;
        }
        const refreshedOrTimeout = await withTimeout<GetSessionResult>(
          supabase.auth.getSession(),
          1500,
        );
        activeSession =
          refreshedOrTimeout !== 'timeout' ? refreshedOrTimeout.data.session : null;
        console.log('[set-password] submit:after retry getSession', {
          hasSession: Boolean(activeSession),
          timedOut: refreshedOrTimeout === 'timeout',
        });
      }

      // Try update via SDK if we have a Supabase session, otherwise fall back to REST
      const trySdkUpdate = async () => {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
      };

      let updated = false;
      if (activeSession) {
        try {
          await Promise.race([
            trySdkUpdate(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('sdk_timeout')), 6000)),
          ]);
          updated = true;
          console.log('[set-password] submit:updateUser success (sdk)');
        } catch (sdkError: unknown) {
          const reason =
            sdkError instanceof Error ? sdkError.message : String(sdkError ?? 'unknown');
          console.warn('[set-password] sdk update failed, falling back', reason);
        }
      }

      if (!updated) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
        const bearer = activeSession?.access_token ?? accessToken;
        if (!supabaseUrl || !anon || !bearer) {
          throw new Error('Missing configuration or bearer token for fallback update.');
        }
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          apikey: anon,
          Authorization: `Bearer ${bearer}`,
        };
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ password }),
        });
        if (!response.ok) {
          let msg = `Fallback update failed (${response.status})`;
          try {
            const json = (await response.json()) as {
              error?: string;
              error_description?: string;
            };
            msg = json.error_description || json.error || msg;
          } catch {}
          throw new Error(msg);
        }
        console.log('[set-password] submit:updateUser success (fallback)');
      }

      // On success, navigate away
      console.log('[set-password] submit:navigate', redirectTarget || '/');
      await router.replace(redirectTarget || '/');
      console.log('[set-password] submit:navigate done');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to update password.';
      setError(message);
      console.error('[set-password] submit error', err);
    } finally {
      // Ensure the button does not remain in a stuck state if navigation is blocked
      setBusy(false);
      console.log('[set-password] submit:finally');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 space-y-6 shadow-lg">
        <header className="space-y-4 text-center">
          <Image
            src="/dvlogo2.svg"
            alt="CampaignMinds"
            width={120}
            height={48}
            className="h-12 w-auto mx-auto object-contain"
            draggable={false}
            priority
          />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Set your password</h1>
            <p className="text-sm opacity-75">
              {userEmail
                ? `Finish setting up the account for ${userEmail}.`
                : 'Finish setting up your account.'}
            </p>
          </div>
        </header>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="muted">Password</span>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onInput={() => setError(null)}
                onInvalid={(event) =>
                  event.currentTarget.setCustomValidity('Password must be at least 8 characters long.')
                }
                onBlur={(event) => event.currentTarget.setCustomValidity('')}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Enter a new password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-2 text-xs text-[--color-text]/70 hover:text-[--color-text]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="muted">Confirm password</span>
            <div className="relative">
              <input
                className="input pr-10"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                onInput={() => setError(null)}
                onInvalid={(event) =>
                  event.currentTarget.setCustomValidity('Please repeat the password.')
                }
                onBlur={(event) => event.currentTarget.setCustomValidity('')}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Repeat the password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-2 text-xs text-[--color-text]/70 hover:text-[--color-text]"
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {error && (
            <div className="text-sm rounded border border-[--color-accent]/60 bg-[--color-accent]/10 text-[--color-accent] px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary disabled:opacity-50 disabled:pointer-events-none"
            disabled={busy || initializingSession || !tokensReady}
          >
            {initializingSession ? 'Preparing...' : busy ? 'Saving...' : 'Save & login'}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 text-center space-y-4 shadow-lg">
        <h1 className="text-xl font-semibold">Loading…</h1>
        <p className="text-sm opacity-70">Preparing password setup…</p>
      </div>
    </div>
  );
}
