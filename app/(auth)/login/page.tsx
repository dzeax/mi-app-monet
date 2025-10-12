import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
  title: 'Sign in — Dataventure',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
