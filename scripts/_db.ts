import * as dotenv from "dotenv";
import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/db/schema";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env.production", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();

if (!configuredDatabaseUrl) {
  throw new Error(
    "DATABASE_URL is not set in .env.local, .env.production, .env, or the process environment."
  );
}

export const databaseUrl: string = configuredDatabaseUrl;

const sslEnabled = process.env.DATABASE_SSL === "true";

const poolConfig: PoolConfig = {
  connectionString: databaseUrl,
  application_name: "pos-system-cli",
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: sslEnabled
    ? {
        rejectUnauthorized:
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      }
    : undefined,
};

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL CLI pool error:", error);
});

let closed = false;

export async function closeScriptDatabase() {
  if (closed) return;
  closed = true;
  await pool.end();
}

export function getDatabaseTarget() {
  const parsed = new URL(databaseUrl);

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://.");
  }

  return {
    hostname: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, "") || "(default)",
    display: `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`,
  };
}

export function isLocalDatabaseHost(hostname: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(
    hostname.toLowerCase()
  );
}
