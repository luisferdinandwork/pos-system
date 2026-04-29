// lib/transactions.ts
import { db } from "@/lib/db";
import { transactions, transactionItems, payments, eventItems } from "@/lib/db/schema";
import { eq, gte, sql } from "drizzle-orm";
import { deductStock } from "@/lib/stock";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CartItemPayload = {
  eventItemId:  number;
  itemId:       string;
  productName:  string;
  quantity:     number;
  unitPrice:    number;
  discountAmt:  number;
  finalPrice:   number;
  subtotal:     number;
  promoApplied: string | null;
  freeQty?:     number;
};

export type CheckoutPayload = {
  eventId:          number;
  items:            CartItemPayload[];
  totalAmount:      number;
  discount:         number;
  finalAmount:      number;
  paymentMethod:    string;
  paymentReference?: string | null;
};

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createTransaction(payload: CheckoutPayload) {
  // 1. Insert transaction header
  const [txn] = await db
    .insert(transactions)
    .values({
      eventId:          payload.eventId,
      totalAmount:      String(payload.totalAmount),
      discount:         String(payload.discount),
      finalAmount:      String(payload.finalAmount),
      paymentMethod:    payload.paymentMethod,
      paymentReference: payload.paymentReference ?? null,
    })
    .returning();

  // 2. Insert line items (snapshot of product state at time of sale)
  const itemRows = payload.items.map((item) => ({
    transactionId: txn.id,
    eventItemId:   item.eventItemId,
    productName:   item.productName,
    itemId:        item.itemId,
    quantity:      item.quantity,
    unitPrice:     String(item.unitPrice),
    discountAmt:   String(item.discountAmt),
    finalPrice:    String(item.finalPrice),
    subtotal:      String(item.subtotal),
    promoApplied:  item.promoApplied ?? null,
  }));
  await db.insert(transactionItems).values(itemRows);

  // 3. Insert payment record
  await db.insert(payments).values({
    transactionId: txn.id,
    method:        payload.paymentMethod,
    reference:     payload.paymentReference ?? null,
  });

  // 4. Deduct stock for each sold item (writes stock_entries + updates denorm col)
  for (const item of payload.items) {
    await deductStock(item.eventItemId, item.quantity, txn.id);
  }

  return txn;
}

// ── Read — per-event ──────────────────────────────────────────────────────────

export async function getTransactionsByEvent(eventId: number) {
  return db
    .select({
      id:               transactions.id,
      eventId:          transactions.eventId,
      totalAmount:      transactions.totalAmount,
      discount:         transactions.discount,
      finalAmount:      transactions.finalAmount,
      paymentMethod:    transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      createdAt:        transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.eventId, eventId))
    .orderBy(sql`${transactions.createdAt} desc`);
}

export async function getTransactionItems(transactionId: number) {
  return db
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, transactionId));
}

/**
 * Stats for a single event — used in the event dashboard tab.
 */
export async function getEventStats(eventId: number): Promise<{
  txnCount:   number;
  revenue:    number;
  discount:   number;
  itemsSold:  number;
}> {
  const [agg] = await db
    .select({
      txnCount:  sql<number>`count(*)`,
      revenue:   sql<number>`coalesce(sum(${transactions.finalAmount}), 0)`,
      discount:  sql<number>`coalesce(sum(${transactions.discount}),     0)`,
    })
    .from(transactions)
    .where(eq(transactions.eventId, eventId));

  const [items] = await db
    .select({
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}), 0)`,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(eq(transactions.eventId, eventId));

  return {
    txnCount:  Number(agg?.txnCount  ?? 0),
    revenue:   Number(agg?.revenue   ?? 0),
    discount:  Number(agg?.discount  ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
  };
}

/**
 * Today's stats for a single event (useful for the live POS dashboard).
 */
export async function getEventTodayStats(eventId: number): Promise<{
  txnCount:  number;
  revenue:   number;
  discount:  number;
  itemsSold: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [r] = await db
    .select({
      txnCount: sql<number>`count(distinct ${transactions.id})`,
      revenue:  sql<number>`coalesce(sum(${transactions.finalAmount}), 0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),     0)`,
    })
    .from(transactions)
    .where(
      sql`${transactions.eventId} = ${eventId}
        AND ${transactions.createdAt} >= ${today}`
    );

  const [items] = await db
    .select({
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}), 0)`,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(
      sql`${transactions.eventId} = ${eventId}
        AND ${transactions.createdAt} >= ${today}`
    );

  return {
    txnCount:  Number(r?.txnCount  ?? 0),
    revenue:   Number(r?.revenue   ?? 0),
    discount:  Number(r?.discount  ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
  };
}

// ── Read — all events (parent dashboard) ─────────────────────────────────────

/**
 * Cross-event stats for the parent dashboard.
 * Returns one row per event with aggregated financials.
 */
export async function getAllEventsStats(): Promise<{
  eventId:   number;
  txnCount:  number;
  revenue:   number;
  discount:  number;
  itemsSold: number;
}[]> {
  // Transaction-level aggregates
  const txnRows = await db
    .select({
      eventId:  transactions.eventId,
      txnCount: sql<number>`count(distinct ${transactions.id})`,
      revenue:  sql<number>`coalesce(sum(${transactions.finalAmount}), 0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),     0)`,
    })
    .from(transactions)
    .groupBy(transactions.eventId);

  // Items-sold aggregates (separate query to avoid double-counting with the txn join)
  const itemRows = await db
    .select({
      eventId:   transactions.eventId,
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}), 0)`,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .groupBy(transactions.eventId);

  const itemsMap = new Map(itemRows.map((r) => [r.eventId, Number(r.itemsSold)]));

  return txnRows.map((r) => ({
    eventId:   r.eventId,
    txnCount:  Number(r.txnCount),
    revenue:   Number(r.revenue),
    discount:  Number(r.discount),
    itemsSold: itemsMap.get(r.eventId) ?? 0,
  }));
}

/**
 * All transactions across all events — used for global export.
 */
export async function getAllTransactions() {
  return db
    .select({
      id:               transactions.id,
      eventId:          transactions.eventId,
      totalAmount:      transactions.totalAmount,
      discount:         transactions.discount,
      finalAmount:      transactions.finalAmount,
      paymentMethod:    transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      createdAt:        transactions.createdAt,
    })
    .from(transactions)
    .orderBy(sql`${transactions.createdAt} desc`);
}