'use client';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  Archive,
  Check,
  ClipboardList,
  Download,
  History,
  LogIn,
  Minus,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { loadBaselineInventory } from './baseline';
import { demoEmployees, demoTickets } from './demo-data';
import {
  blankOrderDraft,
  displayLine,
  formatDate,
  labelCategory,
  ticketLabel,
} from './model';
import { OrderEditor } from './order-editor';
import { Brand, CategoryIcon, ThemeToggle } from './shared-controls';
import type {
  AdminView,
  Employee,
  InventoryRow,
  OrderDraft,
  Ticket,
  TicketFilter,
} from './types';
export default function AdminWorkspace({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<AdminView>('tickets');
  const [signedIn, setSignedIn] = useState(!isSupabaseConfigured());
  const [checking, setChecking] = useState(isSupabaseConfigured());
  const [query, setQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [filter, setFilter] = useState<TicketFilter>('open');
  const [tickets, setTickets] = useState<Ticket[]>(
    isSupabaseConfigured() ? [] : demoTickets,
  );
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>(
    isSupabaseConfigured() ? [] : demoEmployees,
  );
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [draft, setDraft] = useState<OrderDraft>(blankOrderDraft());
  const [addRow, setAddRow] = useState({
    category: '',
    name: '',
    color: '',
    size: '',
    qty: '1',
  });
  async function refreshAdmin() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const [inventoryResult, requestResult, employeeResult] = await Promise.all([
      supabase
        .from('swag_inventory')
        .select(
          'id,category,name,color,size,quantity,minimum_quantity,orderable',
        )
        .is('archived_at', null)
        .order('category')
        .order('name')
        .order('size'),
      supabase
        .from('swag_requests')
        .select(
          'id,request_number,employee_id,requested_for_name,notes,status,created_at,fulfilled_at,cancelled_at,adjusted_at,adjustment_note,original_items,swag_request_items(id,inventory_id,category,item_name,color,size,quantity,fulfilled_quantity)',
        )
        .order('request_number', { ascending: false }),
      supabase.rpc('get_swag_employees'),
    ]);
    if (inventoryResult.error || requestResult.error || employeeResult.error) {
      setMessage(
        inventoryResult.error?.message ??
          requestResult.error?.message ??
          employeeResult.error?.message ??
          'Admin data could not be loaded.',
      );
      return;
    }
    setInventory(
      (inventoryResult.data ?? []).map((row) => ({
        id: row.id,
        category: row.category,
        name: row.name,
        color: row.color,
        size: row.size,
        qty: row.quantity,
        min: row.minimum_quantity,
        orderable: row.orderable,
      })),
    );
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setTickets(
      (requestResult.data ?? []).map((row) => ({
        id: row.id,
        num: Number(row.request_number),
        employeeId: row.employee_id,
        employee: row.requested_for_name,
        createdAt: row.created_at,
        notes: row.notes,
        status: row.status as Ticket['status'],
        fulfilledAt: row.fulfilled_at,
        deletedAt: row.cancelled_at,
        adjustedAt: row.adjusted_at,
        adjustmentNote: row.adjustment_note,
        originalItems: row.original_items as unknown[] | null,
        lines: (row.swag_request_items ?? []).map((line) => ({
          id: line.id,
          inventoryId: line.inventory_id,
          category: line.category,
          name: line.item_name,
          color: line.color,
          size: line.size,
          qty: line.quantity,
          fulfilledQty: line.fulfilled_quantity,
        })),
      })),
    );
  }
  async function authorize() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const snapshot = await loadBaselineInventory();
      setInventory(snapshot.items);
      setSignedIn(true);
      setChecking(false);
      return;
    }
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      setSignedIn(false);
      setChecking(false);
      return;
    }
    const dataPromise = refreshAdmin();
    const access = await supabase.rpc('is_swag_administrator');
    if (access.error || access.data !== true) {
      await supabase.auth.signOut();
      setMessage(
        'This Microsoft account is not authorized for BFZ swag administration.',
      );
      setSignedIn(false);
      setChecking(false);
      return;
    }
    setSignedIn(true);
    setChecking(false);
    await dataPromise;
  }
  useEffect(() => {
    void Promise.resolve().then(authorize);
    const supabase = getSupabaseBrowserClient();
    const auth = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      window.setTimeout(() => {
        void authorize();
      }, 0);
    });
    return () => auth?.data.subscription.unsubscribe();
  }, []);
  async function signIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSignedIn(true);
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/?admin=1`,
        scopes: 'email',
      },
    });
  }
  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setSignedIn(false);
  }
  async function runRpc(
    name: string,
    args: Record<string, unknown>,
    busy: string,
    success: string,
    refreshAfter = true,
  ) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage(success);
      return true;
    }
    setBusyId(busy);
    setMessage('');
    const result = await supabase.rpc(name, args);
    setBusyId('');
    if (result.error) {
      setMessage(result.error.message);
      return false;
    }
    setMessage(success);
    if (refreshAfter) await refreshAdmin();
    return result.data;
  }
  async function fulfill(ticket: Ticket) {
    const detail = ticket.lines
      .map((line) => {
        const stock = inventory.find((row) => row.id === line.inventoryId)?.qty;
        if (stock === undefined)
          return `${displayLine(line)} — not in inventory; no deduction`;
        const taken = Math.min(stock, line.qty);
        return `${displayLine(line)} — deduct ${taken}${taken < line.qty ? `, short ${line.qty - taken}` : ''} (${stock} on hand)`;
      })
      .join('\n');
    if (
      !window.confirm(
        `Fulfill ${ticketLabel(ticket.num)}?\n\n${detail}\n\nThis marks the ticket fulfilled and deducts available stock.`,
      )
    )
      return;
    const data = await runRpc(
      'fulfill_swag_request',
      { p_request_id: ticket.id },
      ticket.id,
      `${ticketLabel(ticket.num)} fulfilled. Inventory updated.`,
    );
    if (
      data &&
      typeof data === 'object' &&
      'shortages' in data &&
      Array.isArray(data.shortages) &&
      data.shortages.length
    )
      setMessage(
        `${ticketLabel(ticket.num)} fulfilled with ${data.shortages.length} stock shortage${data.shortages.length === 1 ? '' : 's'}.`,
      );
  }
  async function ticketAction(
    ticket: Ticket,
    action: 'reopen' | 'delete' | 'restore' | 'purge',
  ) {
    const config = {
      reopen: {
        rpc: 'reopen_swag_request',
        question: `Reopen ${ticketLabel(ticket.num)}? Inventory will not be added back automatically.`,
        done: 'Ticket reopened.',
      },
      delete: {
        rpc: 'delete_swag_request',
        question: `Move ${ticketLabel(ticket.num)} to Deleted? Inventory will not be affected.`,
        done: 'Ticket moved to Deleted.',
      },
      restore: {
        rpc: 'restore_swag_request',
        question: '',
        done: 'Ticket restored.',
      },
      purge: {
        rpc: 'purge_swag_request',
        question: `Permanently delete ${ticketLabel(ticket.num)}? This cannot be undone.`,
        done: 'Ticket permanently deleted.',
      },
    }[action];
    if (config.question && !window.confirm(config.question)) return;
    await runRpc(
      config.rpc,
      { p_request_id: ticket.id },
      ticket.id,
      config.done,
    );
  }
  function beginNew() {
    setDraft(blankOrderDraft());
    setView('new');
  }
  function beginEdit(ticket: Ticket) {
    setDraft({
      ticketId: ticket.id,
      employeeId: ticket.employeeId,
      notes: ticket.notes,
      adjustmentNote: '',
      lines: ticket.lines.map((line) => ({ ...line })),
    });
    setView('new');
  }
  async function saveOrder() {
    const items = draft.lines.map((line) => ({
      inventory_id: line.inventoryId,
      category: line.category,
      name: line.name,
      color: line.color,
      size: line.size,
      quantity: line.qty,
    }));
    const data = draft.ticketId
      ? await runRpc(
          'adjust_swag_request',
          {
            p_request_id: draft.ticketId,
            p_employee_id: draft.employeeId,
            p_items: items,
            p_notes: draft.notes,
            p_adjustment_note: draft.adjustmentNote,
          },
          'save-order',
          'Ticket adjusted.',
        )
      : await runRpc(
          'admin_create_swag_request',
          {
            p_employee_id: draft.employeeId,
            p_items: items,
            p_notes: draft.notes,
          },
          'save-order',
          'Ticket created.',
        );
    if (data !== false) {
      setDraft(blankOrderDraft());
      setFilter('open');
      setView('tickets');
    }
  }
  async function toggleAvailability(
    category: string,
    name: string | null,
    enabled: boolean,
  ) {
    setInventory((rows) =>
      rows.map((row) =>
        row.category === category && (name === null || row.name === name)
          ? { ...row, orderable: enabled }
          : row,
      ),
    );
    const data = await runRpc(
      'set_swag_availability',
      { p_category: category, p_name: name, p_orderable: enabled },
      `${category}:${name ?? '*'}`,
      enabled ? 'Available for ordering.' : 'Hidden from ordering.',
      false,
    );
    if (data === false) await refreshAdmin();
  }
  async function setInventoryQuantity(row: InventoryRow, next: number) {
    if (!Number.isSafeInteger(next)) {
      setMessage('Quantity must be a whole number.');
      return;
    }
    const quantity = Math.max(0, next);
    if (quantity === row.qty) return;
    const previous = row.qty;
    setInventory((rows) =>
      rows.map((entry) =>
        entry.id === row.id ? { ...entry, qty: quantity } : entry,
      ),
    );
    const data = await runRpc(
      'adjust_swag_inventory',
      {
        p_inventory_id: row.id,
        p_quantity: quantity,
        p_note: 'Adjusted from the swag tracker inventory table.',
      },
      row.id,
      'Inventory updated.',
      false,
    );
    if (data === false)
      setInventory((rows) =>
        rows.map((entry) =>
          entry.id === row.id ? { ...entry, qty: previous } : entry,
        ),
      );
  }
  async function setInventoryMinimum(row: InventoryRow, next: number) {
    if (!Number.isSafeInteger(next)) {
      setMessage('Minimum stock must be a whole number.');
      return;
    }
    const minimum = Math.max(0, next);
    if (minimum === row.min) return;
    const previous = row.min;
    const supabase = getSupabaseBrowserClient();
    setInventory((rows) =>
      rows.map((entry) =>
        entry.id === row.id ? { ...entry, min: minimum } : entry,
      ),
    );
    if (!supabase) {
      setMessage('Minimum stock level updated.');
      return;
    }
    setBusyId(`minimum-${row.id}`);
    setMessage('');
    const { error } = await supabase
      .from('swag_inventory')
      .update({ minimum_quantity: minimum })
      .eq('id', row.id);
    setBusyId('');
    if (error) {
      setInventory((rows) =>
        rows.map((entry) =>
          entry.id === row.id ? { ...entry, min: previous } : entry,
        ),
      );
      setMessage(error.message);
      return;
    }
    setMessage('Minimum stock level updated.');
  }
  async function addInventory() {
    const qty = Number.parseInt(addRow.qty, 10);
    if (
      !addRow.category.trim() ||
      !addRow.name.trim() ||
      !Number.isFinite(qty) ||
      qty < 0
    ) {
      setMessage('Enter a category, item name, and valid quantity.');
      return;
    }
    const data = await runRpc(
      'upsert_swag_inventory_item',
      {
        p_category: addRow.category,
        p_name: addRow.name,
        p_size: addRow.size,
        p_quantity: qty,
        p_color: addRow.color,
      },
      'add-inventory',
      'Inventory item added.',
    );
    if (data !== false)
      setAddRow({ category: '', name: '', color: '', size: '', qty: '1' });
  }
  async function removeInventory(row: InventoryRow) {
    if (
      !window.confirm(
        `Remove ${row.name}${row.size ? ` (${row.size})` : ''} from inventory?`,
      )
    )
      return;
    const data = await runRpc(
      'remove_swag_inventory_item',
      { p_inventory_id: row.id },
      row.id,
      'Inventory item removed.',
      false,
    );
    if (data !== false)
      setInventory((rows) => rows.filter((entry) => entry.id !== row.id));
  }
  async function importRows(
    items: unknown[],
    exportedAt: string | null,
    confirmation: string,
  ) {
    if (!window.confirm(confirmation)) return;
    await runRpc(
      'import_swag_inventory',
      { p_items: items, p_exported_at: exportedAt },
      'import',
      `${items.length} inventory records imported successfully.`,
    );
  }
  async function restoreOriginalCatalog() {
    const snapshot = await loadBaselineInventory();
    await importRows(
      snapshot.items.map(
        ({ category, name, color, size, qty, min, orderable }) => ({
          category,
          name,
          color,
          size,
          qty,
          min,
          orderable,
        }),
      ),
      snapshot.exportedAt,
      'Refresh all matching items from the original BFZ catalog? Quantities, minimums, and availability will be reset to that snapshot.',
    );
  }
  async function importInventory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as {
        app?: string;
        type?: string;
        exportedAt?: string;
        items?: unknown[];
      };
      if (
        payload.app !== 'bfz-swag-tracker' ||
        payload.type !== 'inventory-snapshot' ||
        !Array.isArray(payload.items) ||
        !payload.items.length
      )
        throw new Error('Choose a valid BFZ inventory snapshot.');
      await importRows(
        payload.items,
        payload.exportedAt ?? null,
        `Restore ${payload.items.length} records from this inventory snapshot? Existing matching items will be updated; other items remain unchanged.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The inventory file could not be imported.',
      );
    }
  }
  function exportInventory() {
    const payload = {
      app: 'bfz-swag-tracker',
      type: 'inventory-snapshot',
      exportedAt: new Date().toISOString(),
      count: inventory.length,
      items: inventory.map(
        ({ category, name, color, size, qty, min, orderable }) => ({
          category,
          name,
          color,
          size,
          qty,
          min,
          orderable,
        }),
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `bfz-inventory-${new Date().toISOString().slice(0, 10)}-${new Date().toTimeString().slice(0, 5).replace(':', '')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Inventory snapshot downloaded.');
  }

  if (!signedIn)
    return (
      <div className="admin-login-page">
        <header className="site-header">
          <Brand />
          <div className="header-actions">
            <ThemeToggle />
            <Button variant="ghost" onClick={onExit}>
              Back to request form
            </Button>
          </div>
        </header>
        <main className="login-card">
          <span className="login-icon">
            <Settings2 />
          </span>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Manage swag & requests</h1>
          <p>Use your BFZ Microsoft work account to continue.</p>
          {message && (
            <p className="status-message error-message" role="alert">
              {message}
            </p>
          )}
          <Button
            className="microsoft-button"
            disabled={checking}
            onClick={signIn}
          >
            <span className="ms-mark">
              <i />
              <i />
              <i />
              <i />
            </span>
            {checking ? 'Checking session…' : 'Continue with Microsoft'}
          </Button>
        </main>
      </div>
    );

  const searchedTickets = tickets.filter((ticket) =>
    `${ticket.employee} ${ticketLabel(ticket.num)} ${ticket.lines.map((line) => line.name).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visibleTickets = searchedTickets.filter((ticket) =>
    filter === 'deleted'
      ? ticket.status === 'cancelled'
      : filter === 'all'
        ? ticket.status !== 'cancelled'
        : ticket.status === filter,
  );
  const visibleInventory = inventory.filter((row) =>
    `${row.name} ${row.category} ${row.color} ${row.size}`
      .toLowerCase()
      .includes(inventoryQuery.toLowerCase()),
  );
  const lowCount = inventory.filter((row) => row.qty <= row.min).length;
  const availabilityCategories = [
    ...new Set(inventory.map((row) => row.category)),
  ];
  const history = tickets.filter(
    (ticket) =>
      ticket.status === 'fulfilled' &&
      `${ticket.employee} ${ticket.lines.map((line) => line.name).join(' ')}`
        .toLowerCase()
        .includes(historyQuery.toLowerCase()),
  );
  const historyGroups = [
    ...history.reduce((groups, ticket) => {
      const day = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
      }).format(new Date(ticket.fulfilledAt ?? ticket.createdAt));
      groups.set(day, [...(groups.get(day) ?? []), ticket]);
      return groups;
    }, new Map<string, Ticket[]>()),
  ];
  const navItems: { id: AdminView; label: string; icon: React.ReactNode }[] = [
    { id: 'tickets', label: 'Tickets', icon: <ClipboardList /> },
    { id: 'inventory', label: 'Inventory', icon: <Package /> },
    { id: 'availability', label: 'Availability', icon: <Settings2 /> },
    { id: 'history', label: 'History', icon: <History /> },
    { id: 'new', label: 'New order', icon: <Plus /> },
  ];
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Brand />
        <nav>
          {navItems.map((entry) => (
            <button
              key={entry.id}
              className={view === entry.id ? 'active' : ''}
              onClick={() =>
                entry.id === 'new' ? beginNew() : setView(entry.id)
              }
            >
              {entry.icon}
              <span>{entry.label}</span>
              {entry.id === 'tickets' && (
                <b>
                  {tickets.filter((ticket) => ticket.status === 'open').length}
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="admin-profile">
          <span>BFZ</span>
          <div>
            <strong>Microsoft account</strong>
            <small>Administrator</small>
          </div>
          <button aria-label="Sign out" onClick={signOut}>
            <LogIn />
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="mobile-admin-bar">
          <Brand />
          <div className="header-actions">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={onExit}>
              Exit
            </Button>
          </div>
        </div>
        <header className="admin-top">
          <div>
            <p className="eyebrow">ADMIN WORKSPACE</p>
            <h1>{navItems.find((entry) => entry.id === view)?.label}</h1>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <Button variant="outline" onClick={onExit}>
              View request form
            </Button>
          </div>
        </header>
        {message && <output className="status-message">{message}</output>}
        <section className="stats-grid">
          <article>
            <span>
              <ClipboardList />
            </span>
            <div>
              <small>OPEN TICKETS</small>
              <strong>
                {tickets.filter((ticket) => ticket.status === 'open').length}
              </strong>
            </div>
          </article>
          <article>
            <span>
              <Package />
            </span>
            <div>
              <small>UNITS IN STOCK</small>
              <strong>
                {inventory
                  .reduce((sum, row) => sum + row.qty, 0)
                  .toLocaleString()}
              </strong>
            </div>
          </article>
          <article className="alert-stat">
            <span>
              <Archive />
            </span>
            <div>
              <small>LOW / OUT</small>
              <strong>{lowCount}</strong>
            </div>
          </article>
        </section>
        {view === 'tickets' && (
          <section>
            <div className="admin-tools ticket-tools">
              <div className="filter-chips">
                {(
                  ['open', 'fulfilled', 'all', 'deleted'] as TicketFilter[]
                ).map((entry) => (
                  <button
                    key={entry}
                    className={filter === entry ? 'active' : ''}
                    onClick={() => setFilter(entry)}
                  >
                    {entry}
                    {entry === 'deleted' &&
                    tickets.some((ticket) => ticket.status === 'cancelled')
                      ? ` (${tickets.filter((ticket) => ticket.status === 'cancelled').length})`
                      : ''}
                  </button>
                ))}
              </div>
              <div className="search-box">
                <Search />
                <input
                  aria-label="Search tickets"
                  placeholder="Search employee or item…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <Button className="primary-action" onClick={beginNew}>
                <Plus /> New order
              </Button>
            </div>
            {visibleTickets.length ? (
              <div className="ticket-grid">
                {visibleTickets.map((ticket) => (
                  <article
                    className={`ticket-card ${ticket.status}`}
                    key={ticket.id}
                  >
                    <div className="ticket-top">
                      <span>
                        {ticketLabel(ticket.num)}
                        {ticket.adjustedAt && ticket.status !== 'cancelled'
                          ? ' · ADJUSTED'
                          : ''}
                      </span>
                      <small>
                        {ticket.status === 'cancelled'
                          ? 'deleted'
                          : ticket.status}
                      </small>
                    </div>
                    <h2>{ticket.employee}</h2>
                    <p>
                      {ticket.status === 'cancelled' && ticket.deletedAt
                        ? `Deleted ${formatDate(ticket.deletedAt)}`
                        : ticket.status === 'fulfilled' && ticket.fulfilledAt
                          ? `Fulfilled ${formatDate(ticket.fulfilledAt)}`
                          : `Opened ${formatDate(ticket.createdAt)}`}
                    </p>
                    <ul>
                      {ticket.lines.map((line) => (
                        <li key={line.id}>
                          {displayLine(line)}
                          {ticket.status === 'open' && line.inventoryId ? (
                            <small className="line-stock">
                              {' '}
                              ·{' '}
                              {inventory.find(
                                (row) => row.id === line.inventoryId,
                              )?.qty ?? 0}{' '}
                              available
                            </small>
                          ) : (
                            ''
                          )}
                        </li>
                      ))}
                    </ul>
                    {ticket.adjustmentNote && ticket.status !== 'cancelled' && (
                      <div className="ticket-note adjustment">
                        Adjustment: {ticket.adjustmentNote}
                      </div>
                    )}
                    {ticket.notes && (
                      <div className="ticket-note">{ticket.notes}</div>
                    )}
                    <div className="ticket-actions">
                      {ticket.status === 'open' && (
                        <>
                          <Button
                            className="fulfill-button"
                            disabled={busyId === ticket.id}
                            onClick={() => fulfill(ticket)}
                          >
                            <Check /> Fulfill & deduct
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => beginEdit(ticket)}
                          >
                            <Pencil /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete ticket"
                            onClick={() => ticketAction(ticket, 'delete')}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                      {ticket.status === 'fulfilled' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => ticketAction(ticket, 'reopen')}
                          >
                            <RotateCcw /> Reopen
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete ticket"
                            onClick={() => ticketAction(ticket, 'delete')}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                      {ticket.status === 'cancelled' && (
                        <>
                          <Button
                            className="primary-action"
                            size="sm"
                            onClick={() => ticketAction(ticket, 'restore')}
                          >
                            <RotateCcw /> Restore
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => ticketAction(ticket, 'purge')}
                          >
                            <Trash2 /> Delete permanently
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">No tickets match this view.</p>
            )}
          </section>
        )}
        {view === 'new' && (
          <OrderEditor
            draft={draft}
            employees={employees}
            inventory={inventory}
            busy={busyId === 'save-order'}
            onChange={setDraft}
            onSave={saveOrder}
            onCancel={() => {
              const editing = Boolean(draft.ticketId);
              setDraft(blankOrderDraft());
              if (editing) setView('tickets');
            }}
          />
        )}
        {view === 'inventory' && (
          <section>
            <div className="data-panel inventory-add">
              <div>
                <input
                  aria-label="Category"
                  placeholder="Category"
                  value={addRow.category}
                  onChange={(event) =>
                    setAddRow({ ...addRow, category: event.target.value })
                  }
                />
                <input
                  aria-label="Item name"
                  placeholder="Item name"
                  value={addRow.name}
                  onChange={(event) =>
                    setAddRow({ ...addRow, name: event.target.value })
                  }
                />
                <input
                  aria-label="Color"
                  placeholder="Color"
                  value={addRow.color}
                  onChange={(event) =>
                    setAddRow({ ...addRow, color: event.target.value })
                  }
                />
                <input
                  aria-label="Size"
                  placeholder="Size"
                  value={addRow.size}
                  onChange={(event) =>
                    setAddRow({ ...addRow, size: event.target.value })
                  }
                />
                <input
                  aria-label="Quantity"
                  type="number"
                  min="0"
                  value={addRow.qty}
                  onChange={(event) =>
                    setAddRow({ ...addRow, qty: event.target.value })
                  }
                />
                <Button
                  className="primary-action"
                  disabled={busyId === 'add-inventory'}
                  onClick={addInventory}
                >
                  <Plus /> Add
                </Button>
              </div>
            </div>
            <section className="data-panel">
              <div className="panel-top">
                <div>
                  <h2>Inventory</h2>
                  <p>{inventory.length} live size-level records.</p>
                </div>
                <div>
                  <input
                    id="inventory-import"
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={importInventory}
                  />
                  <Button
                    variant="outline"
                    disabled={busyId === 'import'}
                    onClick={() =>
                      document.getElementById('inventory-import')?.click()
                    }
                  >
                    <Upload /> Import
                  </Button>
                  <Button variant="outline" onClick={restoreOriginalCatalog}>
                    <RotateCcw /> Original catalog
                  </Button>
                  <Button variant="outline" onClick={exportInventory}>
                    <Download /> Export
                  </Button>
                </div>
              </div>
              <div className="inventory-toolbar">
                <div className="search-box">
                  <Search />
                  <input
                    aria-label="Search inventory"
                    placeholder="Search item, category, color, or size…"
                    value={inventoryQuery}
                    onChange={(event) => setInventoryQuery(event.target.value)}
                  />
                </div>
                <small>
                  Showing {visibleInventory.length} of {inventory.length}
                </small>
              </div>
              <div className="data-table">
                <div className="data-row data-head">
                  <span>Item</span>
                  <span>Category</span>
                  <span>Size</span>
                  <span>On hand</span>
                  <span>Minimum</span>
                  <span>Status</span>
                  <span>Remove</span>
                </div>
                {visibleInventory.map((row) => (
                  <div className="data-row" key={row.id}>
                    <strong>{row.name}</strong>
                    <span>{labelCategory(row.category)}</span>
                    <span>{row.size || 'One size'}</span>
                    <span className="table-qty">
                      <button
                        aria-label={`Remove one ${row.name}`}
                        disabled={busyId === row.id || row.qty === 0}
                        onClick={() => setInventoryQuantity(row, row.qty - 1)}
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
                          setInventoryQuantity(row, Number(event.target.value))
                        }
                      />
                      <button
                        aria-label={`Add one ${row.name}`}
                        disabled={busyId === row.id}
                        onClick={() => setInventoryQuantity(row, row.qty + 1)}
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
                          setInventoryMinimum(row, Number(event.target.value))
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
                      {row.qty === 0
                        ? 'Out'
                        : row.qty <= row.min
                          ? 'Low'
                          : 'Good'}
                    </span>
                    <button
                      className="icon-danger"
                      aria-label={`Remove ${row.name} ${row.size}`}
                      onClick={() => removeInventory(row)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </section>
        )}
        {view === 'availability' && (
          <section className="data-panel">
            <div className="panel-top">
              <div>
                <h2>Request availability</h2>
                <p>
                  Switch whole categories or individual products on and off.
                </p>
              </div>
            </div>
            {availabilityCategories.map((category) => {
              const categoryRows = inventory.filter(
                (row) => row.category === category,
              );
              const products = [
                ...new Set(categoryRows.map((row) => row.name)),
              ];
              const allOn = categoryRows.every((row) => row.orderable);
              const someOn = categoryRows.some((row) => row.orderable);
              return (
                <div className="availability-group" key={category}>
                  <div className="availability-row category">
                    <div>
                      <CategoryIcon category={category} />
                      <span>
                        <strong>{labelCategory(category)}</strong>
                        <small>
                          {products.length} product
                          {products.length === 1 ? '' : 's'}
                        </small>
                      </span>
                    </div>
                    <button
                      disabled={busyId === `${category}:*`}
                      className={`toggle ${allOn ? '' : 'off'} ${someOn && !allOn ? 'mixed' : ''}`}
                      aria-label={`Toggle ${category}`}
                      onClick={() => toggleAvailability(category, null, !allOn)}
                    >
                      <i />
                    </button>
                  </div>
                  {products.map((product) => {
                    const on = categoryRows
                      .filter((row) => row.name === product)
                      .every((row) => row.orderable);
                    return (
                      <div className="availability-row product" key={product}>
                        <span>{product}</span>
                        <button
                          disabled={busyId === `${category}:${product}`}
                          className={`toggle ${on ? '' : 'off'}`}
                          aria-label={`Toggle ${product}`}
                          onClick={() =>
                            toggleAvailability(category, product, !on)
                          }
                        >
                          <i />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        )}
        {view === 'history' && (
          <section className="data-panel">
            <div className="panel-top">
              <div>
                <h2>Fulfillment history</h2>
                <p>
                  {
                    tickets.filter((ticket) => ticket.status === 'fulfilled')
                      .length
                  }{' '}
                  orders ·{' '}
                  {tickets
                    .filter((ticket) => ticket.status === 'fulfilled')
                    .reduce(
                      (sum, ticket) =>
                        sum +
                        ticket.lines.reduce(
                          (total, line) => total + line.qty,
                          0,
                        ),
                      0,
                    )}{' '}
                  units delivered.
                </p>
              </div>
              <div className="search-box">
                <Search />
                <input
                  aria-label="Search history"
                  placeholder="Search employee or item…"
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                />
              </div>
            </div>
            {historyGroups.length ? (
              historyGroups.map(([day, group]) => (
                <div className="history-group" key={day}>
                  <h3>{day}</h3>
                  {(group ?? []).map((ticket) => (
                    <div className="history-row" key={ticket.id}>
                      <span className="history-check">
                        <Check />
                      </span>
                      <div>
                        <strong>
                          {ticketLabel(ticket.num)} · {ticket.employee}
                        </strong>
                        <p>{ticket.lines.map(displayLine).join(', ')}</p>
                        {ticket.notes && <small>{ticket.notes}</small>}
                      </div>
                      <time>
                        {new Intl.DateTimeFormat('en-US', {
                          timeStyle: 'short',
                        }).format(
                          new Date(ticket.fulfilledAt ?? ticket.createdAt),
                        )}
                      </time>
                      <div className="history-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => ticketAction(ticket, 'reopen')}
                        >
                          <RotateCcw /> Reopen
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete ticket"
                          onClick={() => ticketAction(ticket, 'delete')}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="empty-state">
                No fulfilled requests match this search.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
