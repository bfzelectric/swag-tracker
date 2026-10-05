const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'ONE SIZE'];

export function compareInventorySizes(a: string, b: string): number {
  const normalizedA = (a || 'One size').trim().toUpperCase();
  const normalizedB = (b || 'One size').trim().toUpperCase();
  const rankA = sizeOrder.indexOf(normalizedA);
  const rankB = sizeOrder.indexOf(normalizedB);
  if (rankA !== rankB) return (rankA < 0 ? sizeOrder.length : rankA) - (rankB < 0 ? sizeOrder.length : rankB);
  return normalizedA.localeCompare(normalizedB, undefined, { numeric: true });
}

export function sortInventoryRows<T extends { category: string; name: string; color: string; size: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.name.localeCompare(b.name) ||
    a.color.localeCompare(b.color) ||
    compareInventorySizes(a.size, b.size)
  );
}
