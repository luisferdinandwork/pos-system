// lib/db/seed.ts
import { neon }    from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  events, eventItems,
  transactions, transactionItems, payments, paymentMethods,
} from "./schema";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = drizzle(neon(process.env.DATABASE_URL!));

async function main() {
  console.log("====================================");
  console.log("  POS System — Database Seeder");
  console.log("====================================\n");

  // ── 1. Payment methods ────────────────────────────────────────────────────
  console.log("🌱 Seeding payment methods...");
  await db.insert(paymentMethods).values([
    { name: "Cash",        type: "cash",    provider: null,      sortOrder: 0 },
    { name: "QRIS",        type: "qris",    provider: "GoPay",   sortOrder: 1 },
    { name: "EDC BCA",     type: "debit",   provider: "BCA",     sortOrder: 2 },
    { name: "EDC Mandiri", type: "debit",   provider: "Mandiri", sortOrder: 3 },
    { name: "GoPay",       type: "ewallet", provider: "Gojek",   sortOrder: 4 },
    { name: "OVO",         type: "ewallet", provider: "OVO",     sortOrder: 5 },
  ]);
  console.log("   ✅ 6 payment methods inserted.\n");

  // ── 2. Event ──────────────────────────────────────────────────────────────
  console.log("🌱 Seeding event...");
  const [event] = await db.insert(events).values({
    name:        "Bazar Sample 2025",
    location:    "Mall Kelapa Gading Lt.2",
    description: "Sample seeded event",
    status:      "active",
    startDate:   new Date(),
    endDate:     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).returning();
  console.log(`   ✅ Event #${event.id} created.\n`);

  // ── 3. Event items (products live here, not in a catalog) ─────────────────
  // Each item is fully self-contained: name, prices, and stock all in one row.
  console.log("🌱 Seeding event items...");
  const insertedItems = await db.insert(eventItems).values([
    {
      eventId: event.id,
      itemId: "SPE1040100370", baseItemNo: "SPE1040100",
      name: "SKYRUNNER EVR", color: "WHITE/FOLKSTONE GRAY",
      variantCode: "370", unit: "PRS",
      netPrice: "500000", retailPrice: "700000", stock: 20,
    },
    {
      eventId: event.id,
      itemId: "SPE1040100380", baseItemNo: "SPE1040100",
      name: "SKYRUNNER EVR", color: "WHITE/FOLKSTONE GRAY",
      variantCode: "380", unit: "PRS",
      netPrice: "500000", retailPrice: "700000", stock: 20,
    },
    {
      eventId: event.id,
      itemId: "SPE1040100390", baseItemNo: "SPE1040100",
      name: "SKYRUNNER EVR", color: "WHITE/FOLKSTONE GRAY",
      variantCode: "390", unit: "PRS",
      netPrice: "500000", retailPrice: "700000", stock: 20,
    },
    {
      eventId: event.id,
      itemId: "SPE2040092L", baseItemNo: "SPE2040092",
      name: "SRC RUN FAST MENS TEE", color: "WHITE",
      variantCode: "L", unit: "PCS",
      netPrice: "150000", retailPrice: "200000", stock: 30,
    },
    {
      eventId: event.id,
      itemId: "SPE2040092M", baseItemNo: "SPE2040092",
      name: "SRC RUN FAST MENS TEE", color: "WHITE",
      variantCode: "M", unit: "PCS",
      netPrice: "150000", retailPrice: "200000", stock: 30,
    },
    {
      eventId: event.id,
      itemId: "SPE2040092XL", baseItemNo: "SPE2040092",
      name: "SRC RUN FAST MENS TEE", color: "WHITE",
      variantCode: "XL", unit: "PCS",
      netPrice: "150000", retailPrice: "200000", stock: 30,
    },
    {
      eventId: event.id,
      itemId: "SPE904841NS", baseItemNo: "SPE904841",
      name: "VIPER PERFORMANCE II QUARTER SOCKS", color: "WHITE",
      variantCode: "NS", unit: "PRS",
      netPrice: "50000", retailPrice: "75000", stock: 50,
    },
    {
      eventId: event.id,
      itemId: "SPE904842NS", baseItemNo: "SPE904842",
      name: "VIPER PERFORMANCE II QUARTER SOCKS", color: "BLACK",
      variantCode: "NS", unit: "PRS",
      netPrice: "50000", retailPrice: "75000", stock: 50,
    },
  ]).returning();
  console.log(`   ✅ ${insertedItems.length} event items inserted.\n`);

  // ── 4. Sample transaction ─────────────────────────────────────────────────
  console.log("🌱 Seeding sample transaction...");

  const item1 = insertedItems[0]; // SKYRUNNER EVR 370
  const item2 = insertedItems[3]; // SRC RUN FAST MENS TEE L

  const subtotal    = 500000 + 150000;
  const discount    = 50000;
  const finalAmount = subtotal - discount;

  const [txn] = await db.insert(transactions).values({
    eventId:          event.id,
    totalAmount:      String(subtotal),
    discount:         String(discount),
    finalAmount:      String(finalAmount),
    paymentMethod:    "Cash",
    paymentReference: null,
  }).returning();

  await db.insert(transactionItems).values([
    {
      transactionId: txn.id,
      eventItemId:   item1.id,            // ← references event_items, not event_products
      productName:   "SKYRUNNER EVR (370)",
      itemId:        item1.itemId,         // ← snapshot of itemId at time of sale
      quantity:      1,
      unitPrice:     "500000",
      discountAmt:   "50000",
      finalPrice:    "450000",
      subtotal:      "450000",
      promoApplied:  "Seed Discount",
    },
    {
      transactionId: txn.id,
      eventItemId:   item2.id,
      productName:   "SRC RUN FAST MENS TEE (L)",
      itemId:        item2.itemId,
      quantity:      1,
      unitPrice:     "150000",
      discountAmt:   "0",
      finalPrice:    "150000",
      subtotal:      "150000",
      promoApplied:  null,
    },
  ]);

  await db.insert(payments).values({
    transactionId: txn.id,
    method:        "Cash",
    reference:     null,
  });

  // Reflect the sale in denormalized stock columns
  await db.execute(
    `UPDATE event_items SET stock = stock - 1 WHERE id = ${item1.id}`
  );
  await db.execute(
    `UPDATE event_items SET stock = stock - 1 WHERE id = ${item2.id}`
  );

  console.log(`   ✅ Transaction #${txn.id} — Final: Rp ${finalAmount.toLocaleString("id-ID")}\n`);
  console.log("🎉 Seeding complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeder failed:", err);
  process.exit(1);
});