// components/DashboardCards.tsx
"use client";
import { formatRupiah, formatDate } from "@/lib/utils";

type Stats = { count: number; total: number };
type Transaction = {
  id: number;
  totalAmount: string;
  createdAt: string | null;
  paymentMethod: string | null;
};

type Props = {
  stats: Stats;
  recent: Transaction[];
};

export default function DashboardCards({ stats, recent }: Props) {
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Today's Sales</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatRupiah(stats.total)}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Transactions</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{stats.count}</p>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold text-gray-700">Recent Transactions</h2>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">No transactions yet.</p>
        ) : (
          <ul className="divide-y">
            {recent.map((txn) => (
              <li key={txn.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    Txn #{txn.id}
                  </p>
                  <p className="text-xs text-gray-400">
                    {txn.createdAt ? formatDate(txn.createdAt) : "-"} ·{" "}
                    {txn.paymentMethod ?? "-"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {formatRupiah(txn.totalAmount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}