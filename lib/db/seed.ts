// lib/db/seed.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { products, transactions, transactionItems, payments } from "./schema";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema: { products, transactions, transactionItems, payments } });

// --- Seed data ---

const sampleProducts = [
  { itemId: "SKU-001", name: "Aqua Botol 600ml",     price: "3500",  stock: 100 },
  { itemId: "SKU-002", name: "Indomie Goreng",        price: "3500",  stock: 80  },
  { itemId: "SKU-003", name: "Kopi Kapal Api Sachet", price: "2500",  stock: 120 },
  { itemId: "SKU-004", name: "Teh Botol Sosro 350ml", price: "5000",  stock: 60  },
  { itemId: "SKU-005", name: "Roti Tawar Sari Roti",  price: "18000", stock: 30  },
  { itemId: "SKU-006", name: "Chitato Sapi Panggang",  price: "12000", stock: 45  },
  { itemId: "SKU-007", name: "Susu Ultra Milk 200ml", price: "5500",  stock: 90  },
  { itemId: "SKU-008", name: "Good Day Cappuccino",   price: "3000",  stock: 75  },
];

async function seedProducts() {
  console.log("🌱 Seeding products...");
  const inserted: typeof sampleProducts = [];

  for (const p of sampleProducts) {
    // Skip if itemId already exists
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.itemId, p.itemId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`   ⏭  Skipped (exists): ${p.itemId} — ${p.name}`);
      continue;
    }

    await db.insert(products).values(p);
    inserted.push(p);
    console.log(`   ✅ Inserted: ${p.itemId} — ${p.name}`);
  }

  console.log(`   Done. ${inserted.length} new products inserted.\n`);
}

async function seedTransactions() {
  console.log("🌱 Seeding transactions...");

  // Fetch products we just seeded so we have their real IDs
  const allProducts = await db.select().from(products);
  const find = (itemId: string) => allProducts.find((p) => p.itemId === itemId)!;

  // --- Transaction 1: Cash ---
  const [txn1] = await db
    .insert(transactions)
    .values({ totalAmount: "22000" })
    .returning();

  await db.insert(transactionItems).values([
    {
      transactionId: txn1.id,
      productId: find("SKU-001").id,
      productName: find("SKU-001").name,
      quantity: 2,
      unitPrice: "3500",
      subtotal: "7000",
    },
    {
      transactionId: txn1.id,
      productId: find("SKU-002").id,
      productName: find("SKU-002").name,
      quantity: 2,
      unitPrice: "3500",
      subtotal: "7000",
    },
    {
      transactionId: txn1.id,
      productId: find("SKU-008").id,
      productName: find("SKU-008").name,
      quantity: 1,
      unitPrice: "3000",
      subtotal: "3000",
    },
    {
      transactionId: txn1.id,
      productId: find("SKU-003").id,
      productName: find("SKU-003").name,
      quantity: 2,
      unitPrice: "2500",
      subtotal: "5000",
    },
  ]);

  await db.insert(payments).values({
    transactionId: txn1.id,
    method: "cash",
    reference: null,
  });
  console.log(`   ✅ Transaction #${txn1.id} — Cash — Rp 22.000`);

  // --- Transaction 2: QRIS ---
  const [txn2] = await db
    .insert(transactions)
    .values({ totalAmount: "35500" })
    .returning();

  await db.insert(transactionItems).values([
    {
      transactionId: txn2.id,
      productId: find("SKU-005").id,
      productName: find("SKU-005").name,
      quantity: 1,
      unitPrice: "18000",
      subtotal: "18000",
    },
    {
      transactionId: txn2.id,
      productId: find("SKU-006").id,
      productName: find("SKU-006").name,
      quantity: 1,
      unitPrice: "12000",
      subtotal: "12000",
    },
    {
      transactionId: txn2.id,
      productId: find("SKU-007").id,
      productName: find("SKU-007").name,
      quantity: 1,
      unitPrice: "5500",
      subtotal: "5500",
    },
  ]);

  await db.insert(payments).values({
    transactionId: txn2.id,
    method: "qris",
    reference: "QRIS-20250101-00123",
  });
  console.log(`   ✅ Transaction #${txn2.id} — QRIS — Rp 35.500`);

  // --- Transaction 3: EDC BCA ---
  const [txn3] = await db
    .insert(transactions)
    .values({ totalAmount: "51000" })
    .returning();

  await db.insert(transactionItems).values([
    {
      transactionId: txn3.id,
      productId: find("SKU-004").id,
      productName: find("SKU-004").name,
      quantity: 3,
      unitPrice: "5000",
      subtotal: "15000",
    },
    {
      transactionId: txn3.id,
      productId: find("SKU-005").id,
      productName: find("SKU-005").name,
      quantity: 2,
      unitPrice: "18000",
      subtotal: "36000",
    },
  ]);

  await db.insert(payments).values({
    transactionId: txn3.id,
    method: "edc_bca",
    reference: "BCA-EDC-884521",
  });
  console.log(`   ✅ Transaction #${txn3.id} — EDC BCA — Rp 51.000`);

  console.log("   Done. 3 transactions inserted.\n");
}

async function main() {
  console.log("====================================");
  console.log("  POS System — Database Seeder");
  console.log("====================================\n");

  await seedProducts();
  await seedTransactions();

  console.log("🎉 Seeding complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeder failed:", err);
  process.exit(1);
});