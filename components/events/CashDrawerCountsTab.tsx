// components/events/CashDrawerCountsTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2, WalletCards } from "lucide-react";
import { formatDate, formatRupiah, formatRupiahInput, parseRupiahInput } from "@/lib/utils";

type CashDrawerCount = {
  id: number;
  eventId: number;
  cashierSessionId: number | null;
  countedBy: string | null;
  expectedCash: string;
  actualCash: string;
  difference: string;
  reason: string;
  notes: string | null;
  countedAt: string | null;
};

type ActiveSession = {
  id: number;
  cashierName: string;
  openingCash: string;
  openedAt: string | null;
};

type ApiPayload = {
  counts: CashDrawerCount[];
  activeSession: ActiveSession | null;
  expectedCash: number;
  openingCash: number;
  cashSales: number;
};

const reasonOptions = [
  { value: "opening_check", label: "Opening Check" },
  { value: "count", label: "Drawer Count" },
  { value: "closing_check", label: "Closing Check" },
];

export function CashDrawerCountsTab({ eventId }: { eventId: number }) {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [reason, setReason] = useState("count");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const expectedCash = Number(data?.expectedCash ?? 0);
  const parsedActual = parseRupiahInput(actualCash);
  const diff = parsedActual - expectedCash;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/cash-drawer-counts`, {
        cache: "no-store",
      });
      const json = await res.json();
      setData(res.ok ? json : { counts: [], activeSession: null, expectedCash: 0, openingCash: 0, cashSales: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [eventId]);

  async function saveCount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/events/${eventId}/cash-drawer-counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashierSessionId: data?.activeSession?.id ?? null,
          countedBy: data?.activeSession?.cashierName ?? null,
          expectedCash,
          actualCash: parsedActual,
          reason,
          notes: notes || null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save drawer count");

      setActualCash("");
      setReason("count");
      setNotes("");
      setShowForm(false);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save drawer count");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCount(id: number) {
    if (!confirm("Delete this drawer count?")) return;
    await fetch(`/api/events/${eventId}/cash-drawer-counts?countId=${id}`, {
      method: "DELETE",
    });
    await load();
  }

  const rows = data?.counts ?? [];
  const lastCount = rows[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Expected Drawer", value: formatRupiah(expectedCash), color: "#0369a1" },
          { label: "Opening Cash", value: formatRupiah(data?.openingCash ?? 0), color: "#16a34a" },
          { label: "Cash Sales", value: formatRupiah(data?.cashSales ?? 0), color: "var(--brand-orange)" },
          {
            label: "Last Difference",
            value: lastCount ? formatRupiah(lastCount.difference) : "—",
            color: Number(lastCount?.difference ?? 0) === 0 ? "#16a34a" : "#dc2626",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{item.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: item.color }}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(3,105,161,0.1)", color: "#0369a1" }}>
              <WalletCards size={17} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Cash Drawer Checks</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {data?.activeSession
                  ? `Active session: ${data.activeSession.cashierName}`
                  : "No active cashier session found"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5" style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={12} /> Count Drawer
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={saveCount} className="px-5 py-4 border-b grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Actual Cash in Drawer</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "var(--muted-foreground)" }}>Rp</span>
                <input
                  required
                  inputMode="numeric"
                  value={actualCash}
                  onChange={(e) => setActualCash(formatRupiahInput(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-xl border pl-10 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-400"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: diff === 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#0369a1" }}>
                Difference: {formatRupiah(diff)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Reason</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}>
                  {reasonOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="w-full rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }} />
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl border text-xs font-bold" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Cancel</button>
              <button disabled={saving} className="px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{ background: "var(--brand-orange)", color: "white" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading drawer counts…</div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center">
            <WalletCards size={32} className="mx-auto mb-3 opacity-20" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No drawer checks yet.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {rows.map((row) => {
              const difference = Number(row.difference ?? 0);
              return (
                <div key={row.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{formatDate(row.countedAt)}</p>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{row.reason}</span>
                      {row.countedBy && <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>by {row.countedBy}</span>}
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                      Expected {formatRupiah(row.expectedCash)} · Actual {formatRupiah(row.actualCash)}
                    </p>
                    {row.notes && <p className="text-xs italic mt-1" style={{ color: "var(--muted-foreground)" }}>{row.notes}</p>}
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-black" style={{ color: difference === 0 ? "#16a34a" : difference < 0 ? "#dc2626" : "#0369a1" }}>{formatRupiah(difference)}</p>
                    <p className="text-[10px] uppercase font-bold" style={{ color: "var(--muted-foreground)" }}>Difference</p>
                  </div>

                  <button onClick={() => deleteCount(row.id)} className="p-2 rounded-lg" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
