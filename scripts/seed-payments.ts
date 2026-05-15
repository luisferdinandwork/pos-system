// scripts/seed-payments.ts
// Run with: npx tsx scripts/seed-payments.ts
//
// Seeds only:
//   Cash → one row only
//   EDC  → one generic EDC machine with Debit Card, Credit Card, and QRIS
//
// Removed:
//   - Standalone QRIS payment method
//   - E-wallet payment methods
//   - Bank-specific EDC rows such as BCA, Mandiri, BNI, BRI

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { edcMachines, paymentMethods } from "../lib/db/schema";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set. Check your .env.local file.");
  process.exit(1);
}

const db = drizzle(neon(databaseUrl));

async function main() {
  console.log("🌱 Seeding payment methods...");

  /**
   * Keep this seeder idempotent.
   * Since payment_methods references edc_machines, delete child rows first.
   */
  await db.delete(paymentMethods);
  await db.delete(edcMachines);

  const [edc] = await db
    .insert(edcMachines)
    .values({
      /**
       * Your current schema still requires bankName.
       * We store a generic value so the UI no longer shows bank-specific names.
       */
      bankName: "EDC",
      terminalId: null,
      label: "EDC",
      isActive: true,
      sortOrder: 10,
    })
    .returning();

  await db.insert(paymentMethods).values([
    {
      name: "Cash",
      type: "cash",
      edcMethod: null,
      edcMachineId: null,
      provider: null,
      accountInfo: null,
      isActive: true,
      sortOrder: 0,
    },
    {
      name: "Debit Card",
      type: "edc",
      edcMethod: "debit",
      edcMachineId: edc.id,
      provider: null,
      accountInfo: null,
      isActive: true,
      sortOrder: 10,
    },
    {
      name: "Credit Card",
      type: "edc",
      edcMethod: "credit",
      edcMachineId: edc.id,
      provider: null,
      accountInfo: null,
      isActive: true,
      sortOrder: 11,
    },
    {
      name: "QRIS",
      type: "edc",
      edcMethod: "qris",
      edcMachineId: edc.id,
      provider: null,
      accountInfo: null,
      isActive: true,
      sortOrder: 12,
    },
  ]);

  console.log("✅ Payment methods seeded:");
  console.log("   Cash");
  console.log("   EDC → Debit Card, Credit Card, QRIS");
  console.log("   Removed standalone QRIS and E-Wallet methods.");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
