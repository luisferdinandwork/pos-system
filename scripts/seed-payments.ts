import { closeScriptDatabase, getDatabaseTarget } from "./_db";
import { seedDefaultPaymentMethods } from "./production-seed-data";

async function main() {
  const target = getDatabaseTarget();
  console.log(`🌱 Seeding payment methods on ${target.display}...`);

  const rows = await seedDefaultPaymentMethods();
  console.log(`✅ Payment methods ready: ${rows.join(", ")}`);
  console.log("   Existing custom payment methods were not deleted.");
}

main()
  .catch((error) => {
    console.error(
      `❌ Payment seed failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  })
  .finally(closeScriptDatabase);
