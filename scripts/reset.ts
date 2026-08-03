// scripts/reset.ts
import {
  closeScriptDatabase,
  getDatabaseTarget,
  isLocalDatabaseHost,
  pool,
} from "./_db";

type PostgreSqlError = Error & {
  code?: string;
  detail?: string;
  hint?: string;
};

const LOCK_TIMEOUT_MS = readPositiveInteger(
  "DB_RESET_LOCK_TIMEOUT_MS",
  5_000
);

const STATEMENT_TIMEOUT_MS = readPositiveInteger(
  "DB_RESET_STATEMENT_TIMEOUT_MS",
  60_000
);

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

async function main() {
  const target = getDatabaseTarget();
  const allowRemoteReset = process.env.ALLOW_REMOTE_DB_RESET === "true";

  console.log("====================================");
  console.log("  POS System — Database Reset");
  console.log("====================================\n");

  console.log(`Target database: ${target.display}`);
  console.log(`Lock timeout: ${LOCK_TIMEOUT_MS}ms`);
  console.log(`Statement timeout: ${STATEMENT_TIMEOUT_MS}ms\n`);

  // ────────────────────────────────────────────────────────────────────────────
  // Safety checks
  // ────────────────────────────────────────────────────────────────────────────

  if (!isLocalDatabaseHost(target.hostname) && !allowRemoteReset) {
    throw new Error(
      [
        "Refusing to reset a non-local PostgreSQL host.",
        "Set ALLOW_REMOTE_DB_RESET=true only when a destructive",
        "remote reset is intentional.",
      ].join(" ")
    );
  }

  if (["postgres", "template0", "template1"].includes(target.database)) {
    throw new Error(
      `Refusing to reset PostgreSQL maintenance database "${target.database}".`
    );
  }

  console.log("⚠️  This permanently removes:");
  console.log("   - Application tables");
  console.log("   - PostgreSQL types");
  console.log("   - Sequences");
  console.log("   - Functions");
  console.log("   - Stored migration history");
  console.log("   - All application data\n");

  console.log("🔌 Connecting to PostgreSQL...");

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    console.log("✅ PostgreSQL connection established.");

    // Avoid waiting forever for table/schema locks.
    await client.query(
      "SELECT set_config('lock_timeout', $1, false)",
      [`${LOCK_TIMEOUT_MS}ms`]
    );

    await client.query(
      "SELECT set_config('statement_timeout', $1, false)",
      [`${STATEMENT_TIMEOUT_MS}ms`]
    );

    // Give this connection a recognizable name in pg_stat_activity.
    await client.query(
      "SELECT set_config('application_name', $1, false)",
      ["pos-system-db-reset"]
    );

    // ──────────────────────────────────────────────────────────────────────────
    // Terminate other connections using the same database and database user.
    // ──────────────────────────────────────────────────────────────────────────

    console.log("\n🔍 Checking for other active database connections...");

    const connectionResult = await client.query<{
      pid: number;
      applicationName: string | null;
      state: string | null;
      terminated: boolean;
    }>(`
      SELECT
        pid,
        application_name AS "applicationName",
        state,
        pg_terminate_backend(pid) AS terminated
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND usename = current_user
        AND backend_type = 'client backend'
    `);

    if (connectionResult.rows.length === 0) {
      console.log("✅ No competing connections found.");
    } else {
      console.log(
        `🛑 Found ${connectionResult.rows.length} competing connection(s).`
      );

      for (const connection of connectionResult.rows) {
        const appName = connection.applicationName || "unknown application";
        const state = connection.state || "unknown state";

        console.log(
          `   PID ${connection.pid}: ${appName} (${state}) — ${
            connection.terminated ? "terminated" : "not terminated"
          }`
        );
      }
    }

    // Give PostgreSQL a moment to finish cleaning terminated sessions.
    await new Promise((resolve) => setTimeout(resolve, 200));

    // ──────────────────────────────────────────────────────────────────────────
    // Perform reset
    // ──────────────────────────────────────────────────────────────────────────

    console.log("\n🧹 Starting reset transaction...");

    await client.query("BEGIN");
    transactionStarted = true;

    console.log("🗑️  Dropping drizzle and public schemas...");

    // Both schemas can be dropped in one statement.
    await client.query(`
      DROP SCHEMA IF EXISTS drizzle, public CASCADE
    `);

    console.log("🏗️  Recreating public schema...");

    await client.query(`
      CREATE SCHEMA public AUTHORIZATION CURRENT_USER
    `);

    console.log("💾 Committing database reset...");

    await client.query("COMMIT");
    transactionStarted = false;

    console.log("\n✅ PostgreSQL database reset complete.\n");

    console.log("Next steps:");
    console.log("  npm run db:migrate");
    console.log(
      "  npm run db:seed:production -- <admin-username> <admin-password>"
    );
  } catch (error) {
    if (transactionStarted) {
      console.log("\n↩️  Rolling back reset transaction...");
      await client.query("ROLLBACK").catch(() => undefined);
    }

    const pgError = error as PostgreSqlError;

    if (pgError.code === "55P03") {
      throw new Error(
        [
          "The database reset could not obtain the required lock.",
          "Stop npm run dev, PM2, Drizzle Studio, and other programs",
          "connected to this database, then run the reset again.",
        ].join(" ")
      );
    }

    if (pgError.code === "42501") {
      throw new Error(
        [
          "The PostgreSQL user does not have permission to terminate",
          "another connection or drop the schema.",
          pgError.message,
        ].join(" ")
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error: unknown) => {
    const pgError = error as PostgreSqlError;

    console.error("\n❌ Database reset failed.");
    console.error(
      pgError instanceof Error ? pgError.message : String(pgError)
    );

    if (pgError.detail) {
      console.error(`Detail: ${pgError.detail}`);
    }

    if (pgError.hint) {
      console.error(`Hint: ${pgError.hint}`);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeScriptDatabase();
    } catch (error) {
      console.error(
        "Failed to close the PostgreSQL pool:",
        error instanceof Error ? error.message : String(error)
      );

      process.exitCode = 1;
    }
  });