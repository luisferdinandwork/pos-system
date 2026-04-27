// app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import { getTodayStats, getRecentTransactions } from "@/lib/transactions";

export async function GET() {
  const [stats, recent] = await Promise.all([
    getTodayStats(),
    getRecentTransactions(),
  ]);
  return NextResponse.json({ stats, recent });
}