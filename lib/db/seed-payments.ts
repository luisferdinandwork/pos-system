// lib/db/seed-payments.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { paymentMethods } from "./schema";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = drizzle(neon(process.env.DATABASE_URL!));

async function main() {
  await db.insert(paymentMethods).values([
    { name: "Cash",        type: "cash",    provider: null,        sortOrder: 0 },
    { name: "QRIS",        type: "qris",    provider: "GoPay",     sortOrder: 1 },
    { name: "QRIS",        type: "qris",    provider: "OVO",       sortOrder: 2 },
    { name: "QRIS",        type: "qris",    provider: "ShopeePay", sortOrder: 3 },
    { name: "EDC BCA",     type: "debit",   provider: "BCA",       sortOrder: 4 },
    { name: "EDC Mandiri", type: "debit",   provider: "Mandiri",   sortOrder: 5 },
    { name: "GoPay",       type: "ewallet", provider: "Gojek",     sortOrder: 6 },
    { name: "OVO",         type: "ewallet", provider: "OVO",       sortOrder: 7 },
    { name: "Dana",        type: "ewallet", provider: "Dana",      sortOrder: 8 },
  ]);

  console.log("✅ Payment methods seeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeder failed:", err);
  process.exit(1);
});