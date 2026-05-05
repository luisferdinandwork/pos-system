// lib/stock.ts
import { db } from "@/lib/db";
import {
  eventItems,
  stockTransactions,
  stockTransactionTypes,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type StockTransaction = typeof stockTransactions.$inferSelect;
export type StockTransactionType = typeof stockTransactionTypes.$inferSelect;

export type StockTransactionTypeCode =
  | "transfer_in"
  | "transfer_out"
  | "sale"
  | "adjustment";

export type StockSummary = {
  totalItems: number;
  outOfStock: number;
  lowStock: number;

  /**
   * Current stock now.
   * This can be negative.
   */
  totalUnits: number;

  /**
   * Units sold through sale stock transactions.
   */
  soldUnits: number;

  /**
   * totalUnits + soldUnits.
   * This is useful for dashboard comparison:
   * sold vs total received/available.
   */
  originalUnits: number;
  totalAvailableUnits: number;

  remainingValue: number;
  totalStockValue: number;
};

export type EventInventorySummary = StockSummary & {
  eventId: number;
};

export const DEFAULT_STOCK_TRANSACTION_TYPES = [
  {
    code: "transfer_in",
    name: "Transfer In",
    defaultDirection: 1,
  },
  {
    code: "transfer_out",
    name: "Transfer Out",
    defaultDirection: -1,
  },
  {
    code: "sale",
    name: "Sale",
    defaultDirection: -1,
  },
  {
    code: "adjustment",
    name: "Adjustment",
    defaultDirection: 0,
  },
] as const;

type StockDbExecutor = typeof db | any;

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeStockQuantity(
  typeCode: StockTransactionTypeCode,
  quantity: number
): number {
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error("Quantity must not be zero.");
  }

  if (typeCode === "transfer_in") {
    return Math.abs(quantity);
  }

  if (typeCode === "transfer_out" || typeCode === "sale") {
    return -Math.abs(quantity);
  }

  /**
   * Adjustment can be positive or negative.
   */
  return quantity;
}

function isStockTransactionTypeCode(
  value: string
): value is StockTransactionTypeCode {
  return (
    value === "transfer_in" ||
    value === "transfer_out" ||
    value === "sale" ||
    value === "adjustment"
  );
}

// ── Setup ───────────────────────────────────────────────────────────────────

export async function seedDefaultStockTransactionTypes() {
  for (const type of DEFAULT_STOCK_TRANSACTION_TYPES) {
    const [existing] = await db
      .select()
      .from(stockTransactionTypes)
      .where(eq(stockTransactionTypes.code, type.code))
      .limit(1);

    if (existing) continue;

    await db.insert(stockTransactionTypes).values({
      code: type.code,
      name: type.name,
      defaultDirection: type.defaultDirection,
      isSystem: true,
    });
  }
}

/**
 * Safe resolver.
 * If the type is missing, it creates it.
 * This prevents sync from failing because stock types were not seeded yet.
 */
export async function getOrCreateStockTransactionTypeByCode(
  code: StockTransactionTypeCode,
  executor: StockDbExecutor = db
): Promise<StockTransactionType> {
  const [existing] = await executor
    .select()
    .from(stockTransactionTypes)
    .where(eq(stockTransactionTypes.code, code))
    .limit(1);

  if (existing) return existing;

  const defaultType = DEFAULT_STOCK_TRANSACTION_TYPES.find(
    (type) => type.code === code
  );

  if (!defaultType) {
    throw new Error(`Unknown stock transaction type "${code}".`);
  }

  const [created] = await executor
    .insert(stockTransactionTypes)
    .values({
      code: defaultType.code,
      name: defaultType.name,
      defaultDirection: defaultType.defaultDirection,
      isSystem: true,
    })
    .returning();

  return created;
}

export async function getStockTransactionTypeByCode(
  code: string
): Promise<StockTransactionType> {
  if (!isStockTransactionTypeCode(code)) {
    throw new Error(`Invalid stock transaction type "${code}".`);
  }

  return getOrCreateStockTransactionTypeByCode(code);
}

// ── Read ────────────────────────────────────────────────────────────────────

export async function getStockForEventItem(eventItemId: number): Promise<number> {
  const [row] = await db
    .select({ stock: eventItems.stock })
    .from(eventItems)
    .where(eq(eventItems.id, eventItemId))
    .limit(1);

  return toNumber(row?.stock);
}

export async function getStockLevelsForEvent(
  eventId: number
): Promise<Record<number, number>> {
  const rows = await db
    .select({
      id: eventItems.id,
      stock: eventItems.stock,
    })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  return Object.fromEntries(rows.map((row) => [row.id, toNumber(row.stock)]));
}

export async function getItemsWithStockForEvent(eventId: number) {
  return db
    .select()
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId))
    .orderBy(eventItems.name);
}

