// lib/db/index.ts
import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sslEnabled = process.env.DATABASE_SSL === "true";

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  application_name: "pos-system",
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Without these, a stalled query (flaky network to the cloud DB, a lock
  // wait that never resolves) can hang a sync request indefinitely instead
  // of failing — leaving the POS "syncing…" forever rather than marking the
  // transaction failed so it gets retried. 30s is generous for even a large
  // multi-item cart's stock-deduction loop.
  statement_timeout: 30_000,
  query_timeout: 30_000,
  ssl: sslEnabled
    ? {
        rejectUnauthorized:
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      }
    : undefined,
};

const pool = new Pool(poolConfig);

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export const db = drizzle(pool, { schema });
