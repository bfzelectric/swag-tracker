import type { InventoryRow } from './types';
export async function loadBaselineInventory() {
  const snapshot = (await import('../../data/inventory-baseline.json')).default;
  return {
    exportedAt: snapshot.exportedAt,
    items: snapshot.items.map((row, index) => ({
      id: `snapshot-${index}`,
      category: row.category,
      name: row.name,
      color: row.color,
      size: row.size,
      qty: row.qty,
      min: row.min,
      orderable: row.category === 'Hoodie' ? true : row.orderable,
    })) as InventoryRow[],
  };
}
