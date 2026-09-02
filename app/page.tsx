'use client';

import { useEffect, useState } from 'react';
import {
  Archive,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  History,
  LogIn,
  Minus,
  Package,
  Plus,
  Search,
  Settings2,
  Shirt,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

type CatalogItem = { category: string; name: string; sizes: string[]; color: string };
type CartLine = { name: string; size: string; qty: number };
type PublicStep = 'employee' | 'category' | 'item' | 'size' | 'review';
type AdminView = 'tickets' | 'inventory' | 'availability' | 'history';
type WebMcpContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => object;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

const catalog: CatalogItem[] = [
  { category: 'T-shirts', name: 'Black Tee', sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'], color: 'Black' },
  { category: 'T-shirts', name: 'Gray Tee', sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'], color: 'Gray' },
  { category: 'T-shirts', name: 'Yellow Tee Mesh', sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'], color: 'Yellow' },
  { category: 'T-shirts', name: 'Orange Tee Mesh', sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'], color: 'Safety yellow' },
  { category: 'Long sleeves', name: 'Gray Long Sleeve', sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'], color: 'Gray' },
  { category: 'Long sleeves', name: 'Yellow Long Sleeve', sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'], color: 'Yellow' },
  { category: 'Safety', name: 'High-Vis Vest', sizes: ['M', 'L', 'XL', 'XXL'], color: 'High-vis' },
  { category: 'Lifestyle', name: 'Growler Water Jug w/ Flag Logo', sizes: ['One size'], color: 'Black' },
  { category: 'Lifestyle', name: 'Black Travel Mug w/ Flag Logo', sizes: ['One size'], color: 'Black' },
  { category: 'Hats', name: 'Black/Gray Snapback', sizes: ['One size'], color: 'Black / gray' },
  { category: 'Hats', name: 'Gray/Yellow Snapback', sizes: ['One size'], color: 'Gray / yellow' },
];

const demoEmployees = ['Select an employee…', 'Alex Morgan', 'Casey Brooks', 'Jordan Lee', 'Taylor Reed'];
const demoTickets = [
  { id: 'BFZ-0148', employee: 'Jordan Lee', time: 'Today · 7:32 AM', lines: ['1× Black Tee · L', '1× High-Vis Vest · XL'], status: 'open' },
  { id: 'BFZ-0147', employee: 'Casey Brooks', time: 'Yesterday · 3:18 PM', lines: ['2× Yellow Tee Mesh · M'], status: 'open' },
  { id: 'BFZ-0146', employee: 'Taylor Reed', time: 'Aug 31 · 10:04 AM', lines: ['1× Gray Long Sleeve · XL'], status: 'fulfilled' },
];
const inventoryRows = [
  { name: 'Black Tee', size: 'M', qty: 13, min: 20 },
  { name: 'Black Tee', size: 'L', qty: 48, min: 20 },
  { name: 'Gray Tee', size: 'XL', qty: 70, min: 20 },
  { name: 'Orange Tee Mesh', size: 'M', qty: 0, min: 20 },
  { name: 'Yellow Long Sleeve', size: 'S', qty: 3, min: 5 },
  { name: 'High-Vis Vest', size: 'XL', qty: 15, min: 0 },
];

function Brand() {
  return <div className="brand" aria-label="BFZ Swag Tracker"><span className="brand-mark" aria-hidden="true"><span /></span><span><strong>BFZ SWAG TRACKER</strong><small>orders & stock</small></span></div>;
}

function CategoryIcon({ category }: { category: string }) {
  return category === 'Lifestyle' ? <Package /> : category === 'Hats' ? <Archive /> : <Shirt />;
}

function PublicOrder({ onAdmin }: { onAdmin: () => void }) {
  const [employee, setEmployee] = useState('');
  const [step, setStep] = useState<PublicStep>('employee');
  const [category, setCategory] = useState('');
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [size, setSize] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const categories = [...new Set(catalog.map((entry) => entry.category))];
  const items = catalog.filter((entry) => entry.category === category);
  const count = cart.reduce((sum, line) => sum + line.qty, 0);

  useEffect(() => {
    const context = (document as unknown as { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'stage_swag_request',
      title: 'Stage a swag request',
      description: 'Populate the visible BFZ prototype request form with an employee, catalog item, size, and quantity. This only stages a demo; it does not submit or save data.',
      inputSchema: {
        type: 'object',
        properties: {
          employee: { type: 'string' }, item: { type: 'string' }, size: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 10 },
        },
        required: ['employee', 'item', 'size', 'quantity'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object') throw new Error('A request object is required.');
        const value = input as Record<string, unknown>;
        const match = catalog.find((entry) => entry.name === value.item && entry.sizes.includes(String(value.size)));
        if (!match || typeof value.employee !== 'string' || !demoEmployees.includes(value.employee) || !Number.isInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > 10) throw new Error('Choose a valid demo employee, catalog item, size, and quantity from 1 to 10.');
        setEmployee(value.employee); setCart([{ name: match.name, size: String(value.size), qty: Number(value.quantity) }]); setCategory(match.category); setItem(match); setSize(String(value.size)); setStep('review');
        return { staged: true, employee: value.employee, item: match.name, size: value.size, quantity: value.quantity };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  function addItem() {
    if (!item || !size) return;
    setCart((current) => {
      const existing = current.find((line) => line.name === item.name && line.size === size);
      if (existing) return current.map((line) => line === existing ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { name: item.name, size, qty: 1 }];
    });
    setStep('review');
  }

  function updateQty(index: number, delta: number) {
    setCart((current) => current.map((line, i) => i === index ? { ...line, qty: Math.max(0, line.qty + delta) } : line).filter((line) => line.qty > 0));
  }

  function restartPicker() { setCategory(''); setItem(null); setSize(''); setStep('category'); }

  if (done) {
    return <main className="request-shell success-shell"><section className="success-card"><span className="success-icon"><Check /></span><p className="eyebrow">REQUEST RECEIVED</p><h1>You’re all set.</h1><p>Your request for <strong>{employee}</strong> has been added to the fulfillment board.</p><div className="ticket-number">BFZ-0149</div><Button className="primary-action" onClick={() => { setDone(false); setCart([]); setNotes(''); restartPicker(); }}>Place another request</Button></section></main>;
  }

  return <>
    <header className="site-header"><Brand /><Button variant="ghost" className="admin-link" onClick={onAdmin}><LogIn /> Administrator</Button></header>
    <main className="request-shell">
      <section className="request-intro"><div><p className="eyebrow">BFZ EMPLOYEE GEAR</p><h1>Request company swag.</h1><p>Choose who it’s for, add the items you need, and the BFZ team will take it from there.</p></div><div className="mini-process" aria-label="Three step process"><span className="active">1</span><i /><span>2</span><i /><span>3</span></div></section>
      <section className="order-layout">
        <div className="builder-card">
          <div className="section-heading"><span>01</span><div><h2>Who is this for?</h2><p>Employees are pulled from the BFZ directory.</p></div></div>
          <label className="select-label" htmlFor="employee">Employee</label>
          <NativeSelect id="employee" className="wide-select" value={employee} onChange={(event) => { setEmployee(event.target.value); if (event.target.value) setStep('category'); }}>{demoEmployees.map((name, index) => <NativeSelectOption key={name} value={index ? name : ''}>{name}</NativeSelectOption>)}</NativeSelect>
          <div className={`picker ${!employee ? 'disabled-section' : ''}`}>
            <div className="section-heading"><span>02</span><div><h2>Choose gear</h2><p>Only currently available items appear here.</p></div></div>
            {employee && (step === 'employee' || step === 'category') && <div className="choice-grid">{categories.map((name) => <button key={name} className="choice-card" onClick={() => { setCategory(name); setStep('item'); }}><CategoryIcon category={name} /><span>{name}</span><ChevronRight /></button>)}</div>}
            {step === 'item' && <div><button className="back-link" onClick={() => setStep('category')}>← All categories</button><p className="choice-title">{category}</p><div className="choice-grid products">{items.map((entry) => <button key={entry.name} className="product-card" onClick={() => { setItem(entry); setStep('size'); }}><span className={`swatch ${entry.color.toLowerCase().replaceAll(' ', '-').replace('/', '-')}`} /><span><strong>{entry.name}</strong><small>{entry.color}</small></span><ChevronRight /></button>)}</div></div>}
            {step === 'size' && item && <div><button className="back-link" onClick={() => setStep('item')}>← {category}</button><p className="choice-title">{item.name}</p><div className="size-grid">{item.sizes.map((option) => <button key={option} className={size === option ? 'selected' : ''} onClick={() => setSize(option)}>{option}</button>)}</div><Button className="primary-action add-action" disabled={!size} onClick={addItem}><Plus /> Add to request</Button></div>}
            {employee && step === 'review' && <Button variant="outline" className="add-another" onClick={restartPicker}><Plus /> Add another item</Button>}
          </div>
        </div>
        <aside className="request-summary">
          <div className="summary-head"><div><p className="eyebrow">YOUR REQUEST</p><h2>{count ? `${count} item${count === 1 ? '' : 's'}` : 'Nothing added yet'}</h2></div><span className="cart-count">{count}</span></div>
          {cart.length ? <ul className="cart-lines">{cart.map((line, index) => <li key={`${line.name}-${line.size}`}><div><strong>{line.name}</strong><small>{line.size}</small></div><div className="qty-stepper"><button aria-label="Decrease quantity" onClick={() => updateQty(index, -1)}><Minus /></button><span>{line.qty}</span><button aria-label="Increase quantity" onClick={() => updateQty(index, 1)}><Plus /></button></div><button aria-label="Remove item" className="remove-line" onClick={() => setCart((current) => current.filter((_, i) => i !== index))}><X /></button></li>)}</ul> : <div className="empty-cart"><Package /><p>Your selected gear will appear here.</p></div>}
          <label className="select-label" htmlFor="notes">Notes <span>optional</span></label><Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Delivery details, jobsite, deadline…" />
          <Button className="primary-action submit-action" disabled={!employee || !cart.length} onClick={() => setDone(true)}>Send request <ChevronRight /></Button><p className="privacy-note">No sign-in required. This prototype does not save or send data.</p>
        </aside>
      </section>
    </main>
  </>;
}

function AdminPreview({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<AdminView>('tickets');
  const [signedIn, setSignedIn] = useState(false);
  const [query, setQuery] = useState('');
  const [tickets, setTickets] = useState(demoTickets);
  const visibleTickets = tickets.filter((ticket) => ticket.employee.toLowerCase().includes(query.toLowerCase()) || ticket.id.toLowerCase().includes(query.toLowerCase()));
  const lowCount = inventoryRows.filter((row) => row.qty <= row.min).length;

  if (!signedIn) return <div className="admin-login-page"><header className="site-header"><Brand /><Button variant="ghost" onClick={onExit}>Back to request form</Button></header><main className="login-card"><span className="login-icon"><Settings2 /></span><p className="eyebrow">ADMINISTRATION</p><h1>Manage swag & requests</h1><p>BFZ team members can use their Microsoft work account. The <strong>foreman@bfzelectric.com</strong> account will be excluded.</p><Button className="microsoft-button" onClick={() => setSignedIn(true)}><span className="ms-mark"><i /><i /><i /><i /></span> Continue with Microsoft</Button><small>Interactive prototype — no authentication occurs.</small></main></div>;

  const navItems: { id: AdminView; label: string; icon: React.ReactNode }[] = [
    { id: 'tickets', label: 'Tickets', icon: <ClipboardList /> }, { id: 'inventory', label: 'Inventory', icon: <Package /> }, { id: 'availability', label: 'Availability', icon: <Settings2 /> }, { id: 'history', label: 'History', icon: <History /> },
  ];
  return <div className="admin-app">
    <aside className="admin-sidebar"><Brand /><nav>{navItems.map((entry) => <button key={entry.id} className={view === entry.id ? 'active' : ''} onClick={() => setView(entry.id)}>{entry.icon}<span>{entry.label}</span>{entry.id === 'tickets' && <b>{tickets.filter((ticket) => ticket.status === 'open').length}</b>}</button>)}</nav><div className="admin-profile"><span>JM</span><div><strong>Jordan Miller</strong><small>Administrator</small></div><button aria-label="Sign out" onClick={() => setSignedIn(false)}><LogIn /></button></div></aside>
    <main className="admin-main"><div className="mobile-admin-bar"><Brand /><Button variant="outline" size="sm" onClick={onExit}>Exit demo</Button></div><header className="admin-top"><div><p className="eyebrow">ADMIN WORKSPACE</p><h1>{navItems.find((entry) => entry.id === view)?.label}</h1></div><Button variant="outline" onClick={onExit}>View request form</Button></header>
      <section className="stats-grid"><article><span><ClipboardList /></span><div><small>OPEN TICKETS</small><strong>{tickets.filter((ticket) => ticket.status === 'open').length}</strong></div></article><article><span><Package /></span><div><small>UNITS IN STOCK</small><strong>1,072</strong></div></article><article className="alert-stat"><span><Archive /></span><div><small>LOW / OUT</small><strong>{lowCount}</strong></div></article></section>
      {view === 'tickets' && <section><div className="admin-tools"><div className="search-box"><Search /><input aria-label="Search tickets" placeholder="Search employee or ticket…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Button className="primary-action"><Plus /> New order</Button></div><div className="ticket-grid">{visibleTickets.map((ticket) => <article className={`ticket-card ${ticket.status}`} key={ticket.id}><div className="ticket-top"><span>{ticket.id}</span><small>{ticket.status}</small></div><h2>{ticket.employee}</h2><p>{ticket.time}</p><ul>{ticket.lines.map((line) => <li key={line}>{line}</li>)}</ul>{ticket.status === 'open' ? <Button className="fulfill-button" onClick={() => setTickets((current) => current.map((entry) => entry.id === ticket.id ? { ...entry, status: 'fulfilled' } : entry))}><Check /> Fulfill & deduct</Button> : <div className="fulfilled-label"><Check /> Fulfilled</div>}</article>)}</div></section>}
      {view === 'inventory' && <section className="data-panel"><div className="panel-top"><div><h2>Inventory snapshot</h2><p>132 size-level records imported September 2, 2026.</p></div><div><Button variant="outline"><Upload /> Import JSON</Button><Button variant="outline"><Download /> Export</Button></div></div><div className="data-table"><div className="data-row data-head"><span>Item</span><span>Size</span><span>On hand</span><span>Minimum</span><span>Status</span></div>{inventoryRows.map((row) => <div className="data-row" key={`${row.name}-${row.size}`}><strong>{row.name}</strong><span>{row.size}</span><span>{row.qty}</span><span>{row.min}</span><span className={row.qty === 0 ? 'stock-out' : row.qty <= row.min ? 'stock-low' : 'stock-good'}>{row.qty === 0 ? 'Out' : row.qty <= row.min ? 'Low' : 'Good'}</span></div>)}</div></section>}
      {view === 'availability' && <section className="data-panel"><div className="panel-top"><div><h2>Request availability</h2><p>Hide stocked items that should not be requested right now.</p></div></div>{['T-shirts', 'Long sleeves', 'Safety', 'Lifestyle', 'Hats'].map((name, i) => <div className="availability-row" key={name}><div><CategoryIcon category={name} /><span><strong>{name}</strong><small>{catalog.filter((entry) => entry.category === name).length} products</small></span></div><button className={`toggle ${i === 4 ? 'off' : ''}`} aria-label={`Toggle ${name}`}><i /></button></div>)}</section>}
      {view === 'history' && <section className="data-panel"><div className="panel-top"><div><h2>Fulfillment history</h2><p>A permanent record of delivered BFZ gear.</p></div></div><div className="history-row"><span className="history-check"><Check /></span><div><strong>BFZ-0146 · Taylor Reed</strong><p>Gray Long Sleeve · XL</p></div><time>Aug 31 · 10:04 AM</time></div><div className="history-row"><span className="history-check"><Check /></span><div><strong>BFZ-0145 · Alex Morgan</strong><p>Black Tee · L, High-Vis Vest · L</p></div><time>Aug 29 · 2:41 PM</time></div></section>}
    </main>
  </div>;
}

export default function Home() {
  const [admin, setAdmin] = useState(false);
  return admin ? <AdminPreview onExit={() => setAdmin(false)} /> : <PublicOrder onAdmin={() => setAdmin(true)} />;
}
