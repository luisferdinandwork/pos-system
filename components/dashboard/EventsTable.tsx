// components/dashboard/EventsTable.tsx
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";
import type { EventStat } from "./types";
import { STATUS_META } from "./types";

type Props = {
  events: EventStat[];
};

function pct(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function EventsTable({ events }: Props) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                background: "var(--muted)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {[
                "Event",
                "Status",
                "Revenue",
                "Transactions",
                "Sell-Through",
                "Remaining",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {events.map((ev, i) => {
              const status =
                STATUS_META[ev.status as keyof typeof STATUS_META] ??
                STATUS_META.draft;

              const sellPct = pct(ev.itemsSold, ev.originalUnits);

              return (
                <tr
                  key={ev.id}
                  style={{
                    borderBottom:
                      i < events.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                  className="hover:bg-black/[0.02]"
                >
                  <td className="px-4 py-4">
                    <div>
                      <p
                        className="font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {ev.name}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {ev.location ?? "No location"}
                      </p>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{ background: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                  </td>

                  <td className="px-4 py-4">
                    <div>
                      <p
                        className="font-bold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {formatRupiah(ev.revenue)}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        stock {formatRupiah(ev.totalStockValue)}
                      </p>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <div>
                      <p
                        className="font-bold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {ev.txnCount.toLocaleString("id-ID")}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {ev.itemsSold.toLocaleString("id-ID")} units
                      </p>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <svg width="34" height="34" viewBox="0 0 34 34"
                        role="img" aria-label={`${sellPct}% sell-through`}>
                        <circle cx="17" cy="17" r="13" fill="none"
                          stroke="rgba(124,58,237,0.12)" strokeWidth="3.5" />
                        <circle cx="17" cy="17" r="13" fill="none"
                          stroke="#7c3aed" strokeWidth="3.5"
                          strokeDasharray={`${(sellPct / 100) * 81.68} 81.68`}
                          strokeLinecap="round"
                          transform="rotate(-90 17 17)" />
                      </svg>
                      <span className="text-xs font-bold" style={{ color: "#7c3aed" }}>{sellPct}%</span>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <div>
                      <p
                        className="font-bold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {ev.totalUnits.toLocaleString("id-ID")} units
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {formatRupiah(ev.remainingValue)}
                      </p>
                    </div>
                  </td>

                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/events/${ev.id}`}
                      className="inline-flex px-3 py-2 rounded-xl text-xs font-semibold border"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }}
                    >
                      View
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