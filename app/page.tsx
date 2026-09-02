'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { Archive, Check, ChevronRight, ClipboardList, Download, History, LogIn, Minus, Moon, Package, Plus, Search, Settings2, Shirt, Sun, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase';
import inventorySnapshot from './inventory-data.json';

type InventoryRow = { id: string; category: string; name: string; color: string; size: string; qty: number; min: number; orderable: boolean };
type CatalogRow = Pick<InventoryRow, 'id' | 'category' | 'name' | 'color' | 'size'>;
type CatalogItem = { category: string; name: string; sizes: string[]; color: string; inventoryIds: Record<string, string> };
type Employee = { id: string; employee_name: string };
type CartLine = { inventoryId: string; name: string; size: string; qty: number };
type Ticket = { id: string; num: number; employee: string; time: string; lines: string[]; status: 'open' | 'fulfilled' | 'cancelled'; fulfilledAt?: string | null };
type PublicStep = 'employee' | 'category' | 'item' | 'size' | 'review';
type AdminView = 'tickets' | 'inventory' | 'availability' | 'history';
type WebMcpContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => object }, options: { signal: AbortSignal }) => void | Promise<void> };

const categoryLabels: Record<string, string> = { Tshirt: 'T-shirts', 'Long Sleeve Tshirt': 'Long sleeves' };
const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'One size'];
const staticInventory: InventoryRow[] = inventorySnapshot.items.map((row, index) => ({ id: `snapshot-${index}`, category: row.category, name: row.name, color: row.color, size: row.size, qty: row.qty, min: row.min, orderable: row.orderable }));
const demoEmployees: Employee[] = [{ id: 'demo-alex', employee_name: 'Alex Morgan' }, { id: 'demo-casey', employee_name: 'Casey Brooks' }, { id: 'demo-jordan', employee_name: 'Jordan Lee' }, { id: 'demo-taylor', employee_name: 'Taylor Reed' }];
const demoTickets: Ticket[] = [
  { id: 'demo-148', num: 148, employee: 'Jordan Lee', time: 'Today · 7:32 AM', lines: ['1× Black Tee · L', '1× High-Vis Vest · XL'], status: 'open' },
  { id: 'demo-147', num: 147, employee: 'Casey Brooks', time: 'Yesterday · 3:18 PM', lines: ['2× Yellow Tee Mesh · M'], status: 'open' },
  { id: 'demo-146', num: 146, employee: 'Taylor Reed', time: 'Aug 31 · 10:04 AM', lines: ['1× Gray Long Sleeve · XL'], status: 'fulfilled', fulfilledAt: '2026-08-31T14:04:00Z' },
];

