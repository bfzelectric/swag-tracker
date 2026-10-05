'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The ARIA combobox pattern requires listbox and option semantics on the styled popup controls. */

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  Check,
  ChevronRight,
  LogIn,
  Minus,
  Package,
  Plus,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { loadBaselineInventory } from './baseline';
import { demoEmployees } from './demo-data';
import { groupCatalog, ticketLabel } from './model';
import {
  Brand,
  CategoryIcon,
  EmployeeCombobox,
  ThemeToggle,
} from './shared-controls';
import type {
  CartLine,
  CatalogItem,
  CatalogRow,
  Employee,
  PublicStep,
  WebMcpContext,
} from './types';
export function PublicOrder({ onAdmin }: { onAdmin: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>(
    isSupabaseConfigured() ? [] : demoEmployees,
  );
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [step, setStep] = useState<PublicStep>('employee');
  const [category, setCategory] = useState('');
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [size, setSize] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const categories = [...new Set(catalog.map((entry) => entry.category))];
  const items = catalog.filter((entry) => entry.category === category);
  const employeeName =
    employees.find((entry) => entry.id === employeeId)?.employee_name ?? '';
  const count = cart.reduce((sum, line) => sum + line.qty, 0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      void loadBaselineInventory().then((snapshot) =>
        setCatalog(
          groupCatalog(
            snapshot.items.filter((row) => row.orderable && row.qty > 0),
          ),
        ),
      );
      return;
    }
    void Promise.all([
      supabase.rpc('get_swag_employees'),
      supabase.rpc('get_swag_catalog'),
    ]).then(([employeeResult, catalogResult]) => {
      if (employeeResult.error || catalogResult.error) {
        setMessage(
          'Live data is temporarily unavailable. Please refresh and try again.',
        );
        return;
      }
      setEmployees((employeeResult.data ?? []) as Employee[]);
      setCatalog(groupCatalog((catalogResult.data ?? []) as CatalogRow[]));
    });
  }, []);

  useEffect(() => {
    const context = (document as unknown as { modelContext?: WebMcpContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'stage_swag_request',
          title: 'Stage a swag request',
          description:
            'Populate the visible BFZ request form without submitting it.',
          inputSchema: {
            type: 'object',
            properties: {
              employee: { type: 'string' },
              item: { type: 'string' },
              size: { type: 'string' },
              quantity: { type: 'integer', minimum: 1, maximum: 10 },
            },
            required: ['employee', 'item', 'size', 'quantity'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const value = input as Record<string, unknown>;
            const selectedEmployee = employees.find(
              (entry) => entry.employee_name === value.employee,
            );
            const selectedItem = catalog.find(
              (entry) =>
                entry.name === value.item &&
                entry.sizes.includes(String(value.size)),
            );
            if (
              !selectedEmployee ||
              !selectedItem ||
              !Number.isInteger(value.quantity) ||
              Number(value.quantity) < 1 ||
              Number(value.quantity) > 10
            )
              throw new Error(
                'Choose a valid employee, item, size, and quantity.',
              );
            const selectedSize = String(value.size);
            setEmployeeId(selectedEmployee.id);
            setCart([
              {
                inventoryId: selectedItem.inventoryIds[selectedSize],
                name: selectedItem.name,
                size: selectedSize,
                qty: Number(value.quantity),
              },
            ]);
            setCategory(selectedItem.category);
            setItem(selectedItem);
            setSize(selectedSize);
            setStep('review');
            return { staged: true };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [catalog, employees]);

  function addItem() {
    if (!item || !size) return;
    const inventoryId = item.inventoryIds[size];
    setCart((current) => {
      const existing = current.find((line) => line.inventoryId === inventoryId);
      return existing
        ? current.map((line) =>
            line === existing ? { ...line, qty: line.qty + 1 } : line,
          )
        : [...current, { inventoryId, name: item.name, size, qty: 1 }];
    });
    setStep('review');
  }
  function updateQty(index: number, delta: number) {
    setCart((current) =>
      current
        .map((line, i) =>
          i === index ? { ...line, qty: Math.max(0, line.qty + delta) } : line,
        )
        .filter((line) => line.qty > 0),
    );
  }
  function restartPicker() {
    setCategory('');
    setItem(null);
    setSize('');
    setStep('category');
  }
  async function submitRequest() {
    if (!employeeId || !cart.length) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setTicketNumber(149);
      return;
    }
    setSubmitting(true);
    setMessage('');
    const { data, error } = await supabase.rpc('create_swag_request', {
      p_employee_id: employeeId,
      p_items: cart.map((line) => ({
        inventory_id: line.inventoryId,
        quantity: line.qty,
      })),
      p_notes: notes,
    });
    setSubmitting(false);
    if (error || !data?.[0]) {
      setMessage(error?.message ?? 'The request could not be submitted.');
      return;
    }
    setTicketNumber(Number(data[0].request_number));
  }

  if (ticketNumber !== null)
    return (
      <main className="request-shell success-shell">
        <section className="success-card">
          <span className="success-icon">
            <Check />
          </span>
          <p className="eyebrow">REQUEST RECEIVED</p>
          <h1>You’re all set.</h1>
          <p>
            Your request for <strong>{employeeName}</strong> has been added to
            the fulfillment board.
          </p>
          <div className="ticket-number">{ticketLabel(ticketNumber)}</div>
          <Button
            className="primary-action"
            onClick={() => {
              setTicketNumber(null);
              setEmployeeId('');
              setCart([]);
              setNotes('');
              setStep('employee');
            }}
          >
            Place another request
          </Button>
        </section>
      </main>
    );

  return (
    <>
      <header className="site-header">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
          <Button variant="ghost" className="admin-link" onClick={onAdmin}>
            <LogIn /> Administrator
          </Button>
        </div>
      </header>
      <main className="request-shell">
        <section className="request-intro">
          <div>
            <p className="eyebrow">BFZ EMPLOYEE GEAR</p>
            <h1>Request company swag.</h1>
          </div>
          <div className="mini-process" aria-hidden="true">
            <span className="active">1</span>
            <i />
            <span>2</span>
            <i />
            <span>3</span>
          </div>
        </section>
        {message && (
          <p className="status-message error-message" role="alert">
            {message}
          </p>
        )}
        <section className="order-layout">
          <div className="builder-card">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h2>Who is this for?</h2>
                <p>Active employees are pulled from the BFZ directory.</p>
              </div>
            </div>
            <label className="select-label" htmlFor="employee">
              Employee
            </label>
            <EmployeeCombobox
              id="employee"
              employees={employees}
              value={employeeId}
              onChange={(nextEmployeeId) => {
                setEmployeeId(nextEmployeeId);
                setStep(nextEmployeeId ? 'category' : 'employee');
              }}
            />
            <div className={`picker ${!employeeId ? 'disabled-section' : ''}`}>
              <div className="section-heading">
                <span>02</span>
                <div>
                  <h2>Choose gear</h2>
                  <p>Only orderable items with stock appear here.</p>
                </div>
              </div>
              {employeeId && (step === 'employee' || step === 'category') && (
                <div className="choice-grid">
                  {categories.map((name) => (
                    <button
                      key={name}
                      className="choice-card"
                      onClick={() => {
                        setCategory(name);
                        setStep('item');
                      }}
                    >
                      <CategoryIcon category={name} />
                      <span>{name}</span>
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              )}
              {step === 'item' && (
                <div>
                  <button
                    className="back-link"
                    onClick={() => setStep('category')}
                  >
                    ← All categories
                  </button>
                  <p className="choice-title">{category}</p>
                  <div className="choice-grid products">
                    {items.map((entry) => (
                      <button
                        key={entry.name}
                        className="product-card"
                        onClick={() => {
                          setItem(entry);
                          setStep('size');
                        }}
                      >
                        <span
                          className={`swatch ${entry.color.toLowerCase().replaceAll(' ', '-').replace('/', '-')}`}
                        />
                        <span>
                          <strong>{entry.name}</strong>
                          <small>{entry.color}</small>
                        </span>
                        <ChevronRight />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {step === 'size' && item && (
                <div>
                  <button className="back-link" onClick={() => setStep('item')}>
                    ← {category}
                  </button>
                  <p className="choice-title">{item.name}</p>
                  <div className="size-grid">
                    {item.sizes.map((option) => (
                      <button
                        key={option}
                        className={size === option ? 'selected' : ''}
                        onClick={() => setSize(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <Button
                    className="primary-action add-action"
                    disabled={!size}
                    onClick={addItem}
                  >
                    <Plus /> Add to request
                  </Button>
                </div>
              )}
              {employeeId && step === 'review' && (
                <Button
                  variant="outline"
                  className="add-another"
                  onClick={restartPicker}
                >
                  <Plus /> Add another item
                </Button>
              )}
            </div>
          </div>
          <aside className="request-summary">
            <div className="summary-head">
              <div>
                <p className="eyebrow">YOUR REQUEST</p>
                <h2>
                  {count
                    ? `${count} item${count === 1 ? '' : 's'}`
                    : 'Nothing added yet'}
                </h2>
              </div>
              <span className="cart-count">{count}</span>
            </div>
            {cart.length ? (
              <ul className="cart-lines">
                {cart.map((line, index) => (
                  <li key={line.inventoryId}>
                    <div>
                      <strong>{line.name}</strong>
                      <small>{line.size}</small>
                    </div>
                    <div className="qty-stepper">
                      <button
                        aria-label="Decrease quantity"
                        onClick={() => updateQty(index, -1)}
                      >
                        <Minus />
                      </button>
                      <span>{line.qty}</span>
                      <button
                        aria-label="Increase quantity"
                        onClick={() => updateQty(index, 1)}
                      >
                        <Plus />
                      </button>
                    </div>
                    <button
                      aria-label="Remove item"
                      className="remove-line"
                      onClick={() =>
                        setCart((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-cart">
                <Package />
                <p>Your selected gear will appear here.</p>
              </div>
            )}
            <label className="select-label" htmlFor="notes">
              Notes <span>optional</span>
            </label>
            <Textarea
              id="notes"
              value={notes}
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Delivery details, jobsite, deadline…"
            />
            <Button
              className="primary-action submit-action"
              disabled={!employeeId || !cart.length || submitting}
              onClick={submitRequest}
            >
              {submitting ? 'Sending…' : 'Send request'} <ChevronRight />
            </Button>
            <p className="privacy-note">
              No sign-in required. Requests are sent to the BFZ fulfillment
              board.
            </p>
          </aside>
        </section>
      </main>
    </>
  );
}
