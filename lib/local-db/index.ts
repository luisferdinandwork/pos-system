// lib/local-db/index.ts
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlitePath = path.join(dataDir, "local-pos.db");
export const sqlite = new Database(sqlitePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const localDb = drizzle(sqlite, { schema });

export function initLocalDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_events (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      status      TEXT NOT NULL,
      location    TEXT,
      start_date  TEXT,
      end_date    TEXT,
      data_json   TEXT,
      prepared_at TEXT NOT NULL
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
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      server_session_id INTEGER,
      event_id         INTEGER NOT NULL,
      cashier_name     TEXT NOT NULL,
      opening_cash     TEXT NOT NULL DEFAULT '0',
      closing_cash     TEXT,
      opened_at        TEXT NOT NULL,
      closed_at        TEXT,
      notes            TEXT,
      sync_status      TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS local_transactions (
      client_txn_id         TEXT NOT NULL UNIQUE,
      display_id            TEXT,
      event_id              INTEGER NOT NULL,
      cashier_session_id    INTEGER,
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
      receipt_print_count   INTEGER NOT NULL DEFAULT 0
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

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_local_event_items_event_id
      ON local_event_items(event_id);
    CREATE INDEX IF NOT EXISTS idx_local_cashier_sessions_event_id
      ON local_cashier_sessions(event_id);
    CREATE INDEX IF NOT EXISTS idx_local_transactions_event_id
      ON local_transactions(event_id);
    CREATE INDEX IF NOT EXISTS idx_local_transactions_sync_status
      ON local_transactions(sync_status);
    CREATE INDEX IF NOT EXISTS idx_local_transaction_items_client_txn_id
      ON local_transaction_items(client_txn_id);

    -- Migrations: add new columns to existing tables without re-creating them
    -- SQLite ALTER TABLE only supports ADD COLUMN, so we do it idempotently.
    -- These are no-ops if the column already exists (SQLite ignores duplicate ADD COLUMN).
  `);

  // Idempotent column additions for existing deployments
  const addColumnIfMissing = (table: string, column: string, definition: string) => {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some(c => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  addColumnIfMissing("local_payment_methods", "edc_method",     "TEXT");
  addColumnIfMissing("local_payment_methods", "edc_machine_id", "INTEGER");
  addColumnIfMissing("local_transactions",    "display_id",            "TEXT");
  addColumnIfMissing("local_transactions",    "cashier_session_id",    "INTEGER");
  addColumnIfMissing("local_transactions",    "cash_tendered",         "TEXT");
  addColumnIfMissing("local_transactions",    "change_amount",         "TEXT");
  addColumnIfMissing("local_transactions",    "receipt_print_count",   "INTEGER NOT NULL DEFAULT 0");
}

initLocalDb();