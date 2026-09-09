import 'server-only';
import { createClient } from '@neondatabase/neon-js';
import type { Database } from '@/lib/types';

/**
 * Server-side Data API access, scoped to one request's user.
 *
 * The key property: this does NOT use DATABASE_URL. It forwards the caller's
 * own JWT to the Data API, so every query still runs through the RLS policies
 * as that user. A bug in this file cannot leak another user's rows, because
 * this code has no privileges of its own — it only ever borrows the caller's.
 *
 * We also never verify or decode the token here. There is no point: Neon
 * validates the signature, and Postgres derives auth.user_id() from it. A
 * forged or expired token produces zero rows or an error from the database,
 * not a trusted identity in application code.
 */
export function dataApiAs(token: string) {
  const url = process.env.NEON_DATA_API_URL ?? process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!url) throw new Error('NEON_DATA_API_URL is not set. See .env.example.');

  return createClient<Database>({
    dataApi: { url, getToken: async () => token },
  });
}

/** Pull the bearer token the browser attached to a write request. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

type DbError = { code?: string; message?: string; details?: string } | null;

/**
 * Turn a Postgres/PostgREST error into something a user can act on.
 *
 * These are the last-line defences firing. Reaching one of these branches
 * means a request got past the browser AND past server-side validation, so
 * the message stays useful without echoing raw database internals back out.
 */
export function friendlyDbError(error: DbError): { message: string; status: number } {
  const raw = `${error?.message ?? ''} ${error?.details ?? ''}`;

  if (raw.includes('contacts_priority_valid')) {
    return { message: 'Priority must be one of: high, medium, low.', status: 422 };
  }
  if (raw.includes('contacts_name_not_blank')) {
    return { message: 'Name is required.', status: 422 };
  }
  // 42501 = insufficient_privilege, which is what an RLS policy denial looks
  // like on a write. The row exists but is not yours, or you tried to stamp it
  // with someone else's user_id.
  if (error?.code === '42501' || raw.includes('row-level security')) {
    return { message: 'You can only modify your own contacts.', status: 403 };
  }
  if (error?.code === 'PGRST301' || error?.code === '401') {
    return { message: 'Your session has expired. Please sign in again.', status: 401 };
  }
  return { message: 'Could not save your contact. Please try again.', status: 500 };
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}