export async function getStockHistory(
  eventItemId: number
): Promise<StockTransaction[]> {
  return db
    .select()
    .from(stockTransactions)
    .where(eq(stockTransactions.eventItemId, eventItemId))
    .orderBy(sql`${stockTransactions.createdAt} desc`);
}

export async function assertEventItemBelongsToEvent(
  eventId: number,
  eventItemId: number
) {
  const [item] = await db
    .select({
      id: eventItems.id,
      eventId: eventItems.eventId,
    })
    .from(eventItems)
    .where(and(eq(eventItems.id, eventItemId), eq(eventItems.eventId, eventId)))
    .limit(1);

  if (!item) {
    throw new Error("Item does not belong to this event.");
  }

  return item;
}

// ── Write ───────────────────────────────────────────────────────────────────

type AddStockTransactionInput = {
  eventItemId: number;
  typeCode: StockTransactionTypeCode;
  quantity: number;
  note?: string | null;

  /**
   * Optional relation to a transaction.
   * For sale sync, pass transactionId.
   */
  transactionId?: number | null;

  /**
   * Optional generic reference fields.
   */
  referenceType?: string | null;
  referenceId?: number | null;

  /**
   * Optional date.
   * Use Date, not string, for timestamp columns.
   */
  createdAt?: Date | string | null;
};

async function addStockTransactionWithExecutor(
  executor: StockDbExecutor,
  input: AddStockTransactionInput
): Promise<StockTransaction> {
  if (!Number.isFinite(input.eventItemId)) {
    throw new Error("eventItemId is required.");
  }

  const signedQuantity = normalizeStockQuantity(
    input.typeCode,
    Number(input.quantity)
  );

  const type = await getOrCreateStockTransactionTypeByCode(
    input.typeCode,
    executor
  );

  /**
   * Lock row to avoid two stock updates reading the same value.
   * Works on Postgres.
   */
  const [item] = await executor
    .select()
    .from(eventItems)
    .where(eq(eventItems.id, input.eventItemId))
    .for("update")
    .limit(1);

  if (!item) {
    throw new Error(`Event item ${input.eventItemId} not found.`);
  }

  const stockBefore = toNumber(item.stock);
  const stockAfter = stockBefore + signedQuantity;

  /**
   * IMPORTANT:
   * No guard against stockAfter < 0.
   * Your POS allows negative stock.
   */

  const createdAt =
    input.createdAt instanceof Date
      ? input.createdAt
      : input.createdAt
        ? new Date(input.createdAt)
        : new Date();

  const referenceType =
    input.referenceType ??
    (input.transactionId ? "transaction" : input.typeCode);

  const referenceId = input.referenceId ?? input.transactionId ?? null;

  const [entry] = await executor
    .insert(stockTransactions)
    .values({
      eventItemId: input.eventItemId,
      typeId: type.id,
      quantity: signedQuantity,

      stockBefore,
      stockAfter,

      transactionId: input.transactionId ?? null,

      referenceType,
      referenceId,

      note: input.note ?? null,
      createdAt,
    })
    .returning();

  await executor
    .update(eventItems)
    .set({
      stock: stockAfter,
    })
    .where(eq(eventItems.id, input.eventItemId));

  return entry;
}

/**
 * Public function.
 *
 * If you call it normally:
 *   await addStockTransaction(...)
 *
 * It creates its own db transaction.
 *
 * If you call it from createTransaction() inside tx:
 *   await addStockTransaction(..., tx)
 *
 * It reuses the existing transaction, so FK to transactions.id works.
 */
export async function addStockTransaction(
  input: AddStockTransactionInput,
  executor?: StockDbExecutor
): Promise<StockTransaction> {
  if (executor) {
    return addStockTransactionWithExecutor(executor, input);
  }

  return db.transaction(async (tx) => {
    return addStockTransactionWithExecutor(tx, input);
  });
}

/**
 * Used by transaction creation.
 * Must be called with tx from createTransaction().
 */
export async function deductStock(
  eventItemId: number,
  quantity: number,
  transactionId?: number | null,
  executor?: StockDbExecutor
) {
  return addStockTransaction(
    {
      eventItemId,
      typeCode: "sale",
      quantity: -Math.abs(Number(quantity)),
      transactionId: transactionId ?? null,
      referenceType: "transaction",
      referenceId: transactionId ?? null,
      note: transactionId
        ? `Sale transaction #${transactionId}`
        : "Sale transaction",
    },
    executor
  );
}

/**
 * Compatibility helper if old code still imports addStockEntry.
 */
