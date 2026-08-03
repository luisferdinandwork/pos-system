// lib/transactions.ts
import { db } from "@/lib/db";
import { events, transactions, transactionItems, payments } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { deductStock, addStockTransaction } from "@/lib/stock";
import {
  formatEventTransactionDisplayId,
  getTransactionMonthPrefix,
  parseEventTransactionSequence,
  TRANSACTION_DISPLAY_ID_RE,
} from "@/lib/transaction-ids";

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
  cashTendered?: number | null;
  changeAmount?: number | null;
  cashierSessionId?: number | null;
  cashierName?: string | null;

  // Local/offline idempotency key. Required for sync, optional for online checkout.
  clientTxnId?: string | null;

  // Local POS may generate this before sync. Cloud will preserve it only if it is
  // valid, belongs to this event/month, and is not already used.
  displayId?: string | null;

  // Local POS receipt count to sync into the cloud transaction row.
  receiptPrintCount?: number | null;

  createdAt?: string | Date | null;
};

export type VoidTransactionResult = {
  originalTransactionId: number;
  originalDisplayId: string | null;
  voidTransactionId: number;
  voidDisplayId: string | null;
  voidedAt: Date;
  voidedBy: string | null;
  voidReason: string | null;
  restockedItems: { eventItemId: number; quantity: number }[];
};

function toPositiveInt(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

async function getEventCode(eventId: number): Promise<string> {
  const [event] = await db
    .select({ code: events.code })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event?.code) throw new Error("Event not found or missing event code.");
  return event.code;
}

async function isDisplayIdAvailable(displayId: string) {
  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.displayId, displayId))
    .limit(1);

  return !existing;
}

async function generateDisplayId(eventId: number, date: Date): Promise<string> {
  const eventCode = await getEventCode(eventId);
  const prefix = getTransactionMonthPrefix(eventCode, date);

  const [row] = await db
    .select({ maxDisplayId: sql<string | null>`max(${transactions.displayId})` })
    .from(transactions)
    .where(
      and(
        sql`${transactions.displayId} is not null`,
        sql`${transactions.displayId} like ${prefix + "%"}`
      )
    );

  const lastSeq = row?.maxDisplayId ? parseEventTransactionSequence(row.maxDisplayId) : 0;
  return formatEventTransactionDisplayId(eventCode, date, lastSeq + 1);
}

