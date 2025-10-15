'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
  const params = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState('Checking link...');

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      const hashParams =
        typeof window !== 'undefined' && window.location.hash
          ? new URLSearchParams(window.location.hash.substring(1))
          : new URLSearchParams();

      const errorDescription = hashParams.get('error_description') ?? params.get('error_description') ?? hashParams.get('error') ?? params.get('error');
      if (errorDescription) {
        if (cancelled) return;
        setStatus('error');
        setMessage(errorDescription);
        return;
      }

      const flow = params.get('flow') ?? params.get('type');
      const code = params.get('code') ?? hashParams.get('code');
      const token = params.get('token') ?? hashParams.get('token');
      const email = params.get('email') ?? hashParams.get('email');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const redirectTo = params.get('redirect_to') || hashParams.get('redirect_to') || '/';

      const inviteRedirect =
        (params.get('flow') ?? hashParams.get('flow') ?? params.get('type')) === 'invite'
          ? `/set-password?redirect=${encodeURIComponent(redirectTo)}${email ? `&email=${encodeURIComponent(email)}` : ''}`
          : null;


      try {
        if (code) {
          setMessage('Detected code. Exchanging...');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          setMessage('Detected access+refresh tokens. Setting session...');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (token && flow) {
          setMessage('Detected token + type. Verifying...');
          const payload: Record<string, unknown> = { token, type: flow };
          if (email) payload.email = email;
          const { error } = await supabase.auth.verifyOtp(payload as any);
          if (error) throw error;
                } else {
          throw new Error('Missing token or code in the callback URL.');
        }

        if (cancelled) return;
        setStatus('ok');
        setMessage('Signed in. Redirecting...');
        window.setTimeout(() => {
          if (!cancelled) router.replace(inviteRedirect ?? redirectTo);
        }, 1000);
      } catch (error: any) {
        if (cancelled) return;
        setStatus('error');
        setMessage(error?.message || 'Could not validate the link.');
      }
    };

    process();
    return () => {
      cancelled = true;
    };
  }, [params, router, supabase]);

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
            <button
              className="btn-primary px-4 py-2"
              onClick={() => router.replace('/login')}
            >
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









