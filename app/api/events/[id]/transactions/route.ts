// app/api/events/[id]/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getTransactionsByEvent,
  createTransaction,
} from "@/lib/transactions";

export const runtime = "nodejs";

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

    const txns = await getTransactionsByEvent(eventId);

    return NextResponse.json(txns);
  } catch (error) {
    console.error("[EventTransactionsRoute GET] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load transactions",
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

    const txn = await createTransaction({
      ...body,
      eventId,
    });

    return NextResponse.json(txn, { status: 201 });
  } catch (error) {
    console.error("[EventTransactionsRoute POST] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create transaction",
      },
      { status: 500 }
    );
  }
}