// app/api/edc-machines/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAllEdcMachines, createEdcMachine,
  updateEdcMachine, deleteEdcMachine,
} from "@/lib/payment-methods";

export async function GET() {
  return NextResponse.json(await getAllEdcMachines());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.bankName || !b.label) return NextResponse.json({ error: "bankName and label are required" }, { status: 400 });
  const machine = await createEdcMachine({
    bankName:   String(b.bankName),
    label:      String(b.label),
    terminalId: b.terminalId ? String(b.terminalId) : null,
    isActive:   b.isActive !== undefined ? Boolean(b.isActive) : true,
    sortOrder:  Number(b.sortOrder ?? 0),
  });
  return NextResponse.json(machine, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const machine = await updateEdcMachine(Number(b.id), {
    ...(b.bankName   !== undefined && { bankName:   String(b.bankName)  }),
    ...(b.label      !== undefined && { label:      String(b.label)     }),
    ...(b.terminalId !== undefined && { terminalId: b.terminalId || null }),
    ...(b.isActive   !== undefined && { isActive:   Boolean(b.isActive) }),
    ...(b.sortOrder  !== undefined && { sortOrder:  Number(b.sortOrder)  }),
  });
  return NextResponse.json(machine);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteEdcMachine(id);
  return NextResponse.json({ success: true });
}