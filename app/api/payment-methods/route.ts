// app/api/payment-methods/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  togglePaymentMethod,
  getActivePaymentMethods,
} from "@/lib/payment-methods";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";
  const data = activeOnly
    ? await getActivePaymentMethods()
    : await getAllPaymentMethods();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const method = await createPaymentMethod({
    name: b.name,
    type: b.type,
    provider: b.provider || null,
    accountInfo: b.accountInfo || null,
    isActive: b.isActive ?? true,
    sortOrder: Number(b.sortOrder ?? 0),
  });
  return NextResponse.json(method, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const b = await req.json();

  // Toggle shortcut: { id, isActive }
  if (typeof b.isActive === "boolean" && Object.keys(b).length === 2) {
    return NextResponse.json(await togglePaymentMethod(b.id, b.isActive));
  }

  const updated = await updatePaymentMethod(b.id, {
    name: b.name,
    type: b.type,
    provider: b.provider || null,
    accountInfo: b.accountInfo || null,
    isActive: b.isActive ?? true,
    sortOrder: Number(b.sortOrder ?? 0),
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  await deletePaymentMethod(Number(searchParams.get("id")));
  return NextResponse.json({ success: true });
}