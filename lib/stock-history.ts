export type StockChange = {
  id: string;
  inventory_id: string;
  category: string;
  item_name: string;
  color: string;
  size: string;
  quantity_change: number;
  previous_quantity: number;
  resulting_quantity: number;
  actor_user_id: string | null;
  actor_label: string;
  created_at: string;
  action: string;
};
export type StockChangeLine = {
  key: string;
  name: string;
  category: string;
  color: string;
  size: string;
  added: number;
  removed: number;
  before: number;
  after: number;
  count: number;
  actions: string[];
};
export type StockChangeGroup = {
  id: string;
  actor: string;
  startedAt: string;
  endedAt: string;
  count: number;
  lines: StockChangeLine[];
};

// Session windows use the gap between successive changes, not fixed clock buckets.
// Raw events remain intact; grouping is only a presentation of the saved history.
export function groupStockChanges(
  events: StockChange[],
  gapMs = 5 * 60 * 1000,
): StockChangeGroup[] {
  const groups: StockChangeGroup[] = [];
  const active = new Map<string, StockChangeGroup>();
  const ordered = [...events].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
  for (const event of ordered) {
    const actorKey = event.actor_user_id ?? 'system';
    let group = active.get(actorKey);
    if (
      !group ||
      Date.parse(event.created_at) - Date.parse(group.endedAt) > gapMs
    ) {
      group = {
        id: event.id,
        actor: event.actor_label || 'System',
        startedAt: event.created_at,
        endedAt: event.created_at,
        count: 0,
        lines: [],
      };
      active.set(actorKey, group);
      groups.push(group);
    }
    group.endedAt = event.created_at;
    group.count++;
    const key = JSON.stringify([
      event.inventory_id,
      event.item_name,
      event.color,
      event.size,
    ]);
    let line = group.lines.find((entry) => entry.key === key);
    if (!line) {
      line = {
        key,
        name: event.item_name,
        category: event.category,
        color: event.color,
        size: event.size,
        added: 0,
        removed: 0,
        before: event.previous_quantity,
        after: event.resulting_quantity,
        count: 0,
        actions: [],
      };
      group.lines.push(line);
    }
    line.added += Math.max(0, event.quantity_change);
    line.removed += Math.max(0, -event.quantity_change);
    line.after = event.resulting_quantity;
    line.count++;
    if (!line.actions.includes(event.action)) line.actions.push(event.action);
  }
  return groups.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
}
