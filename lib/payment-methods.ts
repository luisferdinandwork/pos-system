// lib/payment-methods.ts
import { db } from "@/lib/db";
import { paymentMethods, edcMachines } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
export type EdcMachine = typeof edcMachines.$inferSelect;
export type NewEdcMachine = typeof edcMachines.$inferInsert;

// ── Type hierarchy ────────────────────────────────────────────────────────────
//
// cash → standalone cash method, one row only
// edc  → child of one EDC machine; edcMethod = "debit" | "credit" | "qris"
//
// Removed from app-level utils:
// - standalone qris
// - ewallet

export const PAYMENT_TYPES = [
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "edc",  label: "EDC",  icon: "💳" },
] as const;

export const EDC_METHODS = [
  { value: "debit",  label: "Debit Card" },
  { value: "credit", label: "Credit Card" },
  { value: "qris",   label: "QRIS" },
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number]["value"];
export type EdcMethodType = (typeof EDC_METHODS)[number]["value"];

// ── EDC Machine CRUD ──────────────────────────────────────────────────────────

export async function getAllEdcMachines(): Promise<EdcMachine[]> {
  return db.select().from(edcMachines).orderBy(asc(edcMachines.sortOrder));
}

export async function getActiveEdcMachines(): Promise<EdcMachine[]> {
  return db
    .select()
    .from(edcMachines)
    .where(eq(edcMachines.isActive, true))
    .orderBy(asc(edcMachines.sortOrder));
}

export async function createEdcMachine(data: NewEdcMachine): Promise<EdcMachine> {
  const [row] = await db.insert(edcMachines).values(data).returning();
  return row;
}

export async function updateEdcMachine(
  id: number,
  data: Partial<NewEdcMachine>
): Promise<EdcMachine> {
  const [row] = await db
    .update(edcMachines)
    .set(data)
    .where(eq(edcMachines.id, id))
    .returning();

  return row;
}

export async function deleteEdcMachine(id: number): Promise<void> {
  await db.delete(edcMachines).where(eq(edcMachines.id, id));
}

// ── Payment Method CRUD ───────────────────────────────────────────────────────

export async function getAllPaymentMethods(): Promise<PaymentMethod[]> {
  return db.select().from(paymentMethods).orderBy(asc(paymentMethods.sortOrder));
}

export async function getActivePaymentMethods(): Promise<PaymentMethod[]> {
  return db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(asc(paymentMethods.sortOrder));
}

export async function createPaymentMethod(data: NewPaymentMethod): Promise<PaymentMethod> {
  const [row] = await db.insert(paymentMethods).values(data).returning();
  return row;
}

export async function updatePaymentMethod(
  id: number,
  data: Partial<NewPaymentMethod>
): Promise<PaymentMethod> {
  const [row] = await db
    .update(paymentMethods)
    .set(data)
    .where(eq(paymentMethods.id, id))
    .returning();

  return row;
}

export async function deletePaymentMethod(id: number): Promise<void> {
  await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
}

export async function togglePaymentMethod(
  id: number,
  isActive: boolean
): Promise<PaymentMethod> {
  const [row] = await db
    .update(paymentMethods)
    .set({ isActive })
    .where(eq(paymentMethods.id, id))
    .returning();

  return row;
}

// ── Grouped view for POS display ──────────────────────────────────────────────

export type GroupedPaymentMethods = {
  cash: PaymentMethod[];
  edc: { machine: EdcMachine | null; methods: PaymentMethod[] }[];
};

export async function getGroupedActivePaymentMethods(): Promise<GroupedPaymentMethods> {
  const [methods, machines] = await Promise.all([
    getActivePaymentMethods(),
    getActiveEdcMachines(),
  ]);

  const machineMap = new Map(machines.map((m) => [m.id, m]));

  const cash = methods.filter((m) => m.type === "cash");
  const edcRows = methods.filter((m) => m.type === "edc");

  const machineGroups = new Map<number | null, PaymentMethod[]>();

  for (const method of edcRows) {
    const key = method.edcMachineId ?? null;
    if (!machineGroups.has(key)) machineGroups.set(key, []);
    machineGroups.get(key)!.push(method);
  }

  const edc = [...machineGroups.entries()].map(([machineId, methods]) => ({
    machine: machineId !== null ? machineMap.get(machineId) ?? null : null,
    methods,
  }));

  edc.sort((a, b) => (a.machine?.sortOrder ?? 99) - (b.machine?.sortOrder ?? 99));

  return { cash, edc };
}
