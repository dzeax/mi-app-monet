'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

type Props = {
  variant?: 'text' | 'icon' | 'unstyled';
  className?: string;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'children'>;

export default function SignOutButton({
  variant = 'text',
  className = '',
  children,
  ...rest
}: Props) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const onClick = () => {
    setLoading(true);

    const p = signOut().catch(console.error);

    const fallback = setTimeout(() => {
      router.replace('/login');
    }, 200);

    p.finally(() => {
      clearTimeout(fallback);
      router.replace('/login');
      router.refresh();
    });
  };

  const baseClasses =
    variant === 'icon'
      ? `icon-btn ${className}`.trim()
      : variant === 'text'
        ? `btn-ghost h-9 px-3 ${className}`.trim()
        : className;

  const content =
    loading && variant === 'icon'
      ? <span className="spinner-dot" aria-hidden="true" />
      : loading
        ? 'Signing out…'
        : children ?? 'Sign out';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      aria-label={rest['aria-label'] ?? 'Sign out'}
      title={rest.title ?? 'Sign out'}
      className={baseClasses}
      {...rest}
    >
      {content}
      {variant === 'icon' ? <span className="sr-only">Sign out</span> : null}
    </button>
  );
}
