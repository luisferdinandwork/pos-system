// components/LocalPOSFloatingButton.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Database,
  RefreshCw,
  Shuffle,
  X,
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

// ── Colour tokens (mirrors globals.css) ──────────────────────────────────────
const C = {
  deep:   "var(--brand-deep)",
  orange: "var(--brand-orange)",
  border: "var(--border)",
  fg:     "var(--foreground)",
  muted:  "var(--muted)",
  mutedFg:"var(--muted-foreground)",
};

export function LocalPOSFloatingButton() {
  const router = useRouter();
  const [state,     setState]     = useState<LocalPOSState | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  async function loadState() {
    try {
      const data = await fetch("/api/local/pos-state", { cache: "no-store" }).then(r => r.json());
      setState(data);
    } catch {
      setState(null);
    }
  }

  useEffect(() => {
    loadState();
    const saved = localStorage.getItem("local-pos-floating-minimized");
    if (saved === "true") setMinimized(true);
    timerRef.current = setInterval(loadState, 8000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function toggleMinimized() {
    const next = !minimized;
    setMinimized(next);
    localStorage.setItem("local-pos-floating-minimized", String(next));
  }

  // ── Open active event — direct URL to POS sell screen ─────────────────────
  function openActiveEvent() {
    if (!state?.event) return;
    router.push(`/pos?event=${state.event.id}`);
  }

  // ── Switch event — goes to event-select screen, defaults to active filter ──
  // Uses /pos?select=1 which triggers the forceSelect boot path in POSInner,
  // which loads prepared events + cloud events and shows the event-select screen
  // with "active" as the default status filter.
  function switchEvent() {
    setLoading(true);
    router.push("/pos?select=1");
  }

  // ── Render nothing if no prepared event ───────────────────────────────────
  if (!state?.hasPreparedEvent || !state.event) return null;

  const hasPending = (state.pendingSyncCount ?? 0) > 0;

  // ── Minimized pill ────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed right-5 bottom-5 z-50">
        <button
          onClick={toggleMinimized}
          title="Expand Local POS"
          className="flex items-center gap-2.5 rounded-2xl shadow-2xl border pl-3 pr-4 py-2.5 transition-all hover:scale-105 active:scale-95"
          style={{ background: C.deep, borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: C.orange }}>
            <Zap size={14} style={{ color: "white" }} strokeWidth={2.5}/>
          </div>
          <span className="text-xs font-black text-white">POS Active</span>
          {hasPending && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: "#f59e0b", color: "white" }}>
              {state.pendingSyncCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // ── Expanded card ─────────────────────────────────────────────────────────
  return (
    <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2">

      {/* Main card */}
      <div className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: C.deep, border: "1px solid rgba(255,255,255,0.1)", width: 280 }}>

        {/* Card header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-1.5">
            <Database size={11} style={{ color: "#93c5fd" }}/>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
              Local POS Active
            </p>
          </div>
          <button onClick={toggleMinimized}
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
            style={{ color: "rgba(255,255,255,0.4)" }}
            title="Minimize">
            <ChevronDown size={13}/>
          </button>
        </div>

        {/* Event info */}
        <div className="px-4 pb-3.5">
          <p className="text-sm font-black text-white truncate leading-tight">{state.event.name}</p>
          {state.event.location && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
              {state.event.location}
            </p>
          )}

          {/* Sync status */}
          <div className="mt-2.5">
            {hasPending ? (
              <div className="flex items-center gap-1.5">
                <CloudUpload size={12} style={{ color: "#fbbf24", animation: "shimmer 2s ease-in-out infinite" }}/>
                <p className="text-[11px] font-bold" style={{ color: "#fbbf24" }}>
                  {state.pendingSyncCount} sale{state.pendingSyncCount > 1 ? "s" : ""} pending sync
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={12} style={{ color: "#4ade80" }}/>
                <p className="text-[11px] font-bold" style={{ color: "#4ade80" }}>
                  All synced
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }}/>

        {/* Action buttons */}
        <div className="flex">
          {/* Switch event */}
          <button
            onClick={switchEvent}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-bold transition-all hover:bg-white/5 disabled:opacity-50"
            style={{ color: "rgba(255,255,255,0.55)", borderRight: "1px solid rgba(255,255,255,0.07)" }}
            title="Switch to a different event">
            {loading
              ? <RefreshCw size={12} className="animate-spin"/>
              : <Shuffle size={12}/>}
            Switch Event
          </button>

          {/* Open POS */}
          <button
            onClick={openActiveEvent}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-black transition-all hover:bg-white/10"
            style={{ color: "white" }}
            title="Open active event in POS">
            <ArrowRight size={12}/>
            Open POS
          </button>
        </div>
      </div>
    </div>
  );
}