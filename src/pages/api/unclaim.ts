import type { APIRoute } from 'astro';
import { ClaimError, removeClaim, safeReturn } from '../../lib/claims';
import { clearUndo, readUndo } from '../../lib/undo';

// Undo only: remove the one claim this browser just made (signed 10-minute cookie).
// There is deliberately no way to clear someone else's claim from the site.
// To fix a claim later, the owner edits `claims` in Contentful.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const json = request.headers.get('accept')?.includes('application/json');
  const back = safeReturn(form.get('returnTo'));
  const done = (itemId: string) =>
    json ? Response.json({ ok: true }) : redirect(`${back}#item-${itemId}`, 303);
  const fail = (error: string, status: number) =>
    json ? Response.json({ error }, { status }) : redirect(`${back}?error=${error}`, 303);

  try {
    const token = readUndo(cookies);
    if (!token) return fail('undo-expired', 400);
    await removeClaim(token.itemId, token.claimId);
    clearUndo(cookies);
    return done(token.itemId);
  } catch (err) {
    const code = err instanceof ClaimError ? err.code : 'server';
    if (!(err instanceof ClaimError)) console.error(err);
    return fail(code, code === 'server' ? 500 : 404);
  }
};
