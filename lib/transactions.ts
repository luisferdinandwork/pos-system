// lib/transactions.ts
import { db } from "@/lib/db";
import { transactions, transactionItems, payments } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { deductStock } from "@/lib/stock";
import { formatTransactionDisplayId } from "@/lib/utils";

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
  eventId:           number;
  items:             CartItemPayload[];
  totalAmount:       number;
  discount:          number;
  finalAmount:       number;
  paymentMethod:     string;
  paymentReference?: string | null;
  cashTendered?:     number | null;
  changeAmount?:     number | null;
  cashierSessionId?: number | null;
  clientTxnId?:      string | null;
  createdAt?:        string | Date | null;
};

// ── Display ID generation ─────────────────────────────────────────────────────
// Format: yyyyMM + 5-digit sequence scoped to the month.
// Example: first transaction in May 2026 → "20260500001"

async function generateDisplayId(eventId: number, date: Date): Promise<string> {
  const yyyy   = date.getFullYear();
  const mm     = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `${yyyy}${mm}`;

  /**
   * Do not use count(*), because deleting old rows can reuse a number.
   * Instead, find the highest existing yyyyMMxxxxx display ID and increment it.
   *
   * Your schema currently has displayId as globally unique, so this sequence is
   * month-scoped globally. If you want the same yyyyMM00001 to repeat per event,
   * remove .unique() from transactions.displayId or make a composite unique index.
   */
  const [row] = await db
    .select({
      maxDisplayId: sql<string | null>`max(${transactions.displayId})`,
    })
    .from(transactions)
    .where(
      and(
        sql`${transactions.displayId} is not null`,
        sql`${transactions.displayId} like ${prefix + "%"}`
      )
    );

  const currentMax = row?.maxDisplayId ?? null;
  const lastSeq = currentMax ? Number(currentMax.slice(6)) : 0;
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;

  return formatTransactionDisplayId(date, nextSeq);
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createTransaction(payload: CheckoutPayload) {
  if (!payload.items.length) {
    throw new Error("Transaction must have at least one item.");
  }

  if (payload.clientTxnId) {
    const [existing] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.clientTxnId, payload.clientTxnId))
      .limit(1);

    if (existing) return existing;
  }

  return db.transaction(async (tx) => {
    const now = payload.createdAt ? new Date(payload.createdAt) : new Date();
    const displayId = await generateDisplayId(payload.eventId, now);

    const [txn] = await tx
      .insert(transactions)
      .values({
        displayId,
        eventId:          payload.eventId,
        clientTxnId:      payload.clientTxnId ?? null,
        cashierSessionId: payload.cashierSessionId ?? null,
        totalAmount:      String(payload.totalAmount),
        discount:         String(payload.discount),
        finalAmount:      String(payload.finalAmount),
        cashTendered:     payload.cashTendered != null ? String(payload.cashTendered) : null,
        changeAmount:     payload.changeAmount != null ? String(payload.changeAmount) : null,
        paymentMethod:    payload.paymentMethod,
        paymentReference: payload.paymentReference ?? null,
        createdAt:        now,
      })
      .returning();

    await tx.insert(transactionItems).values(
      payload.items.map((item) => ({
        transactionId: txn.id,
        eventItemId:   item.eventItemId,
        itemId:        item.itemId,
        productName:   item.productName,
        quantity:      item.quantity,
        unitPrice:     String(item.unitPrice),
        discountAmt:   String(item.discountAmt),
        finalPrice:    String(item.finalPrice),
        subtotal:      String(item.subtotal),
        promoApplied:  item.promoApplied ?? null,
      }))
    );

    await tx.insert(payments).values({
      transactionId: txn.id,
      method:        payload.paymentMethod,
      reference:     payload.paymentReference ?? null,
      paidAt:        now,
    });

    for (const item of payload.items) {
      await deductStock(item.eventItemId, item.quantity, txn.id, tx);
    }

    return txn;
  });
}

export async function syncOfflineTransactions(payloads: CheckoutPayload[]) {
  const results: {
    clientTxnId: string | null;
    ok: boolean;
    transactionId?: number;
    displayId?: string | null;
    error?: string;
  }[] = [];

  for (const payload of payloads) {
    try {
      const txn = await createTransaction(payload);
      results.push({
        clientTxnId: payload.clientTxnId ?? null,
        ok: true,
        transactionId: txn.id,
        displayId: txn.displayId ?? null,
      });
    } catch (error) {
      results.push({
        clientTxnId: payload.clientTxnId ?? null,
        ok: false,
        error: error instanceof Error ? error.message : "Failed",
      });
    }
  }

  return results;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getTransactionsByEvent(eventId: number) {
  return db
    .select({
      id: transactions.id,
      displayId: transactions.displayId,
      eventId: transactions.eventId,
      clientTxnId: transactions.clientTxnId,
      cashierSessionId: transactions.cashierSessionId,
      totalAmount: transactions.totalAmount,
      discount: transactions.discount,
      finalAmount: transactions.finalAmount,
      cashTendered: transactions.cashTendered,
      changeAmount: transactions.changeAmount,
      paymentMethod: transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      createdAt: transactions.createdAt,
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

export async function getEventStats(eventId: number) {
  const [agg] = await db
    .select({
      txnCount: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}),0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),0)`,
    })
    .from(transactions)
    .where(eq(transactions.eventId, eventId));

  const [items] = await db
    .select({
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}),0)`,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(eq(transactions.eventId, eventId));

  return {
    txnCount: Number(agg?.txnCount ?? 0),
    revenue: Number(agg?.revenue ?? 0),
    discount: Number(agg?.discount ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
  };
}

export async function getEventTodayStats(eventId: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [r] = await db
    .select({
      txnCount: sql<number>`count(distinct ${transactions.id})`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}),0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),0)`,
    })
    .from(transactions)
    .where(sql`${transactions.eventId} = ${eventId} AND ${transactions.createdAt} >= ${today}`);

  const [items] = await db
    .select({
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}),0)`,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(sql`${transactions.eventId} = ${eventId} AND ${transactions.createdAt} >= ${today}`);

  return {
    txnCount: Number(r?.txnCount ?? 0),
    revenue: Number(r?.revenue ?? 0),
    discount: Number(r?.discount ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
  };
}

export async function getAllEventsStats() {
  const txnRows = await db
    .select({
      eventId: transactions.eventId,
      txnCount: sql<number>`count(distinct ${transactions.id})`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}),0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),0)`,
    })
    .from(transactions)
    .groupBy(transactions.eventId);

  const itemRows = await db
    .select({
      eventId: transactions.eventId,
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}),0)`,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .groupBy(transactions.eventId);

  const itemsMap = new Map(itemRows.map((r) => [r.eventId, Number(r.itemsSold)]));

  return txnRows.map((r) => ({
    eventId: r.eventId,
    txnCount: Number(r.txnCount),
    revenue: Number(r.revenue),
    discount: Number(r.discount),
    itemsSold: itemsMap.get(r.eventId) ?? 0,
  }));
}

export async function getAllTransactions() {
  return db
    .select({
      id: transactions.id,
      displayId: transactions.displayId,
      eventId: transactions.eventId,
      clientTxnId: transactions.clientTxnId,
      totalAmount: transactions.totalAmount,
      discount: transactions.discount,
      finalAmount: transactions.finalAmount,
      cashTendered: transactions.cashTendered,
      changeAmount: transactions.changeAmount,
      paymentMethod: transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .orderBy(sql`${transactions.createdAt} desc`);
}
