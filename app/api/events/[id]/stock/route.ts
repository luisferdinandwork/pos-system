// app/api/events/[id]/stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addStockEntry,
  assertEventItemBelongsToEvent,
  getItemsWithStockForEvent,
} from "@/lib/stock";

type StockSource = "manual" | "import" | "sale";

function isStockSource(value: unknown): value is StockSource {
  return value === "manual" || value === "import" || value === "sale";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID" },
        { status: 400 }
      );
    }

    const items = await getItemsWithStockForEvent(eventId);

    return NextResponse.json(items);
  } catch (error) {
    console.error("[EventStockRoute] Failed to load stock items:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load stock items",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json(
        { error: "Invalid event ID" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const eventItemId = Number(body.eventItemId);
    const quantity = Number(body.quantity);
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : "Manual adjustment";

    const source: StockSource = isStockSource(body.source)
      ? body.source
      : "manual";

    if (!Number.isFinite(eventItemId)) {
      return NextResponse.json(
        { error: "eventItemId is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(quantity) || quantity === 0) {
      return NextResponse.json(
        { error: "quantity is required and must not be zero" },
        { status: 400 }
      );
    }

    await assertEventItemBelongsToEvent(eventId, eventItemId);

    const entry = await addStockEntry(
      eventItemId,
      quantity,
      note,
      source
    );

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("[EventStockRoute] Failed to add stock entry:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to add stock entry",
      },
      { status: 500 }
    );
  }
}