// lib/payment-methods.ts
import { db } from "@/lib/db";
import { paymentMethods } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;

export const PAYMENT_TYPES = [
  { value: "cash",    label: "Cash",     icon: "💵" },
  { value: "qris",    label: "QRIS",     icon: "📱" },
  { value: "debit",   label: "Debit",    icon: "💳" },
  { value: "credit",  label: "Credit",   icon: "🏦" },
  { value: "ewallet", label: "E-Wallet", icon: "👛" },
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number]["value"];

export async function getAllPaymentMethods(): Promise<PaymentMethod[]> {
  return db
    .select()
    .from(paymentMethods)
    .orderBy(paymentMethods.sortOrder, paymentMethods.createdAt);
}

export async function getActivePaymentMethods(): Promise<PaymentMethod[]> {
  return db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(paymentMethods.sortOrder, paymentMethods.createdAt);
}

export async function createPaymentMethod(
  data: NewPaymentMethod
): Promise<PaymentMethod> {
  const result = await db.insert(paymentMethods).values(data).returning();
  return result[0];
}

export async function updatePaymentMethod(
  id: number,
  data: Partial<NewPaymentMethod>
): Promise<PaymentMethod> {
  const result = await db
    .update(paymentMethods)
    .set(data)
    .where(eq(paymentMethods.id, id))
    .returning();
  return result[0];
}

export async function deletePaymentMethod(id: number): Promise<void> {
  await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
}

export async function togglePaymentMethod(
  id: number,
  isActive: boolean
): Promise<PaymentMethod> {
  const result = await db
    .update(paymentMethods)
    .set({ isActive })
    .where(eq(paymentMethods.id, id))
    .returning();
  return result[0];
}