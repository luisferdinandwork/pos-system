// lib/local-db/index.ts
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlitePath = path.join(dataDir, "local-pos.db");

export const sqlite = new Database(sqlitePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const localDb = drizzle(sqlite, { schema });

function tableExists(tableName: string): boolean {
  const row = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`
    )
    .get(tableName) as { name?: string } | undefined;

  return Boolean(row?.name);
}

function getColumns(tableName: string): string[] {
  if (!tableExists(tableName)) return [];

  return (
    sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as {
      name: string;
    }[]
  ).map((column) => column.name);
}

function hasColumn(tableName: string, columnName: string): boolean {
  return getColumns(tableName).includes(columnName);
}

function addColumnIfMissing(
  tableName: string,
  columnName: string,
  alterSql: string
) {
  if (!hasColumn(tableName, columnName)) {
    sqlite.exec(alterSql);
  }
}

function createIndexes() {
  /**
   * Indexes must be created AFTER migration guards.
   * Otherwise old SQLite files crash when an index references a new column.
   */
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_local_events_code
      ON local_events(code);

    CREATE INDEX IF NOT EXISTS idx_local_events_prepared_at
      ON local_events(prepared_at);

    CREATE INDEX IF NOT EXISTS idx_local_event_items_event_id
      ON local_event_items(event_id);

    CREATE INDEX IF NOT EXISTS idx_local_payment_methods_active_sort
      ON local_payment_methods(is_active, sort_order);

    CREATE INDEX IF NOT EXISTS idx_local_promos_event_id
      ON local_promos(event_id);

    CREATE INDEX IF NOT EXISTS idx_local_cashier_sessions_event_id
      ON local_cashier_sessions(event_id);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_event_id
      ON local_transactions(event_id);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_event_code
      ON local_transactions(event_code);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_sync_status
      ON local_transactions(sync_status);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_server_transaction_id
      ON local_transactions(server_transaction_id);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_status
      ON local_transactions(status);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_void_of_client_txn_id
      ON local_transactions(void_of_client_txn_id);

    CREATE INDEX IF NOT EXISTS idx_local_transaction_items_client_txn_id
      ON local_transaction_items(client_txn_id);

    CREATE INDEX IF NOT EXISTS idx_local_cash_drawer_counts_event_id
      ON local_cash_drawer_counts(event_id);

    CREATE INDEX IF NOT EXISTS idx_local_cash_drawer_counts_sync_status
      ON local_cash_drawer_counts(sync_status);
  `);
}

