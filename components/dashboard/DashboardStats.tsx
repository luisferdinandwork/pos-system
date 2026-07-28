// components/dashboard/DashboardStats.tsx
import { formatRupiah } from "@/lib/utils";
import type { DashboardData } from "./types";

type Props = { dash: DashboardData };

// Small inline ring — self-contained SVG, no external dep
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(pct, 100) / 100 * circ;
  return (
    <svg width={44} height={44} viewBox="0 0 44 44">
      <circle cx={22} cy={22} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 22 22)" style={{ transition: "stroke-dasharray .5s" }} />
      <text x={22} y={26} textAnchor="middle" fontSize={10} fontWeight="700" fill={color}>{pct}%</text>
    </svg>
  );
}

export function DashboardStats({ dash }: Props) {
  const rev     = dash.totalRevenue      ?? 0;
  const txns    = dash.totalTxns         ?? 0;
  const sold    = dash.totalItemsSold    ?? 0;
  const orig    = dash.totalOriginalUnits ?? 0;
  const stock   = dash.totalStockValue   ?? 0;
  const disc    = dash.totalDiscount     ?? 0;

  const soldPct = orig > 0 ? Math.round((sold / orig) * 100) : 0;
  const revPct  = stock > 0 ? Math.round((rev  / stock) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

      {/* Revenue */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Total Pendapatan</p>
        <p className="text-2xl font-black" style={{ color: "var(--brand-orange)" }}>{formatRupiah(rev)}</p>
        <div className="flex items-center gap-2">
          <Ring pct={revPct} color="var(--brand-orange)" />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            dari nilai stok {formatRupiah(stock)}
          </p>
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Total Transaksi</p>
        <p className="text-2xl font-black" style={{ color: "#7c3aed" }}>{txns.toLocaleString("id-ID")}</p>
        <div className="flex items-center gap-2">
          <Ring pct={soldPct} color="#7c3aed" />
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {sold.toLocaleString("id-ID")} dari {orig.toLocaleString("id-ID")} unit terjual
          </p>
        </div>
      </div>

      {/* Stock value */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Nilai Stok</p>
        <p className="text-2xl font-black" style={{ color: "#0369a1" }}>{formatRupiah(stock)}</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          Berdasarkan harga jual bersih semua item di semua event
        </p>
      </div>

      {/* Discounts */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Total Diskon</p>
        <p className="text-2xl font-black" style={{ color: "#16a34a" }}>{formatRupiah(disc)}</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          Nilai yang dihemat oleh pelanggan dari semua event
        </p>
      </div>

    </div>
  );
}