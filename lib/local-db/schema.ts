// lib/local-db/schema.ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const localEvents = sqliteTable("local_events", {
  id: integer("id").primaryKey(),
  code: text("code").notNull().default(""),
  verifierCode: text("verifier_code"),
  name: text("name").notNull(),
  status: text("status").notNull(),
  location: text("location"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  dataJson: text("data_json"),
  preparedAt: text("prepared_at").notNull(),
});

export const localEventItems = sqliteTable("local_event_items", {
  id: integer("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  itemId: text("item_id").notNull(),
  baseItemNo: text("base_item_no"),
  name: text("name").notNull(),
  color: text("color"),
  variantCode: text("variant_code"),
  unit: text("unit").default("PCS"),
  netPrice: text("net_price").notNull(),
  retailPrice: text("retail_price").notNull(),
  stock: integer("stock").notNull().default(0),
  originalStock: integer("original_stock").notNull().default(0),
});

export const localPaymentMethods = sqliteTable("local_payment_methods", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  edcMethod: text("edc_method"),
  edcMachineId: integer("edc_machine_id"),
  provider: text("provider"),
  accountInfo: text("account_info"),
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const localPromos = sqliteTable("local_promos", {
  id: integer("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  name: text("name").notNull(),
  dataJson: text("data_json").notNull(),
});

export const localCashierSessions = sqliteTable("local_cashier_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverSessionId: integer("server_session_id"),
  eventId: integer("event_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  openingCash: text("opening_cash").notNull().default("0"),
  closingCash: text("closing_cash"),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  notes: text("notes"),
  syncStatus: text("sync_status").notNull().default("pending"),
});

export const localCashDrawerCounts = sqliteTable("local_cash_drawer_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverCountId: integer("server_count_id"),
  eventId: integer("event_id").notNull(),
  cashierSessionId: integer("cashier_session_id"),
  countedBy: text("counted_by"),
  expectedCash: text("expected_cash").notNull().default("0"),
  actualCash: text("actual_cash").notNull().default("0"),
  difference: text("difference").notNull().default("0"),
  reason: text("reason").notNull().default("count"),
  notes: text("notes"),
  countedAt: text("counted_at").notNull(),
  syncStatus: text("sync_status").notNull().default("pending"),
  syncError: text("sync_error"),
});

export const localTransactions = sqliteTable("local_transactions", {
  clientTxnId: text("client_txn_id").notNull().unique(),
  displayId: text("display_id"),
  eventId: integer("event_id").notNull(),
  eventCode: text("event_code"),
  cashierSessionId: integer("cashier_session_id"),
  cashierName: text("cashier_name"),
  totalAmount: text("total_amount").notNull(),
  discount: text("discount").notNull().default("0"),
  finalAmount: text("final_amount").notNull(),
  cashTendered: text("cash_tendered"),
  changeAmount: text("change_amount"),
  paymentMethod: text("payment_method").notNull(),
  paymentReference: text("payment_reference"),
  createdAt: text("created_at").notNull(),
  syncStatus: text("sync_status").notNull().default("pending"),
  serverTransactionId: integer("server_transaction_id"),
  syncError: text("sync_error"),
  receiptPrintCount: integer("receipt_print_count").notNull().default(0),
});

export const localTransactionItems = sqliteTable("local_transaction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientTxnId: text("client_txn_id").notNull(),
  eventItemId: integer("event_item_id").notNull(),
  itemId: text("item_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: text("unit_price").notNull(),
  discountAmt: text("discount_amt").notNull().default("0"),
  finalPrice: text("final_price").notNull(),
  subtotal: text("subtotal").notNull(),
  promoApplied: text("promo_applied"),
});

export const localSyncLogs = sqliteTable("local_sync_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});
