// lib/db/index.ts
import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sslEnabled = process.env.DATABASE_SSL === "true";

const configuredPoolMax = Number(process.env.DATABASE_POOL_MAX ?? 5);
const poolMax =
  Number.isInteger(configuredPoolMax) && configuredPoolMax > 0
    ? configuredPoolMax
    : 5;

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  application_name: "pos-system",
  max: poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  ssl: sslEnabled
    ? {
        rejectUnauthorized:
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      }
    : undefined,
};

// Next.js can evaluate server modules again during development reloads. Without
// caching the pool on globalThis, every evaluation leaves another PostgreSQL
// pool alive until its idle connections expire, which can exhaust the server's
// connection limit and cause otherwise valid queries to be terminated.
const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

const pool = globalForPostgres.postgresPool ?? new Pool(poolConfig);

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.postgresPool = pool;
}

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export const db = drizzle(pool, { schema });
