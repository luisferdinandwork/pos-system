// app/api/stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getProductsWithStock, getStockHistory, addStockEntry } from "@/lib/stock";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  if (productId) {
    const history = await getStockHistory(Number(productId));
    return NextResponse.json(history);
  }

  const products = await getProductsWithStock();
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const entry = await addStockEntry(
    Number(body.productId),
    Number(body.quantity),
    body.note ?? "Manual restock",
    "manual"
  );
  return NextResponse.json(entry, { status: 201 });
}