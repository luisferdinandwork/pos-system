// lib/db/schema.ts
import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Events ────────────────────────────────────────────────────────────────────
export const events = pgTable("events", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  location:    text("location"),
  description: text("description"),
  status:      text("status").notNull().default("draft"),
  startDate:   timestamp("start_date"),
  endDate:     timestamp("end_date"),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ── Event Items ───────────────────────────────────────────────────────────────
export const eventItems = pgTable("event_items", {
  id:          serial("id").primaryKey(),
  eventId:     integer("event_id").notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  itemId:      text("item_id").notNull(),
  baseItemNo:  text("base_item_no"),
  name:        text("name").notNull(),
  color:       text("color"),
  variantCode: text("variant_code"),
  unit:        text("unit").default("PCS"),
  retailPrice: numeric("retail_price", { precision: 12, scale: 2 }).notNull(),
  netPrice:    numeric("net_price",    { precision: 12, scale: 2 }).notNull(),
  stock:       integer("stock").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ── Promos ────────────────────────────────────────────────────────────────────
export const promos = pgTable("promos", {
  id:                serial("id").primaryKey(),
  eventId:           integer("event_id").notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name:              text("name").notNull(),
  type:              text("type").notNull(),
  isActive:          boolean("is_active").notNull().default(true),
  applyToAll:        boolean("apply_to_all").notNull().default(false),
  discountPct:       numeric("discount_pct",    { precision: 5,  scale: 2 }),
  discountFix:       numeric("discount_fix",    { precision: 12, scale: 2 }),
  fixedPrice:        numeric("fixed_price",     { precision: 12, scale: 2 }),
  buyQty:            integer("buy_qty"),
  getFreeQty:        integer("get_free_qty"),
  freeItemId:        integer("free_item_id")
    .references(() => eventItems.id, { onDelete: "set null" }),
  spendMinAmount:    numeric("spend_min_amount", { precision: 12, scale: 2 }),
  freeItemProductId: integer("free_item_product_id")
    .references(() => eventItems.id, { onDelete: "set null" }),
  bundlePrice:       numeric("bundle_price",    { precision: 12, scale: 2 }),
  flashStartTime:    timestamp("flash_start_time"),
  flashEndTime:      timestamp("flash_end_time"),
  minPurchaseQty:    integer("min_purchase_qty").default(1),
  minPurchaseAmt:    numeric("min_purchase_amt", { precision: 12, scale: 2 }),
  maxUsageCount:     integer("max_usage_count"),
  usageCount:        integer("usage_count").notNull().default(0),
  createdAt:         timestamp("created_at").defaultNow(),
});

// ── Promo Tiers ───────────────────────────────────────────────────────────────
export const promoTiers = pgTable("promo_tiers", {
  id:          serial("id").primaryKey(),
  promoId:     integer("promo_id").notNull()
    .references(() => promos.id, { onDelete: "cascade" }),
  minQty:      integer("min_qty").notNull(),
  discountPct: numeric("discount_pct", { precision: 5,  scale: 2 }),
  discountFix: numeric("discount_fix", { precision: 12, scale: 2 }),
  fixedPrice:  numeric("fixed_price",  { precision: 12, scale: 2 }),
});

// ── Promo Items ───────────────────────────────────────────────────────────────
export const promoItems = pgTable("promo_items", {
  id:          serial("id").primaryKey(),
  promoId:     integer("promo_id").notNull()
    .references(() => promos.id, { onDelete: "cascade" }),
  eventItemId: integer("event_item_id").notNull()
    .references(() => eventItems.id, { onDelete: "cascade" }),
});

// ── Stock Transaction Types ───────────────────────────────────────────────────
export const stockTransactionTypes = pgTable(
  "stock_transaction_types",
  {
    id:               serial("id").primaryKey(),
    code:             text("code").notNull(),
    name:             text("name").notNull(),
    defaultDirection: integer("default_direction").notNull().default(0),
    isSystem:         boolean("is_system").notNull().default(true),
    createdAt:        timestamp("created_at").defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("stock_transaction_types_code_unique").on(table.code),
  })
);

// ── Stock Transactions ────────────────────────────────────────────────────────
export const stockTransactions = pgTable(
  "stock_transactions",
  {
    id:            serial("id").primaryKey(),
    eventItemId:   integer("event_item_id").notNull()
      .references(() => eventItems.id, { onDelete: "cascade" }),
    typeId:        integer("type_id").notNull()
      .references(() => stockTransactionTypes.id, { onDelete: "restrict" }),
    quantity:      integer("quantity").notNull(),
    stockBefore:   integer("stock_before").notNull(),
    stockAfter:    integer("stock_after").notNull(),
    transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    referenceType: text("reference_type"),
    referenceId:   text("reference_id"),
    note:          text("note"),
    createdAt:     timestamp("created_at").defaultNow(),
  },
  (table) => ({
    eventItemIdx:   index("stock_transactions_event_item_idx").on(table.eventItemId),
    typeIdx:        index("stock_transactions_type_idx").on(table.typeId),
    transactionIdx: index("stock_transactions_transaction_idx").on(table.transactionId),
  })
);

// ── EDC Machines ──────────────────────────────────────────────────────────────
// Each physical EDC terminal. Bank name is the top-level grouping.
// Each machine supports one or more methods (debit, credit, qris).
export const edcMachines = pgTable("edc_machines", {
  id:         serial("id").primaryKey(),
  bankName:   text("bank_name").notNull(),          // e.g. "BCA", "Mandiri", "BNI"
  terminalId: text("terminal_id"),                  // optional: TID printed on EDC
  label:      text("label").notNull(),              // e.g. "EDC BCA", "EDC Mandiri"
  isActive:   boolean("is_active").notNull().default(true),
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at").defaultNow(),
});

// ── Payment Methods ───────────────────────────────────────────────────────────
// type hierarchy:
//   cash → standalone
//   edc  → child of an edcMachine row; sub-types: debit | credit | qris
// Standalone qris and ewallet were removed from the app flow.
export const paymentMethods = pgTable("payment_methods", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  // top-level type: "cash" | "edc"
  type:        text("type").notNull(),
  // for EDC children: "debit" | "credit" | "qris"
  edcMethod:   text("edc_method"),
  // FK to edc_machines — set for all EDC sub-methods
  edcMachineId: integer("edc_machine_id")
    .references(() => edcMachines.id, { onDelete: "set null" }),
  provider:    text("provider"),
  accountInfo: text("account_info"),
  isActive:    boolean("is_active").notNull().default(true),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ── Cashier Sessions ──────────────────────────────────────────────────────────
// Tracks who is at the register per event, and their opening cash float.
export const cashierSessions = pgTable("cashier_sessions", {
  id:             serial("id").primaryKey(),
  eventId:        integer("event_id").notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  cashierName:    text("cashier_name").notNull(),
  // Cash float at the start of the session
  openingCash:    numeric("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  // Closing cash entered at end of session (optional — filled when session ends)
  closingCash:    numeric("closing_cash", { precision: 12, scale: 2 }),
  openedAt:       timestamp("opened_at").defaultNow(),
  closedAt:       timestamp("closed_at"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at").defaultNow(),
});


// ── Cash Drawer Counts ───────────────────────────────────────────────────────
// Tracks physical drawer cash checks during a cashier session.
// This is different from cashier_sessions: sessions store opening/closing data,
// while this table stores every count/check cashiers perform during the day.
export const cashDrawerCounts = pgTable(
  "cash_drawer_counts",
  {
    id:               serial("id").primaryKey(),
    eventId:          integer("event_id").notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    cashierSessionId: integer("cashier_session_id")
      .references(() => cashierSessions.id, { onDelete: "set null" }),
    countedBy:        text("counted_by"),
    // Expected cash from system: opening cash + cash sales - cash change/outflow
    expectedCash:     numeric("expected_cash", { precision: 12, scale: 2 }).notNull().default("0"),
    // Physical cash counted in drawer
    actualCash:       numeric("actual_cash",   { precision: 12, scale: 2 }).notNull().default("0"),
    // actualCash - expectedCash
    difference:       numeric("difference",    { precision: 12, scale: 2 }).notNull().default("0"),
    reason:           text("reason").notNull().default("count"), // opening_check | count | closing_check
    notes:            text("notes"),
    countedAt:        timestamp("counted_at").defaultNow(),
    createdAt:        timestamp("created_at").defaultNow(),
  },
  (table) => ({
    eventIdx:   index("cash_drawer_counts_event_idx").on(table.eventId),
    sessionIdx: index("cash_drawer_counts_session_idx").on(table.cashierSessionId),
  })
);

// ── Event Receipt Templates ──────────────────────────────────────────────────
// One receipt CMS/config per event. POS and history receipt printing can load
// this setting to customize each event receipt independently.
export const eventReceiptTemplates = pgTable(
  "event_receipt_templates",
  {
    id:              serial("id").primaryKey(),
    eventId:         integer("event_id").notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    isActive:        boolean("is_active").notNull().default(true),

    storeName:       text("store_name"),
    headline:        text("headline"),
    address:         text("address"),
    phone:           text("phone"),
    instagram:       text("instagram"),
    taxId:           text("tax_id"),
    logoUrl:         text("logo_url"),

    footerText:      text("footer_text"),
    returnPolicy:    text("return_policy"),
    promoMessage:    text("promo_message"),

    showEventName:        boolean("show_event_name").notNull().default(true),
    showCashierName:      boolean("show_cashier_name").notNull().default(true),
    showItemSku:          boolean("show_item_sku").notNull().default(true),
    showPaymentReference: boolean("show_payment_reference").notNull().default(true),
    showDiscountBreakdown:boolean("show_discount_breakdown").notNull().default(true),

    customCss:       text("custom_css"),

    createdAt:       timestamp("created_at").defaultNow(),
    updatedAt:       timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    eventUnique: uniqueIndex("event_receipt_templates_event_unique").on(table.eventId),
    eventIdx:    index("event_receipt_templates_event_idx").on(table.eventId),
  })
);

// ── Transactions ──────────────────────────────────────────────────────────────
export const transactions = pgTable("transactions", {
  id:           serial("id").primaryKey(),
  // Human-readable ID: yyyyMM + 5-digit sequence per event per month → e.g. "20260100001"
  displayId:    text("display_id").unique(),
  eventId:      integer("event_id").notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  clientTxnId:  text("client_txn_id").unique(),
  // Cashier session that created this transaction (nullable — legacy data)
  cashierSessionId: integer("cashier_session_id")
    .references(() => cashierSessions.id, { onDelete: "set null" }),
  totalAmount:  numeric("total_amount",  { precision: 12, scale: 2 }).notNull(),
  discount:     numeric("discount",      { precision: 12, scale: 2 }).notNull().default("0"),
  finalAmount:  numeric("final_amount",  { precision: 12, scale: 2 }).notNull(),
  // For cash payments: amount tendered by the customer
  cashTendered: numeric("cash_tendered", { precision: 12, scale: 2 }),
  // Computed change: cashTendered - finalAmount (stored for receipt printing)
  changeAmount: numeric("change_amount", { precision: 12, scale: 2 }),
  paymentMethod:    text("payment_method"),
  paymentReference: text("payment_reference"),
  createdAt:    timestamp("created_at").defaultNow(),
});

// ── Transaction Items ─────────────────────────────────────────────────────────
export const transactionItems = pgTable("transaction_items", {
  id:            serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  eventItemId:   integer("event_item_id").notNull()
    .references(() => eventItems.id, { onDelete: "cascade" }),
  productName:   text("product_name").notNull(),
  itemId:        text("item_id").notNull(),
  quantity:      integer("quantity").notNull(),
  unitPrice:     numeric("unit_price",   { precision: 12, scale: 2 }).notNull(),
  discountAmt:   numeric("discount_amt", { precision: 12, scale: 2 }).notNull().default("0"),
  finalPrice:    numeric("final_price",  { precision: 12, scale: 2 }).notNull(),
  subtotal:      numeric("subtotal",     { precision: 12, scale: 2 }).notNull(),
  promoApplied:  text("promo_applied"),
});

// ── Receipt Print Logs ────────────────────────────────────────────────────────
// Tracks every time a receipt is printed, for audit and reprinting.
export const receiptPrintLogs = pgTable("receipt_print_logs", {
  id:            serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  // "original" | "reprint"
  printType:     text("print_type").notNull().default("reprint"),
  printedAt:     timestamp("printed_at").defaultNow(),
  // Optional: which device/cashier triggered the print
  printedBy:     text("printed_by"),
});

// ── Payments ──────────────────────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id:            serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  method:        text("method").notNull(),
  reference:     text("reference"),
  paidAt:        timestamp("paid_at").defaultNow(),
});

// ── Auth Users ────────────────────────────────────────────────────────────────
export const authUsers = pgTable("auth_users", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  username:     text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role:         text("role").notNull().default("user"),
  eventId:      integer("event_id").references(() => events.id, { onDelete: "set null" }),
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at").defaultNow(),
});