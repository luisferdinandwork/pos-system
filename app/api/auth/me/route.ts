// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

function normalizeEventIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((eventId) => Number(eventId))
    .filter((eventId) => Number.isFinite(eventId) && eventId > 0);
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const eventIds = normalizeEventIds((session.user as any).eventIds);

  return NextResponse.json({
    id: session.user.id,
    name: session.user.name,
    username: session.user.username,
    role: session.user.role,
    eventId: session.user.eventId ?? eventIds[0] ?? null,
    eventIds,
  });
}
