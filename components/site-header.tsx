'use client';

import { useSession } from '@/components/session-provider';
import { Button } from '@/components/ui/button';

export function SiteHeader() {
  const { user, signOut } = useSession();

  return (
    <header className="bg-background border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span className="font-semibold tracking-tight">Networking Tracker</span>

        {user && (
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-muted-foreground hidden truncate text-sm sm:inline">
              {user.email}
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
