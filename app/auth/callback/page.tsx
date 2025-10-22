'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { VerifyOtpParams } from '@supabase/supabase-js';

type Status = 'checking' | 'ok' | 'error';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthCallbackContent() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const router = useRouter();

  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState('Checking link...');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const searchParams = new URLSearchParams(window.location.search);
    const hashString = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hashString);
    const get = (key: string) => hashParams.get(key) ?? searchParams.get(key) ?? undefined;

    const flow = get('flow') ?? get('type');
    const code = get('code');
    const token = get('token');
    const email = get('email');
    const accessToken = get('access_token');
    const refreshToken = get('refresh_token');
    const redirectTo = get('redirect_to') ?? '/';

    const redirectToSetPassword = () => {
      const hash = new URLSearchParams();
      hash.set('redirect', redirectTo || '/');
      if (email) hash.set('email', email);
      if (accessToken) hash.set('at', accessToken);
      if (refreshToken) hash.set('rt', refreshToken);
      setStatus('ok');
      setMessage('Redirecting to password setup...');
      router.replace(`/set-password#${hash.toString()}`);
    };

    const run = async () => {
      try {
        if (flow === 'invite' && accessToken && refreshToken) {
          redirectToSetPassword();
          return;
        }

        if (code) {
          setMessage('Detected code. Exchanging...');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token && flow) {
          setMessage('Detected token + type. Verifying...');
          const allowedTypes: VerifyOtpParams['type'][] = [
            'magiclink',
            'recovery',
            'signup',
            'email_change',
            'invite',
            'sms',
          ];
          if (!allowedTypes.includes(flow as VerifyOtpParams['type'])) {
            throw new Error('Unsupported verification flow.');
          }
          const otpPayload: VerifyOtpParams = { token, type: flow as VerifyOtpParams['type'] };
          if (email) {
            otpPayload.email = email;
          }
          const { error } = await supabase.auth.verifyOtp(otpPayload);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          setMessage('Detected access+refresh tokens. Setting session...');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error('Missing token or code in the callback URL.');
        }

        if (cancelled) return;
        setStatus('ok');
        setMessage('Signed in. Redirecting...');
        router.replace(redirectTo || '/');
      } catch (error: unknown) {
        if (cancelled) return;
        setStatus('error');
        const message = error instanceof Error ? error.message : 'Could not validate the link.';
        setMessage(message);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 text-center space-y-4 shadow-lg">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Processing sign-in...</h1>
          <p className="text-sm opacity-70">{message}</p>
        </div>
        {status === 'error' && (
          <div className="space-y-3">
            <p className="text-sm">
              You can request a new link from an admin or return to login.
            </p>
            <button className="btn-primary px-4 py-2" onClick={() => router.replace('/login')}>
              Go to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CallbackFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[--color-surface] text-[--color-text] px-4">
      <div className="max-w-md w-full rounded-lg border border-[--color-border] bg-[--color-surface-2] p-6 text-center space-y-4 shadow-lg">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Processing sign-in...</h1>
          <p className="text-sm opacity-70">Preparing link...</p>
        </div>
      </div>
    </div>
  );
}
