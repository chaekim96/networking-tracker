'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { neon, isConfigured } from '@/lib/auth/client';
import { useSession } from '@/components/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Mode = 'sign-in' | 'sign-up';

const copy = {
  'sign-in': {
    title: 'Welcome back',
    description: 'Sign in to see your contacts.',
    submit: 'Sign in',
    pending: 'Signing in…',
    switchText: 'New here?',
    switchCta: 'Create an account',
    switchHref: '/auth/sign-up',
  },
  'sign-up': {
    title: 'Create your account',
    description: 'Start tracking the people you want to stay in touch with.',
    submit: 'Create account',
    pending: 'Creating account…',
    switchText: 'Already have an account?',
    switchCta: 'Sign in',
    switchHref: '/auth/sign-in',
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const t = copy[mode];
  const router = useRouter();
  const { refresh } = useSession();

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const { error: authError } =
        mode === 'sign-up'
          ? await neon.auth.signUp.email({ email, password, name: name || email })
          : await neon.auth.signIn.email({ email, password });

      if (authError) {
        setError(authError.message ?? 'Something went wrong. Please try again.');
        return;
      }

      await refresh();
      router.push('/contacts');
    } catch {
      setError('Could not reach the authentication service. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>

      <CardContent>
        {!isConfigured && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Not configured</AlertTitle>
            <AlertDescription>
              NEXT_PUBLIC_NEON_AUTH_URL and NEXT_PUBLIC_NEON_DATA_API_URL are missing.
              Copy .env.example to .env.local and fill them in.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {mode === 'sign-up' && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@berkeley.edu"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'sign-up' ? 'At least 8 characters' : '••••••••'}
            />
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={pending || !isConfigured}>
            {pending ? t.pending : t.submit}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="text-muted-foreground justify-center gap-1 text-sm">
        {t.switchText}
        <Link href={t.switchHref} className="text-foreground font-medium underline">
          {t.switchCta}
        </Link>
      </CardFooter>
    </Card>
  );
}
