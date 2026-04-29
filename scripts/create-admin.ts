// scripts/create-admin.ts
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const { createAuthUser } = await import("@/lib/auth-users");

  const username = process.argv[2] ?? "admin";
  const password = process.argv[3] ?? "admin123";

  const admin = await createAuthUser({
    name: "Admin",
    username,
    password,
    role: "admin",
    eventId: null,
  });

  console.log("✅ Admin user created:");
  console.log({
    id: admin.id,
    username: admin.username,
    role: admin.role,
  });

  console.log("");
  console.log("Login with:");
  console.log(`username: ${username}`);
  console.log(`password: ${password}`);
}

main().catch((err) => {
  console.error("❌ Failed to create admin:", err);
  process.exit(1);
});