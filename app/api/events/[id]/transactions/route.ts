// app/api/events/[id]/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTransactionsByEvent, getTransactionItems, createTransaction } from "@/lib/transactions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const txns = await getTransactionsByEvent(Number(id));
  return NextResponse.json(txns);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const txn = await createTransaction({ ...body, eventId: Number(id) });
  return NextResponse.json(txn, { status: 201 });
}