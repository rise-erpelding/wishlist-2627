# Erp Wish List 2026–2027

The family wish list. Each person has a page of things they'd like. Family members claim an item ("I'll give this") so nobody doubles up. No accounts: anyone with the link can claim, undo, and unclaim. Giver names and emails are optional, and only the list owner sees them, in Contentful.

Version 3. v1 was Next.js and v2 was Lit ([wishlist-2526](../wishlist-2526), reference only). This one is [Astro](https://astro.build), rendered on the server, hosted on Netlify, with content in Contentful.

## Quick start

```bash
nvm use            # Node 24 (from .nvmrc)
npm install
cp .env.example .env   # then fill it in, see below
npm run dev        # http://localhost:4321
```

### Environment variables

All of them are **server-only secrets**. Never give one a `PUBLIC_` prefix and never read them in browser code. Set the same names in Netlify for deploys.

| Name | What it's for | Where to get it |
|---|---|---|
| `CONTENTFUL_SPACE_ID` | Which space | Contentful → Settings → General settings |
| `CONTENTFUL_ENVIRONMENT` | Which environment | `master` |
| `CONTENTFUL_DELIVERY_TOKEN` | Reading items for pages | Settings → API keys → `wishlist-2627` → Content Delivery API token |
| `CONTENTFUL_MANAGEMENT_TOKEN` | Saving claims; scripts | Settings → CMA tokens. Scripts fall back to your `contentful login` token |

The management token also signs the Undo cookie, so rotating it just expires any Undo that is open at that moment.

### Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on port 4321 |
| `npm run build` | Production build for Netlify |
| `npm run preview` | Serve the production build locally |
| `npm run migrate:data` | One-off data script, **preview only** (see below) |

## Managing the list (in Contentful)

The content model is the same as last year's, plus two fields on Item.

- **Wish List**: one per person, plus "Both Kids" for shared gifts. The page address comes from the title: `Both Kids` → `/both-kids`.
- **Category**: Items, Books, Gift Cards. An item in **Gift Cards** can be claimed by several people. Every other item takes one claim.
- **Item**:
  - `title`, `description`, `url`
  - `wishList` and `category` (references; an item on two lists shows on both pages)
  - `image` (upload a picture here) or `imageUrl` (a link, used only if there's no uploaded image)
  - `claims`: **private** JSON list of who is giving it, newest last: `[{ "id", "name", "email", "at" }]`. The site only ever shows how many. Edit it by hand to fix a claim, `[]` clears it.
  - `isClaimed`, `claimedBy`: last year's fields. The site keeps `isClaimed` in sync for the list view, but reads `claims`.
  - `isStale`: **how you archive.** The site shows only items that aren't stale. Mark things stale after Christmas and after birthdays.

**To add an item:** create an Item, fill in title, link, list and category, drop a picture into Image, publish. Only published items show.

**To see who is giving what:** open the item and look at Claims.

Per-person colors and notes (like "Gifts for David and James to share.") live in [`src/lib/site.ts`](src/lib/site.ts). The site title is there too.

## How claiming works

1. "I'll give this" opens a dialog: name and email, both optional, plus a hidden honeypot field for bots.
2. `POST /api/claim` loads the item with the Management API, checks it's published, not stale, and still claimable, appends to `claims`, saves with the version header, and publishes. If someone else saved at the same moment, it reloads and tries once more, so both claims are counted and a regular item can't be claimed twice.
3. The response sets a signed, HttpOnly, 10-minute cookie naming that one claim. The page shows an Undo toast. Undo (`POST /api/unclaim`, `mode=undo`) removes exactly that claim. The next list page view without the `?claimed=` marker drops the cookie, so Undo is offered once.
4. Regular items also have an **Unclaim** link that clears all claims after a confirm. Gift cards can only be undone by the person who claimed.

Everything works without JavaScript as plain form posts and redirects. With JavaScript, the card updates in place. Cross-site posts are rejected by Astro's origin check.

Contentful's public API takes a few seconds to catch up after a change, so a reload right after claiming can briefly show the old state. Claims are checked against the Management API, so that lag never allows a double claim.

## Privacy rules (don't break these)

- Contentful is only ever called from the server. The browser never sees a token.
- [`src/lib/wishlist.ts`](src/lib/wishlist.ts) is the only place pages read items. It turns `claims` into a count before anything renders. Don't pass raw entries to components.
- List pages send `Cache-Control: private, no-cache` and the Netlify adapter has CDN caching off, so claims show up right away. Don't add caching to "make it faster" without keeping this.
- `backups/` holds Contentful exports with giver emails. It's git-ignored. Keep it that way.

## Project layout

```
src/
  pages/
    index.astro            Home: a card per person
    [recipient].astro      A person's list, plus claim dialog and Undo toast
    api/claim.ts           POST: claim an item
    api/unclaim.ts         POST: undo a claim, or unclaim a regular item
  components/              SiteHeader, Hero, Filters, ItemCard, ClaimDialog, UndoToast, SiteFooter
  lib/
    wishlist.ts            Reads Contentful (Delivery API), returns the public shape
    claims.ts              Writes claims (Management API), input checks
    undo.ts                Signed Undo cookie
    site.ts                Site title, per-person colors and notes
    colors.ts              The four brights
  scripts/claim.ts         Browser script: dialog, in-place updates, Undo
  styles/tokens.css        Design tokens (light and dark)
  styles/global.css        Pills, focus ring, shared bits
  layouts/Base.astro       Fonts, theme before paint, noindex
scripts/migrate-data.mjs   One-off data script (already run)
contentful/migrations/     Model changes, already applied (001–004 were reverted by 005–006)
PLAN.md                    The original plan and the decisions made along the way
```

## Design

Tokens are in [`src/styles/tokens.css`](src/styles/tokens.css): Bricolage Grotesque headings, Instrument Sans body, pill buttons, 32px card radius. The four brights (orange, blue, mint, yellow) are the same in both themes. Text on orange, mint, and yellow is dark ink; only blue takes white text. Light or dark follows the system until someone presses the toggle, which is remembered in `localStorage` and applied before the page draws so it never flashes.

## Data script (already run)

`npm run migrate:data` filled the two new fields for items that aren't stale: it copied last year's `isClaimed`/`claimedBy` into `claims` and uploaded each `imageUrl` as an Asset. It only fills empty fields and never touches `isStale`, so it's safe to run again. Without `-- --apply` it only previews.

## Not done yet

- Deploy: GitHub repo, Netlify site, env vars, and a separate management token for the live site.
- Delete last year's Contentful API key (it still exposes old claim emails).
- 4 images to upload by hand: Gulf Breeze Zoo Gift Card, Men's T-shirts (Patagonia), Stance Socks (×2).
- Add-item helper script (`scripts/add-item.mjs <url>`), planned for after launch.
