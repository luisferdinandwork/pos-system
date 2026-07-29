// scripts/reset-local-db.ts
import { sqlite } from "../lib/local-db";

const LOCAL_TABLES = [
  // Child/detail tables first
  "local_transaction_items",
  "local_cash_drawer_counts",
  "local_sync_logs",

  // Transaction/session tables
  "local_transactions",
  "local_cashier_sessions",

  // Event-related tables
  "local_promos",
  "local_event_items",
  "local_events",

  // Supporting/master tables
  "local_payment_methods",
] as const;

function tableExists(tableName: string): boolean {
  const result = sqlite
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
        LIMIT 1
      `
    )
    .get(tableName) as { name: string } | undefined;

  return Boolean(result);
}

function resetSequence(): void {
  if (!tableExists("sqlite_sequence")) {
    return;
  }

  sqlite.prepare("DELETE FROM sqlite_sequence").run();
}

function main(): void {
  const allowReset =
    process.env.ALLOW_LOCAL_DB_RESET === "true" ||
    process.env.NODE_ENV !== "production";

  console.log("====================================");
  console.log("  POS System — Local Database Reset");
  console.log("====================================\n");

  console.log(`Database: ${sqlite.name}\n`);

  if (!allowReset) {
    throw new Error(
      [
        "Refusing to reset the local database in production.",
        "Set ALLOW_LOCAL_DB_RESET=true only when the reset is intentional.",
      ].join(" ")
    );
  }

  console.log("⚠️  This permanently removes:");
  console.log("   - Prepared local events");
  console.log("   - Local event items");
  console.log("   - Local payment methods");
  console.log("   - Local promos");
  console.log("   - Cashier sessions");
  console.log("   - Cash drawer counts");
  console.log("   - Transactions");
  console.log("   - Transaction items");
  console.log("   - Sync logs\n");

  /*
   * Wait briefly when another SQLite connection is finishing a write
   * instead of failing immediately with SQLITE_BUSY.
   */
  sqlite.pragma("busy_timeout = 5000");

  /*
   * Foreign keys must be disabled before starting the transaction.
   * They are restored immediately afterward.
   */
  sqlite.pragma("foreign_keys = OFF");

  let deletedRows = 0;

  try {
    const resetDatabase = sqlite.transaction(() => {
      for (const tableName of LOCAL_TABLES) {
        if (!tableExists(tableName)) {
          console.log(`⏭️  Skipped missing table: ${tableName}`);
          continue;
        }

        const result = sqlite
          .prepare(`DELETE FROM "${tableName}"`)
          .run();

        deletedRows += result.changes;

        console.log(
          `🗑️  Cleared ${tableName}: ${result.changes} row(s)`
        );
      }

      /*
       * Reset AUTOINCREMENT counters so new IDs start again from 1.
       */
      resetSequence();
    });

    console.log("🧹 Clearing local database...\n");

    resetDatabase();
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }

  /*
   * Flush WAL changes back into the main database file.
   */
  sqlite.pragma("wal_checkpoint(TRUNCATE)");

  /*
   * VACUUM can take longer on large databases, so it is optional.
   * Run with LOCAL_DB_VACUUM=true when you also want to shrink the file.
   */
  if (process.env.LOCAL_DB_VACUUM === "true") {
    console.log("\n📦 Compacting SQLite database...");
    sqlite.exec("VACUUM");
  }

  console.log("\n✅ Local database reset complete.");
  console.log(`Deleted rows: ${deletedRows}`);
  console.log("Tables, columns, and indexes were preserved.");
}

try {
  main();
} catch (error) {
  console.error(
    `\n❌ Local database reset failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );

  process.exitCode = 1;
} finally {
  try {
    sqlite.close();
  } catch {
    // The connection may already be closed after an initialization failure.
  }
}