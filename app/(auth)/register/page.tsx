'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(redirect);
    });
  }, [router, redirect, supabase]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setInfo('Revisa tu email para confirmar la cuenta. Luego podrás iniciar sesión.');
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">Crear cuenta</h1>

      <label className="block">
        <span className="text-sm">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2"
          placeholder="tu@correo.com"
        />
      </label>

      <label className="block">
        <span className="text-sm">Contraseña</span>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2"
          placeholder="Mínimo 6 caracteres"
        />
      </label>

      {err && <p className="text-red-600 text-sm">{err}</p>}
      {info && <p className="text-green-700 text-sm">{info}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-black text-white py-2 disabled:opacity-50"
      >
        {loading ? 'Creando…' : 'Crear cuenta'}
      </button>

      <p className="text-sm text-center text-neutral-500">
        ¿Ya tienes cuenta?{' '}
        <a href="/login" className="underline">Entrar</a>
      </p>
    </form>
  );
}
