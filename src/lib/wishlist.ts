// Server-only. The only module that reads Contentful for pages.
// It returns a PUBLIC shape: claim counts, never giver names or emails.
import { CONTENTFUL_DELIVERY_TOKEN, CONTENTFUL_ENVIRONMENT, CONTENTFUL_SPACE_ID } from 'astro:env/server';

export type CategoryKey = 'items' | 'books' | 'gift-cards';

export interface Recipient {
  id: string;
  name: string;
  slug: string;
}

export interface PublicItem {
  id: string;
  title: string;
  description: string;
  url: string | null;
  recipientIds: string[];
  category: CategoryKey;
  categoryLabel: string;
  /** Gift cards can be claimed by several people. */
  multi: boolean;
  claimCount: number;
  /** Not available to claim any more (one claim on a normal item). */
  claimed: boolean;
  image: { src: string; srcset: string; hosted: boolean } | null;
}

interface Link {
  sys: { id: string };
}
interface RawEntry {
  sys: { id: string; createdAt: string; contentType: { sys: { id: string } } };
  fields: Record<string, unknown>;
}
interface RawAsset {
  sys: { id: string };
  fields: { file?: { url: string } };
}
interface EntriesResponse {
  items: RawEntry[];
  includes?: { Entry?: RawEntry[]; Asset?: RawAsset[] };
}

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function cda(query: Record<string, string>): Promise<EntriesResponse> {
  if (!CONTENTFUL_SPACE_ID || !CONTENTFUL_DELIVERY_TOKEN) {
    throw new Error('Missing CONTENTFUL_SPACE_ID or CONTENTFUL_DELIVERY_TOKEN');
  }
  const url = new URL(
    `https://cdn.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENVIRONMENT}/entries`,
  );
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${CONTENTFUL_DELIVERY_TOKEN}` } });
  if (!res.ok) throw new Error(`Contentful ${res.status}`);
  return res.json();
}

function categoryOf(titles: string[]): { key: CategoryKey; label: string } {
  const t = titles.map((x) => x.toLowerCase());
  if (t.includes('gift cards')) return { key: 'gift-cards', label: 'Gift card' };
  if (t.includes('books')) return { key: 'books', label: 'Book' };
  return { key: 'items', label: 'Thing' };
}

function imageFor(fields: Record<string, unknown>, assets: Map<string, RawAsset>): PublicItem['image'] {
  const assetUrl = assets.get((fields.image as Link | undefined)?.sys.id ?? '')?.fields.file?.url;
  if (assetUrl) {
    // Contentful Images API: resized WebP.
    const base = `https:${assetUrl}`;
    const at = (w: number) => `${base}?w=${w}&fm=webp&q=72`;
    return { src: at(480), srcset: [320, 480, 720, 960].map((w) => `${at(w)} ${w}w`).join(', '), hosted: true };
  }
  // Fallback: the shop's own image link (a few shops block Contentful from copying it).
  const ext = fields.imageUrl;
  return typeof ext === 'string' && ext.startsWith('http') ? { src: ext, srcset: '', hosted: false } : null;
}

export async function getWishlist(): Promise<{ recipients: Recipient[]; items: PublicItem[] }> {
  const [lists, itemsRes] = await Promise.all([
    cda({ content_type: 'wishList', limit: '100' }),
    cda({
      content_type: 'item',
      'fields.isStale[ne]': 'true',
      order: '-sys.createdAt',
      include: '1',
      limit: '1000',
    }),
  ]);

  const recipients = lists.items
    .map((e) => ({ id: e.sys.id, name: String(e.fields.title ?? ''), slug: slugify(String(e.fields.title ?? '')) }))
    .filter((r) => r.slug)
    .sort((a, b) => a.name.localeCompare(b.name));

  const includedEntries = new Map((itemsRes.includes?.Entry ?? []).map((e) => [e.sys.id, e]));
  const assets = new Map((itemsRes.includes?.Asset ?? []).map((a) => [a.sys.id, a]));

  const items = itemsRes.items
    .filter((e) => e.fields.title)
    .map((e): PublicItem => {
      const f = e.fields;
      const catTitles = ((f.category as Link[] | undefined) ?? []).map((l) =>
        String(includedEntries.get(l.sys.id)?.fields.title ?? ''),
      );
      const { key, label } = categoryOf(catTitles);
      const multi = key === 'gift-cards';
      // Only the COUNT leaves this function. Names and emails stay here.
      const claimCount = Array.isArray(f.claims) ? f.claims.length : 0;
      return {
        id: e.sys.id,
        title: String(f.title),
        description: typeof f.description === 'string' ? f.description : '',
        url: typeof f.url === 'string' && f.url.startsWith('http') ? f.url : null,
        recipientIds: ((f.wishList as Link[] | undefined) ?? []).map((l) => l.sys.id),
        category: key,
        categoryLabel: label,
        multi,
        claimCount,
        claimed: !multi && claimCount > 0,
        image: imageFor(f, assets),
      };
    });

  return { recipients, items };
}

/** Open items first, then claimed. Newest first within each group. */
export function sortForList(items: PublicItem[]): PublicItem[] {
  return [...items].sort((a, b) => Number(a.claimed) - Number(b.claimed));
}