export function initLocalDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_events (
      id            INTEGER PRIMARY KEY,
      code          TEXT NOT NULL DEFAULT '',
      verifier_code TEXT,
      name          TEXT NOT NULL,
      status        TEXT NOT NULL,
      location      TEXT,
      start_date    TEXT,
      end_date      TEXT,
      data_json     TEXT,
      prepared_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_event_items (
      id             INTEGER PRIMARY KEY,
      event_id       INTEGER NOT NULL,
      item_id        TEXT NOT NULL,
      base_item_no   TEXT,
      name           TEXT NOT NULL,
      color          TEXT,
      variant_code   TEXT,
      unit           TEXT DEFAULT 'PCS',
      net_price      TEXT NOT NULL,
      retail_price   TEXT NOT NULL,
      stock          INTEGER NOT NULL DEFAULT 0,
      original_stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS local_payment_methods (
      id             INTEGER PRIMARY KEY,
      name           TEXT NOT NULL,
      type           TEXT NOT NULL,
      edc_method     TEXT,
      edc_machine_id INTEGER,
      provider       TEXT,
      account_info   TEXT,
      is_active      INTEGER NOT NULL DEFAULT 1,
      sort_order     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS local_promos (
      id        INTEGER PRIMARY KEY,
      event_id  INTEGER NOT NULL,
      name      TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_cashier_sessions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      server_session_id INTEGER,
      event_id          INTEGER NOT NULL,
      cashier_name      TEXT NOT NULL,
      opening_cash      TEXT NOT NULL DEFAULT '0',
      closing_cash      TEXT,
      opened_at         TEXT NOT NULL,
      closed_at         TEXT,
      notes             TEXT,
      sync_status       TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS local_transactions (
      client_txn_id         TEXT NOT NULL UNIQUE,
      display_id            TEXT,
      event_id              INTEGER NOT NULL,
      event_code            TEXT,
      cashier_session_id    INTEGER,
      cashier_name          TEXT,
      total_amount          TEXT NOT NULL,
      discount              TEXT NOT NULL DEFAULT '0',
      final_amount          TEXT NOT NULL,
      cash_tendered         TEXT,
      change_amount         TEXT,
      payment_method        TEXT NOT NULL,
      payment_reference     TEXT,
      created_at            TEXT NOT NULL,
      sync_status           TEXT NOT NULL DEFAULT 'pending',
      server_transaction_id INTEGER,
      sync_error            TEXT,
      receipt_print_count   INTEGER NOT NULL DEFAULT 0,
      status                TEXT NOT NULL DEFAULT 'completed',
      voided_at             TEXT,
      voided_by             TEXT,
      void_reason           TEXT,
      void_sync_status      TEXT,
      void_sync_error       TEXT
    );

    CREATE TABLE IF NOT EXISTS local_transaction_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      client_txn_id TEXT NOT NULL,
      event_item_id INTEGER NOT NULL,
      item_id       TEXT NOT NULL,
      product_name  TEXT NOT NULL,
      quantity      INTEGER NOT NULL,
      unit_price    TEXT NOT NULL,
      discount_amt  TEXT NOT NULL DEFAULT '0',
      final_price   TEXT NOT NULL,
      subtotal      TEXT NOT NULL,
      promo_applied TEXT
    );

    CREATE TABLE IF NOT EXISTS local_sync_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id   INTEGER NOT NULL,
      message    TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_cash_drawer_counts (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      server_count_id    INTEGER,
      event_id           INTEGER NOT NULL,
      cashier_session_id INTEGER,
      counted_by         TEXT,
      expected_cash      TEXT NOT NULL DEFAULT '0',
      actual_cash        TEXT NOT NULL DEFAULT '0',
      difference         TEXT NOT NULL DEFAULT '0',
      reason             TEXT NOT NULL DEFAULT 'count',
      notes              TEXT,
      counted_at         TEXT NOT NULL,
      sync_status        TEXT NOT NULL DEFAULT 'pending',
      sync_error         TEXT
    );
  `);

  addColumnIfMissing(
    "local_events",
    "code",
    `ALTER TABLE local_events ADD COLUMN code TEXT NOT NULL DEFAULT ''`
  );

  addColumnIfMissing(
    "local_events",
    "verifier_code",
    `ALTER TABLE local_events ADD COLUMN verifier_code TEXT`
  );

  addColumnIfMissing(
    "local_events",
    "data_json",
    `ALTER TABLE local_events ADD COLUMN data_json TEXT`
  );

  addColumnIfMissing(
    "local_events",
    "prepared_at",
    `ALTER TABLE local_events ADD COLUMN prepared_at TEXT NOT NULL DEFAULT ''`
  );

  addColumnIfMissing(
    "local_transactions",
    "display_id",
    `ALTER TABLE local_transactions ADD COLUMN display_id TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "event_code",
    `ALTER TABLE local_transactions ADD COLUMN event_code TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "cashier_session_id",
    `ALTER TABLE local_transactions ADD COLUMN cashier_session_id INTEGER`
  );

  addColumnIfMissing(
    "local_transactions",
    "cashier_name",
    `ALTER TABLE local_transactions ADD COLUMN cashier_name TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "server_transaction_id",
    `ALTER TABLE local_transactions ADD COLUMN server_transaction_id INTEGER`
  );

  addColumnIfMissing(
    "local_transactions",
    "sync_error",
    `ALTER TABLE local_transactions ADD COLUMN sync_error TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "receipt_print_count",
    `ALTER TABLE local_transactions ADD COLUMN receipt_print_count INTEGER NOT NULL DEFAULT 0`
  );

  addColumnIfMissing(
    "local_transactions",
    "status",
    `ALTER TABLE local_transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`
  );

  addColumnIfMissing(
    "local_transactions",
    "voided_at",
    `ALTER TABLE local_transactions ADD COLUMN voided_at TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "voided_by",
    `ALTER TABLE local_transactions ADD COLUMN voided_by TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "void_reason",
    `ALTER TABLE local_transactions ADD COLUMN void_reason TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "void_sync_status",
    `ALTER TABLE local_transactions ADD COLUMN void_sync_status TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "void_sync_error",
    `ALTER TABLE local_transactions ADD COLUMN void_sync_error TEXT`
  );

  addColumnIfMissing(
    "local_transactions",
    "void_of_client_txn_id",
    `ALTER TABLE local_transactions ADD COLUMN void_of_client_txn_id TEXT`
  );

  addColumnIfMissing(
    "local_cashier_sessions",
    "server_session_id",
    `ALTER TABLE local_cashier_sessions ADD COLUMN server_session_id INTEGER`
  );

  addColumnIfMissing(
    "local_cashier_sessions",
    "closing_cash",
    `ALTER TABLE local_cashier_sessions ADD COLUMN closing_cash TEXT`
  );

  addColumnIfMissing(
    "local_cashier_sessions",
    "closed_at",
    `ALTER TABLE local_cashier_sessions ADD COLUMN closed_at TEXT`
  );

  addColumnIfMissing(
    "local_cashier_sessions",
    "notes",
    `ALTER TABLE local_cashier_sessions ADD COLUMN notes TEXT`
  );

  addColumnIfMissing(
    "local_cashier_sessions",
    "sync_status",
    `ALTER TABLE local_cashier_sessions ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'`
  );

  addColumnIfMissing(
    "local_cash_drawer_counts",
    "server_count_id",
    `ALTER TABLE local_cash_drawer_counts ADD COLUMN server_count_id INTEGER`
  );

  addColumnIfMissing(
    "local_cash_drawer_counts",
    "sync_error",
    `ALTER TABLE local_cash_drawer_counts ADD COLUMN sync_error TEXT`
  );

  createIndexes();
}

initLocalDb();