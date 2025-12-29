'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function UserMenu() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const logout = async () => {
    await signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-neutral-600">{user?.email ?? ''}</span>
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
