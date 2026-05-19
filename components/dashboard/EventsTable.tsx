// components/dashboard/EventsTable.tsx
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";
import type { EventStat } from "./types";
import { STATUS_META } from "./types";

function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0; }

function MiniRing({ value, color }: { value: number; color: string }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(value, 100) / 100 * circ;
  return (
    <svg width={36} height={36} viewBox="0 0 36 36">
      <circle cx={18} cy={18} r={r} fill="none" stroke="var(--border)" strokeWidth={3.5} />
      <circle cx={18} cy={18} r={r} fill="none" stroke={color} strokeWidth={3.5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" />
      <text x={18} y={22} textAnchor="middle" fontSize={8} fontWeight="700" fill={color}>{value}%</text>
    </svg>
  );
}

export function EventsTable({ events }: { events: EventStat[] }) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
              {["Event", "Status", "Pendapatan", "Transaksi", "Terjual", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "var(--muted-foreground)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => {
              const status  = STATUS_META[ev.status as keyof typeof STATUS_META] ?? STATUS_META.draft;
              const sellPct = pct(ev.itemsSold, ev.originalUnits);

              return (
                <tr key={ev.id} className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderBottom: i < events.length - 1 ? "1px solid var(--border)" : "none" }}>

                  {/* Event name */}
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{ev.name}</p>
                    {ev.location && <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{ev.location}</p>}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold"
                      style={{ background: status.bg, color: status.color }}>{status.label}</span>
                  </td>

                  {/* Revenue */}
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-sm" style={{ color: "var(--brand-orange)" }}>{formatRupiah(ev.revenue)}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>stok {formatRupiah(ev.totalStockValue)}</p>
                  </td>

                  {/* Transactions */}
                  <td className="px-4 py-3.5">
                    <p className="font-bold" style={{ color: "var(--foreground)" }}>{ev.txnCount.toLocaleString("id-ID")}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{ev.itemsSold.toLocaleString("id-ID")} unit</p>
                  </td>

                  {/* Sell-through ring */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <MiniRing value={sellPct} color="#7c3aed" />
                      <div>
                        <p className="text-[11px] font-semibold" style={{ color: "var(--foreground)" }}>
                          {ev.totalUnits.toLocaleString("id-ID")} sisa
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>dari {ev.originalUnits.toLocaleString("id-ID")}</p>
                      </div>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3.5 text-right">
                    <Link href={`/events/${ev.id}`}
                      className="inline-flex px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:bg-black/5"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                      Lihat
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}