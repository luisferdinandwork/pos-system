// app/api/export/transactions/route.ts
import { NextResponse } from "next/server";
import { buildTransactionExcel } from "@/lib/export-excel";

export async function GET() {
  const data = await buildTransactionExcel();
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="transactions-${Date.now()}.xlsx"`,
    },
  });
}