async function resolveDisplayId(params: {
  eventId: number;
  date: Date;
  requestedDisplayId?: string | null;
}) {
  const eventCode = await getEventCode(params.eventId);
  const prefix = getTransactionMonthPrefix(eventCode, params.date);
  const requested = params.requestedDisplayId?.trim() || null;

  if (
    requested &&
    TRANSACTION_DISPLAY_ID_RE.test(requested) &&
    requested.startsWith(prefix) &&
    (await isDisplayIdAvailable(requested))
  ) {
    return requested;
  }

  return generateDisplayId(params.eventId, params.date);
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createTransaction(payload: CheckoutPayload) {
  if (!payload.items.length) throw new Error("Transaction must have at least one item.");

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
    const displayId = await resolveDisplayId({
      eventId: payload.eventId,
      date: now,
      requestedDisplayId: payload.displayId,
    });

    const [txn] = await tx
      .insert(transactions)
      .values({
        displayId,
        eventId: payload.eventId,
        clientTxnId: payload.clientTxnId ?? null,
        cashierSessionId: payload.cashierSessionId ?? null,
        cashierName: payload.cashierName ?? null,
        totalAmount: String(payload.totalAmount),
        discount: String(payload.discount),
        finalAmount: String(payload.finalAmount),
        cashTendered: payload.cashTendered != null ? String(payload.cashTendered) : null,
        changeAmount: payload.changeAmount != null ? String(payload.changeAmount) : null,
        paymentMethod: payload.paymentMethod,
        paymentReference: payload.paymentReference ?? null,
        receiptPrintCount: toPositiveInt(payload.receiptPrintCount),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(transactionItems).values(
      payload.items.map((item) => ({
        transactionId: txn.id,
        eventItemId: item.eventItemId,
        itemId: item.itemId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        discountAmt: String(item.discountAmt),
        finalPrice: String(item.finalPrice),
        subtotal: String(item.subtotal),
        promoApplied: item.promoApplied ?? null,
      }))
    );

    await tx.insert(payments).values({
      transactionId: txn.id,
      method: payload.paymentMethod,
      reference: payload.paymentReference ?? null,
      paidAt: now,
    });

    for (const item of payload.items) {
      await deductStock(item.eventItemId, item.quantity, txn.id, tx);
    }

    return txn;
  });
}

// ── Void ──────────────────────────────────────────────────────────────────────

/**
 * Voids a transaction by:
 * 1. Marking the original as status="voided" (audit trail, blocks re-void).
 * 2. Inserting a reversing transaction (status="void_entry") with negative
 *    amounts and negative line-item quantities/subtotals, linked back via
 *    voidOfTransactionId. Because reports/stats sum() these tables directly,
 *    this makes revenue/discount/itemsSold net out automatically.
 * 3. Restocking every line item through the normal stock ledger
 *    (stock_transactions, type "adjustment") so stock history stays truthful.
 *
 * displayId is PREFIXED ("VOID-<original>") rather than suffixed, so it never
 * matches the `LIKE prefix%` sequence lookup in generateDisplayId() — a
 * suffix could theoretically get picked up as "max" and cause the next real
 * sale to reuse a sequence number.
 */
export async function voidTransaction(
  transactionId: number,
  options: { voidedBy?: string | null; voidReason?: string | null } = {}
): Promise<VoidTransactionResult> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!original) {
      throw new Error("Transaction not found.");
    }

    if ((original as any).voidOfTransactionId != null) {
      throw new Error("Cannot void a void entry.");
    }

    // Since the original's status no longer changes to "voided", double-void
    // protection comes from checking whether a reversing entry already
    // exists for this transaction, instead of reading original.status.
    const [existingVoidEntry] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.voidOfTransactionId, transactionId))
      .limit(1);

    if (existingVoidEntry) {
      throw new Error("Transaction has already been voided.");
    }

    const items = await tx
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, transactionId));

    if (items.length === 0) {
      throw new Error("Transaction has no items to reverse.");
    }

    const now = new Date();

    // status is intentionally NOT changed here — the original stays
    // "completed". voidedAt/voidedBy/voidReason are still stamped, and
    // that's what UI/reports should check to know it was voided.
    const [updatedOriginal] = await tx
      .update(transactions)
      .set({
        voidedAt: now,
        voidedBy: options.voidedBy ?? null,
        voidReason: options.voidReason ?? null,
        updatedAt: now,
      } as any)
      .where(eq(transactions.id, transactionId))
      .returning();

    const [voidTxn] = await tx
      .insert(transactions)
      .values({
        displayId: `VOID-${original.displayId}`,
        eventId: original.eventId,
        clientTxnId: null,
        cashierSessionId: original.cashierSessionId,
        cashierName: options.voidedBy ?? original.cashierName,
        totalAmount: String(-Number(original.totalAmount)),
        discount: String(-Number(original.discount)),
        finalAmount: String(-Number(original.finalAmount)),
        cashTendered: null,
        changeAmount: null,
        paymentMethod: original.paymentMethod,
        paymentReference: original.paymentReference,
        receiptPrintCount: 0,
        status: "void",
        voidOfTransactionId: original.id,
        voidedAt: now,
        voidedBy: options.voidedBy ?? null,
        voidReason: options.voidReason ?? null,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    await tx.insert(transactionItems).values(
      items.map((item) => ({
        transactionId: voidTxn.id,
        eventItemId: item.eventItemId,
        itemId: item.itemId,
        productName: item.productName,
        quantity: -item.quantity,
        unitPrice: item.unitPrice,
        discountAmt: item.discountAmt,
        finalPrice: item.finalPrice,
        subtotal: String(-Number(item.subtotal)),
        promoApplied: item.promoApplied,
      }))
    );

    const restockedItems: { eventItemId: number; quantity: number }[] = [];

    for (const item of items) {
      await addStockTransaction(
        {
          eventItemId: item.eventItemId,
          typeCode: "adjustment",
          quantity: Math.abs(item.quantity),
          transactionId: voidTxn.id,
          referenceType: "void",
          referenceId: voidTxn.id,
          note: `Restocked from voided transaction #${original.id} (${original.displayId})`,
        },
        tx
      );

      restockedItems.push({ eventItemId: item.eventItemId, quantity: item.quantity });
    }

    return {
      originalTransactionId: updatedOriginal.id,
      originalDisplayId: updatedOriginal.displayId ?? null,
      voidTransactionId: voidTxn.id,
      voidDisplayId: voidTxn.displayId ?? null,
      voidedAt: now,
      voidedBy: (updatedOriginal as any).voidedBy ?? null,
      voidReason: (updatedOriginal as any).voidReason ?? null,
      restockedItems,
    };
  });
}

export async function incrementReceiptPrintCount(transactionId: number, by = 1) {
  const increment = Math.max(1, Math.trunc(Number(by) || 1));

  const [updated] = await db
    .update(transactions)
    .set({
      receiptPrintCount: sql`${transactions.receiptPrintCount} + ${increment}`,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionId))
    .returning();

  return updated;
}

