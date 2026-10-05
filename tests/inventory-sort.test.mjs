import test from 'node:test';
import assert from 'node:assert/strict';
import { sortInventoryRows } from '../lib/inventory-sort.ts';

test('inventory groups by category and product, then orders clothing sizes', () => {
  const rows = [
    { category: 'Tshirt', name: 'Black Tee', color: 'Black', size: 'XXL' },
    { category: 'Tshirt', name: 'Black Tee', color: 'Black', size: 'S' },
    { category: 'Hoodie', name: 'Gray Hoodie', color: 'Gray', size: 'XL' },
    { category: 'Tshirt', name: 'Black Tee', color: 'Black', size: 'L' },
    { category: 'Tshirt', name: 'Orange Tee', color: 'Orange', size: 'M' },
    { category: 'Tshirt', name: 'Black Tee', color: 'Black', size: 'XS' },
  ];
  const sorted = sortInventoryRows(rows);
  assert.deepEqual(sorted.map((row) => `${row.category}/${row.name}/${row.size}`), [
    'Hoodie/Gray Hoodie/XL',
    'Tshirt/Black Tee/XS',
    'Tshirt/Black Tee/S',
    'Tshirt/Black Tee/L',
    'Tshirt/Black Tee/XXL',
    'Tshirt/Orange Tee/M',
  ]);
  assert.equal(rows[0].size, 'XXL');
});
