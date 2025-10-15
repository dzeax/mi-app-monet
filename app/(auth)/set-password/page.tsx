'use client';

import { Suspense, useState } from 'react';
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
  const params = useSearchParams();
  const supabase = createClientComponentClient();

  const redirectTarget = params.get('redirect') || '/';
  const userEmail = params.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.replace(redirectTarget);
    } catch (err: any) {
      setError(err?.message || 'Unable to update password.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 space-y-6 shadow-lg">
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Set your password</h1>
          <p className="text-sm opacity-75">
            {userEmail
              ? `Finish setting up the account for ${userEmail}.`
              : 'Finish setting up your account.'}
          </p>
        </header>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="muted">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Enter a new password"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="muted">Confirm password</span>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Repeat the password"
            />
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
            {busy ? 'Saving...' : 'Save password'}
          </button>
        </form>

        <button
          className="btn-ghost w-full"
          onClick={() => router.replace(redirectTarget)}
          disabled={busy}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 text-center space-y-4 shadow-lg">
        <h1 className="text-xl font-semibold">Loading...</h1>
        <p className="text-sm opacity-70">Preparing password setup...</p>
      </div>
    </div>
  );
}


