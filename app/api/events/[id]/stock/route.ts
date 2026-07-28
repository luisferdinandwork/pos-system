// app/api/events/[id]/stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  addStockTransaction,
  assertEventItemBelongsToEvent,
  getItemsWithStockForEvent,
  type StockTransactionTypeCode,
} from "@/lib/stock";

const ALLOWED_TYPE_CODES: StockTransactionTypeCode[] = [
  "transfer_in",
  "transfer_out",
  "adjustment",
  // "sale" is intentionally excluded — sales go through the transactions route
];

function isAllowedTypeCode(value: unknown): value is StockTransactionTypeCode {
  return ALLOWED_TYPE_CODES.includes(value as StockTransactionTypeCode);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const items = await getItemsWithStockForEvent(eventId);
    return NextResponse.json(items);
  } catch (error) {
    console.error("[EventStockRoute GET] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load stock items" },
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
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const body = await req.json();

    const eventItemId = Number(body.eventItemId);
    const quantity    = Number(body.quantity);
    const note        = typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : undefined;

    // Accept typeCode directly.
    // Fall back to mapping the old "source" field so Excel import still works.
    let typeCode: StockTransactionTypeCode;

    if (isAllowedTypeCode(body.typeCode)) {
      typeCode = body.typeCode;
    } else if (body.source === "import") {
      typeCode = "transfer_in";
    } else {
      typeCode = "adjustment";
    }

    if (!Number.isFinite(eventItemId)) {
      return NextResponse.json({ error: "eventItemId is required" }, { status: 400 });
    }

    if (!Number.isFinite(quantity) || quantity === 0) {
      return NextResponse.json(
        { error: "quantity is required and must not be zero" },
        { status: 400 }
      );
    }

    await assertEventItemBelongsToEvent(eventId, eventItemId);

    const entry = await addStockTransaction({
      eventItemId,
      typeCode,
      quantity,
      note: note ?? null,
      referenceType: body.source ?? typeCode,
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("[EventStockRoute POST] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add stock entry" },
      { status: 500 }
    );
  }
}