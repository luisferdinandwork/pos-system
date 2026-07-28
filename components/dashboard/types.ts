// components/dashboard/types.ts

export type EventStat = {
  id: number;
  name: string;
  status: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;

  txnCount: number;
  revenue: number;
  discount: number;
  itemsSold: number;

  /**
   * Current remaining stock.
   */
  totalUnits: number;

  /**
   * Sold units from transactions.
   */
  soldUnits: number;

  /**
   * Existing dashboard field.
   * New meaning:
   * current remaining stock + sold units.
   */
  originalUnits: number;

  /**
   * Clearer alias for originalUnits.
   */
  totalAvailableUnits: number;

  /**
   * Value of all units available for sale.
   */
  totalStockValue: number;

  /**
   * Remaining stock value.
   */
  remainingValue: number;

  /**
   * Optional extra inventory indicators.
   */
  totalItems?: number;
  outOfStock?: number;
  lowStock?: number;
};

export type DashboardData = {
  data: EventStat[];
  totalRevenue: number;
  totalTxns: number;
  totalItemsSold: number;
  totalDiscount: number;
  totalOriginalUnits: number;
  totalStockValue: number;
  activeEvents: number;
};

export const STATUS_META = {
  draft: {
    label: "Draft",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
    dot: "#6b7280",
  },
  active: {
    label: "Active",
    color: "#16a34a",
    bg: "rgba(22,163,74,0.1)",
    dot: "#16a34a",
  },
  closed: {
    label: "Closed",
    color: "#dc2626",
    bg: "rgba(220,38,38,0.1)",
    dot: "#dc2626",
  },
} as const;