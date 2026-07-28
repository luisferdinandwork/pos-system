// lib/auth-users.ts
import { db } from "@/lib/db";
import { authUserEvents, authUsers, events } from "@/lib/db/schema";
import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import bcrypt from "bcryptjs";

export type AuthUser = typeof authUsers.$inferSelect;

export type AuthUserEvent = {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
};

export type AuthUserWithEvents = AuthUser & {
  /**
   * Detailed event rows for the global User Management page.
   */
  events: AuthUserEvent[];

  /**
   * Simple event ids for auth/session/middleware/POS checks.
   */
  eventIds: number[];
};

export type EventUser = AuthUser & {
  assignmentId: number | null;
  assignmentActive: boolean;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeUsername(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function uniqueEventIds(ids: Array<number | string | null | undefined>) {
  return [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
}

/**
 * Existing function - kept.
 */
export async function getUserByUsername(
  username: string
): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.username, normalizeUsername(username)))
    .limit(1);

  return user ?? null;
}

/**
 * Existing function - kept.
 */
export async function getUserById(id: number): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, id))
    .limit(1);

  return user ?? null;
}

/**
 * New helper for multi-event cashiers.
 * Includes:
 * - legacy auth_users.event_id
 * - new auth_user_events active assignments
 *
 * Role-generic: works the same for "user" and "price_checker" — only
 * "admin" is special-cased (admins don't need event assignment).
 */
export async function getUserEventIds(userId: number): Promise<number[]> {
  const user = await getUserById(userId);
  if (!user || user.role === "admin") return [];

  const rows = await db
    .select({ eventId: authUserEvents.eventId })
    .from(authUserEvents)
    .where(
      and(
        eq(authUserEvents.userId, userId),
        eq(authUserEvents.isActive, true)
      )
    );

  return uniqueEventIds([
    user.eventId,
    ...rows.map((row) => row.eventId),
  ]);
}

/**
 * Alias added so newer auth/POS code can import this name,
 * while older code can still use getUserEventIds().
 */
export async function getEventIdsForUser(userId: number): Promise<number[]> {
  return getUserEventIds(userId);
}

/**
 * New helper for NextAuth login.
 * verifyLogin() returns this shape, but it still contains every AuthUser field,
 * so existing code that only reads id/name/role/eventId keeps working.
 */
export async function getUserWithEventsByUsername(
  username: string
): Promise<AuthUserWithEvents | null> {
  const user = await getUserByUsername(username);
  if (!user) return null;

  const eventIds = await getUserEventIds(user.id);

  return {
    ...user,
    eventIds,
    events: [],
  };
}

/**
 * New helper for the global User Management page.
 */
export async function getAllAuthUsersWithEvents(): Promise<
  AuthUserWithEvents[]
> {
  const users = await db
    .select()
    .from(authUsers)
    .orderBy(authUsers.name);

  if (users.length === 0) return [];

  const userIds = users.map((user) => user.id);

  const assignments = await db
    .select({
      userId: authUserEvents.userId,
      eventId: events.id,
      eventName: events.name,
      eventCode: events.code,
      isActive: authUserEvents.isActive,
    })
    .from(authUserEvents)
    .innerJoin(events, eq(events.id, authUserEvents.eventId))
    .where(inArray(authUserEvents.userId, userIds))
    .orderBy(events.name);

  const assignmentsByUser = new Map<number, AuthUserEvent[]>();

  for (const row of assignments) {
    const list = assignmentsByUser.get(row.userId) ?? [];

    list.push({
      id: row.eventId,
      name: row.eventName,
      code: row.eventCode,
      isActive: row.isActive,
    });

    assignmentsByUser.set(row.userId, list);
  }

  return users.map((user) => {
    const assignedEvents = assignmentsByUser.get(user.id) ?? [];

    return {
      ...user,
      events: assignedEvents,
      eventIds: uniqueEventIds([
        user.eventId,
        ...assignedEvents
          .filter((event) => event.isActive)
          .map((event) => event.id),
      ]),
    };
  });
}

