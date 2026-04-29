// lib/transactions.ts
import { db } from "@/lib/db";
import {
  transactions,
  transactionItems,
  payments,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { deductStock } from "@/lib/stock";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CartItemPayload = {
  eventItemId: number;
  itemId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmt: number;
  finalPrice: number;
  subtotal: number;
  promoApplied: string | null;
  freeQty?: number;
};

export type CheckoutPayload = {
  eventId: number;
  items: CartItemPayload[];
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentReference?: string | null;

  // For offline SQLite sync
  clientTxnId?: string | null;
  createdAt?: string | Date | null;
};

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

    if (existing) {
      return existing;
    }
  }

  return db.transaction(async (tx) => {
    const [txn] = await tx
      .insert(transactions)
      .values({
        eventId: payload.eventId,
        clientTxnId: payload.clientTxnId ?? null,
        totalAmount: String(payload.totalAmount),
        discount: String(payload.discount),
        finalAmount: String(payload.finalAmount),
        paymentMethod: payload.paymentMethod,
        paymentReference: payload.paymentReference ?? null,
        createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
      })
      .returning();

    const itemRows = payload.items.map((item) => ({
      transactionId: txn.id,
      eventItemId: item.eventItemId,
      productName: item.productName,
      itemId: item.itemId,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      discountAmt: String(item.discountAmt),
      finalPrice: String(item.finalPrice),
      subtotal: String(item.subtotal),
      promoApplied: item.promoApplied ?? null,
    }));

    await tx.insert(transactionItems).values(itemRows);

    await tx.insert(payments).values({
      transactionId: txn.id,
      method: payload.paymentMethod,
      reference: payload.paymentReference ?? null,
      paidAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
    });

    for (const item of payload.items) {
      await deductStock(item.eventItemId, item.quantity, txn.id);
    }

    return txn;
  });
}

// ── Offline sync ──────────────────────────────────────────────────────────────

export async function syncOfflineTransactions(payloads: CheckoutPayload[]) {
  const results: {
    clientTxnId: string | null;
    ok: boolean;
    transactionId?: number;
    error?: string;
  }[] = [];

  for (const payload of payloads) {
    const clientTxnId = payload.clientTxnId ?? null;

    try {
      const txn = await createTransaction(payload);

      results.push({
        clientTxnId,
        ok: true,
        transactionId: txn.id,
      });
    } catch (error) {
      results.push({
        clientTxnId,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync transaction",
      });
    }
  }

  return results;
}

// ── Read — per-event ──────────────────────────────────────────────────────────

export async function getTransactionsByEvent(eventId: number) {
  return db
    .select({
      id: transactions.id,
      eventId: transactions.eventId,
      clientTxnId: transactions.clientTxnId,
      totalAmount: transactions.totalAmount,
      discount: transactions.discount,
      finalAmount: transactions.finalAmount,
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

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getEventStats(eventId: number): Promise<{
  txnCount: number;
  revenue: number;
  discount: number;
  itemsSold: number;
}> {
  const [agg] = await db
    .select({
      txnCount: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}), 0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.eventId, eventId));

  const [items] = await db
    .select({
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}), 0)`,
    })
    .from(transactionItems)
    .innerJoin(
      transactions,
      eq(transactionItems.transactionId, transactions.id)
    )
    .where(eq(transactions.eventId, eventId));

  return {
    txnCount: Number(agg?.txnCount ?? 0),
    revenue: Number(agg?.revenue ?? 0),
    discount: Number(agg?.discount ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
  };
}

export async function getEventTodayStats(eventId: number): Promise<{
  txnCount: number;
  revenue: number;
  discount: number;
  itemsSold: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [r] = await db
    .select({
      txnCount: sql<number>`count(distinct ${transactions.id})`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}), 0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}), 0)`,
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
    .innerJoin(
      transactions,
      eq(transactionItems.transactionId, transactions.id)
    )
    .where(
      sql`${transactions.eventId} = ${eventId}
        AND ${transactions.createdAt} >= ${today}`
    );

  return {
    txnCount: Number(r?.txnCount ?? 0),
    revenue: Number(r?.revenue ?? 0),
    discount: Number(r?.discount ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
  };
}

export async function getAllEventsStats(): Promise<{
  eventId: number;
  txnCount: number;
  revenue: number;
  discount: number;
  itemsSold: number;
}[]> {
  const txnRows = await db
    .select({
      eventId: transactions.eventId,
      txnCount: sql<number>`count(distinct ${transactions.id})`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}), 0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}), 0)`,
    })
    .from(transactions)
    .groupBy(transactions.eventId);

  const itemRows = await db
    .select({
      eventId: transactions.eventId,
      itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}), 0)`,
    })
    .from(transactionItems)
    .innerJoin(
      transactions,
      eq(transactionItems.transactionId, transactions.id)
    )
    .groupBy(transactions.eventId);

  const itemsMap = new Map(
    itemRows.map((row) => [row.eventId, Number(row.itemsSold)])
  );

  return txnRows.map((row) => ({
    eventId: row.eventId,
    txnCount: Number(row.txnCount),
    revenue: Number(row.revenue),
    discount: Number(row.discount),
    itemsSold: itemsMap.get(row.eventId) ?? 0,
  }));
}

export async function getAllTransactions() {
  return db
    .select({
      id: transactions.id,
      eventId: transactions.eventId,
      clientTxnId: transactions.clientTxnId,
      totalAmount: transactions.totalAmount,
      discount: transactions.discount,
      finalAmount: transactions.finalAmount,
      paymentMethod: transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .orderBy(sql`${transactions.createdAt} desc`);
}