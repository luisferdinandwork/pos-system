// components/LocalPOSFloatingButton.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, CloudUpload, Zap } from "lucide-react";

type LocalPOSState = {
  hasPreparedEvent: boolean;
  event: {
    id: number;
    name: string;
    location: string | null;
    status: string;
  } | null;
  pendingSyncCount: number;
};

export function LocalPOSFloatingButton() {
  const [state, setState] = useState<LocalPOSState | null>(null);

  async function loadState() {
    try {
      const data = await fetch("/api/local/pos-state", {
        cache: "no-store",
      }).then((res) => res.json());

      setState(data);
    } catch {
      setState(null);
    }
  }

  useEffect(() => {
    loadState();

    const interval = setInterval(loadState, 8000);

    return () => clearInterval(interval);
  }, []);

  if (!state?.hasPreparedEvent || !state.event) return null;

  return (
    <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2">
         <Link
            href={`/pos?event=${state.event.id}`}
            className="rounded-2xl shadow-xl border px-4 py-3 flex items-center gap-3 transition-all hover:scale-[1.02]"
            style={{
            background: "var(--brand-deep)",
            borderColor: "rgba(255,255,255,0.12)",
            color: "white",
            }}
        >
            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--brand-orange)" }}
            >
                <Zap size={18} />
            </div>
        <div className="min-w-0">
            <div className="flex items-center gap-1.5">
            <Database size={12} style={{ color: "#93c5fd" }} />
            <p className="text-xs font-bold uppercase tracking-wider">
                Local POS Active
            </p>
            </div>

            <p className="text-sm font-bold truncate max-w-[210px]">
            {state.event.name}
            </p>

            {state.pendingSyncCount > 0 ? (
            <p
                className="text-[11px] font-semibold flex items-center gap-1"
                style={{ color: "#fbbf24" }}
            >
                <CloudUpload size={11} />
                {state.pendingSyncCount} sale
                {state.pendingSyncCount > 1 ? "s" : ""} pending sync
            </p>
            ) : (
            <p className="text-[11px]" style={{ color: "#86efac" }}>
                Ready to continue selling
            </p>
            )}
        </div>
        </Link>
        <Link
            href="/pos?select=1"
            className="rounded-xl shadow-lg border px-3 py-2 text-xs font-bold"
            style={{
            background: "white",
            borderColor: "var(--border)",
            color: "var(--foreground)",
            }}
        >
            Switch POS Event
        </Link>
    </div>
    );
}