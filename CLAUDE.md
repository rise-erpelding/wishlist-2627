# CLAUDE.md

Read [README.md](README.md) first: setup, content model, how claiming works.

## Rules from the owner

- **Never change `isStale`.** The owner archives with it after Christmas and birthdays. Last year's not-stale items, claimed ones too, are deliberate test data.
- **Keep the v2 content model.** The only additions are `claims` and `image` on Item. Don't add fields or content types without asking; a bigger model was tried and reverted.
- **Ask before touching anything outside this repo, `../wishlist-2526` (read-only reference), and the Contentful space.**
- Work in Contentful `master` (no sandbox environment). Any data script previews by default and needs `--apply` to write.

## Privacy and safety

- Contentful tokens are server-only (`astro:env/server`). Never `PUBLIC_`, never in browser code.
- Pages read items only through `src/lib/wishlist.ts`, which reduces `claims` to a count. Never render or serialize raw entries.
- Don't print token values or giver emails in output. Mask them.
- No CDN caching of list pages: claims must show up right away.
- `backups/` contains giver emails and is git-ignored.

## Working here

- Node 24 via nvm: `export PATH=~/.nvm/versions/node/v24.11.0/bin:$PATH` if the shell is on another version.
- Dev server: `npm run dev` (port 4321), or the `astro-dev` entry in `.claude/launch.json`.
- After a Contentful write, the Delivery API lags a few seconds. Check writes with the Management API.
- Test claims go to real content; clean them up afterward.
