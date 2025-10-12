'use client';

import { PropsWithChildren } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function IfEditorOrAdmin({ children }: PropsWithChildren) {
  const { isEditor, loading } = useAuth();
  if (loading) return null;
  return isEditor ? <>{children}</> : null;
}
