// Server-only. Claim and unclaim through the Contentful Management API.
// Giver names and emails are written here and never returned to callers.
import { randomUUID } from 'node:crypto';
import { CONTENTFUL_ENVIRONMENT, CONTENTFUL_MANAGEMENT_TOKEN, CONTENTFUL_SPACE_ID } from 'astro:env/server';

const LOCALE = 'en-US';

export interface Claim {
  id: string;
  name: string;
  email: string;
  at: string;
}

export type ClaimErrorCode = 'gone' | 'taken' | 'not-found' | 'server';
export class ClaimError extends Error {
  constructor(public code: ClaimErrorCode) {
    super(code);
  }
}

interface Entry {
  sys: { id: string; version: number; publishedVersion?: number; contentType: { sys: { id: string } } };
  fields: Record<string, Record<string, unknown> | undefined>;
}

class Conflict extends Error {}

async function cma<T>(method: string, path: string, opts: { body?: unknown; version?: number } = {}): Promise<T> {
  if (!CONTENTFUL_SPACE_ID || !CONTENTFUL_MANAGEMENT_TOKEN) throw new ClaimError('server');
  const res = await fetch(
    `https://api.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENVIRONMENT}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${CONTENTFUL_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/vnd.contentful.management.v1+json',
        ...(opts.version != null && { 'X-Contentful-Version': String(opts.version) }),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    },
  );
  if (res.status === 409) throw new Conflict();
  if (res.status === 404) throw new ClaimError('not-found');
  if (!res.ok) {
    console.error(`Contentful ${method} ${path} → ${res.status}`);
    throw new ClaimError('server');
  }
  return res.json() as Promise<T>;
}

const get = (e: Entry, field: string) => e.fields[field]?.[LOCALE];

async function loadItem(itemId: string): Promise<{ entry: Entry; claims: Claim[]; multi: boolean }> {
  const entry = await cma<Entry>('GET', `/entries/${itemId}`);
  if (entry.sys.contentType.sys.id !== 'item' || !entry.sys.publishedVersion || get(entry, 'isStale') === true) {
    throw new ClaimError('gone');
  }
  const catIds = ((get(entry, 'category') as { sys: { id: string } }[] | undefined) ?? []).map((l) => l.sys.id);
  let multi = false;
  if (catIds.length) {
    const cats = await cma<{ items: Entry[] }>('GET', `/entries?sys.id[in]=${catIds.join(',')}&limit=10`);
    multi = cats.items.some((c) => String(get(c, 'title') ?? '').toLowerCase() === 'gift cards');
  }
  const raw = get(entry, 'claims');
  return { entry, claims: Array.isArray(raw) ? (raw as Claim[]) : [], multi };
}

// Save new claims, then publish. On a version conflict (someone else saved
// the item at the same moment) the whole read-check-write runs once more,
// so neither person's claim is lost and the "taken" check sees both.
async function writeClaims(
  itemId: string,
  change: (current: { claims: Claim[]; multi: boolean }) => Claim[],
): Promise<{ claimCount: number; multi: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { entry, claims, multi } = await loadItem(itemId);
    const next = change({ claims, multi });
    entry.fields.claims = { [LOCALE]: next };
    // Keep the v2 checkbox in sync so it reads right in the Contentful list view.
    entry.fields.isClaimed = { [LOCALE]: next.length > 0 };
    try {
      const saved = await cma<Entry>('PUT', `/entries/${itemId}`, { body: { fields: entry.fields }, version: entry.sys.version });
      await cma('PUT', `/entries/${itemId}/published`, { version: saved.sys.version });
      return { claimCount: next.length, multi };
    } catch (err) {
      if (err instanceof Conflict && attempt === 0) continue;
      if (err instanceof Conflict) throw new ClaimError('server');
      throw err;
    }
  }
  throw new ClaimError('server');
}

export async function addClaim(itemId: string, giver: { name: string; email: string }) {
  const claim: Claim = { id: randomUUID(), name: giver.name, email: giver.email, at: new Date().toISOString() };
  const result = await writeClaims(itemId, ({ claims, multi }) => {
    if (!multi && claims.length > 0) throw new ClaimError('taken');
    return [...claims, claim];
  });
  return { ...result, claimId: claim.id };
}

/** Undo: remove exactly one claim, the one this browser just made. */
export function removeClaim(itemId: string, claimId: string) {
  return writeClaims(itemId, ({ claims }) => claims.filter((c) => c.id !== claimId));
}

// ---------- input checks ----------

export const isItemId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);

export function safeReturn(slug: unknown): string {
  return typeof slug === 'string' && /^[a-z0-9-]{1,60}$/.test(slug) ? `/${slug}` : '/';
}

export function cleanGiver(form: FormData): { name: string; email: string } | { error: 'email' | 'spam' } {
  if (String(form.get('website') ?? '') !== '') return { error: 'spam' }; // honeypot
  const name = String(form.get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const email = String(form.get('email') ?? '').trim().slice(0, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'email' };
  return { name, email };
}
