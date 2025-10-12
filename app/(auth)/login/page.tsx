import type { Metadata } from 'next';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
  title: 'Sign in — Dataventure',
};

export default function Page() {
  return <LoginClient />;
}
