// components/dashboard/EventPerformancePanel.tsx
import { formatRupiah } from "@/lib/utils";
import type { EventStat } from "./types";
import {
  getDiscountPct, getEventHealthLabel,
  getRemainingPct, getRevenuePct, getSellThroughPct,
} from "./helpers";

function Bar({ label, helper, percent, color }: {
  label: string; helper: string; percent: number; color: string;
}) {
  const pct = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{label}</span>
        <span className="text-xs font-black" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{helper}</p>
    </div>
  );
}

export function EventPerformancePanel({ ev }: { ev: EventStat }) {
  const sellPct     = getSellThroughPct(ev);
  const revenuePct  = getRevenuePct(ev);
  const remainPct   = getRemainingPct(ev);
  const discPct     = getDiscountPct(ev);
  const health      = getEventHealthLabel(ev);

  return (
    <div className="rounded-2xl border p-4 space-y-4" style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold" style={{ color: "var(--foreground)" }}>Performa Event</p>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{ background: health.bg, color: health.color }}>{health.label}</span>
      </div>
      <div className="space-y-3.5">
        <Bar label="Unit Terjual"     helper={`${ev.itemsSold.toLocaleString("id-ID")} dari ${ev.originalUnits.toLocaleString("id-ID")} unit`}  percent={sellPct}    color="#7c3aed" />
        <Bar label="Pendapatan"       helper={`${formatRupiah(ev.revenue)} dari ${formatRupiah(ev.totalStockValue)}`}                             percent={revenuePct}  color="var(--brand-orange)" />
        <Bar label="Sisa Stok"        helper={`${ev.totalUnits.toLocaleString("id-ID")} unit tersisa`}                                           percent={remainPct}   color="#0369a1" />
        <Bar label="Rasio Diskon"     helper={`${formatRupiah(ev.discount)} total diskon diberikan`}                                             percent={discPct}     color="#16a34a" />
      </div>
    </div>
  );
}