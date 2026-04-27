// app/api/events/[id]/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getEventItems,
  addEventItem,
  removeEventItem,
  updateEventItem,
} from "@/lib/events";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(await getEventItems(Number(id)));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const b      = await req.json();

  const result = await addEventItem(Number(id), {
    itemId:      String(b.itemId),
    baseItemNo:  b.baseItemNo  ? String(b.baseItemNo)  : null,
    name:        String(b.name),
    color:       b.color       ? String(b.color)       : null,
    variantCode: b.variantCode ? String(b.variantCode) : null,
    unit:        b.unit        ? String(b.unit)        : "PCS",
    netPrice:    String(b.netPrice),
    retailPrice: String(b.retailPrice || b.netPrice),
    stock:       Number(b.stock ?? 0),
  });

  return NextResponse.json(result, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const b = await req.json();
  return NextResponse.json(
    await updateEventItem(Number(b.id), {
      ...(b.name        !== undefined && { name:        String(b.name)        }),
      ...(b.retailPrice !== undefined && { retailPrice: String(b.retailPrice) }),
      ...(b.netPrice    !== undefined && { netPrice:    String(b.netPrice)    }),
      ...(b.stock       !== undefined && { stock:       Number(b.stock)       }),
      ...(b.color       !== undefined && { color:       b.color || null       }),
      ...(b.variantCode !== undefined && { variantCode: b.variantCode || null }),
      ...(b.unit        !== undefined && { unit:        b.unit || "PCS"       }),
    })
  );
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  await removeEventItem(Number(searchParams.get("id")));
  return NextResponse.json({ success: true });
}