export async function getTransactionReceiptPrintCount(transactionId: number) {
  const [row] = await db
    .select({
      transactionId: transactions.id,
      receiptPrintCount: transactions.receiptPrintCount,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!row) {
    throw new Error("Transaction not found.");
  }

  return {
    transactionId: row.transactionId,
    receiptPrintCount: Number(row.receiptPrintCount ?? 0),
  };
}

export async function incrementTransactionReceiptPrintCount(
  transactionId: number
) {
  const [updated] = await db
    .update(transactions)
    .set({
      receiptPrintCount: sql`${transactions.receiptPrintCount} + 1`,
    })
    .where(eq(transactions.id, transactionId))
    .returning({
      transactionId: transactions.id,
      receiptPrintCount: transactions.receiptPrintCount,
    });

  if (!updated) {
    throw new Error("Transaction not found.");
  }

  return {
    transactionId: updated.transactionId,
    receiptPrintCount: Number(updated.receiptPrintCount ?? 0),
  };
}

export async function setReceiptPrintCountAtLeast(
  transactionId: number,
  printCount: number
) {
  const safeCount = Math.max(0, Math.trunc(Number(printCount) || 0));

  const [updated] = await db
    .update(transactions)
    .set({
      receiptPrintCount: sql`greatest(${transactions.receiptPrintCount}, ${safeCount})`,
    })
    .where(eq(transactions.id, transactionId))
    .returning({
      transactionId: transactions.id,
      receiptPrintCount: transactions.receiptPrintCount,
    });

  if (!updated) {
    throw new Error("Transaction not found.");
  }

  return {
    transactionId: updated.transactionId,
    receiptPrintCount: Number(updated.receiptPrintCount ?? 0),
  };
}

export async function getTransactionReceiptPrintCountsByEvent(eventId: number) {
  const rows = await db
    .select({
      id: transactions.id,
      receiptPrintCount: transactions.receiptPrintCount,
    })
    .from(transactions)
    .where(eq(transactions.eventId, eventId));

  return Object.fromEntries(
    rows.map((row) => [row.id, Number(row.receiptPrintCount ?? 0)])
  );
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
      cashierName: transactions.cashierName,
      totalAmount: transactions.totalAmount,
      discount: transactions.discount,
      finalAmount: transactions.finalAmount,
      cashTendered: transactions.cashTendered,
      changeAmount: transactions.changeAmount,
      paymentMethod: transactions.paymentMethod,
      paymentReference: transactions.paymentReference,
      receiptPrintCount: transactions.receiptPrintCount,
      status: transactions.status,
      voidedAt: transactions.voidedAt,
      voidedBy: transactions.voidedBy,
      voidReason: transactions.voidReason,
      voidOfTransactionId: transactions.voidOfTransactionId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.eventId, eventId))
    .orderBy(sql`${transactions.createdAt} desc`);
}

export async function getTransactionItems(transactionId: number) {
  return db.select().from(transactionItems).where(eq(transactionItems.transactionId, transactionId));
}

export async function getEventStats(eventId: number) {
  const [agg] = await db
    .select({
      txnCount: sql<number>`count(*) filter (where ${transactions.voidOfTransactionId} is null)`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}),0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),0)`,
      receiptPrintCount: sql<number>`coalesce(sum(${transactions.receiptPrintCount}),0)`,
    })
    .from(transactions)
    .where(eq(transactions.eventId, eventId));

  const [items] = await db
    .select({ itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}),0)` })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(eq(transactions.eventId, eventId));

  return {
    txnCount: Number(agg?.txnCount ?? 0),
    revenue: Number(agg?.revenue ?? 0),
    discount: Number(agg?.discount ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
    receiptPrintCount: Number(agg?.receiptPrintCount ?? 0),
  };
}

export async function getEventTodayStats(eventId: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [r] = await db
    .select({
      txnCount: sql<number>`count(distinct ${transactions.id}) filter (where ${transactions.voidOfTransactionId} is null)`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}),0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),0)`,
      receiptPrintCount: sql<number>`coalesce(sum(${transactions.receiptPrintCount}),0)`,
    })
    .from(transactions)
    .where(sql`${transactions.eventId} = ${eventId} AND ${transactions.createdAt} >= ${today}`);

  const [items] = await db
    .select({ itemsSold: sql<number>`coalesce(sum(${transactionItems.quantity}),0)` })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
    .where(sql`${transactions.eventId} = ${eventId} AND ${transactions.createdAt} >= ${today}`);

  return {
    txnCount: Number(r?.txnCount ?? 0),
    revenue: Number(r?.revenue ?? 0),
    discount: Number(r?.discount ?? 0),
    itemsSold: Number(items?.itemsSold ?? 0),
    receiptPrintCount: Number(r?.receiptPrintCount ?? 0),
  };
}

export async function getAllEventsStats() {
  const txnRows = await db
    .select({
      eventId: transactions.eventId,
      txnCount: sql<number>`count(distinct ${transactions.id}) filter (where ${transactions.voidOfTransactionId} is null)`,
      revenue: sql<number>`coalesce(sum(${transactions.finalAmount}),0)`,
      discount: sql<number>`coalesce(sum(${transactions.discount}),0)`,
      receiptPrintCount: sql<number>`coalesce(sum(${transactions.receiptPrintCount}),0)`,
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
    receiptPrintCount: Number(r.receiptPrintCount ?? 0),
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
      receiptPrintCount: transactions.receiptPrintCount,
      status: transactions.status,
      voidedAt: transactions.voidedAt,
      voidedBy: transactions.voidedBy,
      voidReason: transactions.voidReason,
      voidOfTransactionId: transactions.voidOfTransactionId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .orderBy(sql`${transactions.createdAt} desc`);
}