# Family wish list v3: build and migration plan

Hand this to Claude Code at the start of the new repo. Target: live by Thu Nov 26 (Thanksgiving). The list is used Nov to Feb, so polish and design-system extraction can follow launch.

## What it is
A no-account wish list. Recipients have items stored in Contentful. Gift givers claim an item with an optional name and email, so duplicates drop and the owner can see who gave what. v1 was Next.js, v2 was Lit web components. v3 is Astro.

## Decisions already made
- **Stack:** Astro, SSR, Netlify adapter. Plain Astro components. Small client scripts only where needed (filters, dialog, theme toggle). Native `<dialog>` for the claim form.
- **Design:** see `tokens.css` (light and dark). Color-blocked, chunky Bricolage Grotesque headings, Instrument Sans body, pill buttons, 32px card radius. Use CSS custom properties from day one. A formal design system comes after launch.
- **Dark mode:** `data-theme` on the root. Default from `prefers-color-scheme`, toggle stored in `localStorage`, set by a tiny inline script before paint to avoid a flash.
- **Brights are fixed in both themes.** Only neutrals flip. Text on orange, mint, yellow is `--on-bright` (dark ink). Only blue carries white text.
- **No accounts. Claiming is open.** Anyone with the link can claim and unclaim. Acceptable for a family list on an unlisted URL.
- **Gift cards** (items in the "Gift Cards" category) can be claimed by several people. No extra field: the site decides from the category.
- **Claims must show up quickly.** No CDN caching of list pages. Read from Contentful per request (or a cache of seconds at most). Do not add aggressive caching if asked to "make it faster" without checking this.
- **Undo:** after claiming, the user sees an Undo toast once. After they navigate away it is gone. Implement with a short-lived signed cookie holding the item id and the claim's `id` from the item's `claims` list.

## Step 0: security first (before any other work)
1. Rotate every Contentful token: Delivery (CDA), Preview (CPA), and any Management (CMA) tokens. Revoke the old ones.
2. Assume last year's tokens were exposed. Delivery token was likely in the client bundle, and claim name/email lived on the published item entry, so they were publicly readable.
3. Search the old repo's git history for committed tokens.
4. In v3, all tokens are server-only env vars on Netlify. Never use a `PUBLIC_` prefix. The browser never talks to Contentful's APIs directly.
5. Use a scoped CMA token for the claim endpoint only (one space, one environment if possible).

## Step 1: Contentful model (done 2026-11-20)
**Work directly in `master`, no sandbox environment** (owner decision). Backup: `backups/export-master-2026-11-20.json` (git-ignored; contains giver emails).

**Owner decision: keep the v2 model.** Add only two fields to `item`. Migrations 001 to 004 tried a bigger model; 005 and 006 put v2 back. All 190 items were checked identical to the backup afterward.
- `wishList`: `title`. The page URL slug comes from the title (`Both Kids` → `/both-kids`).
- `category`: `title`, `wishList`. Unchanged.
- `item`: `title`, `description`, `url`, `wishList` (refs), `category` (refs), `isClaimed`, `claimedBy`, **`claims`** (new, JSON), `imageUrl`, **`image`** (new, Asset), `isStale`.

`claims` is a JSON list, newest last: `[{ "id", "name", "email", "at" }]`. The `id` lets Undo remove exactly one claim.

Rules:
- **`isStale` is how the owner archives.** The site shows items where `isStale` is not true. The owner marks items stale after Christmas and after birthdays. **Scripts never change `isStale`.**
- **Last year's not-stale items stay as they are, as test data**, claimed ones included. The owner clears them out when adding new items.
- **Giver info is on the published item, so the Delivery token must stay server-only.** That is the only thing keeping names and emails private. Never send `claims` to the browser: map items to a public shape (count only) before rendering.
- **The site reads and writes `claims`.** An item is "claimed" when `claims` has at least one entry, unless it is a gift card. `isClaimed`/`claimedBy` are v2 leftovers, not used by v3.
- An item on several lists shows on each of those pages.

## Step 2: data migration script (`npm run migrate:data`, preview by default)
For items that are not stale only:
1. Copy `isClaimed`/`claimedBy` into `claims` (27 items).
2. Upload `imageUrl` as an Asset and set `image` (77 items; some shops, Amazon especially, may block it and get listed for manual upload).

