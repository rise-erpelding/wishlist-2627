#!/usr/bin/env node
// Add an item to the wish list from a product link.
//
//   npm run add-item                    asks for everything
//   npm run add-item -- <url>           starts from a link
//   npm run add-item -- <url> --dry-run shows what it would create, saves nothing
//
// Reads the page's title, description and picture, lets you edit them,
// pick the list(s) and category, then uploads the picture to Contentful
// and creates the item. Uses CONTENTFUL_MANAGEMENT_TOKEN from .env, or your
// `contentful login` token.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const argUrl = args.find((a) => /^https?:\/\//.test(a));
const LOCALE = 'en-US';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

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

// ---------- Contentful ----------

const BASE = `https://api.contentful.com/spaces/${SPACE}/environments/${ENV}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cma(method, path, { body, version, contentType } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      ...(version != null && { 'X-Contentful-Version': String(version) }),
      ...(contentType && { 'X-Contentful-Content-Type': contentType }),
    },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Contentful ${method} ${path} → ${res.status} ${json.message ?? ''}`);
  return json;
}

const v = (e, f) => e.fields?.[f]?.[LOCALE];
const link = (id, linkType = 'Entry') => ({ sys: { type: 'Link', linkType, id } });

// Upload the picture's bytes ourselves (shops often block Contentful from fetching it).
async function uploadImage(title, bytes, mime, fileName) {
  const up = await fetch(`https://upload.contentful.com/spaces/${SPACE}/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/octet-stream' },
    body: bytes,
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`upload ${r.status}`))));
  let asset = await cma('POST', '/assets', {
    body: {
      fields: {
        title: { [LOCALE]: title.slice(0, 250) },
        file: { [LOCALE]: { contentType: mime, fileName, uploadFrom: link(up.sys.id, 'Upload') } },
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
  throw new Error('Contentful did not finish processing the picture');
}

// ---------- reading the product page ----------

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

function meta(html, ...keys) {
  for (const key of keys) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i'))?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return '';
}

async function readPage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
    if (!res.ok) return { error: `the shop answered ${res.status}` };
    const html = await res.text();
    const rawTitle =
      meta(html, 'og:title', 'twitter:title') || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '');
    // Drop shop boilerplate: "Amazon.com: Thing : Toys & Games", "Thing : Target".
    const title = rawTitle
      .replace(/^Amazon\.com\s*:\s*/i, '')
      .replace(/\s+:\s+(Target|Toys & Games|Books|Home & Kitchen|Clothing, Shoes & Jewelry|Sports & Outdoors|Video Games|Everything Else)$/i, '')
      .trim();
    let description = meta(html, 'og:description', 'description', 'twitter:description');
    // Many shops repeat the title as the description; that's not worth keeping.
    if (description.replace(/^Amazon\.com\s*:\s*/i, '').startsWith(title.slice(0, 40))) description = '';
    let image =
      meta(html, 'og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src') ||
      // Amazon puts the product photo in its page data rather than meta tags.
      html.match(/data-old-hires=["'](https:[^"']+)["']/i)?.[1] ||
      html.match(/"hiRes":"(https:[^"]+)"/)?.[1] ||
      html.match(/"large":"(https:[^"]+)"/)?.[1] ||
      '';
    if (image) image = new URL(image, url).href;
    return { title, description, image };
  } catch (err) {
    return { error: err.message };
  }
}

async function downloadImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
  const mime = (res.headers.get('content-type') ?? '').split(';')[0];
  if (!res.ok || !mime.startsWith('image/')) throw new Error(`picture download failed (${res.status} ${mime || 'no type'})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  return { bytes, mime, fileName: `item.${ext}` };
}

// ---------- prompts ----------

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, def = '') => {
  const a = (await rl.question(def ? `${q} [${def.length > 60 ? def.slice(0, 57) + '...' : def}]: ` : `${q}: `)).trim();
  return a || def;
};
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function pick(label, options, { multiple = false } = {}) {
  console.log(`\n${label}:`);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o.label}`));
  for (;;) {
    const answer = await ask(multiple ? 'Number(s), comma-separated' : 'Number');
    const nums = answer.split(/[,\s]+/).filter(Boolean).map(Number);
    const chosen = nums.map((n) => options[n - 1]).filter(Boolean);
    if (chosen.length && chosen.length === nums.length && (multiple || chosen.length === 1)) return chosen;
    console.log('  Pick from the numbers above.');
  }
}

// ---------- main ----------

try {
  console.log(`\n🎁 Add an item${DRY ? ' (dry run: nothing will be saved)' : ''}\n`);

  const [listsRes, catsRes] = await Promise.all([
    cma('GET', '/entries?content_type=wishList&limit=100'),
    cma('GET', '/entries?content_type=category&limit=100'),
  ]);
  const lists = listsRes.items
    .map((e) => ({ id: e.sys.id, label: v(e, 'title') }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const url = argUrl || (await ask('Product link'));
  if (!/^https?:\/\//.test(url)) throw new Error('That needs to be a link starting with http.');

  // Warn about an item that's already on the list with the same link
  // (ignoring ?tracking=stuff, which shops add to every link).
  const bare = (u) => {
    try {
      const x = new URL(u);
      return (x.host.replace(/^www\./, '') + x.pathname).replace(/\/+$/, '').toLowerCase();
    } catch {
      return u;
    }
  };
  const allItems = await cma('GET', '/entries?content_type=item&limit=1000&select=fields.title,fields.url,fields.isStale');
  const liveDupes = allItems.items.filter((e) => v(e, 'isStale') !== true && v(e, 'url') && bare(v(e, 'url')) === bare(url));
  if (liveDupes.length) {
    console.log(`\n⚠️  Already on the list: "${v(liveDupes[0], 'title')}"`);
    if ((await ask('Add it again anyway? (y/N)', 'n')).toLowerCase() !== 'y') throw new Error('Cancelled');
  }

  console.log('\nReading the product page...');
  const page = await readPage(url);
  if (page.error) console.log(`  Couldn't read it (${page.error}). Some shops (Amazon, LEGO) block this; just type the details.`);
  else console.log(`  Found: ${page.title ? 'title' : 'no title'}, ${page.description ? 'description' : 'no description'}, ${page.image ? 'picture' : 'no picture'}`);

  console.log('\nPress Enter to keep what is in [brackets].');
  const title = await ask('Title', page.title ?? '');
  if (!title) throw new Error('A title is needed.');
  const description = await ask('Description (optional; "-" for none)', page.description ? short(page.description, 300) : '');

  const chosenLists = await pick('Whose list? (several = everyone on it can see it)', lists, { multiple: true });
  // Categories shared by every chosen list, so the item files under each of them.
  const catOptions = catsRes.items
    .filter((c) => {
      const ids = (v(c, 'wishList') ?? []).map((l) => l.sys.id);
      return chosenLists.every((l) => ids.includes(l.id));
    })
    .map((c) => ({ id: c.sys.id, label: v(c, 'title') }));
  if (!catOptions.length) throw new Error('No category is set up for that list in Contentful. Add one there first.');
  const [category] = catOptions.length === 1 ? catOptions : await pick('Category', catOptions);
  if (catOptions.length === 1) console.log(`\nCategory: ${category.label}`);

  let imageUrl = await ask('\nPicture link (Enter to keep, "-" for none)', page.image ?? '');
  if (imageUrl === '-') imageUrl = '';
  const publish = (await ask('Publish now so it shows on the site? (Y/n)', 'y')).toLowerCase() !== 'n';

  console.log('\n--- New item ---');
  console.log(`Title:       ${title}`);
  console.log(`Description: ${description && description !== '-' ? short(description) : '(none)'}`);
  console.log(`Link:        ${short(url)}`);
  console.log(`List:        ${chosenLists.map((l) => l.label).join(', ')}`);
  console.log(`Category:    ${category.label}`);
  console.log(`Picture:     ${imageUrl ? short(imageUrl) : '(none)'}`);
  console.log(`Status:      ${publish ? 'published' : 'draft'}`);
  if ((await ask('\nCreate it? (Y/n)', 'y')).toLowerCase() === 'n') throw new Error('Cancelled');

  let imageId = null;
  if (imageUrl) {
    try {
      console.log('\nGetting the picture...');
      const img = await downloadImage(imageUrl);
      if (DRY) console.log(`  (dry run) would upload ${img.mime}, ${Math.round(img.bytes.length / 1024)} KB`);
      else imageId = await uploadImage(title, img.bytes, img.mime, img.fileName);
      if (imageId) console.log('  ✓ Uploaded');
    } catch (err) {
      console.log(`  Couldn't upload the picture (${err.message}). The site will use the link; you can drop a picture into Image in Contentful later.`);
    }
  }

  const fields = {
    title: { [LOCALE]: title },
    url: { [LOCALE]: url },
    wishList: { [LOCALE]: chosenLists.map((l) => link(l.id)) },
    category: { [LOCALE]: [link(category.id)] },
    isClaimed: { [LOCALE]: false },
    isStale: { [LOCALE]: false },
    claims: { [LOCALE]: [] },
    ...(description && description !== '-' && { description: { [LOCALE]: description } }),
    ...(imageUrl && { imageUrl: { [LOCALE]: imageUrl } }),
    ...(imageId && { image: { [LOCALE]: link(imageId, 'Asset') } }),
  };

  if (DRY) {
    console.log('\n(dry run) Nothing saved.');
  } else {
    const entry = await cma('POST', '/entries', { body: { fields }, contentType: 'item' });
    if (publish) await cma('PUT', `/entries/${entry.sys.id}/published`, { version: entry.sys.version });
    console.log(`\n✅ ${publish ? 'Added and published' : 'Saved as a draft'}: ${title}`);
    console.log(`   Edit: https://app.contentful.com/spaces/${SPACE}/environments/${ENV}/entries/${entry.sys.id}`);
  }
} catch (err) {
  console.log(err.message === 'Cancelled' ? '\nCancelled. Nothing saved.' : `\n❌ ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
