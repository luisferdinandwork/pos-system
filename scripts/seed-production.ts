import {
  closeScriptDatabase,
  getDatabaseTarget,
} from "./_db";
import {
  seedDefaultPaymentMethods,
  seedProductionAdmin,
  seedSystemStockTypes,
} from "./production-seed-data";

async function main() {
  const username =
    process.argv[2] ?? process.env.PRODUCTION_ADMIN_USERNAME?.trim();
  const password =
    process.argv[3] ?? process.env.PRODUCTION_ADMIN_PASSWORD;
  const name = process.env.PRODUCTION_ADMIN_NAME?.trim() || "Admin";

  if (!username || !password) {
    throw new Error(
      "Provide admin credentials as arguments or set PRODUCTION_ADMIN_USERNAME and PRODUCTION_ADMIN_PASSWORD."
    );
  }

  const target = getDatabaseTarget();
  console.log("====================================");
  console.log("  POS System — Production Seeder");
  console.log("====================================\n");
  console.log(`Target database: ${target.display}`);
  console.log("Mode: additive and idempotent (no events or sales are deleted)\n");

  const stockTypes = await seedSystemStockTypes();
  console.log(`✅ System stock types: ${stockTypes.join(", ")}`);

  const paymentRows = await seedDefaultPaymentMethods();
  console.log(`✅ Default payment methods: ${paymentRows.join(", ")}`);

  const admin = await seedProductionAdmin({ name, username, password });
  console.log(`✅ Production admin ready: ${admin.username} (#${admin.id})`);
  console.log("\n🎉 Production seed complete.");
}

main()
  .catch((error) => {
    console.error(
      `\n❌ Production seed failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  })
  .finally(closeScriptDatabase);
