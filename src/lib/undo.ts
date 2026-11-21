// Short-lived signed cookie that lets the person who just claimed something undo it.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { CONTENTFUL_MANAGEMENT_TOKEN } from 'astro:env/server';

const COOKIE = 'wl_undo';
const MAX_AGE = 10 * 60; // seconds

export interface UndoToken {
  itemId: string;
  claimId: string;
}

// Key derived from a server secret we already have, so there is no extra env var.
const key = () => createHmac('sha256', CONTENTFUL_MANAGEMENT_TOKEN ?? '').update('wishlist-undo-v1').digest();
const sign = (data: string) => createHmac('sha256', key()).update(data).digest('base64url');

export function setUndo(cookies: AstroCookies, token: UndoToken) {
  const data = Buffer.from(JSON.stringify({ ...token, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  cookies.set(COOKIE, `${data}.${sign(data)}`, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: MAX_AGE,
  });
}

export function readUndo(cookies: AstroCookies): UndoToken | null {
  const raw = cookies.get(COOKIE)?.value;
  if (!raw) return null;
  const [data, sig] = raw.split('.');
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const t = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (typeof t.exp !== 'number' || t.exp < Date.now()) return null;
    return { itemId: String(t.itemId), claimId: String(t.claimId) };
  } catch {
    return null;
  }
}

export function clearUndo(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' });
}
