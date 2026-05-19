// app/api/local/events/[id]/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const { getLocalTransactionsByEvent } = await import("@/lib/local-pos");

    const txns = await getLocalTransactionsByEvent(eventId);

    return NextResponse.json(txns);
  } catch (error) {
    console.error("[LocalTransactionsRoute GET] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load local transactions.",
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

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json(
        { error: "Invalid event ID." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;

    const {
      createLocalTransaction,
      makeLocalClientTxnId,
      getLocalEventCode,
      generateLocalDisplayId,
    } = await import("@/lib/local-pos");

    const eventCode = getLocalEventCode(eventId);
    const createdAt = String(body.createdAt ?? new Date().toISOString());

    const clientTxnId =
      typeof body.clientTxnId === "string" && body.clientTxnId.trim()
        ? body.clientTxnId.trim()
        : makeLocalClientTxnId(eventCode);

    const displayId =
      typeof body.displayId === "string" && body.displayId.trim()
        ? body.displayId.trim()
        : generateLocalDisplayId(eventId, new Date(createdAt));

    const txn = await createLocalTransaction({
      ...(body as any),
      clientTxnId,
      displayId,
      eventId,
      createdAt,
    });

    return NextResponse.json(txn, { status: 201 });
  } catch (error) {
    console.error("[LocalTransactionsRoute POST] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save local transaction.",
      },
      { status: 500 }
    );
  }
}