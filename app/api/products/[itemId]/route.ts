// app/api/products/[itemId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getProductByItemId } from "@/lib/products";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const product = await getProductByItemId(itemId);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}