export async function addStockEntry(
  eventItemId: number,
  quantity: number,
  note?: string | null,
  source?: string | null
) {
  const typeCode: StockTransactionTypeCode =
    source === "import"
      ? "transfer_in"
      : source === "sale"
        ? "sale"
        : "adjustment";

  return addStockTransaction({
    eventItemId,
    typeCode,
    quantity,
    note: note ?? null,
    referenceType: source ?? typeCode,
  });
}

// ── Summaries ───────────────────────────────────────────────────────────────

export async function getStockSummaryForEvent(
  eventId: number
): Promise<StockSummary> {
  const [stockRow] = await db
    .select({
      totalItems: sql<number>`count(${eventItems.id})`,

      outOfStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} <= 0 then 1 else 0 end),
          0
        )
      `,

      lowStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} > 0 and ${eventItems.stock} <= 5 then 1 else 0 end),
          0
        )
      `,

      totalUnits: sql<number>`
        coalesce(sum(${eventItems.stock}), 0)
      `,

      remainingValue: sql<number>`
        coalesce(sum(${eventItems.stock} * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(eventItems)
    .where(eq(eventItems.eventId, eventId));

  const [soldRow] = await db
    .select({
      soldUnits: sql<number>`
        coalesce(sum(abs(${stockTransactions.quantity})), 0)
      `,

      soldStockValue: sql<number>`
        coalesce(sum(abs(${stockTransactions.quantity}) * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(stockTransactions)
    .innerJoin(eventItems, eq(stockTransactions.eventItemId, eventItems.id))
    .innerJoin(
      stockTransactionTypes,
      eq(stockTransactions.typeId, stockTransactionTypes.id)
    )
    .where(
      and(
        eq(eventItems.eventId, eventId),
        eq(stockTransactionTypes.code, "sale")
      )
    );

  const totalUnits = toNumber(stockRow?.totalUnits);
  const soldUnits = toNumber(soldRow?.soldUnits);

  const remainingValue = toNumber(stockRow?.remainingValue);
  const soldStockValue = toNumber(soldRow?.soldStockValue);

  const totalAvailableUnits = totalUnits + soldUnits;
  const totalStockValue = remainingValue + soldStockValue;

  return {
    totalItems: toNumber(stockRow?.totalItems),
    outOfStock: toNumber(stockRow?.outOfStock),
    lowStock: toNumber(stockRow?.lowStock),

    totalUnits,
    soldUnits,

    originalUnits: totalAvailableUnits,
    totalAvailableUnits,

    remainingValue,
    totalStockValue,
  };
}

export async function getInventorySummaryForAllEvents(): Promise<
  EventInventorySummary[]
> {
  const stockRows = await db
    .select({
      eventId: eventItems.eventId,

      totalItems: sql<number>`count(${eventItems.id})`,

      outOfStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} <= 0 then 1 else 0 end),
          0
        )
      `,

      lowStock: sql<number>`
        coalesce(
          sum(case when ${eventItems.stock} > 0 and ${eventItems.stock} <= 5 then 1 else 0 end),
          0
        )
      `,

      totalUnits: sql<number>`coalesce(sum(${eventItems.stock}), 0)`,

      remainingValue: sql<number>`
        coalesce(sum(${eventItems.stock} * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(eventItems)
    .groupBy(eventItems.eventId);

  const soldRows = await db
    .select({
      eventId: eventItems.eventId,

      soldUnits: sql<number>`
        coalesce(sum(abs(${stockTransactions.quantity})), 0)
      `,

      soldStockValue: sql<number>`
        coalesce(sum(abs(${stockTransactions.quantity}) * ${eventItems.netPrice}::numeric), 0)
      `,
    })
    .from(stockTransactions)
    .innerJoin(eventItems, eq(stockTransactions.eventItemId, eventItems.id))
    .innerJoin(
      stockTransactionTypes,
      eq(stockTransactions.typeId, stockTransactionTypes.id)
    )
    .where(eq(stockTransactionTypes.code, "sale"))
    .groupBy(eventItems.eventId);

  const soldMap = new Map(soldRows.map((row) => [row.eventId, row]));

  return stockRows.map((row) => {
    const sold = soldMap.get(row.eventId);

    const totalUnits = toNumber(row.totalUnits);
    const soldUnits = toNumber(sold?.soldUnits);

    const remainingValue = toNumber(row.remainingValue);
    const soldStockValue = toNumber(sold?.soldStockValue);

    const totalAvailableUnits = totalUnits + soldUnits;
    const totalStockValue = remainingValue + soldStockValue;

    return {
      eventId: row.eventId,

      totalItems: toNumber(row.totalItems),
      outOfStock: toNumber(row.outOfStock),
      lowStock: toNumber(row.lowStock),

      totalUnits,
      soldUnits,

      originalUnits: totalAvailableUnits,
      totalAvailableUnits,

      remainingValue,
      totalStockValue,
    };
  });
}