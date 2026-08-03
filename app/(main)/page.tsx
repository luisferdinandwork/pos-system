// app/(main)/page.tsx
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import type { DashboardData } from "@/components/dashboard/types";
import { getAllEvents } from "@/lib/events";
import { getAllEventsStats } from "@/lib/transactions";
import { getInventorySummaryForAllEvents } from "@/lib/stock";

// Re-render on every request so stats are always live.
export const dynamic = "force-dynamic";

async function getDashboardData(): Promise<DashboardData> {
  try {
    const [events, statsRows, inventoryRows] = await Promise.all([
      getAllEvents(),
      getAllEventsStats(),
      getInventorySummaryForAllEvents(),
    ]);

    const statsMap = new Map(statsRows.map((s) => [Number(s.eventId), s]));
    const inventoryMap = new Map(
      inventoryRows.map((r) => [Number(r.eventId), r])
    );

    const data = events.map((ev) => {
      const s = statsMap.get(ev.id) ?? {
        txnCount: 0,
        revenue: 0,
        discount: 0,
        itemsSold: 0,
      };

      const v = inventoryMap.get(ev.id) ?? {
        totalItems: 0,
        outOfStock: 0,
        lowStock: 0,
        totalUnits: 0,
        soldUnits: 0,
        originalUnits: 0,
        totalAvailableUnits: 0,
        totalStockValue: 0,
        remainingValue: 0,
      };

      return {
        id: ev.id,
        name: ev.name,
        status: ev.status,
        location: ev.location,
        startDate: ev.startDate ? String(ev.startDate) : null,
        endDate: ev.endDate ? String(ev.endDate) : null,

        txnCount: Number(s.txnCount),
        revenue: Number(s.revenue),
        discount: Number(s.discount),
        itemsSold: Number(s.itemsSold),

        totalItems: Number(v.totalItems),
        outOfStock: Number(v.outOfStock),
        lowStock: Number(v.lowStock),

        totalUnits: Number(v.totalUnits),
        soldUnits: Number(v.soldUnits),
        originalUnits: Number(v.originalUnits),
        totalAvailableUnits: Number(v.totalAvailableUnits),

        totalStockValue: Number(v.totalStockValue),
        remainingValue: Number(v.remainingValue),
      };
    });

    const totalRevenue = data.reduce((s, e) => s + e.revenue, 0);
    const totalTxns = data.reduce((s, e) => s + e.txnCount, 0);
    const totalItemsSold = data.reduce((s, e) => s + e.itemsSold, 0);
    const totalDiscount = data.reduce((s, e) => s + e.discount, 0);
    const totalOriginalUnits = data.reduce((s, e) => s + e.originalUnits, 0);
    const totalStockValue = data.reduce((s, e) => s + e.totalStockValue, 0);
    const activeEvents = data.filter((e) => e.status === "active").length;

    return {
      data,
      totalRevenue,
      totalTxns,
      totalItemsSold,
      totalDiscount,
      totalOriginalUnits,
      totalStockValue,
      activeEvents,
    };
  } catch (err) {
    console.error("[DashboardPage] Failed to load dashboard data:", err);

    return {
      data: [],
      totalRevenue: 0,
      totalTxns: 0,
      totalItemsSold: 0,
      totalDiscount: 0,
      totalOriginalUnits: 0,
      totalStockValue: 0,
      activeEvents: 0,
    };
  }
}

export default async function DashboardPage() {
  const dash = await getDashboardData();
  return <DashboardShell dash={dash} />;
}