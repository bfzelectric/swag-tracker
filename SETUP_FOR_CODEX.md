# Agent-run new-machine setup

Goal: after a GitHub Desktop clone, make this existing app ready for local development
with as little manual work as possible. This runbook is triggered by a user setup request,
not every task. Never assume consent to deployment, database writes or account creation.

## 1. Inspect and prepare automatically

- Work from this repository root; check Git status and preserve existing changes.
- Check Node/npm availability. Use Node 22.13+; `.nvmrc` and `.node-version` select 22.
  If Node is missing, use an available approved runtime or offer/install Node through
  the machine's supported installer with the necessary approval. Never change system
  policy, install privileged software silently or use a shell-pipe download installer.
- Run `npm run setup`. It creates `.env.local` only if absent, runs locked `npm ci`
  when needed, and reports readiness with no key values. An unchanged lockfile and
  previously installed dependencies skip reinstalling. `npm run doctor` is read-only.
- Do not start by requiring GitHub CLI, Supabase CLI, Docker or database passwords.
  GitHub Desktop handles repository authentication. Neither Supabase CLI nor Vercel CLI
  is required just to run the app locally. The app needs no OpenAI API key.

## 2. Obtain configuration with minimum human effort

If `npm run doctor` says live settings are present, preserve them. Otherwise:

1. Prefer already authorized Vercel access available to this agent. Retrieve only this
   existing project's required development settings into an ignored local file, never
   into chat, logs or tracked Markdown. Do not copy unrelated server credentials.
2. If using the CLI, inspect its current help first. Use the existing project and team:
   project `swag-tracker`, project ID `prj_SMI4QbpxNUbQHmjOqOleZY00D0bh`, team
   `bfz-electric` / `team_QnCs3lUi7a8iavMk7TqLsuls`. These are identifiers, not credentials.
   Authenticate only if necessary; use its official browser sign-in flow.
3. Link the clone to that existing project; do not create a similarly named replacement.
   Expected command shape after confirming help:

   ```text
   npx vercel@latest link --yes --project prj_SMI4QbpxNUbQHmjOqOleZY00D0bh --scope bfz-electric
   npx vercel@latest env pull .env.vercel-import.local --environment=development --yes
   npm run setup -- --import-env .env.vercel-import.local
   npm run doctor
   ```

4. Pull to `.env.vercel-import.local`, NOT directly over `.env.local`. The importer
   accepts only the three settings in `.env.example`, fills only missing/blank values,
   rejects secret/service-role browser keys and preserves local overrides. Safely remove
   only that temporary import file after success; do not delete the actual `.env.local`.
5. If development values are unavailable, report the precise missing setting names.
   Do not silently pull production secrets or create/update remote environment variables.
   An authorized user can supply the existing project's URL and publishable key securely,
   or approve retrieving only those public settings from another existing environment.

All `.env*` files except `.env.example` are ignored. Never print their contents. If values
are provided manually, write them locally without repeating them back in conversation.
Verify `git check-ignore .env.local` before handling any real credentials.

## 3. Verify automatically, without live mutations

- Run `npm run check` and `npm run build`; record actual outcomes.
- Start `npm run dev` on an available port, open the reported URL using available
  browser tools, and check page load, console errors, theme and employee search.
- For live configuration, confirm public read RPCs return successfully without logging
  employee lists. Configuration presence does not prove connectivity, RLS or OAuth works.
- Do not submit test orders, import inventory, run SQL smoke tests, change stock, apply
  migrations, change Microsoft provider settings or deploy during machine setup.
- Admin Microsoft sign-in, MFA and consent require the human. Check the localhost return
  path only when they ask to test sign-in. If the chosen localhost URL is not allowed,
  explain the needed Supabase redirect allowlist entry; do not loosen the allowlist or
  remove production redirects. Restart the server after changing local environment files.
- Windows's known libuv build shutdown assertion is documented in `docs/DEVELOPMENT.md`.
  Do not claim its nonzero exit passed; distinguish it from verified Linux CI output.

## 4. If human action remains, provide exact steps

Finish every independent safe step first. Ask only for the specific blocker, not a
generic “configure your accounts.” Present a small numbered checklist adapted to what
you actually observed, for example:

1. Open the official Vercel login link the CLI generated (or its on-screen code).
2. Sign in using the account with access to BFZ Electric; finish MFA/consent yourself.
3. Return here and say “Signed in.” I will link the project, retrieve the permitted
   settings, and continue the checks for you.

For missing organization access, specify which account/team access is required; do not
ask for passwords or MFA codes in chat. For missing Node/OS permission, provide the
official installer/package-manager steps for the detected operating system, then rerun
setup once complete. For manual public settings, point to the existing Supabase project's
Connect/API keys screen and explain that only URL/publishable key are needed, not
service-role or database passwords. Prefer secure local entry over pasting in chat.

## 5. Handoff

Report briefly: what you configured; local URL; whether preview or live reads were verified;
test/build results; exact remaining steps. Distinguish optional deployment/database-management
account connections from requirements for running locally. Do not mark fully linked until
the relevant checks have succeeded. Do not claim this sets up unrelated BFZ apps or copies
account sessions from the old machine.

Reference: [official Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
