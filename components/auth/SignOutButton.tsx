'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(false);

  const onClick = () => {
    setLoading(true);

    // Lanzamos el signOut en segundo plano (sin bloquear la UI)
    const p = supabase.auth.signOut().catch(console.error);

    // Redirigimos ya — así no dependemos de la red
    const fallback = setTimeout(() => {
      router.replace('/login');
    }, 200); // pequeño delay para que el click se vea “respondido”

    // Si el signOut termina antes/ después, volvemos a asegurar la redirección
    p.finally(() => {
      clearTimeout(fallback);
      router.replace('/login');
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      aria-label="Sign out"
      title="Sign out"
      className="btn-ghost h-9 px-3"
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
