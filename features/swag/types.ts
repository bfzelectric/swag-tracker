export type InventoryRow = {
  id: string;
  category: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  min: number;
  orderable: boolean;
};
export type CatalogRow = Pick<
  InventoryRow,
  'id' | 'category' | 'name' | 'color' | 'size'
>;
export type CatalogItem = {
  category: string;
  name: string;
  sizes: string[];
  color: string;
  inventoryIds: Record<string, string>;
};
export type Employee = { id: string; employee_name: string };
export type CartLine = {
  inventoryId: string;
  name: string;
  size: string;
  qty: number;
};
export type TicketLine = {
  id: string;
  inventoryId: string | null;
  category: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  fulfilledQty: number | null;
};
export type Ticket = {
  id: string;
  num: number;
  employeeId: string;
  employee: string;
  createdAt: string;
  notes: string;
  lines: TicketLine[];
  status: 'open' | 'fulfilled' | 'cancelled';
  fulfilledAt: string | null;
  deletedAt: string | null;
  adjustedAt: string | null;
  adjustmentNote: string;
  originalItems: unknown[] | null;
};
export type OrderDraft = {
  ticketId?: string;
  employeeId: string;
  notes: string;
  adjustmentNote: string;
  lines: TicketLine[];
};
export type PublicStep = 'employee' | 'category' | 'item' | 'size' | 'review';
export type AdminView =
  | 'tickets'
  | 'inventory'
  | 'availability'
  | 'history'
  | 'new';
export type TicketFilter = 'open' | 'fulfilled' | 'all' | 'deleted';
export type WebMcpContext = {
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
