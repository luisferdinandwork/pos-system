// app/api/events/[id]/users/route.ts
import { NextResponse } from "next/server";
import {
  assignUserToEvent,
  createAuthUser,
  getAssignableUsersForEvent,
  getEventUsers,
  setEventUserAssignmentActive,
  unassignUserFromEvent,
} from "@/lib/auth-users";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Compatible response behavior:
 *
 * 1. Cashier/session pages:
 *    GET /api/events/[id]/users
 *    -> returns EventUser[]
 *
 * 2. Event detail Users tab:
 *    GET /api/events/[id]/users?includeAvailable=true
 *    -> returns { users: EventUser[], availableUsers: EventUser[] }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = parseId(id);

  if (!eventId) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const includeAvailable =
    url.searchParams.get("includeAvailable") === "true" ||
    url.searchParams.get("mode") === "manage";

  const users = await getEventUsers(eventId);

  if (!includeAvailable) {
    return NextResponse.json(users);
  }

  const availableUsers = await getAssignableUsersForEvent(eventId);

  return NextResponse.json({
    users,
    availableUsers,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = parseId(id);

  if (!eventId) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const existingUserId = parseId(body.existingUserId);

    if (existingUserId) {
      const assignment = await assignUserToEvent(existingUserId, eventId);
      return NextResponse.json({ ok: true, assignment });
    }

    const user = await createAuthUser({
      name: body.name,
      username: body.username,
      password: body.password,
      role: "user",
      eventId,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save user." },
      { status: 400 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = parseId(id);

  if (!eventId) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  const body = await request.json();
  const userId = parseId(body.id);

  if (!userId || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const assignment = await setEventUserAssignmentActive(
    userId,
    eventId,
    body.isActive
  );

  return NextResponse.json({ ok: true, assignment });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = parseId(id);

  if (!eventId) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const userId = parseId(url.searchParams.get("id"));

  if (!userId) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  await unassignUserFromEvent(userId, eventId);
  return NextResponse.json({ ok: true });
}
