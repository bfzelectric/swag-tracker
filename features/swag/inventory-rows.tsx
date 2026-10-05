'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The ARIA combobox pattern requires listbox and option semantics on the styled popup controls. */

import { Minus, Plus, Trash2 } from 'lucide-react';
import { Fragment } from 'react';

import { labelCategory } from './model';
import { CategoryIcon } from './shared-controls';
import type { InventoryRow } from './types';
export function InventoryRows({
  rows,
  busyId,
  onQuantityChange,
  onMinimumChange,
  onRemove,
}: {
  rows: InventoryRow[];
  busyId: string;
  onQuantityChange: (row: InventoryRow, quantity: number) => void;
  onMinimumChange: (row: InventoryRow, minimum: number) => void;
  onRemove: (row: InventoryRow) => void;
}) {
  const categories = [...new Set(rows.map((row) => row.category))];
  return (
    <>
      {categories.map((category) => {
        const categoryRows = rows.filter((row) => row.category === category);
        return (
          <Fragment key={category}>
            <div className="inventory-category-heading">
              <CategoryIcon category={category} />
              <strong>{labelCategory(category)}</strong>
              <small>
                {categoryRows.length} size-level record
                {categoryRows.length === 1 ? '' : 's'}
              </small>
            </div>
            {categoryRows.map((row) => (
              <div className="data-row" key={row.id}>
                <strong>{row.name}</strong>
                <span>{labelCategory(row.category)}</span>
                <span>{row.size || 'One size'}</span>
                <span className="table-qty">
                  <button
                    aria-label={`Remove one ${row.name}`}
                    disabled={busyId === row.id || row.qty === 0}
                    onClick={() => onQuantityChange(row, row.qty - 1)}
                  >
                    <Minus />
                  </button>
                  <input
                    key={row.qty}
                    aria-label={`${row.name} quantity`}
                    type="number"
                    min="0"
                    defaultValue={row.qty}
                    onBlur={(event) =>
                      onQuantityChange(row, Number(event.target.value))
                    }
                  />
                  <button
                    aria-label={`Add one ${row.name}`}
                    disabled={busyId === row.id}
                    onClick={() => onQuantityChange(row, row.qty + 1)}
                  >
                    <Plus />
                  </button>
                </span>
                <span>
                  <input
                    key={row.min}
                    className="minimum-input"
                    aria-label={`${row.name} minimum stock`}
                    type="number"
                    min="0"
                    disabled={busyId === `minimum-${row.id}`}
                    defaultValue={row.min}
                    onBlur={(event) =>
                      onMinimumChange(row, Number(event.target.value))
                    }
                  />
                </span>
                <span
                  className={
                    row.qty === 0
                      ? 'stock-out'
                      : row.qty <= row.min
                        ? 'stock-low'
                        : 'stock-good'
                  }
                >
                  {row.qty === 0 ? 'Out' : row.qty <= row.min ? 'Low' : 'Good'}
                </span>
                <button
                  className="icon-danger"
                  aria-label={`Remove ${row.name} ${row.size}`}
                  onClick={() => onRemove(row)}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