Fills only empty fields, so it is safe to re-run.

## Step 3: Astro app
Routes:
- `/` redirects to the first recipient, or lists recipients.
- `/[recipient]`: the list page. Hero block, status filters (All, Unclaimed, Claimed), category filters, item grid.
- `POST /api/claim` and `POST /api/unclaim`.

Claim endpoint:
- Validate: item exists, is not stale, is claimable. Trim and length-limit name and email, loose email check, reject if the honeypot field is filled.
- Append to the item's `claims` with the Contentful version header (`X-Contentful-Version`). On a 409 conflict (someone else claimed at the same moment), re-fetch and retry once, so neither claim is lost. Re-check claimability after the re-fetch. Then publish the item.
- Return the item id and claim `id` in a signed, short-lived cookie for Undo.
- Works as a plain form POST with redirect, enhanced with `fetch` when JS is present.

Images: use the Contentful Images API (`?w=&fm=webp`, `srcset`). Items with no image get the category color-block placeholder from the design.

Components to build (from the design): header with recipient pills and theme toggle, hero block, stat block, filter pills, category chips, item card (image, category label, title, description, link, claim button, claimed state, multi-claim count), claim dialog, undo toast, empty state, footer note.

Accessibility: real buttons and labels, `aria-pressed` on filters, `<dialog>` with focus management, visible focus ring, 44px minimum targets. Worth showing off, but not a launch blocker.

## Step 4: add-item helper (replaces the old wishlist scrapers)
Do not rebuild the Amazon/Target wishlist scraping. It caused duplicate and tracking problems. Instead: `scripts/add-item.mjs <url> --recipient=alex`. It fetches og:title and og:image from the product page, uploads the image as a Contentful Asset, and creates a draft Item for the owner to review and publish. If the fetch fails (Amazon often blocks), it creates the draft without an image and the owner uploads one by hand.

## Step 5: deploy and cutover
1. Netlify deploy preview against `master`. Test claim, unclaim, multi-claim, and a concurrent double-claim.
2. Set env vars in Netlify. No tokens in the repo or the client bundle.
3. Point the family at the new site URL.
4. Spot-check a published page's HTML and network calls for any token or giver data.
5. Share links with family.

## After launch
- Extract tokens to W3C DTCG JSON with Style Dictionary, generating `tokens.css`.
- Extract the components into a small package or Storybook-style reference.
- Optional: Turnstile or rate limiting if spam appears.

## Findings (2026-11-20, from the old repo and the live Delivery API)

**Old site:** https://erpwishlist2526.netlify.app/ (Vite + Lit, Netlify function `claim-item`). Env vars: `VITE_CONTENTFUL_SPACE_ID`, `VITE_CONTENTFUL_ACCESS_TOKEN`, `VITE_CONTENTFUL_ENVIRONMENT` (browser), `CONTENTFUL_SPACE_ID`, `CONTENTFUL_MANAGEMENT_TOKEN`, `CONTENTFUL_ENVIRONMENT` (function). Nothing else reads the claim fields except old local scripts.

**Token status:** both old CMA tokens return 401 (expired), so the old claim function is already dead. The old Delivery token **still works** and is in the old site's bundle. No secrets in old git history.

**Exposure:** 70 published items carry a giver email in `claimedBy`, readable by anyone with the old Delivery token.

**Existing model (master):**
- `wishList`: `title`. 5 entries: David, James, Both Kids, Rise, Dave.
- `category`: `title`, `wishList` (Array[Entry]). 4 entries: "Books", "books" (Dave only), "Items", "Gift Cards". Shared across lists.
- `item`: `title` (Symbol), `description` (Text), `url` (Symbol), `wishList` (**Array** of Entry, required), `category` (**Array** of Entry, required), `isClaimed` (Boolean, required), `claimedBy` (Symbol, email or empty), `imageUrl` (Symbol, external URL), `isStale` (Boolean).
- No giver name field. Images are hot-linked URLs (97 Amazon, 27 Target, rest from ~30 shops), not Assets.

**Items:** 180 total. 107 `isStale` (older seasons, 100 claimed). 73 current = 2025-26 (27 claimed). A few items sit on 2 or 3 lists or in 2 categories.
