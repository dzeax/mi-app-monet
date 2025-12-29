'use client';

import { Suspense, useMemo, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !anon) {
      throw new Error('Missing Supabase public environment variables.');
    }
    return createClient(url, anon, {
      auth: {
        flowType: 'implicit',
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }, []);
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const origin = window.location.origin;
      const redirectTo = `${origin}/set-password?redirect=${encodeURIComponent(redirect)}`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (resetError) throw resetError;
      setInfo('Check your email for a reset link.');
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Unable to request password reset.';
      if (message.toLowerCase().includes('rate limit')) {
        message = 'You have requested too many reset emails. Please wait a few minutes and try again.';
      }
      setError(message);
    } finally {
      setBusy(false);
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
            <h1 className="text-xl font-semibold">Reset your password</h1>
            <p className="text-sm opacity-75">
              Enter your email and we will send you a reset link.
            </p>
          </div>
        </header>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            <span className="muted">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onInput={() => setError(null)}
              autoComplete="email"
              required
              placeholder="you@dataventure.com"
            />
          </label>

          {error && (
            <div className="text-sm rounded border border-[--color-accent]/60 bg-[--color-accent]/10 text-[--color-accent] px-3 py-2">
              {error}
            </div>
          )}

          {info && (
            <div className="text-sm rounded border border-emerald-400/60 bg-emerald-50 text-emerald-700 px-3 py-2">
              {info}
            </div>
          )}

          <button type="submit" className="btn-primary disabled:opacity-50" disabled={busy}>
            {busy ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ResetFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 text-center space-y-3 shadow-lg">
        <h1 className="text-xl font-semibold">Loading...</h1>
        <p className="text-sm opacity-70">Preparing reset form.</p>
      </div>
    </div>
  );
}
