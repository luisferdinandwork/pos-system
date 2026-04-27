// app/api/export/stock/route.ts
import { NextResponse } from "next/server";
import { buildStockExcel } from "@/lib/export-excel";

export async function GET() {
  const data = await buildStockExcel();
  return new NextResponse(data, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="stock-template-${Date.now()}.xlsx"`,
    },
  });
}