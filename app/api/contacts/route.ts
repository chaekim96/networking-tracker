import { validateContact } from '@/lib/validation';
import { dataApiAs, bearerToken, friendlyDbError, json } from '@/lib/server/data-api';

/**
 * POST /api/contacts — create a contact.
 *
 * Writes deliberately take this server-side detour instead of going straight
 * from the browser to the Data API. Validation that runs only in the browser
 * is advisory: anyone can skip the UI. Validation here cannot be skipped,
 * because this route is the only path the app's writes take, and the CHECK
 * constraints in db/schema.sql cover even the path around this route.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return json({ message: 'You must be signed in to add a contact.' }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ message: 'Invalid request body.' }, 400);
  }

  // TRUSTED VALIDATION. Runs on every write, no matter what the client did.
  const result = validateContact(payload);
  if (!result.ok) {
    return json(
      { message: result.error.message, fieldErrors: result.error.fieldErrors },
      422
    );
  }

  // Note what is NOT here: user_id. The column defaults to auth.user_id() in
  // Postgres, so the owner is derived from the verified token, never from
  // anything the client sent.
  const db = dataApiAs(token);
  const { data, error } = await db
    .from('contacts')
    .insert(result.value)
    .select()
    .single();

  if (error) {
    const { message, status } = friendlyDbError(error);
    return json({ message }, status);
  }

  return json({ contact: data }, 201);
}