function labelCategory(category: string) { return categoryLabels[category] ?? category; }
function ticketLabel(num: number) { return `BFZ-${String(num).padStart(4, '0')}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function groupCatalog(rows: CatalogRow[]): CatalogItem[] {
  const grouped = new Map<string, CatalogItem>();
  for (const row of rows) {
    const size = row.size || 'One size';
    const key = `${row.category}\u0000${row.name}`;
    const existing = grouped.get(key);
    if (existing) { if (!existing.sizes.includes(size)) existing.sizes.push(size); existing.inventoryIds[size] = row.id; }
    else grouped.set(key, { category: labelCategory(row.category), name: row.name, color: row.color || 'High-vis', sizes: [size], inventoryIds: { [size]: row.id } });
  }
  return [...grouped.values()].map((entry) => ({ ...entry, sizes: entry.sizes.sort((a, b) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b)) }));
}
const staticCatalog = groupCatalog(staticInventory.filter((row) => row.orderable && row.qty > 0));

function Brand() { return <div className="brand" aria-label="BFZ Swag Tracker"><span className="brand-mark" aria-hidden="true"><span /></span><span><strong>BFZ SWAG TRACKER</strong><small>orders & stock</small></span></div>; }
function ThemeToggle() {
  function toggleTheme() { const root = document.documentElement; const next = root.dataset.theme === 'light' ? 'dark' : 'light'; root.dataset.theme = next; try { localStorage.setItem('bfz-swag-theme', next); } catch { /* applies for this visit */ } }
  return <Button variant="outline" size="icon" className="theme-toggle" aria-label="Toggle color theme" title="Toggle color theme" onClick={toggleTheme}><span className="show-in-dark"><Sun /></span><span className="show-in-light"><Moon /></span></Button>;
}
function CategoryIcon({ category }: { category: string }) { return category === 'Lifestyle' ? <Package /> : category === 'Hats' ? <Archive /> : <Shirt />; }

function PublicOrder({ onAdmin }: { onAdmin: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>(demoEmployees);
  const [catalog, setCatalog] = useState<CatalogItem[]>(staticCatalog);
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
  const employeeName = employees.find((entry) => entry.id === employeeId)?.employee_name ?? '';
  const count = cart.reduce((sum, line) => sum + line.qty, 0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    void Promise.all([supabase.rpc('get_swag_employees'), supabase.rpc('get_swag_catalog')]).then(([employeeResult, catalogResult]) => {
      if (employeeResult.error || catalogResult.error) { setMessage('Live data is temporarily unavailable. Please refresh and try again.'); return; }
      setEmployees((employeeResult.data ?? []) as Employee[]);
      setCatalog(groupCatalog((catalogResult.data ?? []) as CatalogRow[]));
    });
  }, []);

  useEffect(() => {
    const context = (document as unknown as { modelContext?: WebMcpContext }).modelContext; if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'stage_swag_request', title: 'Stage a swag request', description: 'Populate the visible BFZ request form without submitting it.',
      inputSchema: { type: 'object', properties: { employee: { type: 'string' }, item: { type: 'string' }, size: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['employee', 'item', 'size', 'quantity'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input as Record<string, unknown>; const selectedEmployee = employees.find((entry) => entry.employee_name === value.employee); const selectedItem = catalog.find((entry) => entry.name === value.item && entry.sizes.includes(String(value.size)));
        if (!selectedEmployee || !selectedItem || !Number.isInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > 10) throw new Error('Choose a valid employee, item, size, and quantity.');
        const selectedSize = String(value.size); setEmployeeId(selectedEmployee.id); setCart([{ inventoryId: selectedItem.inventoryIds[selectedSize], name: selectedItem.name, size: selectedSize, qty: Number(value.quantity) }]); setCategory(selectedItem.category); setItem(selectedItem); setSize(selectedSize); setStep('review'); return { staged: true };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [catalog, employees]);

  function addItem() { if (!item || !size) return; const inventoryId = item.inventoryIds[size]; setCart((current) => { const existing = current.find((line) => line.inventoryId === inventoryId); return existing ? current.map((line) => line === existing ? { ...line, qty: line.qty + 1 } : line) : [...current, { inventoryId, name: item.name, size, qty: 1 }]; }); setStep('review'); }
  function updateQty(index: number, delta: number) { setCart((current) => current.map((line, i) => i === index ? { ...line, qty: Math.max(0, line.qty + delta) } : line).filter((line) => line.qty > 0)); }
  function restartPicker() { setCategory(''); setItem(null); setSize(''); setStep('category'); }
  async function submitRequest() {
    if (!employeeId || !cart.length) return; const supabase = getSupabaseBrowserClient(); if (!supabase) { setTicketNumber(149); return; }
    setSubmitting(true); setMessage(''); const { data, error } = await supabase.rpc('create_swag_request', { p_employee_id: employeeId, p_items: cart.map((line) => ({ inventory_id: line.inventoryId, quantity: line.qty })), p_notes: notes }); setSubmitting(false);
    if (error || !data?.[0]) { setMessage(error?.message ?? 'The request could not be submitted.'); return; } setTicketNumber(Number(data[0].request_number));
  }

  if (ticketNumber !== null) return <main className="request-shell success-shell"><section className="success-card"><span className="success-icon"><Check /></span><p className="eyebrow">REQUEST RECEIVED</p><h1>You’re all set.</h1><p>Your request for <strong>{employeeName}</strong> has been added to the fulfillment board.</p><div className="ticket-number">{ticketLabel(ticketNumber)}</div><Button className="primary-action" onClick={() => { setTicketNumber(null); setEmployeeId(''); setCart([]); setNotes(''); setStep('employee'); }}>Place another request</Button></section></main>;

  return <><header className="site-header"><Brand /><div className="header-actions"><ThemeToggle /><Button variant="ghost" className="admin-link" onClick={onAdmin}><LogIn /> Administrator</Button></div></header><main className="request-shell">
    <section className="request-intro"><div><p className="eyebrow">BFZ EMPLOYEE GEAR</p><h1>Request company swag.</h1><p>Choose who it’s for, add the items you need, and the BFZ team will take it from there.</p></div><div className="mini-process" aria-label="Three step process"><span className="active">1</span><i /><span>2</span><i /><span>3</span></div></section>{message && <p className="status-message error-message" role="alert">{message}</p>}
    <section className="order-layout"><div className="builder-card"><div className="section-heading"><span>01</span><div><h2>Who is this for?</h2><p>Active employees are pulled from the BFZ directory.</p></div></div><label className="select-label" htmlFor="employee">Employee</label><NativeSelect id="employee" className="wide-select" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); if (event.target.value) setStep('category'); }}><NativeSelectOption value="">Select an employee…</NativeSelectOption>{employees.map((employee) => <NativeSelectOption key={employee.id} value={employee.id}>{employee.employee_name}</NativeSelectOption>)}</NativeSelect>
      <div className={`picker ${!employeeId ? 'disabled-section' : ''}`}><div className="section-heading"><span>02</span><div><h2>Choose gear</h2><p>Only orderable items with stock appear here.</p></div></div>{employeeId && (step === 'employee' || step === 'category') && <div className="choice-grid">{categories.map((name) => <button key={name} className="choice-card" onClick={() => { setCategory(name); setStep('item'); }}><CategoryIcon category={name} /><span>{name}</span><ChevronRight /></button>)}</div>}{step === 'item' && <div><button className="back-link" onClick={() => setStep('category')}>← All categories</button><p className="choice-title">{category}</p><div className="choice-grid products">{items.map((entry) => <button key={entry.name} className="product-card" onClick={() => { setItem(entry); setStep('size'); }}><span className={`swatch ${entry.color.toLowerCase().replaceAll(' ', '-').replace('/', '-')}`} /><span><strong>{entry.name}</strong><small>{entry.color}</small></span><ChevronRight /></button>)}</div></div>}{step === 'size' && item && <div><button className="back-link" onClick={() => setStep('item')}>← {category}</button><p className="choice-title">{item.name}</p><div className="size-grid">{item.sizes.map((option) => <button key={option} className={size === option ? 'selected' : ''} onClick={() => setSize(option)}>{option}</button>)}</div><Button className="primary-action add-action" disabled={!size} onClick={addItem}><Plus /> Add to request</Button></div>}{employeeId && step === 'review' && <Button variant="outline" className="add-another" onClick={restartPicker}><Plus /> Add another item</Button>}</div></div>
      <aside className="request-summary"><div className="summary-head"><div><p className="eyebrow">YOUR REQUEST</p><h2>{count ? `${count} item${count === 1 ? '' : 's'}` : 'Nothing added yet'}</h2></div><span className="cart-count">{count}</span></div>{cart.length ? <ul className="cart-lines">{cart.map((line, index) => <li key={line.inventoryId}><div><strong>{line.name}</strong><small>{line.size}</small></div><div className="qty-stepper"><button aria-label="Decrease quantity" onClick={() => updateQty(index, -1)}><Minus /></button><span>{line.qty}</span><button aria-label="Increase quantity" onClick={() => updateQty(index, 1)}><Plus /></button></div><button aria-label="Remove item" className="remove-line" onClick={() => setCart((current) => current.filter((_, i) => i !== index))}><X /></button></li>)}</ul> : <div className="empty-cart"><Package /><p>Your selected gear will appear here.</p></div>}<label className="select-label" htmlFor="notes">Notes <span>optional</span></label><Textarea id="notes" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Delivery details, jobsite, deadline…" /><Button className="primary-action submit-action" disabled={!employeeId || !cart.length || submitting} onClick={submitRequest}>{submitting ? 'Sending…' : 'Send request'} <ChevronRight /></Button><p className="privacy-note">No sign-in required. Requests are sent to the BFZ fulfillment board.</p></aside>
    </section></main></>;
}

function AdminPreview({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<AdminView>('tickets'); const [signedIn, setSignedIn] = useState(!isSupabaseConfigured()); const [checking, setChecking] = useState(isSupabaseConfigured()); const [query, setQuery] = useState(''); const [inventoryQuery, setInventoryQuery] = useState(''); const [tickets, setTickets] = useState<Ticket[]>(demoTickets); const [inventory, setInventory] = useState<InventoryRow[]>(staticInventory); const [message, setMessage] = useState(''); const [busyId, setBusyId] = useState('');
  async function refreshAdmin() {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const [inventoryResult, requestResult] = await Promise.all([supabase.from('swag_inventory').select('id,category,name,color,size,quantity,minimum_quantity,orderable').order('category').order('name').order('size'), supabase.from('swag_requests').select('id,request_number,requested_for_name,status,created_at,fulfilled_at,swag_request_items(item_name,size,quantity)').order('request_number', { ascending: false })]);
    if (inventoryResult.error || requestResult.error) { setMessage(inventoryResult.error?.message ?? requestResult.error?.message ?? 'Admin data could not be loaded.'); return; }
    setInventory((inventoryResult.data ?? []).map((row) => ({ id: row.id, category: row.category, name: row.name, color: row.color, size: row.size, qty: row.quantity, min: row.minimum_quantity, orderable: row.orderable })));
    setTickets((requestResult.data ?? []).map((row) => ({ id: row.id, num: Number(row.request_number), employee: row.requested_for_name, time: formatDate(row.created_at), lines: (row.swag_request_items ?? []).map((line) => `${line.quantity}× ${line.item_name}${line.size ? ` · ${line.size}` : ''}`), status: row.status as Ticket['status'], fulfilledAt: row.fulfilled_at })));
  }
  async function authorize() { const supabase = getSupabaseBrowserClient(); if (!supabase) { setSignedIn(true); setChecking(false); return; } const session = await supabase.auth.getSession(); if (!session.data.session) { setSignedIn(false); setChecking(false); return; } const access = await supabase.rpc('is_swag_administrator'); if (access.error || access.data !== true) { await supabase.auth.signOut(); setMessage('This Microsoft account is not authorized for BFZ swag administration.'); setSignedIn(false); setChecking(false); return; } setSignedIn(true); setChecking(false); await refreshAdmin(); }
  useEffect(() => { void Promise.resolve().then(authorize); const supabase = getSupabaseBrowserClient(); const auth = supabase?.auth.onAuthStateChange(() => { window.setTimeout(() => { void authorize(); }, 0); }); return () => auth?.data.subscription.unsubscribe(); }, []);
  async function signIn() { const supabase = getSupabaseBrowserClient(); if (!supabase) { setSignedIn(true); return; } const redirect = new URL(window.location.href); redirect.searchParams.set('admin', '1'); await supabase.auth.signInWithOAuth({ provider: 'azure', options: { redirectTo: redirect.toString(), scopes: 'email' } }); }
  async function signOut() { const supabase = getSupabaseBrowserClient(); if (supabase) await supabase.auth.signOut(); setSignedIn(false); }
  async function fulfill(id: string) { const supabase = getSupabaseBrowserClient(); if (!supabase) { setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, status: 'fulfilled' } : ticket)); return; } setBusyId(id); setMessage(''); const result = await supabase.rpc('fulfill_swag_request', { p_request_id: id }); setBusyId(''); if (result.error) setMessage(result.error.message); else await refreshAdmin(); }
  async function toggleAvailability(category: string, enabled: boolean) { const supabase = getSupabaseBrowserClient(); if (!supabase) { setInventory((rows) => rows.map((row) => row.category === category ? { ...row, orderable: enabled } : row)); return; } setBusyId(category); const result = await supabase.rpc('set_swag_availability', { p_category: category, p_name: null, p_orderable: enabled }); setBusyId(''); if (result.error) setMessage(result.error.message); else await refreshAdmin(); }
  async function adjustInventory(row: InventoryRow, delta: number) { const next = Math.max(0, row.qty + delta); const supabase = getSupabaseBrowserClient(); if (!supabase) { setInventory((rows) => rows.map((item) => item.id === row.id ? { ...item, qty: next } : item)); return; } setBusyId(row.id); const result = await supabase.rpc('adjust_swag_inventory', { p_inventory_id: row.id, p_quantity: next, p_note: 'Adjusted from the swag tracker inventory table.' }); setBusyId(''); if (result.error) setMessage(result.error.message); else await refreshAdmin(); }
  async function importInventory(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const payload = JSON.parse(await file.text()) as { app?: string; type?: string; exportedAt?: string; items?: unknown[] }; if (payload.app !== 'bfz-swag-tracker' || payload.type !== 'inventory-snapshot' || !Array.isArray(payload.items) || !payload.items.length) throw new Error('Choose a valid BFZ inventory snapshot.'); const supabase = getSupabaseBrowserClient(); if (!supabase) throw new Error('Imports are available on the connected Vercel application.'); setBusyId('import'); const result = await supabase.rpc('import_swag_inventory', { p_items: payload.items, p_exported_at: payload.exportedAt ?? null }); setBusyId(''); if (result.error) throw result.error; setMessage(`${result.data} inventory records imported successfully.`); await refreshAdmin(); } catch (error) { setBusyId(''); setMessage(error instanceof Error ? error.message : 'The inventory file could not be imported.'); } }
  function exportInventory() { const payload = { app: 'bfz-swag-tracker', type: 'inventory-snapshot', exportedAt: new Date().toISOString(), count: inventory.length, items: inventory.map(({ category, name, color, size, qty, min, orderable }) => ({ category, name, color, size, qty, min, orderable })) }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `bfz-inventory-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); }

  if (!signedIn) return <div className="admin-login-page"><header className="site-header"><Brand /><div className="header-actions"><ThemeToggle /><Button variant="ghost" onClick={onExit}>Back to request form</Button></div></header><main className="login-card"><span className="login-icon"><Settings2 /></span><p className="eyebrow">ADMINISTRATION</p><h1>Manage swag & requests</h1><p>Use your BFZ Microsoft work account to continue.</p>{message && <p className="status-message error-message" role="alert">{message}</p>}<Button className="microsoft-button" disabled={checking} onClick={signIn}><span className="ms-mark"><i /><i /><i /><i /></span>{checking ? 'Checking session…' : 'Continue with Microsoft'}</Button></main></div>;

  const visibleTickets = tickets.filter((ticket) => ticket.employee.toLowerCase().includes(query.toLowerCase()) || ticketLabel(ticket.num).toLowerCase().includes(query.toLowerCase())); const visibleInventory = inventory.filter((row) => `${row.name} ${row.category} ${row.color} ${row.size}`.toLowerCase().includes(inventoryQuery.toLowerCase())); const lowCount = inventory.filter((row) => row.qty <= row.min).length; const availability = [...new Set(inventory.map((row) => row.category))].map((category) => { const rows = inventory.filter((row) => row.category === category); return { raw: category, name: labelCategory(category), products: new Set(rows.map((row) => row.name)).size, enabled: rows.every((row) => row.orderable) }; }); const history = tickets.filter((ticket) => ticket.status === 'fulfilled');
  const navItems: { id: AdminView; label: string; icon: React.ReactNode }[] = [{ id: 'tickets', label: 'Tickets', icon: <ClipboardList /> }, { id: 'inventory', label: 'Inventory', icon: <Package /> }, { id: 'availability', label: 'Availability', icon: <Settings2 /> }, { id: 'history', label: 'History', icon: <History /> }];
  return <div className="admin-app"><aside className="admin-sidebar"><Brand /><nav>{navItems.map((entry) => <button key={entry.id} className={view === entry.id ? 'active' : ''} onClick={() => setView(entry.id)}>{entry.icon}<span>{entry.label}</span>{entry.id === 'tickets' && <b>{tickets.filter((ticket) => ticket.status === 'open').length}</b>}</button>)}</nav><div className="admin-profile"><span>BFZ</span><div><strong>Microsoft account</strong><small>Administrator</small></div><button aria-label="Sign out" onClick={signOut}><LogIn /></button></div></aside><main className="admin-main"><div className="mobile-admin-bar"><Brand /><div className="header-actions"><ThemeToggle /><Button variant="outline" size="sm" onClick={onExit}>Exit</Button></div></div><header className="admin-top"><div><p className="eyebrow">ADMIN WORKSPACE</p><h1>{navItems.find((entry) => entry.id === view)?.label}</h1></div><div className="header-actions"><ThemeToggle /><Button variant="outline" onClick={onExit}>View request form</Button></div></header>{message && <output className="status-message">{message}</output>}<section className="stats-grid"><article><span><ClipboardList /></span><div><small>OPEN TICKETS</small><strong>{tickets.filter((ticket) => ticket.status === 'open').length}</strong></div></article><article><span><Package /></span><div><small>UNITS IN STOCK</small><strong>{inventory.reduce((sum, row) => sum + row.qty, 0).toLocaleString()}</strong></div></article><article className="alert-stat"><span><Archive /></span><div><small>LOW / OUT</small><strong>{lowCount}</strong></div></article></section>
    {view === 'tickets' && <section><div className="admin-tools"><div className="search-box"><Search /><input aria-label="Search tickets" placeholder="Search employee or ticket…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Button className="primary-action" onClick={onExit}><Plus /> New order</Button></div><div className="ticket-grid">{visibleTickets.filter((ticket) => ticket.status !== 'cancelled').map((ticket) => <article className={`ticket-card ${ticket.status}`} key={ticket.id}><div className="ticket-top"><span>{ticketLabel(ticket.num)}</span><small>{ticket.status}</small></div><h2>{ticket.employee}</h2><p>{ticket.time}</p><ul>{ticket.lines.map((line) => <li key={line}>{line}</li>)}</ul>{ticket.status === 'open' ? <Button className="fulfill-button" disabled={busyId === ticket.id} onClick={() => fulfill(ticket.id)}><Check />{busyId === ticket.id ? 'Fulfilling…' : 'Fulfill & deduct'}</Button> : <div className="fulfilled-label"><Check /> Fulfilled</div>}</article>)}</div></section>}
    {view === 'inventory' && <section className="data-panel"><div className="panel-top"><div><h2>Inventory</h2><p>{inventory.length} live size-level records.</p></div><div><input id="inventory-import" type="file" accept="application/json,.json" hidden onChange={importInventory} /><Button variant="outline" disabled={busyId === 'import'} onClick={() => document.getElementById('inventory-import')?.click()}><Upload />{busyId === 'import' ? 'Importing…' : 'Import JSON'}</Button><Button variant="outline" onClick={exportInventory}><Download /> Export</Button></div></div><div className="inventory-toolbar"><div className="search-box"><Search /><input aria-label="Search inventory" placeholder="Search item, category, color, or size…" value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} /></div><small>Showing {visibleInventory.length} of {inventory.length} records</small></div><div className="data-table"><div className="data-row data-head"><span>Item</span><span>Category</span><span>Size</span><span>On hand</span><span>Minimum</span><span>Status</span><span>Orderable</span></div>{visibleInventory.map((row) => <div className="data-row" key={row.id}><strong>{row.name}</strong><span>{labelCategory(row.category)}</span><span>{row.size || 'One size'}</span><span className="table-qty"><button aria-label={`Remove one ${row.name} ${row.size}`} disabled={busyId === row.id || row.qty === 0} onClick={() => adjustInventory(row, -1)}><Minus /></button><b>{row.qty}</b><button aria-label={`Add one ${row.name} ${row.size}`} disabled={busyId === row.id} onClick={() => adjustInventory(row, 1)}><Plus /></button></span><span>{row.min}</span><span className={row.qty === 0 ? 'stock-out' : row.qty <= row.min ? 'stock-low' : 'stock-good'}>{row.qty === 0 ? 'Out' : row.qty <= row.min ? 'Low' : 'Good'}</span><span className={row.orderable ? 'orderable-yes' : 'orderable-no'}>{row.orderable ? 'Yes' : 'No'}</span></div>)}</div></section>}
    {view === 'availability' && <section className="data-panel"><div className="panel-top"><div><h2>Request availability</h2><p>Control which inventory categories appear on the public request form.</p></div></div>{availability.map((group) => <div className="availability-row" key={group.raw}><div><CategoryIcon category={group.name} /><span><strong>{group.name}</strong><small>{group.products} product{group.products === 1 ? '' : 's'}</small></span></div><button disabled={busyId === group.raw} className={`toggle ${group.enabled ? '' : 'off'}`} aria-label={`Toggle ${group.name}`} onClick={() => toggleAvailability(group.raw, !group.enabled)}><i /></button></div>)}</section>}
    {view === 'history' && <section className="data-panel"><div className="panel-top"><div><h2>Fulfillment history</h2><p>A permanent record of delivered BFZ gear.</p></div></div>{history.length ? history.map((ticket) => <div className="history-row" key={ticket.id}><span className="history-check"><Check /></span><div><strong>{ticketLabel(ticket.num)} · {ticket.employee}</strong><p>{ticket.lines.join(', ')}</p></div><time>{ticket.fulfilledAt ? formatDate(ticket.fulfilledAt) : ticket.time}</time></div>) : <p className="empty-state">No fulfilled requests yet.</p>}</section>}
  </main></div>;
}

export default function Home() { const [admin, setAdmin] = useState(false); useEffect(() => { if (new URLSearchParams(window.location.search).get('admin') === '1') void Promise.resolve().then(() => setAdmin(true)); }, []); return admin ? <AdminPreview onExit={() => setAdmin(false)} /> : <PublicOrder onAdmin={() => setAdmin(true)} />; }
