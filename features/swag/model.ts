import type { CatalogRow, CatalogItem, OrderDraft, TicketLine } from './types';
import { compareInventorySizes } from '../../lib/inventory-sort.ts';
const categoryLabels: Record<string, string> = {
  Tshirt: 'T-shirts',
  'Long Sleeve Tshirt': 'Long sleeves',
};
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export function labelCategory(category: string) {
  return categoryLabels[category] ?? category;
}
export function ticketLabel(num: number) {
  return `BFZ-${String(num).padStart(4, '0')}`;
}
export function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
export function groupCatalog(rows: CatalogRow[]): CatalogItem[] {
  const grouped = new Map<string, CatalogItem>();
  for (const row of rows) {
    const size = row.size || 'One size';
    const key = `${row.category}\u0000${row.name}`;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.sizes.includes(size)) existing.sizes.push(size);
      existing.inventoryIds[size] = row.id;
    } else
      grouped.set(key, {
        category: labelCategory(row.category),
        name: row.name,
        color: row.color || 'High-vis',
        sizes: [size],
        inventoryIds: { [size]: row.id },
      });
  }
  return [...grouped.values()].map((entry) => ({
    ...entry,
    sizes: entry.sizes.sort(compareInventorySizes),
  }));
}
export function displayLine(line: TicketLine) {
  return `${line.qty}× ${line.name}${line.size ? ` · ${line.size}` : ''}`;
}
export function blankOrderDraft(): OrderDraft {
  return { employeeId: '', notes: '', adjustmentNote: '', lines: [] };
}
