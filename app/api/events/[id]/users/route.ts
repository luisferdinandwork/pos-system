// app/api/events/[id]/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getEventUsers,
  getAssignableUsersForEvent,
  createAuthUser,
  assignUserToEvent,
  setEventUserAssignmentActive,
  unassignUserFromEvent,
} from "@/lib/auth-users";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Defense in depth: middleware already scopes non-admins to their assigned
 * events, but user-management endpoints deliberately go further and require
 * admin regardless — a cashier or price_checker assigned to this event
 * should never be able to create/reassign/remove accounts on it.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user || String((session.user as any).role) !== "admin") {
    return null;
  }

  return session;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventId = Number(id);

  if (!Number.isFinite(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const includeAvailable = searchParams.get("includeAvailable") === "true";

  try {
    const users = await getEventUsers(eventId);

    if (!includeAvailable) {
      return NextResponse.json(users);
    }

    const availableUsers = await getAssignableUsersForEvent(eventId);

    return NextResponse.json({ users, availableUsers });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to load event users") },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventId = Number(id);

  if (!Number.isFinite(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    // Path A: assign an existing user (cashier or price checker) to this event.
    if (body.existingUserId !== undefined) {
      const userId = Number(body.existingUserId);

      if (!Number.isFinite(userId) || userId <= 0) {
        return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
      }

      const assignment = await assignUserToEvent(userId, eventId);
      return NextResponse.json(assignment, { status: 201 });
    }

    // Path B: create a brand new user and assign to this event.
    const name = String(body.name ?? "").trim();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role === "price_checker" ? "price_checker" : "user";

    if (!name || !username || !password) {
      return NextResponse.json(
        { error: "Name, username, and password are required." },
        { status: 400 }
      );
    }

    const created = await createAuthUser({
      name,
      username,
      password,
      role,
      eventId,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to add user to event") },
      { status: 400 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventId = Number(id);

  if (!Number.isFinite(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = Number(body.id);
  const isActive = Boolean(body.isActive);

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  try {
    const updated = await setEventUserAssignmentActive(userId, eventId, isActive);

    if (!updated) {
      return NextResponse.json(
        { error: "User is not assigned to this event." },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to update assignment") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventId = Number(id);

  if (!Number.isFinite(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const userId = Number(searchParams.get("id"));

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  try {
    await unassignUserFromEvent(userId, eventId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to remove user from event") },
      { status: 500 }
    );
  }
}