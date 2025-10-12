'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-neutral-600">{email}</span>
      <button
        onClick={logout}
        className="text-sm rounded-md border px-3 py-1 hover:bg-neutral-50"
        title="Cerrar sesión"
      >
        Salir
      </button>
    </div>
  );
}
