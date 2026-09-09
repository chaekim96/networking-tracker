import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Integration test for the RLS boundary.
 *
 * The unit tests in validation.test.ts cover application-level validation.
 * They cannot catch the failure that actually matters here: someone loosening
 * a policy in db/schema.sql so one user can reach another user's rows. This
 * test asserts that boundary against a real Neon database, over the same
 * public Data API the browser uses, with two real signed-in users.
 *
 * It talks to the Data API directly rather than through the Next.js routes, so
 * it needs no dev server — and, more importantly, it tests the layer that is
 * actually load-bearing. If the API routes vanished tomorrow, these assertions
 * would still have to hold.
 *
 * Skipped unless credentials are present, so `npm test` stays green offline:
 *   npm run test:rls
 */

// Load .env.local only when explicitly asked for. `npm test` must not depend
// on network access or live credentials, so without this flag the suite below
// skips instead of failing on a machine that has neither.
if (process.env.RLS_INTEGRATION === '1') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // no .env.local — the skipIf guard below handles it
  }
}

const AUTH = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const DATA = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
const A_EMAIL = process.env.RLS_TEST_A_EMAIL;
const A_PASSWORD = process.env.RLS_TEST_A_PASSWORD;
const B_EMAIL = process.env.RLS_TEST_B_EMAIL;
const B_PASSWORD = process.env.RLS_TEST_B_PASSWORD;

const configured = Boolean(AUTH && DATA && A_EMAIL && A_PASSWORD && B_EMAIL && B_PASSWORD);

/** Sign in and exchange the session cookie for the JWT the Data API accepts. */
async function tokenFor(email: string, password: string): Promise<string> {
  const signIn = await fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ email, password }),
  });
  if (!signIn.ok) throw new Error(`sign-in failed for ${email}: ${signIn.status}`);

  const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
  const res = await fetch(`${AUTH}/token`, {
    headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error(`no token for ${email}`);
  return body.token;
}

const api = (token: string) => ({
  async get(path: string) {
    const res = await fetch(`${DATA}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json() };
  },
  async send(method: string, path: string, payload?: unknown) {
    const res = await fetch(`${DATA}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  },
});

describe.skipIf(!configured)('RLS ownership boundary (integration)', () => {
  let a: ReturnType<typeof api>;
  let b: ReturnType<typeof api>;
  let aUserId: string;
  let bUserId: string;
  let aRowId: string;

  beforeAll(async () => {
    const [ta, tb] = await Promise.all([
      tokenFor(A_EMAIL!, A_PASSWORD!),
      tokenFor(B_EMAIL!, B_PASSWORD!),
    ]);
    a = api(ta);
    b = api(tb);

    const claim = (t: string) =>
      JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub as string;
    aUserId = claim(ta);
    bUserId = claim(tb);

    const created = await a.send('POST', '/contacts', {
      name: 'RLS Integration Fixture',
      priority: 'high',
    });
    aRowId = created.body[0].id;
  }, 30_000);

  afterAll(async () => {
    if (a && aRowId) await a.send('DELETE', `/contacts?id=eq.${aRowId}`);
  });

  it('stamps new rows with the caller from the JWT, not the payload', async () => {
    const res = await a.send('POST', '/contacts', {
      name: 'Ownership Smuggle Attempt',
      priority: 'low',
      user_id: bUserId, // try to plant a row in B's list
    });
    // Either the write is rejected outright by the INSERT policy's WITH CHECK,
    // or the column default wins and the row belongs to A. Both are safe; what
    // must never happen is a row landing in B's account.
    if (res.status < 300) {
      expect(res.body[0].user_id).toBe(aUserId);
      await a.send('DELETE', `/contacts?id=eq.${res.body[0].id}`);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('A can read a row A owns', async () => {
    const { body } = await a.get(`/contacts?id=eq.${aRowId}&select=id,user_id`);
    expect(body).toHaveLength(1);
    expect(body[0].user_id).toBe(aUserId);
  });

  it('B cannot read A rows, even asking for the id directly', async () => {
    const { body } = await b.get(`/contacts?id=eq.${aRowId}&select=*`);
    expect(body).toEqual([]);
  });

  it("B's full listing never contains a row owned by A", async () => {
    const { body } = await b.get('/contacts?select=user_id');
    for (const row of body as { user_id: string }[]) {
      expect(row.user_id).toBe(bUserId);
    }
  });

  it('B cannot update A row', async () => {
    const res = await b.send('PATCH', `/contacts?id=eq.${aRowId}`, { name: 'Hijacked' });
    expect(res.body ?? []).toEqual([]); // zero rows affected

    const after = await a.get(`/contacts?id=eq.${aRowId}&select=name`);
    expect(after.body[0].name).toBe('RLS Integration Fixture');
  });

  it('B cannot delete A row', async () => {
    const res = await b.send('DELETE', `/contacts?id=eq.${aRowId}`);
    expect(res.body ?? []).toEqual([]);

    const after = await a.get(`/contacts?id=eq.${aRowId}&select=id`);
    expect(after.body).toHaveLength(1); // still there
  });

  it('A cannot hand a row to another user by rewriting user_id', async () => {
    // This is the attack that USING alone would allow: the row IS A's, so the
    // USING clause passes. Only WITH CHECK on UPDATE stops the new value.
    await a.send('PATCH', `/contacts?id=eq.${aRowId}`, { user_id: bUserId });

    const stillA = await a.get(`/contacts?id=eq.${aRowId}&select=user_id`);
    expect(stillA.body).toHaveLength(1);
    expect(stillA.body[0].user_id).toBe(aUserId);

    const notB = await b.get(`/contacts?id=eq.${aRowId}&select=id`);
    expect(notB.body).toEqual([]);
  });

  it('rejects an invalid priority at the database', async () => {
    const res = await a.send('POST', '/contacts', { name: 'Bad', priority: 'urgent' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects a whitespace-only name at the database', async () => {
    const res = await a.send('POST', '/contacts', { name: '   ', priority: 'high' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects anonymous reads', async () => {
    const res = await fetch(`${DATA}/contacts?select=*`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
