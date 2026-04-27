// app/page.tsx
import { getTodayStats, getRecentTransactions } from "@/lib/transactions";
import { formatRupiah, formatDate }              from "@/lib/utils";
import { TrendingUp, ShoppingBag, Sparkles, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, recent] = await Promise.all([
    getTodayStats(),
    getRecentTransactions(5),
  ]);

  const todayTotal = Number(stats?.total ?? 0);
  const todayCount = Number(stats?.count ?? 0);
  const todaySaved = Number(stats?.saved ?? 0);

  const methodColor: Record<string, { bg: string; text: string }> = {
    cash:        { bg: "rgba(255,200,92,0.15)",  text: "#b45309"  },
    qris:        { bg: "rgba(124,58,237,0.15)",  text: "#7c3aed"  },
    edc_bca:     { bg: "rgba(3,105,161,0.15)",   text: "#0369a1"  },
    edc_mandiri: { bg: "rgba(190,24,93,0.15)",   text: "#be185d"  },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {new Date().toLocaleDateString("id-ID", {
              weekday: "long", day: "numeric",
              month: "long",   year: "numeric",
            })}
          </p>
        </div>
        <a href="/api/export/transactions"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--brand-orange)", color: "white" }}>
          <ArrowUpRight size={14} /> Export Excel
        </a>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Today's Revenue", value: formatRupiah(todayTotal), icon: TrendingUp,  accent: "var(--brand-orange)" },
          { label: "Transactions",    value: String(todayCount),       icon: ShoppingBag, accent: "#0369a1"             },
          { label: "Discounts Given", value: formatRupiah(todaySaved), icon: Sparkles,    accent: "#16a34a"             },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="rounded-xl border p-5 relative overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 -translate-y-4 translate-x-4"
              style={{ background: accent }} />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}>{label}</p>
                <p className="text-2xl font-bold mt-2" style={{ color: "var(--foreground)" }}>
                  {value}
                </p>
              </div>
              <div className="p-2 rounded-lg" style={{ background: `${accent}22` }}>
                <Icon size={18} style={{ color: accent }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>
            Recent Transactions
          </h2>
          <Link href="/transactions" className="text-xs font-medium"
            style={{ color: "var(--brand-orange)" }}>
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm"
            style={{ color: "var(--muted-foreground)" }}>
            No transactions yet today.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["ID", "Time", "Final Total", "Discount", "Payment"].map((h) => (
                  <th key={h}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((txn, i) => {
                const raw = String(txn.paymentMethod ?? "").toLowerCase().replace(/\s|\(.*\)/g, "");
                const colors = methodColor[raw] ?? {
                  bg: "rgba(107,114,128,0.1)", text: "var(--muted-foreground)",
                };
                return (
                  <tr key={txn.id}
                    style={{ borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td className="px-5 py-3 font-mono text-xs"
                      style={{ color: "var(--muted-foreground)" }}>#{txn.id}</td>
                    <td className="px-5 py-3 text-xs"
                      style={{ color: "var(--muted-foreground)" }}>
                      {txn.createdAt ? formatDate(txn.createdAt) : "—"}
                    </td>
                    <td className="px-5 py-3 font-bold"
                      style={{ color: "var(--foreground)" }}>
                      {formatRupiah(txn.finalAmount)}
                    </td>
                    <td className="px-5 py-3 text-xs"
                      style={{ color: "#16a34a" }}>
                      {Number(txn.discount) > 0 ? `− ${formatRupiah(txn.discount)}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: colors.bg, color: colors.text }}>
                        {txn.paymentMethod ?? "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}