// app/(main)/transactions/page.tsx
import { getAllTransactions } from "@/lib/transactions";
import { formatRupiah, formatDate } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

const methodColor: Record<string, { bg: string; text: string }> = {
  cash:        { bg: "rgba(255,200,92,0.15)",  text: "#ffc85c" },
  qris:        { bg: "rgba(255,101,63,0.15)",  text: "#ff653f" },
  edc_bca:     { bg: "rgba(100,160,255,0.15)", text: "#7eb8ff" },
  edc_mandiri: { bg: "rgba(160,100,255,0.15)", text: "#c47eff" },
};

export default async function TransactionsPage() {
  const transactions = await getAllTransactions();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {transactions.length} total records
          </p>
        </div>
        <a
          href="/api/export/transactions"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--brand-orange)", color: "white" }}
        >
          <ArrowUpRight size={14} />
          Export Excel
        </a>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              {["ID", "Date & Time", "Total", "Payment Method", "Reference"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  No transactions recorded yet.
                </td>
              </tr>
            ) : transactions.map((txn, i) => {
              const colors = methodColor[txn.paymentMethod ?? ""] ?? { bg: "rgba(255,255,255,0.05)", text: "var(--muted-foreground)" };
              return (
                <tr
                  key={txn.id}
                  className="transition-colors hover:bg-white/5"
                  style={{ borderBottom: i < transactions.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>#{txn.id}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {txn.createdAt ? formatDate(txn.createdAt) : "-"}
                  </td>
                  <td className="px-5 py-3 font-bold">{formatRupiah(txn.totalAmount)}</td>
                  <td className="px-5 py-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: colors.bg, color: colors.text }}>
                      {txn.paymentMethod ?? "-"}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {txn.paymentReference ?? "—"}
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