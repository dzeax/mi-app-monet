'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <SetPasswordContent />
    </Suspense>
  );
}

function SetPasswordContent() {
  const router = useRouter();
  const urlSearch = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient(), []);

  const hashString =
    typeof window !== 'undefined' && window.location.hash
      ? window.location.hash.substring(1)
      : '';
  const hashParams = useMemo(() => new URLSearchParams(hashString), [hashString]);

  const redirectTarget =
    hashParams.get('redirect') || urlSearch.get('redirect') || '/';
  const userEmail = hashParams.get('email') || urlSearch.get('email') || '';
  const accessToken = hashParams.get('at') || urlSearch.get('at');
  const refreshToken = hashParams.get('rt') || urlSearch.get('rt');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const ensureSession = async () => {
      if (!accessToken || !refreshToken) return;
      try {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Unable to initialize your session.');
      }
    };
    ensureSession();
    return () => {
      mounted = false;
    };
  }, [accessToken, refreshToken, supabase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

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
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace(redirectTarget || '/');
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || 'Unable to update password.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 space-y-6 shadow-lg">
        <header className="space-y-4 text-center">
          <img
            src="/dvlogo2.svg"
            alt="CampaignMinds"
            className="h-12 mx-auto object-contain"
            draggable={false}
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
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save & login'}
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
