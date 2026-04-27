// lib/transactions.ts
import { db } from "@/lib/db";
import { transactions, transactionItems, payments, products } from "@/lib/db/schema";
import { eq, gte, sql } from "drizzle-orm";
import { deductStock } from "@/lib/stock";

export type CartItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export type CheckoutPayload = {
  items: CartItem[];
  totalAmount: number;
  paymentMethod: string;
  paymentReference?: string;
};

export async function createTransaction(payload: CheckoutPayload) {
  const [txn] = await db
    .insert(transactions)
    .values({ totalAmount: String(payload.totalAmount) })
    .returning();

  const itemRows = payload.items.map((item) => ({
    transactionId: txn.id,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: String(item.unitPrice),
    subtotal: String(item.unitPrice * item.quantity),
  }));
  await db.insert(transactionItems).values(itemRows);

  await db.insert(payments).values({
    transactionId: txn.id,
    method: payload.paymentMethod,
    reference: payload.paymentReference ?? null,
  });

  // Deduct stock via stock entries (replaces direct SQL update)
  for (const item of payload.items) {
    await deductStock(item.productId, item.quantity, txn.id);
  }

  return txn;
}

export async function getAllTransactions() {
  const result = await db
    .select({
      id: transactions.id,
      totalAmount: transactions.totalAmount,
      createdAt: transactions.createdAt,
      paymentMethod: payments.method,
      paymentReference: payments.reference,
    })
    .from(transactions)
    .leftJoin(payments, eq(payments.transactionId, transactions.id))
    .orderBy(sql`${transactions.createdAt} desc`);
  return result;
}

export async function getTodayStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = await db
    .select({
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${transactions.totalAmount}), 0)`,
    })
    .from(transactions)
    .where(gte(transactions.createdAt, today));
  return result[0];
}

export async function getRecentTransactions() {
  return getAllTransactions().then((rows) => rows.slice(0, 5));
}

export async function getTransactionItems(transactionId: number) {
  return db
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, transactionId));
}