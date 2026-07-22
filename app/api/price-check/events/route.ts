// app/api/price-check/events/route.ts
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";

import { authOptions } from "@/lib/auth";
import { getUserEventIds } from "@/lib/auth-users";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "user", "price_checker"]);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const userId = Number(session.user.id);
    const role = String(session.user.role ?? "");

    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "Invalid authenticated user." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json(
        { error: "You do not have access to price checking." },
        { status: 403 }
      );
    }

    const columns = {
      id: events.id,
      name: events.name,
      status: events.status,
      location: events.location,
    };

    if (role === "admin") {
      const rows = await db
        .select(columns)
        .from(events)
        .orderBy(asc(events.name));

      return NextResponse.json(rows);
    }

    const assignedEventIds = await getUserEventIds(userId);

    if (assignedEventIds.length === 0) {
      return NextResponse.json([]);
    }

    const rows = await db
      .select(columns)
      .from(events)
      .where(inArray(events.id, assignedEventIds))
      .orderBy(asc(events.name));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("[GET /api/price-check/events]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load price-check events.",
      },
      { status: 500 }
    );
  }
}