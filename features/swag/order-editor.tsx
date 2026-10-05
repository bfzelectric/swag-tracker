'use client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { labelCategory } from './model';
import { EmployeeCombobox } from './shared-controls';
import type { Employee, InventoryRow, OrderDraft } from './types';
export function OrderEditor({
  draft,
  employees,
  inventory,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: OrderDraft;
  employees: Employee[];
  inventory: InventoryRow[];
  busy: boolean;
  onChange: (draft: OrderDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSize, setCustomSize] = useState('');
  const orderable = inventory.filter((row) => row.orderable);
  const categories = [...new Set(orderable.map((row) => row.category))];
  const names = [
    ...new Set(
      orderable
        .filter((row) => row.category === category)
        .map((row) => row.name),
    ),
  ];
  const sizes = orderable.filter(
    (row) => row.category === category && row.name === name,
  );
  function addCatalog() {
    const row = sizes.find((entry) => (entry.size || 'One size') === size);
    if (!row) return;
    const existing = draft.lines.find((line) => line.inventoryId === row.id);
    onChange({
      ...draft,
      lines: existing
        ? draft.lines.map((line) =>
            line.id === existing.id ? { ...line, qty: line.qty + 1 } : line,
          )
        : [
            ...draft.lines,
            {
              id: `draft-${crypto.randomUUID()}`,
              inventoryId: row.id,
              category: row.category,
              name: row.name,
              color: row.color,
              size: row.size,
              qty: 1,
              fulfilledQty: null,
            },
          ],
    });
  }
  function addCustom() {
    const itemName = customName.trim();
    if (!itemName) return;
    onChange({
      ...draft,
      lines: [
        ...draft.lines,
        {
          id: `custom-${crypto.randomUUID()}`,
          inventoryId: null,
          category: 'Custom',
          name: itemName,
          color: '',
          size: customSize.trim(),
          qty: 1,
          fulfilledQty: null,
        },
      ],
    });
    setCustomName('');
    setCustomSize('');
  }
  function changeQty(id: string, delta: number) {
    onChange({
      ...draft,
      lines: draft.lines
        .map((line) =>
          line.id === id
            ? { ...line, qty: Math.max(0, line.qty + delta) }
            : line,
        )
        .filter((line) => line.qty > 0),
    });
  }
  return (
    <section className="data-panel order-editor">
      <div className="panel-top">
        <div>
          <h2>{draft.ticketId ? 'Adjust ticket' : 'Create a new order'}</h2>
          <p>
            {draft.ticketId
              ? 'Changes retain the original request for reference.'
              : 'The order appears on the ticket board immediately.'}
          </p>
        </div>
      </div>
      <label className="select-label" htmlFor="admin-employee">
        Who is this for?
      </label>
      <EmployeeCombobox
        key={`admin-employee-${draft.ticketId || 'new'}`}
        id="admin-employee"
        employees={employees}
        value={draft.employeeId}
        onChange={(employeeId) => onChange({ ...draft, employeeId })}
      />
      <div className="editor-lines">
        <div className="linehead">
          <strong>Order</strong>
          <span>
            {draft.lines.length} line{draft.lines.length === 1 ? '' : 's'}
          </span>
        </div>
        {draft.lines.length ? (
          draft.lines.map((line) => (
            <div className="editor-line" key={line.id}>
              <div>
                <strong>{line.name}</strong>
                <small>
                  {line.size || 'One size'}
                  {line.inventoryId ? '' : ' · Custom'}
                </small>
              </div>
              <div className="qty-stepper">
                <button
                  aria-label="Decrease quantity"
                  onClick={() => changeQty(line.id, -1)}
                >
                  <Minus />
                </button>
                <span>{line.qty}</span>
                <button
                  aria-label="Increase quantity"
                  onClick={() => changeQty(line.id, 1)}
                >
                  <Plus />
                </button>
              </div>
              <button
                className="remove-line"
                aria-label={`Remove ${line.name}`}
                onClick={() =>
                  onChange({
                    ...draft,
                    lines: draft.lines.filter((entry) => entry.id !== line.id),
                  })
                }
              >
                <X />
              </button>
            </div>
          ))
        ) : (
          <p className="empty-state">No items added yet.</p>
        )}
      </div>
      <div className="catalog-builder">
        <div>
          <label htmlFor="order-category">Category</label>
          <select
            id="order-category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setName('');
              setSize('');
            }}
          >
            <option value="">Choose…</option>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {labelCategory(entry)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="order-item">Item</label>
          <select
            id="order-item"
            value={name}
            disabled={!category}
            onChange={(event) => {
              setName(event.target.value);
              setSize('');
            }}
          >
            <option value="">Choose…</option>
            {names.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="order-size">Size</label>
          <select
            id="order-size"
            value={size}
            disabled={!name}
            onChange={(event) => setSize(event.target.value)}
          >
            <option value="">Choose…</option>
            {sizes.map((entry) => (
              <option key={entry.id} value={entry.size || 'One size'}>
                {entry.size || 'One size'} · {entry.qty} on hand
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" disabled={!size} onClick={addCatalog}>
          <Plus /> Add
        </Button>
      </div>
      <details className="custom-item">
        <summary>Add a custom item not in the catalog</summary>
        <div>
          <input
            aria-label="Custom item name"
            placeholder="Item name"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
          />
          <input
            aria-label="Custom item size"
            placeholder="Size (optional)"
            value={customSize}
            onChange={(event) => setCustomSize(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={!customName.trim()}
            onClick={addCustom}
          >
            <Plus /> Add custom
          </Button>
        </div>
      </details>
      <label className="select-label" htmlFor="admin-notes">
        Notes <span>optional</span>
      </label>
      <Textarea
        id="admin-notes"
        maxLength={2000}
        value={draft.notes}
        onChange={(event) => onChange({ ...draft, notes: event.target.value })}
        placeholder="Delivery details, address, deadline…"
      />
      {draft.ticketId && (
        <>
          <label
            className="select-label adjustment-label"
            htmlFor="adjustment-note"
          >
            What changed? <span>optional</span>
          </label>
          <input
            id="adjustment-note"
            className="text-input"
            maxLength={1000}
            value={draft.adjustmentNote}
            onChange={(event) =>
              onChange({ ...draft, adjustmentNote: event.target.value })
            }
            placeholder="Example: swapped the shirt color due to stock"
          />
        </>
      )}
      <div className="editor-actions">
        <Button
          className="primary-action"
          disabled={busy || !draft.employeeId || !draft.lines.length}
          onClick={onSave}
        >
          {busy ? 'Saving…' : draft.ticketId ? 'Save changes' : 'Create ticket'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {draft.ticketId ? 'Cancel' : 'Clear'}
        </Button>
      </div>
    </section>
  );
}
