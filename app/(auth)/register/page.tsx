'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirect = sp.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Si ya hay sesión, redirige
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(redirect);
    });
  }, [router, redirect]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    // Si en Supabase tienes "Confirm email" activo, verás este aviso:
    setInfo('Revisa tu email para confirmar la cuenta. Luego podrás iniciar sesión.');
    // Si lo tienes desactivado en dev, puedes redirigir directo:
    // router.replace('/login?registered=1');
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
