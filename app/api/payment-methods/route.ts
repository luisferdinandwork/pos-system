// app/api/payment-methods/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllPaymentMethods,
  getActivePaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from "@/lib/payment-methods";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";
  const methods = activeOnly
    ? await getActivePaymentMethods()
    : await getAllPaymentMethods();
  return NextResponse.json(methods);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const method = await createPaymentMethod({
    name:        String(b.name),
    type:        String(b.type),
    provider:    b.provider    ? String(b.provider)    : null,
    accountInfo: b.accountInfo ? String(b.accountInfo) : null,
    isActive:    b.isActive !== undefined ? Boolean(b.isActive) : true,
    sortOrder:   Number(b.sortOrder ?? 0),
  });
  return NextResponse.json(method, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const b = await req.json();
  const method = await updatePaymentMethod(Number(b.id), {
    ...(b.name        !== undefined && { name:        String(b.name)          }),
    ...(b.type        !== undefined && { type:        String(b.type)          }),
    ...(b.provider    !== undefined && { provider:    b.provider    || null   }),
    ...(b.accountInfo !== undefined && { accountInfo: b.accountInfo || null   }),
    ...(b.isActive    !== undefined && { isActive:    Boolean(b.isActive)     }),
    ...(b.sortOrder   !== undefined && { sortOrder:   Number(b.sortOrder)     }),
  });
  return NextResponse.json(method);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  await deletePaymentMethod(Number(searchParams.get("id")));
  return NextResponse.json({ success: true });
}