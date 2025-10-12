'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const redirect = search.get('redirect') || '/';
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await signIn(email, password);
      if (!res.ok) {
        setErr(res.message || 'Unable to sign in.');
      } else {
        router.push(redirect);
        router.refresh();
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-[oklch(98%_.01_250)] dark:bg-neutral-950">
      {/* Left / Brand side */}
      <div className="relative hidden md:flex flex-col overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(110deg,#050a33_0%,#050a33_24%,rgba(7,11,56,0.95)_36%,rgba(93,46,185,0.82)_56%,rgba(162,71,226,0.58)_76%,rgba(210,97,244,0.36)_90%,rgba(255,255,255,0)_99%)]" />
        <div className="absolute inset-0 [clip-path:polygon(45%_0%,100%_0%,100%_100%,70%_100%)] bg-[linear-gradient(135deg,rgba(222,110,255,0.75)_0%,rgba(187,88,243,0.6)_45%,rgba(255,255,255,0)_100%)]" />
        <div className="absolute -top-28 -left-32 h-[30rem] w-[30rem] rounded-full bg-indigo-500/45 blur-[180px]" />
        <div className="absolute -bottom-36 -right-24 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/45 blur-[170px]" />

        <div className="relative z-10 p-8">
          <div className="space-y-3">
            <Image
              src="/dvlogo2.svg"
              width={228}
              height={70}
              alt="Dataventure"
              priority
              className="h-20 w-auto drop-shadow-[0_6px_12px_rgba(0,0,0,0.28)]"
            />
            <div className="h-px w-24 bg-white/45" />
            <p className="text-xs font-medium uppercase tracking-[0.32em] text-white/75">
              Data & Performance Marketing
            </p>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center p-10">
          <Image
            src="/illustrations/login-hero.png"
            alt="Email analytics illustration"
            width={640}
            height={640}
            className="w-[80%] max-w-[560px] h-auto drop-shadow-2xl"
            priority
          />
        </div>

        <div className="relative z-10 px-8 pb-6 text-[0.75rem] text-white/75">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="whitespace-nowrap text-white/75">
              &copy; 2025 Dataventure Global SL. All rights reserved. | Privacy
            </p>
          </div>
        </div>
      </div>

      {/* Right / Form side */}
      <div className="relative flex items-center justify-center px-6 py-16 md:px-12 md:py-24">
        <div className="w-full max-w-md flex flex-col">
          {/* Mobile brand header */}
          <div className="mb-10 flex items-center md:hidden">
            <Image
              src="/dvlogo2.svg"
              width={192}
              height={57}
              alt="Dataventure"
              className="h-14 w-auto drop-shadow-[0_6px_12px_rgba(0,0,0,0.24)]"
            />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Welcome back! Please enter your credentials.
          </p>

          <form onSubmit={onSubmit} className="mt-12 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-300/80 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 ring-indigo-500"
                placeholder="you@dataventure.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Password
              </span>
              <div className="mt-1 relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300/80 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 pr-11 text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 ring-indigo-500"
                  placeholder="********"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {err && (
              <div className="rounded-lg border border-red-300/70 bg-red-50 text-red-700 px-3 py-2 text-sm">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-neutral-900 text-white py-2.5 font-medium hover:bg-neutral-800 disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <div className="flex items-center justify-start text-sm">
              <Link
                href="/auth/reset"
                className="text-indigo-600 hover:text-indigo-700"
              >
                Forgot password?
              </Link>
            </div>
          </form>
        </div>

        <span className="absolute bottom-6 right-6 flex items-center gap-1 text-xs text-neutral-500">
          Crafted with
          <Image src="/love2.png" alt="love icon" width={14} height={14} className="h-3.5 w-3.5" />
          by DavidZ
        </span>
      </div>
    </div>
  );
}
