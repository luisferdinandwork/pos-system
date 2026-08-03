import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  closeScriptDatabase,
  db,
  getDatabaseTarget,
} from "../../scripts/_db";

async function main() {
  const target = getDatabaseTarget();
  console.log(`⏳ Running PostgreSQL migrations on ${target.display}...`);

  await migrate(db, {
    migrationsFolder: "./drizzle/migrations",
  });

  console.log("✅ PostgreSQL migrations complete.");
}

main()
  .catch((error) => {
    console.error(
      `❌ Migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  })
  .finally(closeScriptDatabase);
