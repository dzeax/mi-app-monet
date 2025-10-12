'use client';

import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import SignOutButton from '@/components/auth/SignOutButton';

export default function AppHeader() {
  const { user, role, loading } = useAuth();

  return (
    <header role="banner" className="app-header">
      <div className="bar mx-auto w-full px-3 md:px-4 lg:px-6 flex items-center justify-between gap-3">
        {/* Logo principal (SVG) */}
        <div className="flex items-center">
          <Image
            src="/dvlogo2.svg"
            alt="Dataventure"
            width={180}
            height={56}
            priority
            style={{ height: 'var(--logo-h)', width: 'auto' }}
            className="brand-logo"
          />
        </div>

        {/* Acciones */}
        <nav aria-label="Header actions" className="flex items-center gap-2">
          <button className="btn-ghost h-9 px-3" aria-label="Toggle theme">🌓</button>

          {/* Info de usuario (solo cuando ya sabemos el estado y hay sesión) */}
          {!loading && user && (
            <div className="hidden sm:flex items-center gap-2 pr-1">
              <span className="text-sm opacity-70">{user.email}</span>
              {role && (
                <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs opacity-80">
                  {role}
                </span>
              )}
            </div>
          )}

          {/* Botón de cerrar sesión solo si hay sesión */}
          {!loading && user ? <SignOutButton /> : null}
        </nav>
      </div>
    </header>
  );
}
