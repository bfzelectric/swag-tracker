import test from 'node:test';
import assert from 'node:assert/strict';
import { groupStockChanges } from '../lib/stock-history.ts';

function event(id, minute, overrides = {}) {
  return {
    id: String(id),
    inventory_id: 'tee-l',
    item_name: 'Black Tee',
    category: 'Tshirt',
    color: 'Black',
    size: 'L',
    previous_quantity: 30,
    resulting_quantity: 29,
    quantity_change: -1,
    actor_user_id: 'a',
    actor_label: 'Admin A',
    created_at: new Date(
      Date.UTC(2026, 9, 13, 12) + minute * 60000,
    ).toISOString(),
    action: 'adjusted',
    ...overrides,
  };
}
test('fifteen removals become one item in one session, retaining exact totals', () => {
  const events = Array.from({ length: 15 }, (_, i) =>
    event(i, i / 10, { previous_quantity: 30 - i, resulting_quantity: 29 - i }),
  );
  const groups = groupStockChanges(events);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 15);
  assert.equal(groups[0].lines.length, 1);
  assert.equal(groups[0].lines[0].removed, 15);
  assert.equal(groups[0].lines[0].after, 15);
});
test('mixed garments and sizes share a session but keep separate lines', () => {
  const groups = groupStockChanges([
    event(1, 0),
    event(2, 1, { inventory_id: 'hoodie', item_name: 'Hoodie' }),
    event(3, 2, { inventory_id: 'tee-m', size: 'M' }),
    event(4, 3),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].lines.length, 3);
  assert.equal(groups[0].lines[0].removed, 2);
});
test('five-minute inactivity gap splits sessions, including across clock boundaries', () => {
  const groups = groupStockChanges([
    event(1, 4),
    event(2, 6),
    event(3, 11),
    event(4, 17),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[1].count, 3);
});
test('different people never share a group; interleaved events preserve each session', () => {
  const groups = groupStockChanges([
    event(1, 0),
    event(2, 1, { actor_user_id: 'b' }),
    event(3, 2),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 2);
});
test('opposite changes do not cancel out the visible audit totals', () => {
  const groups = groupStockChanges([
    event(1, 0),
    event(2, 1, {
      quantity_change: 1,
      previous_quantity: 29,
      resulting_quantity: 30,
    }),
  ]);
  assert.equal(groups[0].lines[0].removed, 1);
  assert.equal(groups[0].lines[0].added, 1);
  assert.equal(groups[0].lines[0].before, 30);
  assert.equal(groups[0].lines[0].after, 30);
});
test('newest groups first, stable input, retained zero-quantity item removal', () => {
  const events = [
    event(2, 10, {
      quantity_change: 0,
      previous_quantity: 0,
      resulting_quantity: 0,
      action: 'removed',
    }),
    event(1, 0),
  ];
  assert.equal(groupStockChanges(events)[0].id, '2');
  assert.equal(events[0].id, '2');
  assert.deepEqual(groupStockChanges(events)[0].lines[0].actions, ['removed']);
});
test('database microsecond timestamps preserve before/after order', () => {
  const groups = groupStockChanges([
    event('a', 0, {
      created_at: '2026-10-13T12:00:00.123456+00:00',
      previous_quantity: 29,
      resulting_quantity: 28,
    }),
    event('z', 0, { created_at: '2026-10-13T12:00:00.123123+00:00' }),
  ]);
  assert.equal(groups[0].lines[0].before, 30);
  assert.equal(groups[0].lines[0].after, 28);
});
