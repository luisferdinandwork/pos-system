import {
  closeScriptDatabase,
  getDatabaseTarget,
  isLocalDatabaseHost,
  pool,
} from "./_db";

async function main() {
  const target = getDatabaseTarget();
  const allowRemoteReset = process.env.ALLOW_REMOTE_DB_RESET === "true";

  console.log("====================================");
  console.log("  POS System — Database Reset");
  console.log("====================================\n");
  console.log(`Target database: ${target.display}\n`);

  if (!isLocalDatabaseHost(target.hostname) && !allowRemoteReset) {
    throw new Error(
      "Refusing to reset a non-local PostgreSQL host. Set ALLOW_REMOTE_DB_RESET=true only if this destructive remote reset is intentional."
    );
  }

  if (["postgres", "template0", "template1"].includes(target.database)) {
    throw new Error(
      `Refusing to reset PostgreSQL maintenance database "${target.database}".`
    );
  }

  console.log("🗑️  Resetting PostgreSQL schemas...");
  console.log(
    "⚠️  This permanently drops all application tables, types, sequences, functions, data, and migration history."
  );
  console.log("   Repository migration files will be kept.\n");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  console.log("✅ Database reset complete.\n");
  console.log("Next steps:");
  console.log("  npm run db:migrate");
  console.log("  npm run db:seed:production -- <admin-username> <admin-password>");
}

main()
  .catch((error) => {
    console.error(
      `\n❌ Reset failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  })
  .finally(closeScriptDatabase);
