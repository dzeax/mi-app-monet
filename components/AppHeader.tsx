'use client';

import { useMemo } from 'react';
import Image from 'next/image';

import { useAuth } from '@/context/AuthContext';
import SignOutButton from '@/components/auth/SignOutButton';

export default function AppHeader() {
  const { user, role, loading } = useAuth();

  const displayName = useMemo(() => {
    if (!user?.displayName || !user.displayName.trim()) {
      const fallback = user?.email?.split('@')[0] ?? '';
      return fallback || 'Welcome';
    }
    return user.displayName.trim();
  }, [user?.displayName, user?.email]);

  const initials = useMemo(() => {
    const source = displayName || user?.email || 'User';
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || 'U';
  }, [displayName, user?.email]);

  return (
    <header role="banner" className="app-header">
      <div className="bar mx-auto flex w-full items-center justify-between gap-3 px-3 md:px-4 lg:px-6">
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

        <nav aria-label="Header actions" className="flex items-center gap-3">
          {!loading && user && (
            <div className="flex items-center gap-3 pr-1">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[--color-surface-3] ring-1 ring-black/5">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-medium text-[--color-text]/80">
                    {initials}
                  </span>
                )}
              </div>
              <div className="hidden min-w-[120px] flex-col leading-tight sm:flex">
                <span className="text-sm font-medium text-[--color-text]">{displayName}</span>
                <span className="text-xs opacity-70">{user.email}</span>
              </div>
              {role && (
                <span className="hidden sm:inline-flex items-center rounded-full border border-[--color-border] px-2 py-0.5 text-xs capitalize text-[--color-text]/80">
                  {role}
                </span>
              )}
            </div>
          )}

          {!loading && user ? <SignOutButton /> : null}
        </nav>
      </div>
    </header>
  );
}
