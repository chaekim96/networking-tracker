'use client';

import { createClient } from '@neondatabase/neon-js';
import type { Database } from '@/lib/types';

/**
 * The browser's Neon client — TWO-URL OBJECT FORM.
 *
 * One object, two independent endpoints:
 *   auth.url     → Neon Managed Better Auth (sign up / in / out, issues the JWT)
 *   dataApi.url  → Neon Data API (PostgREST over HTTPS)
 *
 * The client attaches the session JWT to every Data API request automatically,
 * which is what lets `auth.user_id()` resolve inside Postgres and the RLS
 * policies evaluate. Both URLs are public on purpose: they are addresses, not
 * credentials. Anyone can point curl at them; RLS is what stops them reading
 * rows that are not theirs.
 */

const authUrl = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

/** Surfaced in the UI as a setup error rather than crashing the bundle. */
export const isConfigured = Boolean(authUrl && dataApiUrl);

export const neon = createClient<Database>({
  auth: { url: authUrl ?? 'https://unconfigured.invalid' },
  dataApi: { url: dataApiUrl ?? 'https://unconfigured.invalid/rest/v1' },
});

/**
 * The current session's JWT, for handing to our own write API.
 *
 * The SDK injects this itself for direct `.from()` reads. We need it in hand
 * only because writes take a detour through our server routes for validation,
 * and the server must be able to act as this user rather than as a superuser.
 *
 * The 0.7.0-beta typings do not surface the /token endpoint's response shape,
 * so this reads the two documented field names defensively.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const auth = neon.auth as unknown as {
      token?: () => Promise<{ data?: { token?: string } | null }>;
      getAccessToken?: () => Promise<{ data?: { accessToken?: string; token?: string } | null }>;
    };

    if (typeof auth.token === 'function') {
      const res = await auth.token();
      if (res?.data?.token) return res.data.token;
    }
    if (typeof auth.getAccessToken === 'function') {
      const res = await auth.getAccessToken();
      return res?.data?.accessToken ?? res?.data?.token ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Attach the bearer token to a request against our own write API. */
export async function authedFetch(input: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  return fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
