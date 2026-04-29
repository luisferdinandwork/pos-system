// components/dashboard/DashboardStats.tsx
import { DollarSign, ShoppingBag, Warehouse, Zap } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import type { DashboardData } from "./types";

type Props = { dash: DashboardData };

export function DashboardStats({ dash }: Props) {
  const totalRevenue = dash.totalRevenue ?? 0;
  const totalTxns = dash.totalTxns ?? 0;
  const totalItemsSold = dash.totalItemsSold ?? 0;
  const totalOriginalUnits = dash.totalOriginalUnits ?? 0;
  const totalStockValue = dash.totalStockValue ?? 0;
  const totalDiscount = dash.totalDiscount ?? 0;

  const soldPct =
    totalOriginalUnits > 0
      ? Math.round((totalItemsSold / totalOriginalUnits) * 100)
      : 0;

  const revenuePct =
    totalStockValue > 0
      ? Math.round((totalRevenue / totalStockValue) * 100)
      : 0;

  const stats = [
    { dot: "#ff653f", label: "Revenue", value: formatRupiah(totalRevenue),
      sub: `${totalTxns.toLocaleString("id-ID")} transactions · ${revenuePct}% realized` },
    { dot: "#7c3aed", label: "Units sold", value: totalItemsSold.toLocaleString("id-ID"),
      sub: `of ${totalOriginalUnits.toLocaleString("id-ID")} total · ${soldPct}% sell-through` },
    { dot: "#0369a1", label: "Stock value", value: formatRupiah(totalStockValue),
      sub: "based on net price" },
    { dot: "#16a34a", label: "Discounts", value: formatRupiah(totalDiscount),
      sub: "saved by customers" },
  ];

  return (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {stats.map(({ dot, label, value, sub }) => (
      <div key={label} className="rounded-2xl border p-4"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
          <p className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}>{label}</p>
        </div>
        <p className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{value}</p>
        <p className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>{sub}</p>
      </div>
    ))}
  </div>
);
}