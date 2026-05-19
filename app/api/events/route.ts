// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  type CreateEventInput,
  type UpdateEventInput,
} from "@/lib/events";

function toDateOnly(val: unknown): Date | null {
  if (val == null) return null;

  const raw = String(val).trim();
  if (!raw) return null;

  // Accepts "YYYY-MM-DD" from the page.
  // Uses noon to avoid timezone shifting the date backwards.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNullableString(val: unknown): string | null {
  if (val == null) return null;
  const raw = String(val).trim();
  return raw || null;
}

function toOptionalString(val: unknown): string | undefined {
  if (val === undefined) return undefined;
  const raw = String(val ?? "").trim();
  return raw || undefined;
}

function parseCreateEventBody(body: Record<string, unknown>): CreateEventInput {
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();

  if (!/^\d{4}$/.test(code)) {
    throw new Error("Event code must be exactly 4 digits.");
  }

  if (!name) {
    throw new Error("Event name is required.");
  }

  return {
    code,
    name,
    verifierCode: toNullableString(body.verifierCode),
    location: toNullableString(body.location),
    description: toNullableString(body.description),
    status: toNullableString(body.status) ?? "draft",
    startDate: toDateOnly(body.startDate),
    endDate: toDateOnly(body.endDate),
  };
}

function parseUpdateEventBody(body: Record<string, unknown>): UpdateEventInput {
  const payload: UpdateEventInput = {};

  if (body.code !== undefined) {
    const code = String(body.code ?? "").trim();

    if (!/^\d{4}$/.test(code)) {
      throw new Error("Event code must be exactly 4 digits.");
    }

    payload.code = code;
  }

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();

    if (!name) {
      throw new Error("Event name is required.");
    }

    payload.name = name;
  }

  if (body.verifierCode !== undefined) {
    payload.verifierCode = toOptionalString(body.verifierCode);
  }

  if (body.location !== undefined) {
    payload.location = toNullableString(body.location);
  }

  if (body.description !== undefined) {
    payload.description = toNullableString(body.description);
  }

  if (body.status !== undefined) {
    payload.status = toNullableString(body.status) ?? "draft";
  }

  if (body.startDate !== undefined) {
    payload.startDate = toDateOnly(body.startDate);
  }

  if (body.endDate !== undefined) {
    payload.endDate = toDateOnly(body.endDate);
  }

  return payload;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getStatusFromError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();

  if (
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("must be") ||
    message.includes("already used")
  ) {
    return 400;
  }

  return 500;
}

export async function GET() {
  try {
    const rows = await getAllEvents();
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[EventsRoute GET] Failed:", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error, "Failed to load events"),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const payload = parseCreateEventBody(body);
    const event = await createEvent(payload);

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("[EventsRoute POST] Failed:", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error, "Failed to create event"),
      },
      { status: getStatusFromError(error) }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const eventId = Number(body.id);

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const payload = parseUpdateEventBody(body);
    const event = await updateEvent(eventId, payload);

    return NextResponse.json(event);
  } catch (error) {
    console.error("[EventsRoute PUT] Failed:", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error, "Failed to update event"),
      },
      { status: getStatusFromError(error) }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const eventId = Number(searchParams.get("id"));
    const forceLocalDelete = searchParams.get("forceLocalDelete") === "true";

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    /**
     * Important:
     * Import local POS only inside DELETE, so GET /api/events does not initialize
     * SQLite and does not fail because of local DB migration issues.
     */
    try {
      const { deleteLocalEventData } = await import("@/lib/local-pos");

      deleteLocalEventData(eventId, {
        force: forceLocalDelete,
      });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to delete local POS data");

      if (message.toLowerCase().includes("unsynced")) {
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
        error: getErrorMessage(error, "Failed to delete event"),
      },
      { status: 500 }
    );
  }
}