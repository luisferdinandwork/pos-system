import { closeScriptDatabase, getDatabaseTarget } from "./_db";
import { seedProductionAdmin } from "./production-seed-data";

async function main() {
  const username =
    process.argv[2] ?? process.env.PRODUCTION_ADMIN_USERNAME?.trim();
  const password =
    process.argv[3] ?? process.env.PRODUCTION_ADMIN_PASSWORD;
  const name = process.env.PRODUCTION_ADMIN_NAME?.trim() || "Admin";

  if (!username || !password) {
    throw new Error(
      "Provide username/password arguments or set PRODUCTION_ADMIN_USERNAME and PRODUCTION_ADMIN_PASSWORD."
    );
  }

  const target = getDatabaseTarget();
  console.log(`Creating or updating an admin on ${target.display}...`);

  const admin = await seedProductionAdmin({ name, username, password });
  console.log("✅ Admin user ready:");
  console.log({
    id: admin.id,
    username: admin.username,
    role: admin.role,
  });
}

main()
  .catch((error) => {
    console.error(
      `❌ Failed to create admin: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  })
  .finally(closeScriptDatabase);
