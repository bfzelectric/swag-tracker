# Setup, checks and debugging

## Another machine

1. Install Git and Node 22.13+ (use the same major as CI where possible).
2. Clone `https://github.com/bfzelectric/swag-tracker.git` and open that folder in Codex.
3. Read `AGENTS.md`; run `npm ci` to reproduce locked dependencies.
4. Copy `.env.example` to `.env.local` and obtain approved values securely.
5. Run `npm run dev`; use the URL printed by the development server.
6. Run `npm run check` and `npm run build` before delivering changes.

Without environment variables you get an offline preview. For live data configure
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the existing
BFZ project. `NEXT_PUBLIC_SITE_URL` documents the intended deployment URL; OAuth currently
uses the browser origin. Never put a service-role key in a public variable.
Vercel/Supabase/GitHub CLI logins and Codex connector authorizations must be established
on the new machine separately. `.vercel` and local tokens are intentionally not tracked.

Do not create a new database or seed the historical inventory on every machine.
The existing shared database remains the source of truth. This repository's migration
history is app-specific; shared history may differ. Do not use automatic `db push` or
migration repair until you have inspected the shared project's migration ledger.

## Fast task routing

| Symptom | Start here |
| --- | --- |
| Public item missing | Public RPC stock/orderable/archive filter; then `public-order.tsx` |
| Employee search/keyboard issue | `shared-controls.tsx` |
| Login return path/permission | `admin-workspace.tsx`, provider config, `is_swag_administrator` |
| Quantity/fulfillment mismatch | RPC migration, inventory events; do not only patch UI |
| Styles/theme/mobile | `tokens.css`, `elements.css`, `primitives.css`, then `swag.css` |
| Imports/old stock | `baseline.ts` and admin import RPC; never treat snapshot as current |
| Pages-only path issue | `vite.config.ts`, GitHub Pages workflow |

## Verification

`npm run check` runs TypeScript, lint and pure model tests. CI runs the same gate and
the build. Model tests do not touch Supabase. `tests/swag_workflow_smoke.sql` is a separate
database integration test: use only an explicitly approved isolated database.

Manually check: searchable employee picker; category/item/size selection; cart add/remove,
quantity and notes; success/restart; theme; admin entry/exit; login redirect; inventory
search/minimum/quantity; ticket edit/fulfill/history; mobile viewport. Do not create live
orders, alter inventory, import or delete records merely to verify a refactor.

Windows vinext builds have previously printed successful build/prerender output then
hit a Node/libuv `UV_HANDLE_CLOSING` shutdown assertion. A nonzero exit is not a passing
build: report it and use Linux CI to distinguish runtime-tooling trouble from app errors.

## Maintaining portable context

Commit these Markdown files with code. Add new product/architecture decisions to
`PROJECT_CONTEXT.md`, visual rules to `DESIGN_NOTES.md`, and setup issues here. Keep
`AGENTS.md` concise as a routing index. Do not paste full chat transcripts, secrets or
large generated logs into it. GitHub stores only committed/pushed files; local chat
history and machine-specific connector settings are not reconstructed by a clone.
