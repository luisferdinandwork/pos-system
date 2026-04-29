// components/dashboard/EventCard.tsx
import Link from "next/link";
import { ArrowUpRight, Calendar, MapPin, Receipt, Wallet } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { EventPerformancePanel } from "./EventPerformancePanel";
import type { EventStat } from "./types";
import { STATUS_META } from "./types";

type Props = {
  ev: EventStat;
  highlight?: boolean;
};

export function EventCard({ ev, highlight = false }: Props) {
  const status =
    STATUS_META[ev.status as keyof typeof STATUS_META] ?? STATUS_META.draft;

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{
        background: "var(--card)",
        borderColor: highlight ? "rgba(22,163,74,0.25)" : "var(--border)",
        boxShadow: highlight ? "0 6px 24px rgba(22,163,74,0.08)" : "none",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="text-lg font-bold truncate"
              style={{ color: "var(--foreground)" }}
            >
              {ev.name}
            </h3>

            <span
              className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: status.bg, color: status.color }}
            >
              {status.label}
            </span>
          </div>

          <div
            className="flex flex-wrap items-center gap-3 mt-2 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            {ev.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {ev.location}
              </span>
            )}
            {ev.startDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={12} />
                {new Date(ev.startDate).toLocaleDateString("id-ID")}
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/events/${ev.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
          style={{
            borderColor: "var(--border)",
            color: "var(--foreground)",
          }}
        >
          Open <ArrowUpRight size={13} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-xl p-3 border"
          style={{ borderColor: "var(--brand-orange)", background: "rgba(255,101,63,0.1)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={14} style={{ color: "var(--brand-orange)" }} />
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Revenue
            </span>
          </div>
          <p className="text-sm font-black" style={{ color: "var(--foreground)" }}>
            {formatRupiah(ev.revenue)}
          </p>
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            stock value {formatRupiah(ev.totalStockValue)}
          </p>
        </div>

        <div
          className="rounded-xl p-3 border"
          style={{ borderColor: "rgba(124,58,237)", background: "rgba(124,58,237,0.1)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Receipt size={14} style={{ color: "#7c3aed" }} />
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Transactions
            </span>
          </div>
          <p className="text-sm font-black" style={{ color: "var(--foreground)" }}>
            {ev.txnCount.toLocaleString("id-ID")}
          </p>
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            {ev.itemsSold.toLocaleString("id-ID")} units sold
          </p>
        </div>
      </div>

      <EventPerformancePanel ev={ev} />

      <div className="grid grid-cols-3 gap-3 text-center">
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            Sold
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
            {ev.itemsSold.toLocaleString("id-ID")}
          </p>
        </div>

        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            Remaining
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
            {ev.totalUnits.toLocaleString("id-ID")}
          </p>
        </div>

        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            Discount
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
            {formatRupiah(ev.discount)}
          </p>
        </div>
      </div>
    </div>
  );
}