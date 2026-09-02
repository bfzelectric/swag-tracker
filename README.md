# BFZ Swag Tracker

Employee swag requests and inventory fulfillment for BFZ Electric.

## Application behavior

- Public visitors select an active employee and submit a request without signing in.
- The public catalog contains only inventory marked orderable with stock on hand.
- BFZ Microsoft accounts can access administration, except `foreman@bfzelectric.com`.
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
