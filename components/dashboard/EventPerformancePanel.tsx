// components/dashboard/EventPerformancePanel.tsx
import { formatRupiah } from "@/lib/utils";
import type { EventStat } from "./types";
import { MetricBar } from "./MetricBar";
import {
  getDiscountPct,
  getEventHealthLabel,
  getRemainingPct,
  getRevenuePct,
  getSellThroughPct,
} from "./helpers";

type Props = {
  ev: EventStat;
};

export function EventPerformancePanel({ ev }: Props) {
  const sellPct = getSellThroughPct(ev);
  const revenuePct = getRevenuePct(ev);
  const remainingPct = getRemainingPct(ev);
  const discountPct = getDiscountPct(ev);
  const health = getEventHealthLabel(ev);

  return (
    <div
      className="rounded-2xl border p-4 space-y-4"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
            Performance
          </h3>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Quick event report snapshot
          </p>
        </div>

        <span
          className="px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: health.bg, color: health.color }}
        >
          {health.label}
        </span>
      </div>

      <div className="space-y-3">
        <MetricBar
          label="Sell-through"
          value={`${sellPct}%`}
          helper={`${ev.itemsSold.toLocaleString("id-ID")} sold of ${ev.originalUnits.toLocaleString("id-ID")} total`}
          percent={sellPct}
          color="#7c3aed"
        />

        <MetricBar
          label="Revenue realization"
          value={`${revenuePct}%`}
          helper={`${formatRupiah(ev.revenue)} of ${formatRupiah(ev.totalStockValue)}`}
          percent={revenuePct}
          color="var(--brand-orange)"
        />

        <MetricBar
          label="Remaining stock"
          value={`${remainingPct}%`}
          helper={`${ev.totalUnits.toLocaleString("id-ID")} units remaining`}
          percent={remainingPct}
          color="#0369a1"
        />

        <MetricBar
          label="Discount ratio"
          value={`${discountPct}%`}
          helper={`${formatRupiah(ev.discount)} total discount`}
          percent={discountPct}
          color="#16a34a"
        />
      </div>
    </div>
  );
}