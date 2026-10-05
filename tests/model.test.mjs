import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankOrderDraft,
  displayLine,
  groupCatalog,
  labelCategory,
  ticketLabel,
} from '../features/swag/model.ts';

test('catalog keeps categories separate and sorts sizes without mutating source', () => {
  const rows = [
    { id: 'xl', category: 'Tshirt', name: 'Black', color: 'Black', size: 'XL' },
    { id: 's', category: 'Tshirt', name: 'Black', color: 'Black', size: 'S' },
    {
      id: 'hoodie',
      category: 'Hoodie',
      name: 'Black',
      color: 'Black',
      size: 'L',
    },
  ];
  const before = structuredClone(rows);
  const grouped = groupCatalog(rows);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0].sizes, ['S', 'XL']);
  assert.equal(grouped[0].inventoryIds.XL, 'xl');
  assert.equal(grouped[1].category, 'Hoodie');
  assert.deepEqual(rows, before);
});

test('blank sizes become One size and duplicate sizes do not duplicate choices', () => {
  const row = {
    id: 'one',
    category: 'Lifestyle',
    name: 'Bottle',
    color: '',
    size: '',
  };
  const [item] = groupCatalog([row, { ...row, id: 'two' }]);
  assert.deepEqual(item.sizes, ['One size']);
  assert.equal(item.inventoryIds['One size'], 'two');
});

test('labels preserve existing ticket and category conventions', () => {
  assert.equal(ticketLabel(7), 'BFZ-0007');
  assert.equal(ticketLabel(12345), 'BFZ-12345');
  assert.equal(labelCategory('Tshirt'), 'T-shirts');
  assert.equal(labelCategory('Hoodie'), 'Hoodie');
  assert.equal(
    displayLine({ qty: 2, name: 'Hoodie', size: 'XL' }),
    '2× Hoodie · XL',
  );
});

test('new order drafts do not share mutable line arrays', () => {
  const a = blankOrderDraft();
  const b = blankOrderDraft();
  a.lines.push({ id: 'example' });
  assert.equal(b.lines.length, 0);
  assert.equal(b.employeeId, '');
});
