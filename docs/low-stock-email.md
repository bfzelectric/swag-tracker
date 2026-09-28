# Camo Beanies email pilot

Production status (2026-09-28): theog is connected, the worker returned HTTP 200
with `idle`, and the one-minute Cron job is active. Stock was 19 with Minimum 10,
so no low-stock email was due. Tests did not change the real stock count.

## Rule and delivery

- From: `theog@bfzelectric.com`; to: `artiem@bfzelectric.com`.
- Subject: `Low stock: Camo Beanies`.
- Body includes the item name, current On Hand, Minimum, and a replenishment request.
- Trigger: active Camo Beanies inventory has On Hand less than or equal to Minimum.
- One email per low-stock period. Stock above Minimum resets the rule.
- Supabase checks the queue every minute after the sender connection is activated.

The queue is `public.swag_stock_alerts`. RLS and explicit revokes prevent browser
accounts from reading or modifying it or calling the worker RPCs. The worker has
custom authentication using a random Vault secret. Disabling gateway JWT verification
does not make delivery public: a valid `x-swag-worker-secret` is required.

## Microsoft connection

The existing BFZ Microsoft application supports delegated device sign-in. A separate
connection for this pilot uses `Mail.Send`, `User.Read` (to verify the exact sender),
and `offline_access`. It requests no permission to read mail. The refresh token is
encrypted in Supabase Vault and rotated after successful token refreshes. Existing
OSHA connection tokens and code are not changed.

Run `node scripts/connect-swag-mail.mjs start <tenant-id> <client-id>`, sign in at the
Microsoft URL using the printed code, then run `node scripts/connect-swag-mail.mjs poll`.
The script rejects a mailbox other than the configured sender. It writes credentials
only to ignored `work/swag-mail-connection.json`; never commit or print that file.

An authorized operator must import those values into Supabase Vault under:

- `swag_mail_tenant_id`
- `swag_mail_client_id`
- `swag_mail_refresh_token`

The migration creates `swag_mail_worker_secret` independently. Once the connection is
stored, remove the local connection and device-state files. Invoke the worker using
the Vault secret without exposing it in logs, verify the returned `idle` or `accepted`
result, then activate the existing `swag-camo-beanies-low-stock-email` Cron job.

Microsoft may require renewed sign-in after revocation or policy changes. Reconnect
the same sender if the worker reports `Reconnect Microsoft sender`. Do not change
organization-wide Microsoft policies to bypass a sign-in restriction.

## Operations

`sent` means Microsoft Graph accepted the message (HTTP 202); it is not an inbox
delivery receipt. The message is retained in the sender's Sent Items. Check that
folder and Exchange delivery reports when investigating recipient delivery.

Explicit throttling and server errors retry after increasing delays, up to five
attempts. Permanent errors remain `failed`. Network timeouts and expired processing
leases remain `unknown`, because Microsoft might already have accepted the email.
Check Sent Items for the alert reference before manually retrying an unknown result.
This prevents blind duplicate sends.

For status, inspect the alert queue, Cron job history, and matching `net._http_response`
records. A Cron SQL success only means its HTTP request was queued; inspect the HTTP
status and worker response too. Never log Vault values or authorization headers.

The rollback-only SQL smoke test covers equality, below/above threshold, repeat edits,
restock, archive, minimum changes, other items, zero stock, lease ownership, delayed
retry, and denied browser access. It does not alter actual inventory or send mail.
