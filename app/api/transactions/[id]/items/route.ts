// app/api/transactions/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTransactionItems } from "@/lib/transactions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const items = await getTransactionItems(Number(id));
  return NextResponse.json(items);
}