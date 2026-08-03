import { hash } from "bcryptjs";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./_db";
import {
  authUsers,
  edcMachines,
  paymentMethods,
  stockTransactionTypes,
} from "../lib/db/schema";

const SYSTEM_STOCK_TYPES = [
  { code: "transfer_in", name: "Transfer In", defaultDirection: 1 },
  { code: "transfer_out", name: "Transfer Out", defaultDirection: -1 },
  { code: "sale", name: "Sale", defaultDirection: -1 },
  { code: "adjustment", name: "Adjustment", defaultDirection: 0 },
];

const DEFAULT_PAYMENT_METHODS = [
  { name: "Debit Card", edcMethod: "debit", sortOrder: 10 },
  { name: "Credit Card", edcMethod: "credit", sortOrder: 11 },
  { name: "QRIS", edcMethod: "qris", sortOrder: 12 },
];

export async function seedSystemStockTypes() {
  for (const row of SYSTEM_STOCK_TYPES) {
    await db
      .insert(stockTransactionTypes)
      .values({ ...row, isSystem: true })
      .onConflictDoUpdate({
        target: stockTransactionTypes.code,
        set: {
          name: row.name,
          defaultDirection: row.defaultDirection,
          isSystem: true,
        },
      });
  }

  return SYSTEM_STOCK_TYPES.map((row) => row.code);
}

export async function seedDefaultPaymentMethods() {
  const [existingEdc] = await db
    .select()
    .from(edcMachines)
    .where(eq(edcMachines.label, "EDC"))
    .orderBy(asc(edcMachines.id))
    .limit(1);

  const [edc] = existingEdc
    ? await db
        .update(edcMachines)
        .set({
          bankName: "EDC",
          label: "EDC",
          isActive: true,
          sortOrder: 10,
        })
        .where(eq(edcMachines.id, existingEdc.id))
        .returning()
    : await db
        .insert(edcMachines)
        .values({
          bankName: "EDC",
          terminalId: null,
          label: "EDC",
          isActive: true,
          sortOrder: 10,
        })
        .returning();

  if (!edc) {
    throw new Error("Failed to create or update the default EDC machine.");
  }

  const [existingCash] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.type, "cash"))
    .orderBy(asc(paymentMethods.id))
    .limit(1);

  if (existingCash) {
    await db
      .update(paymentMethods)
      .set({
        name: "Cash",
        edcMethod: null,
        edcMachineId: null,
        provider: null,
        isActive: true,
        sortOrder: 0,
      })
      .where(eq(paymentMethods.id, existingCash.id));
  } else {
    await db.insert(paymentMethods).values({
      name: "Cash",
      type: "cash",
      edcMethod: null,
      edcMachineId: null,
      provider: null,
      accountInfo: null,
      isActive: true,
      sortOrder: 0,
    });
  }

  for (const method of DEFAULT_PAYMENT_METHODS) {
    const [existing] = await db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.type, "edc"),
          eq(paymentMethods.edcMethod, method.edcMethod)
        )
      )
      .orderBy(asc(paymentMethods.id))
      .limit(1);

    const values = {
      name: method.name,
      type: "edc",
      edcMethod: method.edcMethod,
      edcMachineId: edc.id,
      provider: null,
      accountInfo: null,
      isActive: true,
      sortOrder: method.sortOrder,
    };

    if (existing) {
      await db
        .update(paymentMethods)
        .set(values)
        .where(eq(paymentMethods.id, existing.id));
    } else {
      await db.insert(paymentMethods).values(values);
    }
  }

  return ["Cash", ...DEFAULT_PAYMENT_METHODS.map((row) => row.name)];
}

export async function seedProductionAdmin(params: {
  name: string;
  username: string;
  password: string;
}) {
  const username = params.username.trim().toLowerCase();

  if (!username) throw new Error("Admin username is required.");
  if (params.password.length < 12) {
    throw new Error("Production admin password must contain at least 12 characters.");
  }

  const passwordHash = await hash(params.password, 12);
  const [admin] = await db
    .insert(authUsers)
    .values({
      name: params.name.trim() || "Admin",
      username,
      passwordHash,
      role: "admin",
      eventId: null,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: authUsers.username,
      set: {
        name: params.name.trim() || "Admin",
        passwordHash,
        role: "admin",
        eventId: null,
        isActive: true,
      },
    })
    .returning({
      id: authUsers.id,
      name: authUsers.name,
      username: authUsers.username,
      role: authUsers.role,
    });

  if (!admin) {
    throw new Error("Failed to create or update the production administrator.");
  }

  return admin;
}
