# Product context and architecture

## Objective

BFZ employees request company swag without signing in. They choose the employee
receiving the items using searchable employee selection, then category, item,
size, quantity and optional notes. Administrators manage requests and inventory.

This project began as an HTML/SQL application and a September 2, 2026 inventory
snapshot, then a GitHub Pages mockup, followed by a Vercel app backed by the existing
shared BFZ Supabase project. Original temporary attachments are not reliable portable
sources; the maintained implementation, migrations and baseline are in this repository.

## Preserved requirements

- Clothing includes hoodies/sweatshirts as well as shirts and other original categories.
- Public catalog contains only available, orderable, non-archived size-level stock.
- Public users select a shared employee record, not an authenticated identity.
- Microsoft/Azure administrator login returns to this app's administrator workspace.
- Administrator access also obeys centralized BFZ app permissions. The browser checks
  `can_access_platform_app('swag')`, then `is_swag_administrator`, before fetching admin data.
  The latest read policy uses `private.swag_access_snapshot()` without provisioning writes.
  This depends on the shared platform's roles, department/employee match and app overrides,
  plus existing edit eligibility. Earlier migrations describe legacy BFZ-email/Azure rules;
  do not treat those alone as the current full access policy or expose exclusions in UI copy.
- Admin features: ticket creation/editing, fulfillment, reopen, delete/restore/purge,
  history/search, inventory quantity/minimum edits, archive, category/product availability,
  occasional JSON import/export and original-catalog restore.
- Header: SWG mark and “BFZ SWAG TRACKER” only. No BFZ platform navigation.
- Geist typography, dark/light themes, larger inventory text and mobile-friendly ordering.

## Data boundaries

The browser uses the publishable Supabase key. Supabase RLS and security-definer RPCs
are the security boundary. `lib/supabase.ts` owns one browser client. Public reads use
`get_swag_employees` and `get_swag_catalog`; submissions use `create_swag_request`.
Admin authorization uses `is_swag_administrator`. Administrator data reads come from
`swag_inventory`, `swag_requests` and nested `swag_request_items`; inventory events are
recorded server-side. Migrations are the authoritative reference for exact columns,
grants and RPC arguments.

Inventory is grouped by category with category filters and natural clothing-size order;
mobile admin navigation remains accessible when the desktop sidebar is hidden.
The Camo Beanies low-stock email pilot is server-side (queue, Cron and Edge Function),
not dependent on any development machine. See `docs/low-stock-email.md`; never reconnect
its Microsoft sender or redeploy the function merely to configure a new machine.

Stock is deducted when fulfilling, not when submitting. Fulfillment deducts available
stock atomically and reports shortages; reopening does not automatically restore stock.
Do not change this meaning during a presentation-only refactor.

With no Supabase configuration the app uses fictional demo employees/orders and a lazy
baseline snapshot. Demo mode is not persistent and is not evidence of a working live backend.
The historical baseline is not an automatic seed. Import/restore can overwrite quantities,
minimums and availability and requires an explicit administrator action.

## Hosting and portability

Repository: https://github.com/bfzelectric/swag-tracker

Production: https://swag-tracker.vercel.app/

Historical mockup: https://bfzelectric.github.io/swag-tracker/

Runtime is React with vinext/Vite using an App Router-shaped structure; do not assume
it is a stock Next.js deployment. GitHub Actions uses a `/swag-tracker/` base path for
Pages. Vercel uses `/`. Preserve both until the user decides to retire the mockup.

These docs summarize established requirements available in this Codex task and repo.
They do not export full Codex transcripts, GitHub project boards, external credentials
or unrelated BFZ programs. New decisions belong here so another machine can continue.
