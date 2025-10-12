'use client';

import { PropsWithChildren } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function IfAdmin({ children }: PropsWithChildren) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  return isAdmin ? <>{children}</> : null;
}
