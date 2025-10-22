'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import SignOutButton from '@/components/auth/SignOutButton';

const BellIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6.5 10.5V9a5.5 5.5 0 0 1 11 0v1.5a7 7 0 0 0 1.24 4.02l.26.38a1 1 0 0 1-.83 1.6H5.83a1 1 0 0 1-.83-1.6l.26-.38A7 7 0 0 0 6.5 10.5z" />
    <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
  </svg>
);

const HelpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 4" />
    <path d="M12 17h.01" />
  </svg>
);

const ThemeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3v2" />
    <path d="M12 19v2" />
    <path d="M5.22 5.22l1.42 1.42" />
    <path d="M17.36 17.36l1.42 1.42" />
    <path d="M3 12h2" />
    <path d="M19 12h2" />
    <path d="M5.22 18.78l1.42-1.42" />
    <path d="M17.36 6.64l1.42-1.42" />
    <circle cx="12" cy="12" r="4.5" />
  </svg>
);

const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const PowerIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 7v6" />
    <path d="M6.5 8.5a6.5 6.5 0 1 0 11 0" />
  </svg>
);

const formatSegment = (segment: string) =>
  segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AppHeader() {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [menuOpen, setMenuOpen] = useState(false);
  const [progressActive, setProgressActive] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const searchParamsString = searchParams?.toString();

  useEffect(() => {
    setProgressActive(true);
    const timeout = setTimeout(() => setProgressActive(false), 500);
    return () => clearTimeout(timeout);
  }, [pathname, searchParamsString]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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

  const breadcrumbs = useMemo(() => {
    if (!pathname) return [];
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => ({
      href: '/' + segments.slice(0, index + 1).join('/'),
      label: formatSegment(segment),
      current: index === segments.length - 1,
    }));
  }, [pathname]);

  return (
    <header role="banner" className="app-header header-glass">
      <div className={`header-progress ${progressActive ? 'header-progress--active' : ''}`} aria-hidden="true" />
      <div className="bar mx-auto flex w-full items-center justify-between gap-3 px-3 md:px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex items-center">
            <Image
              src="/dvlogo2.svg"
              alt="Dataventure"
              width={160}
              height={54}
              priority
              style={{ height: 'var(--logo-h)', width: 'auto' }}
              className="brand-logo"
            />
          </Link>
          <nav aria-label="Breadcrumb" className="breadcrumb hidden lg:block">
            <ol className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/60">
              <li>
                <Link href="/" className="breadcrumb__link">
                  Home
                </Link>
              </li>
              {breadcrumbs.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-2">
                  <span className="breadcrumb__separator">/</span>
                  {crumb.current ? (
                    <span className="breadcrumb__current">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="breadcrumb__link">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <div className="flex-1" />

        <nav aria-label="Header actions" className="header-actions flex items-center gap-2">
          <button type="button" className="icon-btn hidden md:inline-flex" aria-label="Toggle theme">
            <ThemeIcon className="h-4 w-4" />
          </button>
          <button type="button" className="icon-btn" aria-label="Notifications">
            <BellIcon className="h-4 w-4" />
          </button>
          <button type="button" className="icon-btn" aria-label="Help center">
            <HelpIcon className="h-4 w-4" />
          </button>
          <SignOutButton variant="icon" aria-label="Sign out">
            <PowerIcon className="h-5 w-5" />
          </SignOutButton>

          {!loading && user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="user-button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="user-button__avatar">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="user-button__initials">{initials}</span>
                  )}
                </span>
                <span className="user-button__meta">
                  <span className="user-button__name">{displayName}</span>
                  {role ? <span className="user-button__role">{role}</span> : null}
                </span>
                <ChevronDownIcon className={`user-button__chevron ${menuOpen ? 'user-button__chevron--open' : ''}`} />
              </button>
              {menuOpen && (
                <div className="user-menu" role="menu">
                  <div className="user-menu__header">
                    <div className="user-menu__name">{displayName}</div>
                    <div className="user-menu__email">{user.email}</div>
                  </div>
                  <button type="button" className="user-menu__item" role="menuitem">
                    View profile
                  </button>
                  <button type="button" className="user-menu__item" role="menuitem">
                    Preferences
                  </button>
                  <SignOutButton
                    variant="unstyled"
                    className="user-menu__item user-menu__item--danger"
                    role="menuitem"
                    aria-label="Sign out from menu"
                  />
                </div>
              )}
            </div>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
