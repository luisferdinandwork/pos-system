// lib/stock.ts
import { db } from "@/lib/db";
import { stockEntries, products } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export type StockEntry = typeof stockEntries.$inferSelect;

// Get current stock level for a product (sum of all entries)
export async function getStockForProduct(productId: number): Promise<number> {
  const result = await db
    .select({ total: sql<number>`coalesce(sum(${stockEntries.quantity}), 0)` })
    .from(stockEntries)
    .where(eq(stockEntries.productId, productId));
  return Number(result[0]?.total ?? 0);
}

// Get stock levels for ALL products at once (efficient — one query)
export async function getAllStockLevels(): Promise<Record<number, number>> {
  const rows = await db
    .select({
      productId: stockEntries.productId,
      total: sql<number>`coalesce(sum(${stockEntries.quantity}), 0)`,
    })
    .from(stockEntries)
    .groupBy(stockEntries.productId);

  return Object.fromEntries(rows.map((r) => [r.productId, Number(r.total)]));
}

// Add a stock entry (restock)
export async function addStockEntry(
  productId: number,
  quantity: number,
  note: string,
  source: "manual" | "import" | "sale" = "manual"
): Promise<StockEntry> {
  const result = await db
    .insert(stockEntries)
    .values({ productId, quantity, note, source })
    .returning();
  return result[0];
}

// Deduct stock when a sale happens (called internally by createTransaction)
export async function deductStock(
  productId: number,
  quantity: number,
  transactionId: number
): Promise<void> {
  await db.insert(stockEntries).values({
    productId,
    quantity: -quantity,
    note: `Sale #${transactionId}`,
    source: "sale",
  });
}

// Get full entry history for a product
export async function getStockHistory(productId: number): Promise<StockEntry[]> {
  return db
    .select()
    .from(stockEntries)
    .where(eq(stockEntries.productId, productId))
    .orderBy(sql`${stockEntries.createdAt} desc`);
}

// Get all products with their current stock levels joined
export async function getProductsWithStock() {
  const allProducts = await db.select().from(products).orderBy(products.createdAt);
  const stockLevels = await getAllStockLevels();
  return allProducts.map((p) => ({
    ...p,
    stock: stockLevels[p.id] ?? 0,
  }));
}