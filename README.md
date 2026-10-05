# BFZ Swag Tracker

Employee swag requests and inventory fulfillment for BFZ Electric.

**New machine:** clone in GitHub Desktop, open the folder in Codex, and say
“Set up this project using SETUP_FOR_CODEX.md.” See [START_HERE.md](START_HERE.md).

This repository is the single portable project folder. Start with [AGENTS.md](AGENTS.md)
in Codex, then use the [project structure](docs/PROJECT_STRUCTURE.md),
[project context](docs/PROJECT_CONTEXT.md), [design notes](docs/DESIGN_NOTES.md),
and [setup/debugging handbook](docs/DEVELOPMENT.md).

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
npm ci
npm run dev
```

For assisted first-run configuration use `npm run setup`; `npm run doctor` checks the
machine without making changes or printing secrets. Codex follows the
[setup runbook](SETUP_FOR_CODEX.md) and handles the commands for you.

## Deployment

The repository is linked to the BFZ Electric `swag-tracker` Vercel project and GitHub repository. Production, preview, and development environments require the three keys listed in `.env.example`.
