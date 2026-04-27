// app/page.tsx
import { getTodayStats, getRecentTransactions } from "@/lib/transactions";
import { formatRupiah, formatDate } from "@/lib/utils";
import { TrendingUp, ShoppingBag, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, recent] = await Promise.all([
    getTodayStats(),
    getRecentTransactions(),
  ]);

  const todayTotal = Number(stats?.total ?? 0);
  const todayCount = Number(stats?.count ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <a
          href="/api/export/transactions"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: "var(--brand-orange)", color: "white" }}
        >
          <ArrowUpRight size={14} />
          Export Excel
        </a>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className="rounded-xl p-5 border relative overflow-hidden"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 -translate-y-6 translate-x-6"
            style={{ background: "var(--brand-orange)" }}
          />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Today's Sales
              </p>
              <p className="text-2xl font-bold mt-2 text-white">{formatRupiah(todayTotal)}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ background: "rgba(255,101,63,0.15)" }}>
              <TrendingUp size={18} style={{ color: "var(--brand-orange)" }} />
            </div>
          </div>
        </div>

        <div
          className="rounded-xl p-5 border relative overflow-hidden"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 -translate-y-6 translate-x-6"
            style={{ background: "var(--brand-yellow)" }}
          />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Transactions Today
              </p>
              <p className="text-2xl font-bold mt-2 text-white">{todayCount}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ background: "rgba(255,200,92,0.15)" }}>
              <ShoppingBag size={18} style={{ color: "var(--brand-yellow)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-white">Recent Transactions</h2>
          <Link href="/transactions" className="text-xs font-medium transition-colors" style={{ color: "var(--brand-orange)" }}>
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            No transactions yet today.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid var(--border)` }}>
                {["ID", "Time", "Total", "Payment"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((txn, i) => (
                <tr
                  key={txn.id}
                  style={{ borderBottom: i < recent.length - 1 ? `1px solid var(--border)` : "none" }}
                >
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                    #{txn.id}
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {txn.createdAt ? formatDate(txn.createdAt) : "-"}
                  </td>
                  <td className="px-5 py-3 font-semibold text-white">
                    {formatRupiah(txn.totalAmount)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: txn.paymentMethod === "cash"
                          ? "rgba(255,200,92,0.15)"
                          : "rgba(255,101,63,0.15)",
                        color: txn.paymentMethod === "cash"
                          ? "var(--brand-yellow)"
                          : "var(--brand-orange)",
                      }}
                    >
                      {txn.paymentMethod ?? "-"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}