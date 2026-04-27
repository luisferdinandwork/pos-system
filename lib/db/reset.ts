// lib/db/reset.ts
import { neon }   from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql }    from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = drizzle(neon(process.env.DATABASE_URL!));

async function main() {
  const force = process.env.FORCE_RESET === "true";

  if (!force) {
    console.log("⚠️  This will DROP ALL TABLES and ALL DATA.");
    console.log("    Run with FORCE_RESET=true to confirm:\n");
    console.log("    Windows (PowerShell):");
    console.log("      $env:FORCE_RESET='true'; npm run db:reset\n");
    console.log("    Windows (CMD):");
    console.log("      set FORCE_RESET=true && npm run db:reset\n");
    console.log("    Mac / Linux:");
    console.log("      FORCE_RESET=true npm run db:reset");
    process.exit(0);
  }

  console.log("🗑️  Dropping all tables...\n");

  const tables = [
    "promo_items",
    "promo_tiers",
    "promos",
    "stock_entries",
    "transaction_items",
    "payments",
    "transactions",
    "event_products",
    "events",
    "payment_methods",
    "products",
    "__drizzle_migrations",
  ];

  for (const table of tables) {
    try {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS "${table}" CASCADE`));
      console.log(`   ✅ Dropped: ${table}`);
    } catch (e) {
      console.log(`   ⚠️  Skipped: ${table} — ${String(e)}`);
    }
  }

  console.log("\n✅ All tables dropped.");
  console.log("\nNext steps:");
  console.log("  npm run db:generate");
  console.log("  npm run db:migrate");
  console.log("  npm run db:seed");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});