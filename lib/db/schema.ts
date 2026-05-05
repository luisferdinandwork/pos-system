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
// Products no longer live in a global catalog.
// Each event_item is fully self-contained: all product metadata, prices,
// and stock live here. The same physical product (same itemId) can appear
// in multiple events as independent rows.
export const eventItems = pgTable("event_items", {
  id:          serial("id").primaryKey(),
  eventId:     integer("event_id").notNull()
    .references(() => events.id, { onDelete: "cascade" }),

  // ── Product identity ──────────────────────────────────────────────────────
  // itemId is NOT a foreign key — it's just a string code.
  // The same itemId can exist in multiple events independently.
  itemId:      text("item_id").notNull(),
  baseItemNo:  text("base_item_no"),
  name:        text("name").notNull(),
  color:       text("color"),
  variantCode: text("variant_code"),
  unit:        text("unit").default("PCS"),

  // ── Prices (per-event, independent) ──────────────────────────────────────
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
  // freeItemId now references event_items (the free product lives in this event)
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
// Links a promo to specific event_items it applies to.
export const promoItems = pgTable("promo_items", {
  id:          serial("id").primaryKey(),
  promoId:     integer("promo_id").notNull()
    .references(() => promos.id, { onDelete: "cascade" }),
  eventItemId: integer("event_item_id").notNull()
    .references(() => eventItems.id, { onDelete: "cascade" }),
});

// ── Stock Transaction Types ────────────────────────────────────────────────
// Future-proof table: add new stock movement types without changing schema.
export const stockTransactionTypes = pgTable(
  "stock_transaction_types",
  {
    id: serial("id").primaryKey(),

    /**
     * Examples:
     * transfer_in
     * transfer_out
     * sale
     * adjustment
     */
    code: text("code").notNull(),

    name: text("name").notNull(),

    /**
     *  1 = normally increases stock
     * -1 = normally decreases stock
     *  0 = can be either positive or negative, e.g. adjustment
     */
    defaultDirection: integer("default_direction").notNull().default(0),

    isSystem: boolean("is_system").notNull().default(true),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("stock_transaction_types_code_unique").on(
      table.code
    ),
  })
);

// ── Stock Transactions ─────────────────────────────────────────────────────
// This is the source-of-truth stock ledger.
// event_items.stock is only the cached current balance.
export const stockTransactions = pgTable(
  "stock_transactions",
  {
    id: serial("id").primaryKey(),

    eventItemId: integer("event_item_id")
      .notNull()
      .references(() => eventItems.id, { onDelete: "cascade" }),

    typeId: integer("type_id")
      .notNull()
      .references(() => stockTransactionTypes.id, { onDelete: "restrict" }),

    /**
     * Signed quantity:
     * +10 = stock increases
     * -3  = stock decreases
     */
    quantity: integer("quantity").notNull(),

    /**
     * Audit fields. Helpful later when debugging stock mismatch.
     */
    stockBefore: integer("stock_before").notNull(),
    stockAfter: integer("stock_after").notNull(),

    /**
     * Optional link to a sale transaction.
     * For transfer/adjustment this can stay null.
     */
    transactionId: integer("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),

    /**
     * Optional flexible reference for future use:
     * import file id, sync batch id, admin user id, transfer document no, etc.
     */
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),

    note: text("note"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    eventItemIdx: index("stock_transactions_event_item_idx").on(
      table.eventItemId
    ),
    typeIdx: index("stock_transactions_type_idx").on(table.typeId),
    transactionIdx: index("stock_transactions_transaction_idx").on(
      table.transactionId
    ),
  })
);

// ── Transactions ──────────────────────────────────────────────────────────────

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),

  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),

  clientTxnId: text("client_txn_id").unique(),

  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  finalAmount: numeric("final_amount", { precision: 12, scale: 2 }).notNull(),

  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),

  createdAt: timestamp("created_at").defaultNow(),
});

// ── Transaction Items ─────────────────────────────────────────────────────────
export const transactionItems = pgTable("transaction_items", {
  id:            serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  eventItemId:   integer("event_item_id").notNull()
    .references(() => eventItems.id, { onDelete: "cascade" }),
  // Snapshot of product identity at time of sale
  productName:   text("product_name").notNull(),
  itemId:        text("item_id").notNull(),
  quantity:      integer("quantity").notNull(),
  unitPrice:     numeric("unit_price",   { precision: 12, scale: 2 }).notNull(),
  discountAmt:   numeric("discount_amt", { precision: 12, scale: 2 }).notNull().default("0"),
  finalPrice:    numeric("final_price",  { precision: 12, scale: 2 }).notNull(),
  subtotal:      numeric("subtotal",     { precision: 12, scale: 2 }).notNull(),
  promoApplied:  text("promo_applied"),
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

// ── Payment Methods ───────────────────────────────────────────────────────────
export const paymentMethods = pgTable("payment_methods", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  type:        text("type").notNull(),
  provider:    text("provider"),
  accountInfo: text("account_info"),
  isActive:    boolean("is_active").notNull().default(true),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow(),
});

// add this below events table, or near the bottom

export const authUsers = pgTable("auth_users", {
  id: serial("id").primaryKey(),

  name: text("name").notNull(),

  username: text("username").notNull().unique(),

  passwordHash: text("password_hash").notNull(),

  /**
   * admin = full dashboard access
   * user  = event POS access only
   */
  role: text("role").notNull().default("user"),

  /**
   * For normal event users.
   * Admin can be null.
   */
  eventId: integer("event_id").references(() => events.id, {
    onDelete: "set null",
  }),

  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow(),
});