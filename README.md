# BFZ Swag Tracker

Employee swag requests and inventory fulfillment for BFZ Electric.

## Application behavior

- Public visitors select an active employee and submit a request without signing in.
- The public catalog contains only inventory marked orderable with stock on hand.
- Eligible BFZ Microsoft accounts can access administration.
- Administrators can fulfill requests atomically, manage category availability, search inventory, and import/export inventory snapshots.
- Fulfillment deducts stock and creates an immutable inventory event.

## Data and security

The application uses the shared BFZ Supabase project and canonical `employees` table. The migration in `supabase/migrations` creates namespaced swag tables, indexes, RPCs, explicit grants, and row-level security policies. Public database access is limited to three validated RPCs: the active employee name picker, orderable catalog, and request submission.

## Local development

Copy `.env.example` to `.env.local` and populate the documented public settings, then run:

```bash
npm install
npm run dev
```

## Deployment

The repository is linked to the BFZ Electric `swag-tracker` Vercel project and GitHub repository. Production, preview, and development environments require the three keys listed in `.env.example`.

## Camo Beanies low-stock email pilot

Only active inventory named **Camo Beanies** is monitored. `quantity <= minimum_quantity`
queues an email from **theog@bfzelectric.com** to **artiem@bfzelectric.com**. The database
trigger covers fulfillment, manual stock edits, minimum changes, and imports. It sends
once per low-stock period; restocking above Minimum rearms it. Archiving or restocking
cancels an unsent alert. Other items do not send alerts.

The Supabase `swag-stock-email` Edge Function processes the queue on a one-minute
server-side Cron schedule. It does not depend on a browser, Codex, or this computer.
The production sender is connected and the schedule is active. Fresh installations
leave it inactive until Microsoft authorizes the sender and the connection is verified.
See [server setup and operations](docs/low-stock-email.md).

Checks: `node --test tests/swag_stock_email.test.mjs` tests email delivery handling.
`tests/swag_low_stock_smoke.sql` tests threshold behavior and queue permissions inside
a transaction that rolls back all inventory changes, without sending email.
