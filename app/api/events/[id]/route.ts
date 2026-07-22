// app/api/events/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getEventById,
  updateEvent,
  deleteEvent,
  type UpdateEventInput,
} from "@/lib/events";

function toDateOnly(val: unknown): Date | null {
  if (val == null) return null;

  const raw = String(val).trim();
  if (!raw) return null;

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

function parseUpdateEventBody(body: Record<string, unknown>): UpdateEventInput {
  const payload: UpdateEventInput = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      throw new Error("Event name is required.");
    }
    payload.name = name;
  }

  if (body.verifierCode !== undefined) {
    const raw = String(body.verifierCode ?? "").trim();
    payload.verifierCode = raw || undefined;
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const event = await getEventById(eventId);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error("[EventByIdRoute GET] Failed:", error);

    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to load event") },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const payload = parseUpdateEventBody(body);
    const event = await updateEvent(eventId, payload);

    return NextResponse.json(event);
  } catch (error) {
    console.error("[EventByIdRoute PUT] Failed:", error);

    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to update event") },
      { status: getStatusFromError(error) }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const forceLocalDelete = searchParams.get("forceLocalDelete") === "true";

    /**
     * Same pattern as the base /api/events DELETE route:
     * clean up local POS data first, but don't let a local cleanup
     * failure block the cloud delete unless it's specifically
     * because of unsynced sales.
     */
    try {
      const { deleteLocalEventData } = await import("@/lib/local-pos");

      deleteLocalEventData(eventId, { force: forceLocalDelete });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to delete local POS data");

      if (message.toLowerCase().includes("unsynced")) {
        return NextResponse.json(
          { error: message, code: "LOCAL_POS_HAS_UNSYNCED_SALES" },
          { status: 409 }
        );
      }

      console.warn("[EventByIdRoute DELETE] Local POS cleanup skipped:", error);
    }

    await deleteEvent(eventId);

    return NextResponse.json({ success: true, deletedLocalPos: true });
  } catch (error) {
    console.error("[EventByIdRoute DELETE] Failed:", error);

    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to delete event") },
      { status: 500 }
    );
  }
}