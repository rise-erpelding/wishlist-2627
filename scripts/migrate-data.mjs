#!/usr/bin/env node
// Fills the two new item fields (`claims`, `image`) for items that are NOT stale.
// Stale items are left exactly as they are. isStale is never changed.
//
//   npm run migrate:data            preview only (default), changes nothing
//   npm run migrate:data -- --apply write to Contentful
//
// Safe to re-run: it only fills `claims` and `image` when they are empty.
// Never prints giver emails.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const LOCALE = 'en-US';

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const ENV = process.env.CONTENTFUL_ENVIRONMENT || 'master';
const TOKEN = process.env.CONTENTFUL_MANAGEMENT_TOKEN || cliToken();
if (!SPACE || !TOKEN) {
  console.error('Need CONTENTFUL_SPACE_ID in .env and a management token (.env or `contentful login`).');
  process.exit(1);
}

function cliToken() {
  try {
    return JSON.parse(readFileSync(`${homedir()}/.contentfulrc.json`, 'utf8')).managementToken;
  } catch {
    return undefined;
  }
}

// ---------- tiny CMA client ----------

const BASE = `https://api.contentful.com/spaces/${SPACE}/environments/${ENV}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cma(method, path, { body, version } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/vnd.contentful.management.v1+json',
        ...(version != null && { 'X-Contentful-Version': String(version) }),
      },
      body: body && JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 5) {
      await sleep(Number(res.headers.get('x-contentful-ratelimit-reset') || 1) * 1000 + 250);
      continue;
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.message ?? text.slice(0, 200)}`);
    return json;
  }
}

async function all(path) {
  const out = [];
  for (let skip = 0; ; skip += 1000) {
    const page = await cma('GET', `${path}${path.includes('?') ? '&' : '?'}limit=1000&skip=${skip}`);
    out.push(...page.items);
    if (skip + 1000 >= page.total) return out;
  }
}

const v = (entry, field) => entry.fields[field]?.[LOCALE];
const isPublishedAndClean = (e) => !!e.sys.publishedVersion && e.sys.version === e.sys.publishedVersion + 1;
const status = (e) => (!e.sys.publishedVersion ? 'draft' : isPublishedAndClean(e) ? 'published' : 'has unpublished edits');

// Save field changes, then republish only if the entry was published with no
// pending edits before we touched it (so we never publish the owner's drafts).
async function save(entry, changes) {
  const wasClean = isPublishedAndClean(entry);
  for (const [k, val] of Object.entries(changes)) entry.fields[k] = { [LOCALE]: val };
  if (!APPLY) return;
  const saved = await cma('PUT', `/entries/${entry.sys.id}`, { body: { fields: entry.fields }, version: entry.sys.version });
  if (wasClean) await cma('PUT', `/entries/${saved.sys.id}/published`, { version: saved.sys.version });
}

// Old claim (isClaimed + claimedBy) → one entry in the new `claims` list.
function legacyClaims(item) {
  if (!v(item, 'isClaimed')) return [];
  return [{ id: randomUUID(), name: '', email: v(item, 'claimedBy') || '', at: item.sys.updatedAt }];
}

function guessContentType(url) {
  const ext = new URL(url).pathname.split('.').pop().toLowerCase();
  return { png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml' }[ext] ?? 'image/jpeg';
}

// Contentful downloads the image from the shop itself. Some shops block it.
async function uploadImage(title, url) {
  const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').slice(0, 100) || 'image';
  let asset = await cma('POST', '/assets', {
    body: {
      fields: {
        title: { [LOCALE]: title.slice(0, 250) },
        file: { [LOCALE]: { contentType: guessContentType(url), fileName, upload: url } },
      },
    },
  });
  await cma('PUT', `/assets/${asset.sys.id}/files/${LOCALE}/process`, { version: asset.sys.version });
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    asset = await cma('GET', `/assets/${asset.sys.id}`);
    if (asset.fields.file?.[LOCALE]?.url) {
      await cma('PUT', `/assets/${asset.sys.id}/published`, { version: asset.sys.version });
      return asset.sys.id;
    }
  }
  await cma('DELETE', `/assets/${asset.sys.id}`, { version: asset.sys.version }).catch(() => {});
  throw new Error('Contentful could not fetch the image (site probably blocks it)');
}

// ---------- run ----------

const log = { claims: [], images: [], imageFailures: [], skipped: [] };
const items = (await all('/entries?content_type=item&order=sys.createdAt')).filter((i) => !v(i, 'isStale'));

for (const item of items) {
  const title = v(item, 'title');
  if (!title) {
    log.skipped.push(`${item.sys.id}: empty untitled ${status(item)}`);
    continue;
  }

  // 1. Copy the old claim into `claims` (only if `claims` is still empty).
  if (v(item, 'claims') == null) {
    const claims = legacyClaims(item);
    if (claims.length) log.claims.push(`${title.slice(0, 60)} [${status(item)}]`);
    await save(item, { claims });
  }

  // 2. Upload the image as an Asset (only if `image` is still empty).
  const url = v(item, 'imageUrl');
  if (v(item, 'image') || !url) continue;
  const host = new URL(url).host;
  if (!APPLY) {
    log.images.push(`${title.slice(0, 60)} (${host})`);
    continue;
  }
  try {
    const assetId = await uploadImage(title, url);
    const fresh = await cma('GET', `/entries/${item.sys.id}`);
    await save(fresh, { image: { sys: { type: 'Link', linkType: 'Asset', id: assetId } } });
    log.images.push(`${title.slice(0, 60)} (${host})`);
  } catch (err) {
    log.imageFailures.push(`${title.slice(0, 60)} (${host}): ${err.message}`);
  }
}

// ---------- report ----------

const section = (name, lines) => lines.length && console.log(`\n## ${name} (${lines.length})\n` + lines.map((l) => `  - ${l}`).join('\n'));
console.log(APPLY ? '# APPLIED to Contentful' : '# PREVIEW ONLY: nothing was changed. Re-run with --apply to write.');
console.log(`environment: ${ENV}, items that are not stale: ${items.length}`);
section('Claims copied from isClaimed/claimedBy', log.claims);
section(APPLY ? 'Images uploaded' : 'Images to upload', log.images);
section('Image uploads that failed (upload by hand)', log.imageFailures);
section('Skipped', log.skipped);
