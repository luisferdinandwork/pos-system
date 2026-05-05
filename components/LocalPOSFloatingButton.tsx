// components/LocalPOSFloatingButton.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Database,
  Zap,
} from "lucide-react";

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
  const [minimized, setMinimized] = useState(false);

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

    const saved = localStorage.getItem("local-pos-floating-minimized");

    if (saved === "true") {
      setMinimized(true);
    }

    const interval = setInterval(loadState, 8000);

    return () => clearInterval(interval);
  }, []);

  function toggleMinimized() {
    const next = !minimized;
    setMinimized(next);
    localStorage.setItem("local-pos-floating-minimized", String(next));
  }

  if (!state?.hasPreparedEvent || !state.event) return null;

  if (minimized) {
    return (
      <div className="fixed right-5 bottom-5 z-50 flex items-center gap-2">
        <button
          onClick={toggleMinimized}
          className="w-12 h-12 rounded-2xl shadow-xl border flex items-center justify-center"
          style={{
            background: "var(--brand-deep)",
            borderColor: "rgba(255,255,255,0.12)",
            color: "white",
          }}
          title="Expand Local POS"
        >
          <Zap size={20} />
        </button>

        {state.pendingSyncCount > 0 && (
          <span
            className="px-2 py-1 rounded-full text-[11px] font-black shadow-lg"
            style={{
              background: "#f59e0b",
              color: "white",
            }}
          >
            {state.pendingSyncCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2">
      <div
        className="rounded-2xl shadow-xl border px-4 py-3 flex items-center gap-3"
        style={{
          background: "var(--brand-deep)",
          borderColor: "rgba(255,255,255,0.12)",
          color: "white",
        }}
      >
        <Link
          href={`/pos?event=${state.event.id}`}
          className="flex items-center gap-3 min-w-0"
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

        <button
          onClick={toggleMinimized}
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "white",
          }}
          title="Minimize"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div className="flex gap-2">
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

        <button
          onClick={toggleMinimized}
          className="rounded-xl shadow-lg border px-3 py-2 text-xs font-bold flex items-center gap-1"
          style={{
            background: "white",
            borderColor: "var(--border)",
            color: "var(--foreground)",
          }}
        >
          <ChevronUp size={13} />
          Minimize
        </button>
      </div>
    </div>
  );
}