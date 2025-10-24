'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Session } from '@supabase/supabase-js';

export default function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const supabase = useMemo(() => createClientComponentClient(), []);

  useEffect(() => {
    let mounted = true;

    const syncUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setEmail(data.user?.email ?? null);
    };

    void syncUser();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session: Session | null) => {
      if (!mounted) return;
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

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
