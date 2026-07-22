import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { authOptions } from "@/lib/auth";
import { assertUserCanAccessEvent } from "@/lib/auth-users";
import { db } from "@/lib/db";
import { eventItems, events } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["admin", "user", "price_checker"]);

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { eventId: rawEventId } = await params;

    const eventId = Number(rawEventId);
    const userId = Number(session.user.id);
    const role = String(session.user.role ?? "");

    if (!Number.isInteger(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "Invalid event id." },
        { status: 400 }
      );
    }

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

    const [existingEvent] = await db
      .select({
        id: events.id,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!existingEvent) {
      return NextResponse.json(
        { error: "Event not found." },
        { status: 404 }
      );
    }

    if (role !== "admin") {
      const canAccess = await assertUserCanAccessEvent({
        userId,
        role,
        eventId,
      });

      if (!canAccess) {
        return NextResponse.json(
          {
            error:
              "You are not assigned to this event or the assignment is inactive.",
          },
          { status: 403 }
        );
      }
    }

    const rows = await db
      .select({
        id: eventItems.id,
        itemId: eventItems.itemId,
        variantCode: eventItems.variantCode,
        name: eventItems.name,
        color: eventItems.color,
        unit: eventItems.unit,
        netPrice: eventItems.netPrice,
        retailPrice: eventItems.retailPrice,
        stock: eventItems.stock,
      })
      .from(eventItems)
      .where(
        and(
          eq(eventItems.eventId, eventId)
        )
      )
      .orderBy(
        asc(eventItems.name),
        asc(eventItems.itemId)
      );

    return NextResponse.json(rows);
  } catch (error) {
    console.error(
      "[GET /api/price-check/events/[eventId]/items]",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load event items.",
      },
      { status: 500 }
    );
  }
}