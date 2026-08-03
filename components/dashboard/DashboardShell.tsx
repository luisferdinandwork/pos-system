// components/dashboard/DashboardShell.tsx
"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import { DashboardStats } from "./DashboardStats";
import { EventCard } from "./EventCard";
import { EventsTable } from "./EventsTable";
import type { DashboardData } from "./types";

export function DashboardShell({ dash }: { dash: DashboardData }) {
  const active = dash.data.filter(e => e.status === "active");
  const others = dash.data.filter(e => e.status !== "active");

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Ringkasan semua event</p>
        </div>
        <Link href="/events"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:bg-black/5"
          style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}>
          <Calendar size={14} /> Kelola Event
        </Link>
      </div>

      {/* Summary stats */}
      <DashboardStats dash={dash} />

      {/* Active events */}
      {active.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#16a34a" }} />
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              Sedang Berlangsung
            </h2>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {active.map(ev => <EventCard key={ev.id} ev={ev} highlight />)}
          </div>
        </section>
      )}

      {/* Other events */}
      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            Semua Event
          </h2>
          <EventsTable events={others} />
        </section>
      )}

      {/* Empty state */}
      {dash.data.length === 0 && (
        <div className="rounded-2xl border py-20 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <Calendar size={36} className="mx-auto mb-3 opacity-15" style={{ color: "var(--muted-foreground)" }} />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Belum ada event.{" "}
            <Link href="/events" className="underline" style={{ color: "var(--brand-orange)" }}>
              Buat event pertama →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}