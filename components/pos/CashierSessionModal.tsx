// components/pos/CashierSessionModal.tsx
// Shown when the POS loads and no active local cashier session exists.
// Lets the cashier enter their name to open a session (with optional opening cash).
// The session is stored in local SQLite and synced to Neon during the next sync run.
"use client";

import { useState } from "react";
import { User, Banknote, LogIn } from "lucide-react";
import { formatRupiahInput, parseRupiahInput, formatRupiah } from "@/lib/utils";

type Props = {
  eventName: string;
  onOpen: (cashierName: string, openingCash: number) => void | Promise<void>;
  onSkip: () => void;  // allow skipping — session becomes anonymous
};

export function CashierSessionModal({ eventName, onOpen, onSkip }: Props) {
  const [cashierName, setCashierName] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [saving, setSaving]           = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cashierName.trim()) return;
    setSaving(true);
    try {
      await onOpen(cashierName.trim(), parseRupiahInput(openingCash));
    } finally {
      setSaving(false);
    }
  }

  const C = {
    deep:   "var(--brand-deep)",
    orange: "var(--brand-orange)",
    border: "var(--border)",
    muted:  "var(--muted)",
    mutedFg:"var(--muted-foreground)",
    fg:     "var(--foreground)",
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: "rgba(30,16,78,0.7)", backdropFilter: "blur(8px)" }}>
      <form onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
        style={{ background: "white" }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4" style={{ background: C.deep }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: C.orange }}>
            <User size={22} style={{ color: "white" }} />
          </div>
          <p className="text-lg font-black text-white">Start Cashier Session</p>
          <p className="text-xs mt-1 opacity-60 text-white truncate">{eventName}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
              style={{ color: C.mutedFg }}>
              Your Name *
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: C.mutedFg }} />
              <input
                required
                value={cashierName}
                onChange={e => setCashierName(e.target.value)}
                placeholder="e.g. Budi Santoso"
                autoFocus
                className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ border: `1px solid ${C.border}`, color: C.fg, background: "white",
                  // @ts-ignore
                  "--tw-ring-color": "rgba(255,101,63,0.3)" }} />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5"
              style={{ color: C.mutedFg }}>
              Opening Cash (optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black"
                style={{ color: C.mutedFg }}>Rp</span>
              <input
                inputMode="numeric"
                value={openingCash}
                onChange={e => setOpeningCash(formatRupiahInput(e.target.value))}
                placeholder="0"
                className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono font-bold focus:outline-none"
                style={{ border: `1px solid ${C.border}`, color: C.fg, background: "white" }} />
            </div>
            <p className="text-xs mt-1" style={{ color: C.mutedFg }}>
              Cash float in the drawer at session start
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2">
          <button type="submit" disabled={saving || !cashierName.trim()}
            className="w-full rounded-2xl py-3.5 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40 transition-all hover:opacity-90"
            style={{ background: C.orange, color: "white" }}>
            <LogIn size={16} />
            {saving ? "Opening session…" : "Start Session"}
          </button>
          <button type="button" onClick={onSkip}
            className="w-full rounded-2xl py-2.5 text-xs font-bold transition-all hover:opacity-70"
            style={{ color: C.mutedFg }}>
            Skip (anonymous cashier)
          </button>
        </div>
      </form>
    </div>
  );
}