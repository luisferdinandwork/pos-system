// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/lib/events";
import { deleteLocalEventData } from "@/lib/local-pos";

function toDate(val: string | null | undefined): Date | null {
  if (!val || val.trim() === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseEventBody(b: Record<string, unknown>) {
  return {
    name: b.name as string,
    location: (b.location as string) || null,
    description: (b.description as string) || null,
    status: (b.status as string) || "draft",
    startDate: toDate(b.startDate as string),
    endDate: toDate(b.endDate as string),
  };
}

export async function GET() {
  return NextResponse.json(await getAllEvents());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  return NextResponse.json(await createEvent(parseEventBody(b)), {
    status: 201,
  });
}

export async function PUT(req: NextRequest) {
  const b = await req.json();
  return NextResponse.json(await updateEvent(Number(b.id), parseEventBody(b)));
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const eventId = Number(searchParams.get("id"));
    const forceLocalDelete = searchParams.get("forceLocalDelete") === "true";

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID" },
        { status: 400 }
      );
    }

    /**
     * Delete local SQLite POS data first.
     * If it has unsynced sales, this will block deletion unless forceLocalDelete=true.
     */
    try {
      deleteLocalEventData(eventId, {
        force: forceLocalDelete,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete local POS data";

      if (message.includes("unsynced")) {
        return NextResponse.json(
          {
            error: message,
            code: "LOCAL_POS_HAS_UNSYNCED_SALES",
          },
          { status: 409 }
        );
      }

      console.warn("[EventsRoute DELETE] Local POS cleanup skipped:", error);
    }

    await deleteEvent(eventId);

    return NextResponse.json({
      success: true,
      deletedLocalPos: true,
    });
  } catch (error) {
    console.error("[EventsRoute DELETE] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete event",
      },
      { status: 500 }
    );
  }
}