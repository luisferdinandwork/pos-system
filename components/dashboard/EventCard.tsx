// components/dashboard/EventCard.tsx
import Link from "next/link";
import { ArrowUpRight, Calendar, MapPin } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { EventPerformancePanel } from "./EventPerformancePanel";
import type { EventStat } from "./types";
import { STATUS_META } from "./types";

export function EventCard({ ev, highlight = false }: { ev: EventStat; highlight?: boolean }) {
  const status = STATUS_META[ev.status as keyof typeof STATUS_META] ?? STATUS_META.draft;

  return (
    <div className="rounded-2xl border p-5 space-y-4"
      style={{
        background: "var(--card)",
        borderColor: highlight ? "rgba(22,163,74,0.3)" : "var(--border)",
        boxShadow: highlight ? "0 4px 20px rgba(22,163,74,0.07)" : "none",
      }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold truncate" style={{ color: "var(--foreground)" }}>{ev.name}</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
              style={{ background: status.bg, color: status.color }}>{status.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{ color: "var(--muted-foreground)" }}>
            {ev.location && <span className="flex items-center gap-1"><MapPin size={11} />{ev.location}</span>}
            {ev.startDate && <span className="flex items-center gap-1"><Calendar size={11} />{new Date(ev.startDate).toLocaleDateString("id-ID")}</span>}
          </div>
        </div>
        <Link href={`/events/${ev.id}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border flex-shrink-0 transition-all hover:bg-black/5"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
          Buka <ArrowUpRight size={12} />
        </Link>
      </div>

      {/* Key numbers — 2 cards only */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ background: "rgba(255,101,63,0.06)", border: "1px solid rgba(255,101,63,0.15)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Pendapatan</p>
          <p className="text-sm font-black" style={{ color: "var(--brand-orange)" }}>{formatRupiah(ev.revenue)}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{ev.txnCount.toLocaleString("id-ID")} transaksi</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Unit Terjual</p>
          <p className="text-sm font-black" style={{ color: "#7c3aed" }}>{ev.itemsSold.toLocaleString("id-ID")}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>sisa {ev.totalUnits.toLocaleString("id-ID")} unit</p>
        </div>
      </div>

      {/* Performance bars */}
      <EventPerformancePanel ev={ev} />
    </div>
  );
}