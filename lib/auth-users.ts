// lib/auth-users.ts
import { db } from "@/lib/db";
import { authUsers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export type AuthUser = typeof authUsers.$inferSelect;

export async function getUserByUsername(
  username: string
): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.username, username))
    .limit(1);

  return user ?? null;
}

export async function getUserById(id: number): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, id))
    .limit(1);

  return user ?? null;
}

export async function getUsersByEvent(eventId: number): Promise<AuthUser[]> {
  return db
    .select()
    .from(authUsers)
    .where(eq(authUsers.eventId, eventId));
}

export async function createAuthUser(data: {
  name: string;
  username: string;
  password: string;
  role: "admin" | "user";
  eventId?: number | null;
}) {
  const passwordHash = await bcrypt.hash(data.password, 12);

  const [created] = await db
    .insert(authUsers)
    .values({
      name: data.name,
      username: data.username,
      passwordHash,
      role: data.role,
      eventId: data.role === "admin" ? null : data.eventId ?? null,
      isActive: true,
    })
    .returning();

  return created;
}

export async function updateAuthUser(
  id: number,
  data: {
    name?: string;
    username?: string;
    password?: string;
    role?: "admin" | "user";
    eventId?: number | null;
    isActive?: boolean;
  }
) {
  const patch: Partial<typeof authUsers.$inferInsert> = {};

  if (data.name !== undefined) patch.name = data.name;
  if (data.username !== undefined) patch.username = data.username;
  if (data.role !== undefined) patch.role = data.role;
  if (data.eventId !== undefined) patch.eventId = data.eventId;
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  if (data.password && data.password.trim()) {
    patch.passwordHash = await bcrypt.hash(data.password, 12);
  }

  const [updated] = await db
    .update(authUsers)
    .set(patch)
    .where(eq(authUsers.id, id))
    .returning();

  return updated;
}

export async function deleteAuthUser(id: number) {
  await db.delete(authUsers).where(eq(authUsers.id, id));
}

export async function verifyLogin(username: string, password: string) {
  const user = await getUserByUsername(username);

  if (!user || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) return null;

  return user;
}

export async function assertUserCanAccessEvent(data: {
  userId: number;
  role: string;
  eventId: number;
}) {
  if (data.role === "admin") return true;

  const [user] = await db
    .select()
    .from(authUsers)
    .where(
      and(
        eq(authUsers.id, data.userId),
        eq(authUsers.eventId, data.eventId)
      )
    )
    .limit(1);

  return Boolean(user);
}