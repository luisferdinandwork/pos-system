// app/api/stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllItemsWithStock,
  getStockHistory,
  addStockEntry,
} from "@/lib/stock";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventItemId      = searchParams.get("eventItemId");

  if (eventItemId) {
    const history = await getStockHistory(Number(eventItemId));
    return NextResponse.json(history);
  }

  // Returns all event_items rows with their current stock level
  const data = await getAllItemsWithStock();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body  = await req.json();
  const entry = await addStockEntry(
    Number(body.eventItemId),        // renamed from eventProductId
    Number(body.quantity),
    body.note   ?? "Manual restock",
    body.source ?? "manual"
  );
  return NextResponse.json(entry, { status: 201 });
}