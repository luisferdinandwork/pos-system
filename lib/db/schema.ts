// lib/db/schema.ts
import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull().unique(),
  baseItemNo: text("base_item_no"),
  name: text("name").notNull(),
  color: text("color"),
  variantCode: text("variant_code"),
  unit: text("unit").default("PCS"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  originalPrice: numeric("original_price", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stockEntries = pgTable("stock_entries", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  note: text("note"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactionItems = pgTable("transaction_items", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id),
  method: text("method").notNull(),
  reference: text("reference"),
  paidAt: timestamp("paid_at").defaultNow(),
});

// ── New: user-managed payment methods master table ───────────────────────────
export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),          // display name, e.g. "BCA Mobile"
  type: text("type").notNull(),          // "qris" | "debit" | "credit" | "cash" | "ewallet"
  provider: text("provider"),            // e.g. "BCA", "Mandiri", "GoPay", "OVO"
  accountInfo: text("account_info"),     // optional: account number, merchant ID, etc.
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});