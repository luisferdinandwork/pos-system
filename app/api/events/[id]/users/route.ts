// app/api/events/[id]/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  createAuthUser,
  deleteAuthUser,
  getUsersByEvent,
  updateAuthUser,
} from "@/lib/auth-users";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "admin") {
    return false;
  }

  return true;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventId = Number(id);

  const users = await getUsersByEvent(eventId);

  return NextResponse.json(
    users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      eventId: user.eventId,
      isActive: user.isActive,
      createdAt: user.createdAt,
    }))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventId = Number(id);
  const body = await req.json();

  const user = await createAuthUser({
    name: String(body.name),
    username: String(body.username),
    password: String(body.password),
    role: "user",
    eventId,
  });

  return NextResponse.json(
    {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      eventId: user.eventId,
      isActive: user.isActive,
    },
    { status: 201 }
  );
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const user = await updateAuthUser(Number(body.id), {
    name: body.name !== undefined ? String(body.name) : undefined,
    username: body.username !== undefined ? String(body.username) : undefined,
    password: body.password ? String(body.password) : undefined,
    isActive:
      typeof body.isActive === "boolean" ? Boolean(body.isActive) : undefined,
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    eventId: user.eventId,
    isActive: user.isActive,
  });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));

  await deleteAuthUser(id);

  return NextResponse.json({ success: true });
}