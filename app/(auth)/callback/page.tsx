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
  const [message, setMessage] = useState('Validando enlace...');

  useEffect(() => {
    let cancelled = false;

    const process = async () => {
      const errorDescription = params.get('error_description') ?? params.get('error');
      if (errorDescription) {
        if (cancelled) return;
        setStatus('error');
        setMessage(errorDescription);
        return;
      }

      const code = params.get('code');
      const token = params.get('token');
      const type = params.get('type');
      const email = params.get('email');
      const redirectTo = params.get('redirect_to') || '/';

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token && type) {
          const payload: Record<string, unknown> = { token, type };
          if (email) payload.email = email;
          const { error } = await supabase.auth.verifyOtp(payload as any);
          if (error) throw error;
        } else {
          throw new Error('Missing token or code in the callback URL.');
        }

        if (cancelled) return;
        setStatus('ok');
        setMessage('Ingreso completado. Redirigiendo...');
        window.setTimeout(() => {
          if (!cancelled) router.replace(redirectTo);
        }, 1200);
      } catch (error: any) {
        if (cancelled) return;
        setStatus('error');
        setMessage(error?.message || 'No se pudo validar el enlace.');
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
          <h1 className="text-xl font-semibold">Procesando acceso…</h1>
          <p className="text-sm opacity-70">{message}</p>
        </div>
        {status === 'error' && (
          <div className="space-y-3">
            <p className="text-sm">
              Puedes solicitar un nuevo enlace desde el panel de administradores o volver al login.
            </p>
            <button
              className="btn-primary px-4 py-2"
              onClick={() => router.replace('/login')}
            >
              Ir al login
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
          <h1 className="text-xl font-semibold">Procesando acceso…</h1>
          <p className="text-sm opacity-70">Preparando enlace…</p>
        </div>
      </div>
    </div>
  );
}

