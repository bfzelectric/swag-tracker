# Stock history

Inventory has a stock-history panel on the right on wide screens, or below the inventory on smaller screens. The inventory table scrolls independently so the history remains reachable.

Changes by one account are grouped into a session until the gap between changes exceeds five minutes. Different item variants have separate lines in the same card. Each line totals additions and removals separately and shows the first and final on-hand counts. Cards show the account and session timestamps in the viewer's local time. Search matches whole loaded sessions; Load older changes extends the loaded history and may complete the oldest session.

`public.swag_stock_changes` retains immutable snapshots of item identity, quantity before/after, actor, and server timestamp. A private trigger records committed insert, quantity update, archive, restore, and delete operations, including changes made by imports and fulfillment RPCs. No-op quantity edits and minimum/availability changes do not create stock events. The existing request-linked events remain unchanged and are not used to log new timeline entries, avoiding double counting.

Only Swag administrators can read the ledger through RLS; clients cannot insert, edit, or delete history. Item IDs deliberately have no inventory foreign key, so hard-deleting an item preserves its history. Existing manual/fulfillment events are backfilled with currently available item labels. Earlier additions/imports that were never recorded cannot be reconstructed.

The panel refreshes after successful changes, on reopening Inventory, or with its refresh button. Pagination uses the timestamp and ID cursor, 200 raw events at a time. Demo mode retains timeline changes only for the current administrator preview session.

Verification: `npm run check` includes grouping tests for mixed sizes/items, separate actors, corrections, session boundaries, and timestamp ordering. Run `tests/stock-history.sql` only in an approved isolated test database. It exercises writes and permissions in a transaction that is rolled back, including 15 removals, import, fulfillment, archive/restore, deletion, and no-op edits.