/**
 * New richer function for the Event Users tab.
 * It returns assigned users from the new join table and also includes old
 * legacy auth_users.event_id users.
 */
export async function getEventUsers(eventId: number): Promise<EventUser[]> {
  const assigned = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      username: authUsers.username,
      passwordHash: authUsers.passwordHash,
      role: authUsers.role,
      eventId: authUsers.eventId,
      isActive: authUsers.isActive,
      createdAt: authUsers.createdAt,
      assignmentId: authUserEvents.id,
      assignmentActive: authUserEvents.isActive,
    })
    .from(authUserEvents)
    .innerJoin(authUsers, eq(authUsers.id, authUserEvents.userId))
    .where(eq(authUserEvents.eventId, eventId))
    .orderBy(authUsers.name);

  const legacy = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.eventId, eventId))
    .orderBy(authUsers.name);

  const byId = new Map<number, EventUser>();

  for (const user of legacy) {
    byId.set(user.id, {
      ...user,
      assignmentId: null,
      assignmentActive: user.isActive,
    });
  }

  for (const user of assigned) {
    byId.set(user.id, user);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Existing function - kept.
 * Existing code imports getUsersByEvent(), so do not remove it.
 */
export async function getUsersByEvent(eventId: number): Promise<AuthUser[]> {
  const users = await getEventUsers(eventId);

  return users.map(({ assignmentId, assignmentActive, ...user }) => user);
}

/**
 * New helper for Event Users tab.
 * Returns active, unassigned users who CAN be assigned to an event —
 * both cashiers ("user") and price-checker-only accounts ("price_checker"),
 * since both role types are event-scoped. Admins are never assignable here.
 */
export async function getAssignableUsersForEvent(
  eventId: number
): Promise<AuthUser[]> {
  const current = await getEventUsers(eventId);
  const currentIds = current.map((user) => user.id);

  if (currentIds.length > 0) {
    return db
      .select()
      .from(authUsers)
      .where(
        and(
          inArray(authUsers.role, ["user", "price_checker"]),
          eq(authUsers.isActive, true),
          notInArray(authUsers.id, currentIds)
        )
      )
      .orderBy(authUsers.name);
  }

  return db
    .select()
    .from(authUsers)
    .where(
      and(
        inArray(authUsers.role, ["user", "price_checker"]),
        eq(authUsers.isActive, true)
      )
    )
    .orderBy(authUsers.name);
}

/**
 * Existing function - kept.
 * Added eventIds support without removing eventId support.
 * Role type widened to include "price_checker" — a new role that, like
 * "user", is event-scoped (needs eventId/eventIds) but has no access
 * beyond the /price-check page (enforced in middleware.ts).
 */
export async function createAuthUser(data: {
  name: string;
  username: string;
  password: string;
  role: "admin" | "user" | "price_checker";
  eventId?: number | null;
  eventIds?: number[];
}) {
  const name = normalizeText(data.name);
  const username = normalizeUsername(data.username);
  const password = String(data.password ?? "");

  if (!name) throw new Error("Name is required.");
  if (!username) throw new Error("Username is required.");
  if (!password.trim()) throw new Error("Password is required.");

  const existing = await getUserByUsername(username);
  if (existing) throw new Error(`Username "${username}" is already used.`);

  const assignedEventIds = uniqueEventIds([
    data.eventId,
    ...(data.eventIds ?? []),
  ]);

  const passwordHash = await bcrypt.hash(password, 12);

  const [created] = await db
    .insert(authUsers)
    .values({
      name,
      username,
      passwordHash,
      role: data.role,
      /**
       * Keep this filled for old POS/session code.
       * New code should read auth_user_events through getUserEventIds().
       */
      eventId:
        data.role === "admin"
          ? null
          : assignedEventIds[0] ?? data.eventId ?? null,
      isActive: true,
    })
    .returning();

  if (created.role !== "admin" && assignedEventIds.length > 0) {
    await db
      .insert(authUserEvents)
      .values(
        assignedEventIds.map((eventId) => ({
          userId: created.id,
          eventId,
          isActive: true,
        }))
      )
      .onConflictDoUpdate({
        target: [authUserEvents.userId, authUserEvents.eventId],
        set: { isActive: true },
      });
  }

  return created;
}

/**
 * Existing function - kept.
 * Added eventIds support without removing eventId support.
 * Role type widened to include "price_checker".
 */
export async function updateAuthUser(
  id: number,
  data: {
    name?: string;
    username?: string;
    password?: string;
    role?: "admin" | "user" | "price_checker";
    eventId?: number | null;
    eventIds?: number[];
    isActive?: boolean;
  }
) {
  const existingUser = await getUserById(id);
  if (!existingUser) throw new Error("User not found.");

  const nextRole = data.role ?? existingUser.role;
  const assignedEventIds =
    data.eventIds !== undefined
      ? uniqueEventIds(data.eventIds)
      : data.eventId !== undefined
        ? uniqueEventIds([data.eventId])
        : null;

  const patch: Partial<typeof authUsers.$inferInsert> = {};

  if (data.name !== undefined) {
    const name = normalizeText(data.name);
    if (!name) throw new Error("Name is required.");
    patch.name = name;
  }

  if (data.username !== undefined) {
    const username = normalizeUsername(data.username);
    if (!username) throw new Error("Username is required.");

    const existing = await getUserByUsername(username);
    if (existing && existing.id !== id) {
      throw new Error(`Username "${username}" is already used.`);
    }

    patch.username = username;
  }

  if (data.role !== undefined) patch.role = data.role;
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  if (nextRole === "admin") {
    patch.eventId = null;
  } else if (assignedEventIds !== null) {
    patch.eventId = assignedEventIds[0] ?? null;
  } else if (data.eventId !== undefined) {
    patch.eventId = data.eventId;
  }

  if (data.password && data.password.trim()) {
    patch.passwordHash = await bcrypt.hash(data.password, 12);
  }

  const [updated] = await db
    .update(authUsers)
    .set(patch)
    .where(eq(authUsers.id, id))
    .returning();

  if (!updated) throw new Error("User not found.");

  /**
   * Keep assignment table in sync only when role/event assignment is edited.
   * This avoids accidentally removing assignments when editing only name/password/status.
   */
  if (nextRole === "admin") {
    await db.delete(authUserEvents).where(eq(authUserEvents.userId, id));
  } else if (assignedEventIds !== null) {
    await db.delete(authUserEvents).where(eq(authUserEvents.userId, id));

    if (assignedEventIds.length > 0) {
      await db
        .insert(authUserEvents)
        .values(
          assignedEventIds.map((eventId) => ({
            userId: id,
            eventId,
            isActive: true,
          }))
        )
        .onConflictDoUpdate({
          target: [authUserEvents.userId, authUserEvents.eventId],
          set: { isActive: true },
        });
    }
  }

  return updated;
}

/**
 * Existing function - kept.
 */
export async function deleteAuthUser(id: number) {
  await db.delete(authUsers).where(eq(authUsers.id, id));
}

/**
 * New function, but accepts BOTH call styles:
 *
 * assignUserToEvent(userId, eventId)
 * assignUserToEvent({ userId, eventId })
 */
export async function assignUserToEvent(
  userIdOrData: number | { userId: number; eventId: number },
  maybeEventId?: number
) {
  const userId =
    typeof userIdOrData === "number" ? userIdOrData : userIdOrData.userId;

  const eventId =
    typeof userIdOrData === "number" ? maybeEventId : userIdOrData.eventId;

  if (!eventId) throw new Error("Event id is required.");

  const user = await getUserById(userId);

  if (!user) throw new Error("User not found.");
  if (user.role === "admin") {
    throw new Error("Admin users do not need event assignment.");
  }

  const [assignment] = await db
    .insert(authUserEvents)
    .values({ userId, eventId, isActive: true })
    .onConflictDoUpdate({
      target: [authUserEvents.userId, authUserEvents.eventId],
      set: { isActive: true },
    })
    .returning();

  /**
   * Legacy fallback for code that still reads auth_users.event_id.
   * Do not overwrite it if the user already has one.
   */
  if (user.eventId === null) {
    await db.update(authUsers).set({ eventId }).where(eq(authUsers.id, userId));
  }

  return assignment;
}

/**
 * New helper for active/inactive assignment toggles.
 */
export async function setEventUserAssignmentActive(
  userId: number,
  eventId: number,
  isActive: boolean
) {
  const [assignment] = await db
    .update(authUserEvents)
    .set({ isActive })
    .where(
      and(
        eq(authUserEvents.userId, userId),
        eq(authUserEvents.eventId, eventId)
      )
    )
    .returning();

  if (assignment) return assignment;

  /**
   * If this is still a legacy-only user, create the assignment first
   * instead of disabling the whole user account.
   */
  const user = await getUserById(userId);
  if (user?.eventId === eventId) {
    const row = await assignUserToEvent(userId, eventId);

    if (!isActive) {
      const [updated] = await db
        .update(authUserEvents)
        .set({ isActive })
        .where(eq(authUserEvents.id, row.id))
        .returning();

      return updated;
    }

    return row;
  }

  return null;
}

/**
 * New function, but accepts BOTH call styles:
 *
 * unassignUserFromEvent(userId, eventId)
 * unassignUserFromEvent({ userId, eventId })
 */
export async function unassignUserFromEvent(
  userIdOrData: number | { userId: number; eventId: number },
  maybeEventId?: number
) {
  const userId =
    typeof userIdOrData === "number" ? userIdOrData : userIdOrData.userId;

  const eventId =
    typeof userIdOrData === "number" ? maybeEventId : userIdOrData.eventId;

  if (!eventId) throw new Error("Event id is required.");

  await db
    .delete(authUserEvents)
    .where(
      and(
        eq(authUserEvents.userId, userId),
        eq(authUserEvents.eventId, eventId)
      )
    );

  const user = await getUserById(userId);

  if (user?.eventId === eventId) {
    const [nextAssignment] = await db
      .select({ eventId: authUserEvents.eventId })
      .from(authUserEvents)
      .where(
        and(
          eq(authUserEvents.userId, userId),
          eq(authUserEvents.isActive, true)
        )
      )
      .limit(1);

    await db
      .update(authUsers)
      .set({ eventId: nextAssignment?.eventId ?? null })
      .where(eq(authUsers.id, userId));
  }
}

/**
 * Existing function - kept.
 * Now returns the user with eventIds so auth.ts can add it to token/session.
 * Existing callers that only need AuthUser fields still work.
 */
export async function verifyLogin(username: string, password: string) {
  const user = await getUserWithEventsByUsername(username);

  if (!user || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) return null;

  return user;
}

/**
 * Existing function - kept.
 * Now supports both legacy auth_users.event_id and new auth_user_events.
 * Role-generic: only "admin" is special-cased.
 */
export async function assertUserCanAccessEvent(data: {
  userId: number;
  role: string;
  eventId: number;
}) {
  if (data.role === "admin") return true;

  const [row] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .leftJoin(
      authUserEvents,
      and(
        eq(authUserEvents.userId, authUsers.id),
        eq(authUserEvents.eventId, data.eventId)
      )
    )
    .where(
      and(
        eq(authUsers.id, data.userId),
        eq(authUsers.isActive, true),
        or(
          eq(authUsers.eventId, data.eventId),
          and(
            eq(authUserEvents.eventId, data.eventId),
            eq(authUserEvents.isActive, true)
          )
        )
      )
    )
    .limit(1);

  return Boolean(row);
}

/**
 * New helper for routes/actions that need to validate multiple events.
 */
export async function assertUserCanAccessAllEvents(data: {
  userId: number;
  role: string;
  eventIds: number[];
}) {
  if (data.role === "admin") return true;

  const allowedEventIds = await getUserEventIds(data.userId);
  const allowed = new Set(allowedEventIds);

  return data.eventIds.every((eventId) => allowed.has(Number(eventId)));
}