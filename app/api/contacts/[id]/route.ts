import { validateContact } from '@/lib/validation';
import { dataApiAs, bearerToken, friendlyDbError, json } from '@/lib/server/data-api';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/contacts/:id — edit a contact.
 *
 * There is no ownership check in this file, and that is the point. We never
 * ask "does this row belong to the caller?" in application code, because that
 * check is exactly the kind that gets forgotten in a later refactor. The
 * UPDATE policy's USING clause makes another user's row unreachable, and its
 * WITH CHECK clause makes it impossible to hand a row to a different user_id.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;

  const token = bearerToken(request);
  if (!token) {
    return json({ message: 'You must be signed in to edit a contact.' }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ message: 'Invalid request body.' }, 400);
  }

  const result = validateContact(payload);
  if (!result.ok) {
    return json(
      { message: result.error.message, fieldErrors: result.error.fieldErrors },
      422
    );
  }

  const db = dataApiAs(token);
  const { data, error } = await db
    .from('contacts')
    .update(result.value)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // PGRST116 = "no rows returned". Either the contact does not exist, or it
    // exists but belongs to someone else and RLS hid it. We answer the same
    // way for both on purpose: distinguishing them would confirm to an
    // attacker that a given id is real.
    if (error.code === 'PGRST116') {
      return json({ message: 'Contact not found.' }, 404);
    }
    const { message, status } = friendlyDbError(error);
    return json({ message }, status);
  }

  return json({ contact: data });
}

/** DELETE /api/contacts/:id — remove a contact. Same RLS reasoning as PATCH. */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;

  const token = bearerToken(request);
  if (!token) {
    return json({ message: 'You must be signed in to delete a contact.' }, 401);
  }

  const db = dataApiAs(token);
  const { data, error } = await db.from('contacts').delete().eq('id', id).select();

  if (error) {
    const { message, status } = friendlyDbError(error);
    return json({ message }, status);
  }
  if (!data || data.length === 0) {
    return json({ message: 'Contact not found.' }, 404);
  }

  return json({ id });
}
