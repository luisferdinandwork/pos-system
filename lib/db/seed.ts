// lib/db/seed.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import {
  events,
  eventItems,
  stockTransactionTypes,
  stockTransactions,
  transactions,
  transactionItems,
  payments,
  paymentMethods,
} from "./schema";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = drizzle(neon(process.env.DATABASE_URL!));

type SeedEvent = {
  name: string;
  location: string;
  status: "draft" | "active" | "closed";
  startOffsetDays: number;
  durationDays: number;
  transactionCount: number;
};

type SeedItem = {
  itemId: string;
  baseItemNo: string;
  name: string;
  color: string;
  variantCode: string;
  unit: string;
  netPrice: number;
  retailPrice: number;
  stock: number;
};

const PAYMENT_METHODS = [
  { name: "Cash", type: "cash", provider: null, sortOrder: 0 },
  { name: "QRIS", type: "qris", provider: "QRIS", sortOrder: 1 },
  { name: "EDC BCA", type: "debit", provider: "BCA", sortOrder: 2 },
  { name: "EDC Mandiri", type: "debit", provider: "Mandiri", sortOrder: 3 },
  { name: "GoPay", type: "ewallet", provider: "Gojek", sortOrder: 4 },
  { name: "OVO", type: "ewallet", provider: "OVO", sortOrder: 5 },
];

const SEED_EVENTS: SeedEvent[] = [
  {
    name: "Jakarta Sneaker Fair 2026",
    location: "Mall Kelapa Gading",
    status: "active",
    startOffsetDays: -4,
    durationDays: 10,
    transactionCount: 90,
  },
  {
    name: "Bandung Weekend Expo",
    location: "Paris Van Java",
    status: "active",
    startOffsetDays: -2,
    durationDays: 7,
    transactionCount: 64,
  },
  {
    name: "Surabaya Sport Bazaar",
    location: "Tunjungan Plaza",
    status: "active",
    startOffsetDays: -1,
    durationDays: 5,
    transactionCount: 42,
  },
  {
    name: "Bali Summer Sale",
    location: "Beachwalk Shopping Center",
    status: "closed",
    startOffsetDays: -24,
    durationDays: 8,
    transactionCount: 78,
  },
  {
    name: "Medan Year-End Clearance",
    location: "Sun Plaza",
    status: "closed",
    startOffsetDays: -40,
    durationDays: 9,
    transactionCount: 52,
  },
  {
    name: "Yogyakarta Campus Pop-Up",
    location: "Ambarrukmo Plaza",
    status: "closed",
    startOffsetDays: -18,
    durationDays: 4,
    transactionCount: 34,
  },
  {
    name: "Semarang Ramadan Promo",
    location: "DP Mall",
    status: "draft",
    startOffsetDays: 7,
    durationDays: 8,
    transactionCount: 0,
  },
  {
    name: "Makassar Grand Opening",
    location: "Trans Studio Mall",
    status: "draft",
    startOffsetDays: 14,
    durationDays: 10,
    transactionCount: 0,
  },
];

const BASE_ITEMS: SeedItem[] = [
  {
    itemId: "SPE1040100370",
    baseItemNo: "SPE1040100",
    name: "SKYRUNNER EVR",
    color: "WHITE/FOLKSTONE GRAY",
    variantCode: "370",
    unit: "PRS",
    netPrice: 500000,
    retailPrice: 700000,
    stock: 38,
  },
  {
    itemId: "SPE1040100380",
    baseItemNo: "SPE1040100",
    name: "SKYRUNNER EVR",
    color: "WHITE/FOLKSTONE GRAY",
    variantCode: "380",
    unit: "PRS",
    netPrice: 500000,
    retailPrice: 700000,
    stock: 42,
  },
  {
    itemId: "SPE1040100390",
    baseItemNo: "SPE1040100",
    name: "SKYRUNNER EVR",
    color: "WHITE/FOLKSTONE GRAY",
    variantCode: "390",
    unit: "PRS",
    netPrice: 500000,
    retailPrice: 700000,
    stock: 40,
  },
  {
    itemId: "SPE1040100400",
    baseItemNo: "SPE1040100",
    name: "SKYRUNNER EVR",
    color: "WHITE/FOLKSTONE GRAY",
    variantCode: "400",
    unit: "PRS",
    netPrice: 500000,
    retailPrice: 700000,
    stock: 35,
  },
  {
    itemId: "SPE2040092M",
    baseItemNo: "SPE2040092",
    name: "SRC RUN FAST MENS TEE",
    color: "WHITE",
    variantCode: "M",
    unit: "PCS",
    netPrice: 150000,
    retailPrice: 200000,
    stock: 55,
  },
  {
    itemId: "SPE2040092L",
    baseItemNo: "SPE2040092",
    name: "SRC RUN FAST MENS TEE",
    color: "WHITE",
    variantCode: "L",
    unit: "PCS",
    netPrice: 150000,
    retailPrice: 200000,
    stock: 55,
  },
  {
    itemId: "SPE2040092XL",
    baseItemNo: "SPE2040092",
    name: "SRC RUN FAST MENS TEE",
    color: "WHITE",
    variantCode: "XL",
    unit: "PCS",
    netPrice: 150000,
    retailPrice: 200000,
    stock: 48,
  },
  {
    itemId: "SPE904841NS",
    baseItemNo: "SPE904841",
    name: "VIPER PERFORMANCE II QUARTER SOCKS",
    color: "WHITE",
    variantCode: "NS",
    unit: "PRS",
    netPrice: 50000,
    retailPrice: 75000,
    stock: 90,
  },
  {
    itemId: "SPE904842NS",
    baseItemNo: "SPE904842",
    name: "VIPER PERFORMANCE II QUARTER SOCKS",
    color: "BLACK",
    variantCode: "NS",
    unit: "PRS",
    netPrice: 50000,
    retailPrice: 75000,
    stock: 90,
  },
  {
    itemId: "SPE7001001",
    baseItemNo: "SPE700100",
    name: "SPORT WATER BOTTLE",
    color: "BLACK",
    variantCode: "750ML",
    unit: "PCS",
    netPrice: 80000,
    retailPrice: 120000,
    stock: 70,
  },
];

