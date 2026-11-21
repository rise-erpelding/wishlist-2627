import type { APIRoute } from 'astro';
import { addClaim, ClaimError, cleanGiver, isItemId, safeReturn } from '../../lib/claims';
import { setUndo } from '../../lib/undo';

// Plain form POST (redirects back) or fetch with Accept: application/json.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const json = request.headers.get('accept')?.includes('application/json');
  const back = safeReturn(form.get('returnTo'));
  const itemId = form.get('itemId');

  const fail = (error: string, status: number) =>
    json
      ? Response.json({ error }, { status })
      : redirect(`${back}?${new URLSearchParams({ claim: isItemId(itemId) ? itemId : '', error })}#claim-dialog`, 303);

  if (!isItemId(itemId)) return fail('not-found', 400);
  const giver = cleanGiver(form);
  // Bots that fill the honeypot get a fake success and nothing is saved.
  if ('error' in giver && giver.error === 'spam') return json ? Response.json({ ok: true }) : redirect(back, 303);
  if ('error' in giver) return fail(giver.error, 400);

  try {
    const { claimId, claimCount, multi } = await addClaim(itemId, giver);
    setUndo(cookies, { itemId, claimId });
    return json
      ? Response.json({ ok: true, claimCount, claimed: !multi })
      : redirect(`${back}?claimed=${itemId}#item-${itemId}`, 303);
  } catch (err) {
    const code = err instanceof ClaimError ? err.code : 'server';
    if (!(err instanceof ClaimError)) console.error(err);
    return fail(code, code === 'taken' ? 409 : code === 'server' ? 500 : 404);
  }
};
