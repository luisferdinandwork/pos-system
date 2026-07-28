// app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import { getAllEventsStats } from "@/lib/transactions";
import { getAllEvents } from "@/lib/events";
import { getInventorySummaryForAllEvents } from "@/lib/stock";

export async function GET() {
  try {
    const [events, statsRows, inventoryRows] = await Promise.all([
      getAllEvents(),
      getAllEventsStats(),
      getInventorySummaryForAllEvents(),
    ]);

    const statsMap = new Map(
      statsRows.map((row) => [Number(row.eventId), row])
    );

    const inventoryMap = new Map(
      inventoryRows.map((row) => [Number(row.eventId), row])
    );

    const data = events.map((event) => {
      const stats = statsMap.get(event.id) ?? {
        txnCount: 0,
        revenue: 0,
        discount: 0,
        itemsSold: 0,
      };

      const inventory = inventoryMap.get(event.id) ?? {
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
        id: event.id,
        name: event.name,
        status: event.status,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,

        txnCount: Number(stats.txnCount),
        revenue: Number(stats.revenue),
        discount: Number(stats.discount),
        itemsSold: Number(stats.itemsSold),

        totalItems: Number(inventory.totalItems),
        outOfStock: Number(inventory.outOfStock),
        lowStock: Number(inventory.lowStock),

        /**
         * Current remaining stock.
         */
        totalUnits: Number(inventory.totalUnits),

        /**
         * Units sold from transaction_items.
         */
        soldUnits: Number(inventory.soldUnits),

        /**
         * Existing field used by dashboard.
         * New meaning:
         * current remaining stock + sold units.
         */
        originalUnits: Number(inventory.originalUnits),

        /**
         * Clearer alias for originalUnits.
         */
        totalAvailableUnits: Number(inventory.totalAvailableUnits),

        totalStockValue: Number(inventory.totalStockValue),
        remainingValue: Number(inventory.remainingValue),
      };
    });

    const totalRevenue = data.reduce(
      (sum, event) => sum + Number(event.revenue),
      0
    );

    const totalTxns = data.reduce(
      (sum, event) => sum + Number(event.txnCount),
      0
    );

    const totalItemsSold = data.reduce(
      (sum, event) => sum + Number(event.itemsSold),
      0
    );

    const totalDiscount = data.reduce(
      (sum, event) => sum + Number(event.discount),
      0
    );

    const totalOriginalUnits = data.reduce(
      (sum, event) => sum + Number(event.originalUnits),
      0
    );

    const totalStockValue = data.reduce(
      (sum, event) => sum + Number(event.totalStockValue),
      0
    );

    const activeEvents = data.filter(
      (event) => event.status === "active"
    ).length;

    return NextResponse.json({
      data,
      totalRevenue,
      totalTxns,
      totalItemsSold,
      totalDiscount,
      totalOriginalUnits,
      totalStockValue,
      activeEvents,
    });
  } catch (error) {
    console.error("[DashboardRoute] Failed to load dashboard:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load dashboard",
      },
      { status: 500 }
    );
  }
}