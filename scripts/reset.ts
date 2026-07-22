// scripts/reset.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set. Check your .env.local file.");
  process.exit(1);
}

function describeConnectionTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "(unable to parse DATABASE_URL — is it a valid postgres:// URL?)";
  }
}

const sqlClient = neon(databaseUrl);
const db = drizzle(sqlClient);

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle", "migrations");

async function runWithRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === attempts;

      console.warn(
        `   ⚠️  ${label} failed (attempt ${attempt}/${attempts})${
          isLastAttempt ? "" : ` — retrying in ${attempt * 2}s...`
        }`
      );

      if (!isLastAttempt) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }
  }

  throw lastError;
}

function isFetchConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("fetch failed") ||
    message.includes("ConnectTimeoutError") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED")
  );
}

function deleteMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("   ℹ️  No local drizzle/migrations folder found — nothing to delete.");
    return;
  }

  const entries = fs.readdirSync(MIGRATIONS_DIR);

  if (entries.length === 0) {
    console.log("   ℹ️  drizzle/migrations folder is already empty.");
    return;
  }

  for (const entry of entries) {
    fs.rmSync(path.join(MIGRATIONS_DIR, entry), { recursive: true, force: true });
  }

  console.log(`   ✅ Removed ${entries.length} item(s) from drizzle/migrations/.`);
}

async function main() {
  console.log("====================================");
  console.log("  POS System — Database Reset");
  console.log("====================================\n");

  console.log(`Target database: ${describeConnectionTarget(databaseUrl!)}\n`);

  console.log("🗑️  Resetting database schema...");
  console.log("⚠️  This will DROP ALL TABLES, TYPES, SEQUENCES, FUNCTIONS, AND DATA,");
  console.log("   and clear drizzle's migration history, so the next migrate starts clean.\n");

  try {
    // "public" holds all app tables. "drizzle" holds drizzle-kit's own
    // migration tracking table (__drizzle_migrations). Both must be dropped —
    // otherwise drizzle-kit will think old migrations already ran against a
    // database that no longer has any tables, and silently skip re-applying them.
    await runWithRetry("Drop public schema", () =>
      db.execute(sql.raw(`DROP SCHEMA IF EXISTS public CASCADE;`))
    );

    await runWithRetry("Drop drizzle schema", () =>
      db.execute(sql.raw(`DROP SCHEMA IF EXISTS drizzle CASCADE;`))
    );

    await runWithRetry("Recreate public schema", () =>
      db.execute(sql.raw(`CREATE SCHEMA public;`))
    );

    await runWithRetry("Grant public schema permissions", () =>
      db.execute(sql.raw(`GRANT ALL ON SCHEMA public TO public;`))
    );

    console.log("\n✅ Database schema reset complete.\n");
  } catch (error) {
    if (isFetchConnectivityError(error)) {
      console.error("\n❌ Could not reach the Neon database endpoint.");
      console.error("   This is a NETWORK connectivity problem, not a bug in this script.\n");
      console.error("   Checklist:");
      console.error("   1. Confirm the Neon project/branch isn't paused (check the Neon dashboard —");
      console.error("      free-tier projects auto-suspend and can take a few seconds to wake up).");
      console.error("   2. If you're on a VPN or corporate network, try disabling it — many block");
      console.error("      outbound HTTPS to unfamiliar hosts like *.neon.tech.");
      console.error("   3. On Windows, try: set NODE_OPTIONS=--dns-result-order=ipv4first");
      console.error("      then re-run this script (some Windows/IPv6 setups break undici's fetch).");
      console.error("   4. Confirm .env.local's DATABASE_URL hasn't changed/rotated in the Neon dashboard.");
      console.error("   5. Try again in a minute — transient DNS/network blips do happen.\n");
    } else {
      console.error("\n❌ Reset failed:", error);
    }

    process.exit(1);
  }

  console.log("🗑️  Clearing local migration files...");
  deleteMigrationFiles();

  console.log("\n🎉 Reset complete!\n");
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