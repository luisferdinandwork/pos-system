// scripts/reset.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set. Check your .env.local file.");
  process.exit(1);
}

const db = drizzle(neon(databaseUrl));

async function main() {
  console.log("🗑️  Resetting database schema...");
  console.log("⚠️  This will DROP ALL TABLES, TYPES, SEQUENCES, FUNCTIONS, AND DATA in public schema.");

  /**
   * This is simpler and safer than keeping a manual table list.
   * It drops the entire public schema and recreates it cleanly.
   *
   * Works from Windows PowerShell / CMD with:
   *   npm run db:reset
   */
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS public CASCADE;`));
  await db.execute(sql.raw(`CREATE SCHEMA public;`));

  /**
   * Restore normal permissions.
   * These are safe defaults for most Neon/Postgres projects.
   */
  await db.execute(sql.raw(`GRANT ALL ON SCHEMA public TO public;`));

  console.log("✅ Public schema reset complete.");
  console.log("");
  console.log("Next steps:");
  console.log("  npm run db:generate");
  console.log("  npm run db:migrate");
  console.log("  npm run db:seed");
  console.log("  npx tsx scripts/seed-payments.ts");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});