const STOCK_TRANSACTION_TYPES = [
  { code: "transfer_in", name: "Transfer In", defaultDirection: 1 },
  { code: "transfer_out", name: "Transfer Out", defaultDirection: -1 },
  { code: "sale", name: "Sale", defaultDirection: -1 },
  { code: "adjustment", name: "Adjustment", defaultDirection: 0 },
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne<T>(items: T[]) {
  return items[randomInt(0, items.length - 1)];
}

function pickMany<T>(items: T[], count: number) {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function dateFromOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function randomDateBetween(start: Date, end: Date) {
  const startTime = start.getTime();
  const endTime = end.getTime();

  if (endTime <= startTime) return start;

  return new Date(startTime + Math.random() * (endTime - startTime));
}

function paymentReference(method: string) {
  if (method === "Cash") return null;

  const prefix =
    method === "QRIS"
      ? "QR"
      : method.includes("BCA")
        ? "BCA"
        : method.includes("Mandiri")
          ? "MDR"
          : method.toUpperCase();

  return `${prefix}-${randomInt(100000, 999999)}`;
}

function discountForLine(unitPrice: number, quantity: number) {
  const roll = Math.random();

  if (roll < 0.25) {
    return Math.round(unitPrice * quantity * 0.1);
  }

  if (roll < 0.4) {
    return Math.round(unitPrice * quantity * 0.2);
  }

  return 0;
}

async function resetSeedData() {
  console.log("🧹 Clearing old seed data...");

  await db.delete(payments);
  await db.delete(transactionItems);
  await db.delete(transactions);
  await db.delete(stockTransactions);
  await db.delete(stockTransactionTypes);
  await db.delete(eventItems);
  await db.delete(events);
  await db.delete(paymentMethods);

  console.log("   ✅ Old seed data cleared.\n");
}

async function seedPaymentMethods() {
  console.log("🌱 Seeding payment methods...");

  await db.insert(paymentMethods).values(PAYMENT_METHODS);

  console.log(`   ✅ ${PAYMENT_METHODS.length} payment methods inserted.\n`);
}

async function seedStockTransactionTypes() {
  console.log("🌱 Seeding stock transaction types...");

  const inserted = await db
    .insert(stockTransactionTypes)
    .values(
      STOCK_TRANSACTION_TYPES.map((type) => ({
        ...type,
        isSystem: true,
      }))
    )
    .returning();

  console.log(`   ✅ ${inserted.length} stock transaction types inserted.\n`);

  return Object.fromEntries(inserted.map((type) => [type.code, type.id]));
}

async function seedEventsAndSales(stockTypeIds: Record<string, number>) {
  console.log("🌱 Seeding events, items, stock, and transactions...\n");

  for (const seedEvent of SEED_EVENTS) {
    const startDate = dateFromOffset(seedEvent.startOffsetDays);
    const endDate = dateFromOffset(
      seedEvent.startOffsetDays + seedEvent.durationDays
    );

    const [event] = await db
      .insert(events)
      .values({
        name: seedEvent.name,
        location: seedEvent.location,
        description: `Seeded event for dashboard testing: ${seedEvent.name}`,
        status: seedEvent.status,
        startDate,
        endDate,
      })
      .returning();

    const stockMultiplier =
      seedEvent.status === "closed"
        ? 0.85
        : seedEvent.status === "draft"
          ? 1.15
          : 1;

    const eventItemRows = BASE_ITEMS.map((item, index) => {
      const stock = Math.max(
        10,
        Math.round(item.stock * stockMultiplier + randomInt(-5, 8))
      );

      const priceOffset = randomInt(-20000, 30000);
      const netPrice = Math.max(25000, item.netPrice + priceOffset);
      const retailPrice = Math.max(netPrice, item.retailPrice + priceOffset);

      return {
        eventId: event.id,
        itemId: `${item.itemId}-${event.id}`,
        baseItemNo: item.baseItemNo,
        name: item.name,
        color: item.color,
        variantCode: item.variantCode,
        unit: item.unit,
        netPrice: String(netPrice),
        retailPrice: String(retailPrice),
        stock,
      };
    });

    const insertedItems = await db
      .insert(eventItems)
      .values(eventItemRows)
      .returning();

    await db.insert(stockTransactions).values(
      insertedItems.map((item) => ({
        eventItemId: item.id,
        typeId: stockTypeIds.transfer_in,
        quantity: Number(item.stock),
        stockBefore: 0,
        stockAfter: Number(item.stock),
        note: "Initial seeded stock",
        referenceType: "seed",
      }))
    );

    let transactionCreated = 0;

    for (let i = 0; i < seedEvent.transactionCount; i++) {
      const availableItems = insertedItems.filter((item) => item.stock > 0);

      if (availableItems.length === 0) break;

      const selectedItems = pickMany(availableItems, randomInt(1, 4));

      const lines = [];

      for (const item of selectedItems) {
        const currentStock = Number(item.stock ?? 0);
        if (currentStock <= 0) continue;

        const quantity = Math.min(randomInt(1, 3), currentStock);
        const unitPrice = Number(item.netPrice);
        const discountAmt = discountForLine(unitPrice, quantity);
        const grossSubtotal = unitPrice * quantity;
        const subtotal = Math.max(0, grossSubtotal - discountAmt);
        const finalPrice = Math.max(0, unitPrice - Math.round(discountAmt / quantity));

        lines.push({
          item,
          quantity,
          unitPrice,
          discountAmt,
          finalPrice,
          subtotal,
          promoApplied: discountAmt > 0 ? "Seed Promo" : null,
        });

        item.stock = currentStock - quantity;
      }

      if (lines.length === 0) continue;

      const totalAmount = lines.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0
      );

      const discount = lines.reduce(
        (sum, line) => sum + line.discountAmt,
        0
      );

      const finalAmount = lines.reduce(
        (sum, line) => sum + line.subtotal,
        0
      );

      const method = pickOne(PAYMENT_METHODS).name;
      const createdAt = randomDateBetween(startDate, new Date());

      const [txn] = await db
        .insert(transactions)
        .values({
          eventId: event.id,
          totalAmount: String(totalAmount),
          discount: String(discount),
          finalAmount: String(finalAmount),
          paymentMethod: method,
          paymentReference: paymentReference(method),
          createdAt,
        })
        .returning();

      await db.insert(transactionItems).values(
        lines.map((line) => ({
          transactionId: txn.id,
          eventItemId: line.item.id,
          productName: `${line.item.name}${
            line.item.variantCode ? ` (${line.item.variantCode})` : ""
          }`,
          itemId: line.item.itemId,
          quantity: line.quantity,
          unitPrice: String(line.unitPrice),
          discountAmt: String(line.discountAmt),
          finalPrice: String(line.finalPrice),
          subtotal: String(line.subtotal),
          promoApplied: line.promoApplied,
        }))
      );

      await db.insert(payments).values({
        transactionId: txn.id,
        method,
        reference: paymentReference(method),
        paidAt: createdAt,
      });

      await db.insert(stockTransactions).values(
        lines.map((line) => {
          const stockAfter = Number(line.item.stock);
          const stockBefore = stockAfter + Number(line.quantity);

          return {
            eventItemId: line.item.id,
            typeId: stockTypeIds.sale,
            quantity: -Math.abs(Number(line.quantity)),
            stockBefore,
            stockAfter,
            transactionId: txn.id,
            note: `Sale #${txn.id}`,
            referenceType: "transaction",
            referenceId: String(txn.id),
            createdAt,
          };
        })
      );

      transactionCreated++;
    }

    for (const item of insertedItems) {
      await db
        .update(eventItems)
        .set({
          stock: Number(item.stock),
        })
        .where(sql`${eventItems.id} = ${item.id}`);
    }

    console.log(
      `   ✅ ${event.name}: ${insertedItems.length} items, ${transactionCreated} transactions`
    );
  }

  console.log("");
}

async function main() {
  console.log("====================================");
  console.log("  POS System — Large Dashboard Seeder");
  console.log("====================================\n");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing in .env.local");
  }

  await resetSeedData();
  await seedPaymentMethods();

  const stockTypeIds = await seedStockTransactionTypes();

  await seedEventsAndSales(stockTypeIds);

  console.log("🎉 Large seed complete!");
  console.log("   Open your dashboard to test many events and charts.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeder failed:", err);
  process.exit(1);
});