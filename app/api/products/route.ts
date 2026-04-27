// app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAllProducts, createProduct, updateProduct, deleteProduct } from "@/lib/products";

export async function GET() {
  return NextResponse.json(await getAllProducts());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const product = await createProduct({
    itemId: b.itemId,
    baseItemNo: b.baseItemNo || null,
    name: b.name,
    color: b.color || null,
    variantCode: b.variantCode || null,
    unit: b.unit || "PCS",
    price: String(b.price),
    originalPrice: b.originalPrice ? String(b.originalPrice) : null,
    stock: Number(b.stock),
  });
  return NextResponse.json(product, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const b = await req.json();
  const updated = await updateProduct(b.id, {
    itemId: b.itemId,
    baseItemNo: b.baseItemNo || null,
    name: b.name,
    color: b.color || null,
    variantCode: b.variantCode || null,
    unit: b.unit || "PCS",
    price: String(b.price),
    originalPrice: b.originalPrice ? String(b.originalPrice) : null,
    stock: Number(b.stock),
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  await deleteProduct(Number(searchParams.get("id")));
  return NextResponse.json({ success: true });
}