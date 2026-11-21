import type { APIRoute } from 'astro';
import { clearClaims, ClaimError, isItemId, removeClaim, safeReturn } from '../../lib/claims';
import { clearUndo, readUndo } from '../../lib/undo';

// mode=undo  → remove the one claim this browser just made (signed cookie).
// otherwise  → itemId: unclaim a regular (non gift card) item.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const json = request.headers.get('accept')?.includes('application/json');
  const back = safeReturn(form.get('returnTo'));
  const done = (itemId: string) =>
    json ? Response.json({ ok: true }) : redirect(`${back}#item-${itemId}`, 303);
  const fail = (error: string, status: number) =>
    json ? Response.json({ error }, { status }) : redirect(`${back}?error=${error}`, 303);

  try {
    if (form.get('mode') === 'undo') {
      const token = readUndo(cookies);
      if (!token) return fail('undo-expired', 400);
      await removeClaim(token.itemId, token.claimId);
      clearUndo(cookies);
      return done(token.itemId);
    }
    const itemId = form.get('itemId');
    if (!isItemId(itemId)) return fail('not-found', 400);
    await clearClaims(itemId);
    return done(itemId);
  } catch (err) {
    const code = err instanceof ClaimError ? err.code : 'server';
    if (!(err instanceof ClaimError)) console.error(err);
    return fail(code, code === 'server' ? 500 : 404);
  }
};
