// lib/products.ts
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq, ilike, or } from "drizzle-orm";

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export async function getAllProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(products.createdAt);
}

export async function getProductByItemId(itemId: string): Promise<Product | null> {
  const result = await db.select().from(products).where(eq(products.itemId, itemId)).limit(1);
  return result[0] ?? null;
}

export async function createProduct(data: NewProduct): Promise<Product> {
  const result = await db.insert(products).values(data).returning();
  return result[0];
}

export async function updateProduct(id: number, data: Partial<NewProduct>): Promise<Product> {
  const result = await db.update(products).set(data).where(eq(products.id, id)).returning();
  return result[0];
}

export async function deleteProduct(id: number): Promise<void> {
  await db.delete(products).where(eq(products.id, id));
}

export async function upsertProduct(data: NewProduct): Promise<Product> {
  const existing = await getProductByItemId(data.itemId);
  if (existing) return updateProduct(existing.id, data);
  return createProduct(data);
}