// app/api/transactions/[id]/void/route.ts
import { NextRequest, NextResponse } from "next/server";
import { voidTransaction } from "@/lib/transactions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transactionId = Number(id);

    if (!Number.isFinite(transactionId) || transactionId <= 0) {
      return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await voidTransaction(transactionId, {
      voidedBy: body.voidedBy ? String(body.voidedBy) : null,
      voidReason: body.voidReason ? String(body.voidReason) : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[VoidTransactionRoute] Failed:", error);

    const message = error instanceof Error ? error.message : "Failed to void transaction.";
    const status =
      message.toLowerCase().includes("not found") ? 404 :
      message.toLowerCase().includes("already voided") ? 409 :
      message.toLowerCase().includes("cannot void") ? 409 :
      500;

    return NextResponse.json({ error: message }, { status });
  }
}