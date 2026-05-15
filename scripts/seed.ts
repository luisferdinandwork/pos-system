// scripts/seed.ts
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
  edcMachines,
  cashierSessions,
  receiptPrintLogs,
  cashDrawerCounts,
  eventReceiptTemplates,
} from "../lib/db/schema";
import { formatTransactionDisplayId } from "../lib/utils";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing in .env.local");
}

const db = drizzle(neon(databaseUrl));

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

type SeedPaymentMethod = {
  name: string;
  type: "cash" | "edc";
  edcMethod: "debit" | "credit" | "qris" | null;
  provider: string | null;
  sortOrder: number;
};

const SEED_EVENTS: SeedEvent[] = [
  {
    name: "Jakarta Sneaker Fair 2026",
    location: "Mall Kelapa Gading",
    status: "active",
    startOffsetDays: -3,
    durationDays: 10,
    transactionCount: 32,
  },
  {
    name: "Bali Summer Sale 2026",
    location: "Beachwalk Shopping Center",
    status: "closed",
    startOffsetDays: -25,
    durationDays: 7,
    transactionCount: 24,
  },
  {
    name: "Bandung Weekend Expo 2026",
    location: "Paris Van Java",
    status: "draft",
    startOffsetDays: 8,
    durationDays: 5,
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

const PAYMENT_METHODS: SeedPaymentMethod[] = [
  { name: "Cash", type: "cash", edcMethod: null, provider: null, sortOrder: 0 },
  { name: "Debit Card", type: "edc", edcMethod: "debit", provider: null, sortOrder: 10 },
  { name: "Credit Card", type: "edc", edcMethod: "credit", provider: null, sortOrder: 11 },
  { name: "QRIS", type: "edc", edcMethod: "qris", provider: null, sortOrder: 12 },
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
    method === "Debit Card"
      ? "DBT"
      : method === "Credit Card"
        ? "CRD"
        : method === "QRIS"
          ? "QR"
          : "PAY";

  return `${prefix}-${randomInt(100000, 999999)}`;
}

function discountForLine(unitPrice: number, quantity: number) {
  const roll = Math.random();

  if (roll < 0.25) return Math.round(unitPrice * quantity * 0.1);
  if (roll < 0.4) return Math.round(unitPrice * quantity * 0.2);

  return 0;
}

function buildCashValues(method: string, finalAmount: number) {
  if (method !== "Cash") {
    return { cashTendered: null, changeAmount: null };
  }

  const roundedTendered = Math.ceil(finalAmount / 50000) * 50000;
  const cashTendered = Math.max(roundedTendered, finalAmount);
  const changeAmount = cashTendered - finalAmount;

  return { cashTendered, changeAmount };
}

function createDisplayId(date: Date, sequence: number) {
  return formatTransactionDisplayId(date, sequence);
}

async function resetSeedData() {
  console.log("🧹 Clearing old seed data...");

  /**
   * Delete child tables first to avoid FK errors.
   * This only clears seeded app data, not drizzle migrations.
   */
  await db.delete(receiptPrintLogs);
  await db.delete(cashDrawerCounts);
  await db.delete(eventReceiptTemplates);
  await db.delete(payments);
  await db.delete(transactionItems);
  await db.delete(stockTransactions);
  await db.delete(transactions);
  await db.delete(cashierSessions);
  await db.delete(stockTransactionTypes);
  await db.delete(eventItems);
  await db.delete(events);
  await db.delete(paymentMethods);
  await db.delete(edcMachines);

  console.log("   ✅ Old seed data cleared.\n");
}

async function seedPaymentData() {
  console.log("🌱 Seeding payment data...");

  const [edc] = await db
    .insert(edcMachines)
    .values({
      bankName: "EDC",
      terminalId: null,
      label: "EDC",
      isActive: true,
      sortOrder: 10,
    })
    .returning();

  await db.insert(paymentMethods).values(
    PAYMENT_METHODS.map((method) => ({
      name: method.name,
      type: method.type,
      edcMethod: method.edcMethod,
      edcMachineId: method.type === "edc" ? edc.id : null,
      provider: method.provider,
      accountInfo: null,
      isActive: true,
      sortOrder: method.sortOrder,
    }))
  );

  console.log("   ✅ Payment methods inserted: Cash, EDC Debit Card, EDC Credit Card, EDC QRIS.\n");
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
  console.log("🌱 Seeding 3 events, items, stock, cashiers, and transactions...\n");

  let globalTransactionSequence = 1;

  for (const seedEvent of SEED_EVENTS) {
    const startDate = dateFromOffset(seedEvent.startOffsetDays);
    const endDate = dateFromOffset(seedEvent.startOffsetDays + seedEvent.durationDays);

    const [event] = await db
      .insert(events)
      .values({
        name: seedEvent.name,
        location: seedEvent.location,
        description: `Seeded ${seedEvent.status} event for dashboard testing: ${seedEvent.name}`,
        status: seedEvent.status,
        startDate,
        endDate,
      })
      .returning();

    await db.insert(eventReceiptTemplates).values({
      eventId: event.id,
      isActive: true,
      storeName: event.name,
      headline: "Official Event Receipt",
      address: event.location,
      phone: "+62 812-0000-0000",
      instagram: "@sport.event",
      footerText: "Terima kasih sudah berbelanja!",
      returnPolicy: "Barang yang sudah dibeli tidak dapat dikembalikan.",
      promoMessage: seedEvent.status === "active" ? "Follow kami untuk info promo berikutnya." : null,
      showEventName: true,
      showCashierName: true,
      showItemSku: true,
      showPaymentReference: true,
      showDiscountBreakdown: true,
    });


    const [cashierSession] = await db
      .insert(cashierSessions)
      .values({
        eventId: event.id,
        cashierName:
          seedEvent.status === "draft"
            ? "Draft Cashier"
            : seedEvent.status === "closed"
              ? "Closed Event Cashier"
              : "Active Event Cashier",
        openingCash: "1000000",
        closingCash: seedEvent.status === "closed" ? "1500000" : null,
        openedAt: startDate,
        closedAt: seedEvent.status === "closed" ? endDate : null,
        notes: `Seeded ${seedEvent.status} cashier session`,
      })
      .returning();

    await db.insert(cashDrawerCounts).values({
      eventId: event.id,
      cashierSessionId: cashierSession.id,
      countedBy: cashierSession.cashierName,
      expectedCash: "1000000",
      actualCash: "1000000",
      difference: "0",
      reason: "opening_check",
      notes: "Initial seeded drawer count",
      countedAt: startDate,
    });


    const stockMultiplier =
      seedEvent.status === "closed"
        ? 0.85
        : seedEvent.status === "draft"
          ? 1.15
          : 1;

    const eventItemRows = BASE_ITEMS.map((item) => {
      const stock = Math.max(
        10,
        Math.round(item.stock * stockMultiplier + randomInt(-5, 8))
      );

      const priceOffset = randomInt(-20000, 30000);
      const netPrice = Math.max(25000, item.netPrice + priceOffset);
      const retailPrice = Math.max(netPrice, item.retailPrice + priceOffset);

      return {
        eventId: event.id,
        itemId: item.itemId,
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
      const availableItems = insertedItems.filter((item) => Number(item.stock) > 0);
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

      const discount = lines.reduce((sum, line) => sum + line.discountAmt, 0);
      const finalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);

      const method = pickOne(PAYMENT_METHODS).name;
      const reference = paymentReference(method);
      const { cashTendered, changeAmount } = buildCashValues(method, finalAmount);
      const createdAt = randomDateBetween(startDate, seedEvent.status === "closed" ? endDate : new Date());
      const displayId = createDisplayId(createdAt, globalTransactionSequence++);
      const clientTxnId = displayId;

      const [txn] = await db
        .insert(transactions)
        .values({
          displayId,
          eventId: event.id,
          clientTxnId,
          cashierSessionId: cashierSession.id,
          totalAmount: String(totalAmount),
          discount: String(discount),
          finalAmount: String(finalAmount),
          cashTendered: cashTendered != null ? String(cashTendered) : null,
          changeAmount: changeAmount != null ? String(changeAmount) : null,
          paymentMethod: method,
          paymentReference: reference,
          createdAt,
        })
        .returning();

      await db.insert(transactionItems).values(
        lines.map((line) => ({
          transactionId: txn.id,
          eventItemId: line.item.id,
          productName: `${line.item.name}${line.item.variantCode ? ` (${line.item.variantCode})` : ""}`,
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
        reference,
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
            note: `Sale #${displayId}`,
            referenceType: "transaction",
            referenceId: displayId,
            createdAt,
          };
        })
      );

      /**
       * Add some print logs so receipt print count appears in the history/event pages.
       * First print = original. Occasional second print = reprint.
       */
      await db.insert(receiptPrintLogs).values({
        transactionId: txn.id,
        printType: "original",
        printedBy: cashierSession.cashierName,
        printedAt: createdAt,
      });

      if (Math.random() < 0.2) {
        await db.insert(receiptPrintLogs).values({
          transactionId: txn.id,
          printType: "reprint",
          printedBy: cashierSession.cashierName,
          printedAt: new Date(createdAt.getTime() + randomInt(2, 60) * 60_000),
        });
      }

      transactionCreated++;
    }


    if (transactionCreated > 0) {
      const expectedCashAfterSales = 1000000 + transactionCreated * 250000;
      await db.insert(cashDrawerCounts).values({
        eventId: event.id,
        cashierSessionId: cashierSession.id,
        countedBy: cashierSession.cashierName,
        expectedCash: String(expectedCashAfterSales),
        actualCash: String(expectedCashAfterSales),
        difference: "0",
        reason: seedEvent.status === "closed" ? "closing_check" : "count",
        notes: "Seeded drawer count after sales",
        countedAt: seedEvent.status === "closed" ? endDate : new Date(),
      });
    }

    for (const item of insertedItems) {
      await db
        .update(eventItems)
        .set({ stock: Number(item.stock) })
        .where(sql`${eventItems.id} = ${item.id}`);
    }

    console.log(
      `   ✅ ${event.name} (${event.status}): ${insertedItems.length} items, ${transactionCreated} transactions`
    );
  }

  console.log("");
}

async function main() {
  console.log("====================================");
  console.log("  POS System — Clean Seeder");
  console.log("====================================\n");

  await resetSeedData();
  await seedPaymentData();

  const stockTypeIds = await seedStockTransactionTypes();
  await seedEventsAndSales(stockTypeIds);

  console.log("🎉 Seed complete!");
  console.log("   Created exactly 3 events: active, closed, draft.");
  console.log("   Payment methods: Cash + EDC Debit Card/Credit Card/QRIS.");
  console.log("   Transaction IDs use yyyyMM00001 format.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeder failed:", err);
  process.exit(1);
});
