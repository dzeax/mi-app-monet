'use client';

import { AuthProvider } from '@/context/AuthContext';

// Provider base para todas las rutas, incluido login/reset.
export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
