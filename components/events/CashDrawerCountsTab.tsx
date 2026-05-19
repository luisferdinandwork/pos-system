// components/events/CashDrawerCountsTab.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, WalletCards, Banknote, ArrowDownLeft, ArrowUpRight, User } from "lucide-react";
import { formatDate, formatRupiah, formatRupiahInput, parseRupiahInput } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  cashReceived: number;  // sum of cashTendered — physical cash that entered the drawer
  changeGiven: number;   // sum of changeAmount — cash handed back to customer
  cashSales: number;     // net = cashReceived − changeGiven (= sum of finalAmount)
};

const reasonOptions = [
  { value: "opening_check", label: "Opening Check" },
  { value: "count",         label: "Drawer Count"  },
  { value: "closing_check", label: "Closing Check"  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function CashDrawerCountsTab({ eventId }: { eventId: number }) {
  const [data,       setData]       = useState<ApiPayload | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [reason,     setReason]     = useState("count");
  const [notes,      setNotes]      = useState("");
  const [saving,     setSaving]     = useState(false);

  const expectedCash = Number(data?.expectedCash ?? 0);
  const parsedActual = parseRupiahInput(actualCash);
  const diff         = parsedActual - expectedCash;

  const liveDiffColor = diff === 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#0369a1";
  const liveDiffLabel = diff === 0
    ? "✓ Balanced"
    : diff > 0
      ? `+${formatRupiah(diff)} over`
      : `${formatRupiah(diff)} short`;

  // ── Data loading ──────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/events/${eventId}/cash-drawer-counts`, { cache: "no-store" });
      const json = await res.json();
      setData(
        res.ok
          ? json
          : { counts: [], activeSession: null, expectedCash: 0, openingCash: 0, cashReceived: 0, changeGiven: 0, cashSales: 0 }
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [eventId]);

  // ── Save count ────────────────────────────────────────────────────────────

  async function saveCount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/cash-drawer-counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashierSessionId: data?.activeSession?.id          ?? null,
          countedBy:        data?.activeSession?.cashierName ?? null,
          expectedCash,
          actualCash:       parsedActual,
          reason,
          notes: notes || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save drawer count");
      setActualCash(""); setReason("count"); setNotes(""); setShowForm(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save drawer count");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete count ──────────────────────────────────────────────────────────

  async function deleteCount(id: number) {
    if (!confirm("Delete this drawer count?")) return;
    await fetch(`/api/events/${eventId}/cash-drawer-counts?countId=${id}`, { method: "DELETE" });
    await load();
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const rows      = data?.counts ?? [];
  const lastCount = rows[0];
  const lastDiff  = Number(lastCount?.difference ?? 0);
  const lastDiffColor = lastDiff === 0 ? "#16a34a" : lastDiff < 0 ? "#dc2626" : "#0369a1";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Opening cash */}
        <div className="rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
              <Banknote size={14} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              Opening Cash
            </p>
          </div>
          <p className="text-xl font-black" style={{ color: "#16a34a" }}>
            {formatRupiah(data?.openingCash ?? 0)}
          </p>
          {data?.activeSession ? (
            <p className="flex items-center gap-1 text-[10px] mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
              <User size={9} className="flex-shrink-0" />
              {data.activeSession.cashierName}
            </p>
          ) : (
            <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>No active session</p>
          )}
        </div>

        {/* Cash received */}
        <div className="rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
              <ArrowDownLeft size={14} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              Cash Received
            </p>
          </div>
          <p className="text-xl font-black" style={{ color: "var(--brand-orange)" }}>
            {formatRupiah(data?.cashReceived ?? 0)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            − Change {formatRupiah(data?.changeGiven ?? 0)} = Net {formatRupiah(data?.cashSales ?? 0)}
          </p>
        </div>

        {/* Expected drawer */}
        <div className="rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(3,105,161,0.1)", color: "#0369a1" }}>
              <WalletCards size={14} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              Expected Drawer
            </p>
          </div>
          <p className="text-xl font-black" style={{ color: "#0369a1" }}>
            {formatRupiah(expectedCash)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Opening + Cash Received − Change
          </p>
        </div>

        {/* Last difference */}
        <div className="rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: lastCount ? `${lastDiffColor}18` : "var(--muted)",
                color: lastCount ? lastDiffColor : "var(--muted-foreground)",
              }}>
              <ArrowUpRight size={14} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              Last Difference
            </p>
          </div>
          <p className="text-xl font-black" style={{ color: lastCount ? lastDiffColor : "var(--muted-foreground)" }}>
            {lastCount ? formatRupiah(lastDiff) : "—"}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {lastCount ? formatDate(lastCount.countedAt) : "No counts yet"}
          </p>
        </div>
      </div>

      {/* ── Calculation explainer bar ── */}
      <div className="rounded-2xl border px-4 py-3"
        style={{ background: "rgba(3,105,161,0.04)", borderColor: "rgba(3,105,161,0.18)" }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: "#0369a1" }}>
          Expected Cash Calculation
        </p>
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className="font-bold" style={{ color: "#16a34a" }}>
            Opening {formatRupiah(data?.openingCash ?? 0)}
          </span>
          <span style={{ color: "var(--muted-foreground)" }}>+</span>
          <span className="font-bold" style={{ color: "var(--brand-orange)" }}>
            Cash Received {formatRupiah(data?.cashReceived ?? 0)}
          </span>
          <span style={{ color: "var(--muted-foreground)" }}>−</span>
          <span className="font-bold" style={{ color: "#dc2626" }}>
            Change Given {formatRupiah(data?.changeGiven ?? 0)}
          </span>
          <span style={{ color: "var(--muted-foreground)" }}>=</span>
          <span className="font-black" style={{ color: "#0369a1" }}>
            {formatRupiah(expectedCash)}
          </span>
        </div>
        {!data?.activeSession && (
          <p className="text-[10px] mt-1.5 font-semibold" style={{ color: "#b45309" }}>
            ⚠ No active cashier session — open one from the Sessions tab to scope cash totals to a shift.
          </p>
        )}
      </div>

      {/* ── Counts table ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>

        {/* Table header */}
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap"
          style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(3,105,161,0.1)", color: "#0369a1" }}>
              <WalletCards size={17} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Cash Drawer Checks</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {data?.activeSession
                  ? `Active cashier: ${data.activeSession.cashierName} · since ${formatDate(data.activeSession.openedAt)}`
                  : "No active session — open one from the Sessions tab"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
              style={{ background: "var(--brand-orange)", color: "white" }}>
              <Plus size={12} /> Count Drawer
            </button>
          </div>
        </div>

        {/* Inline count entry form */}
        {showForm && (
          <form onSubmit={saveCount}
            className="px-5 py-4 border-b grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end"
            style={{ borderColor: "var(--border)", background: "var(--muted)" }}>

            {/* Actual cash input + live diff */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                style={{ color: "var(--muted-foreground)" }}>
                Actual Cash in Drawer *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                  style={{ color: "var(--muted-foreground)" }}>Rp</span>
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
              {/* Live difference preview */}
              <div className="mt-1.5 flex items-center justify-between text-[10px]">
                <span style={{ color: "var(--muted-foreground)" }}>
                  Expected: <span className="font-bold">{formatRupiah(expectedCash)}</span>
                </span>
                {actualCash ? (
                  <span className="font-black" style={{ color: liveDiffColor }}>{liveDiffLabel}</span>
                ) : null}
              </div>
            </div>

            {/* Reason + notes */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                  style={{ color: "var(--muted-foreground)" }}>Reason</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}>
                  {reasonOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
                  style={{ color: "var(--muted-foreground)" }}>Notes</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowForm(false); setActualCash(""); }}
                className="px-4 py-2.5 rounded-xl border text-xs font-bold"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                Cancel
              </button>
              <button disabled={saving}
                className="px-4 py-2.5 rounded-xl text-xs font-black disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: "var(--brand-orange)", color: "white" }}>
                {saving ? "Saving…" : "Save Count"}
              </button>
            </div>
          </form>
        )}

        {/* Count rows */}
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm"
            style={{ color: "var(--muted-foreground)" }}>
            <RefreshCw size={14} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center">
            <WalletCards size={32} className="mx-auto mb-3 opacity-20"
              style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm font-bold" style={{ color: "var(--muted-foreground)" }}>No drawer checks yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--border)" }}>
              Click "Count Drawer" to record the first check.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {rows.map((row) => {
              const d      = Number(row.difference ?? 0);
              const dColor = d === 0 ? "#16a34a" : d < 0 ? "#dc2626" : "#0369a1";
              const dLabel = d === 0
                ? "Balanced"
                : d > 0
                  ? `+${formatRupiah(d)} over`
                  : `${formatRupiah(d)} short`;

              return (
                <div key={row.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                        {formatDate(row.countedAt)}
                      </p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold capitalize"
                        style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                        {row.reason.replace(/_/g, " ")}
                      </span>
                      {row.countedBy && (
                        <span className="flex items-center gap-1 text-[10px]"
                          style={{ color: "var(--muted-foreground)" }}>
                          <User size={9} />{row.countedBy}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs flex-wrap"
                      style={{ color: "var(--muted-foreground)" }}>
                      <span>
                        Expected{" "}
                        <span className="font-bold" style={{ color: "#0369a1" }}>
                          {formatRupiah(row.expectedCash)}
                        </span>
                      </span>
                      <span>·</span>
                      <span>
                        Actual{" "}
                        <span className="font-bold" style={{ color: "var(--foreground)" }}>
                          {formatRupiah(row.actualCash)}
                        </span>
                      </span>
                    </div>
                    {row.notes && (
                      <p className="text-xs italic mt-1" style={{ color: "var(--muted-foreground)" }}>
                        {row.notes}
                      </p>
                    )}
                  </div>

                  {/* Difference */}
                  <div className="flex-shrink-0 text-right min-w-[90px]">
                    <p className="text-sm font-black" style={{ color: dColor }}>
                      {formatRupiah(d)}
                    </p>
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: dColor }}>
                      {dLabel}
                    </p>
                  </div>

                  <button onClick={() => deleteCount(row.id)}
                    className="p-2 rounded-lg flex-shrink-0 transition-all hover:bg-red-100"
                    style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}>
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