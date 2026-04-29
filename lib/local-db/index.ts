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

export function initLocalDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_events (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      location TEXT,
      start_date TEXT,
      end_date TEXT,
      data_json TEXT,
      prepared_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_event_items (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      base_item_no TEXT,
      name TEXT NOT NULL,
      color TEXT,
      variant_code TEXT,
      unit TEXT DEFAULT 'PCS',
      net_price TEXT NOT NULL,
      retail_price TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      original_stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS local_payment_methods (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT,
      account_info TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS local_promos (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_txn_id TEXT NOT NULL UNIQUE,
      event_id INTEGER NOT NULL,
      total_amount TEXT NOT NULL,
      discount TEXT NOT NULL DEFAULT '0',
      final_amount TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_reference TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      server_transaction_id INTEGER,
      sync_error TEXT
    );

    CREATE TABLE IF NOT EXISTS local_transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_txn_id TEXT NOT NULL,
      event_item_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price TEXT NOT NULL,
      discount_amt TEXT NOT NULL DEFAULT '0',
      final_price TEXT NOT NULL,
      subtotal TEXT NOT NULL,
      promo_applied TEXT
    );

    CREATE TABLE IF NOT EXISTS local_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_event_items_event_id
      ON local_event_items(event_id);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_event_id
      ON local_transactions(event_id);

    CREATE INDEX IF NOT EXISTS idx_local_transactions_sync_status
      ON local_transactions(sync_status);

    CREATE INDEX IF NOT EXISTS idx_local_transaction_items_client_txn_id
      ON local_transaction_items(client_txn_id);
  `);
}

initLocalDb();