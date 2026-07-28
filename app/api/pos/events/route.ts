// app/api/pos/events/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { and, asc, eq, inArray } from "drizzle-orm";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "admin") {
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.status, "active"))
      .orderBy(asc(events.startDate), asc(events.name));

    return NextResponse.json(rows);
  }

  const eventIds = normalizeEventIds((session.user as any).eventIds);

  if (eventIds.length === 0) {
    return NextResponse.json([]);
  }

  const rows = await db
    .select()
    .from(events)
    .where(and(inArray(events.id, eventIds), eq(events.status, "active")))
    .orderBy(asc(events.startDate), asc(events.name));

  return NextResponse.json(rows);
}
