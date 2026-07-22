// app/api/local/events/[id]/transactions/[clientTxnId]/void/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clientTxnId: string }> }
) {
  try {
    const { clientTxnId } = await params;
    const decoded = decodeURIComponent(clientTxnId);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const { voidLocalTransaction } = await import("@/lib/local-pos");

    const result = await voidLocalTransaction(decoded, {
      voidedBy: body.voidedBy ? String(body.voidedBy) : null,
      voidReason: body.voidReason ? String(body.voidReason) : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[LocalVoidTransactionRoute] Failed:", error);

    const message =
      error instanceof Error ? error.message : "Failed to void local transaction.";
    const status = message.toLowerCase().includes("already voided")
      ? 409
      : message.toLowerCase().includes("not found")
        ? 404
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}