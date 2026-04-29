// app/api/local/events/[id]/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  createLocalTransaction,
  getLocalTransactionsByEvent,
  makeLocalClientTxnId,
} from "@/lib/local-pos";

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

    const txns = await getLocalTransactionsByEvent(eventId);

    return NextResponse.json(txns);
  } catch (error) {
    console.error("[LocalTransactionsRoute] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load local transactions",
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

    const clientTxnId =
      body.clientTxnId || makeLocalClientTxnId(eventId);

    const txn = await createLocalTransaction({
      ...body,
      clientTxnId,
      eventId,
      createdAt: body.createdAt ?? new Date().toISOString(),
    });

    return NextResponse.json(txn, { status: 201 });
  } catch (error) {
    console.error("[LocalTransactionsRoute] Failed to create:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save local transaction",
      },
      { status: 500 }
    );
  }
}