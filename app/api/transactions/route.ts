// app/api/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createTransaction, getAllTransactions } from "@/lib/transactions";

export async function GET() {
  const data = await getAllTransactions();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const txn = await createTransaction(body);
  return NextResponse.json(txn, { status: 201 });
}