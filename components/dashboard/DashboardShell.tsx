// components/dashboard/DashboardShell.tsx
"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import { DashboardStats } from "./DashboardStats";
import { EventCard } from "./EventCard";
import { EventsTable } from "./EventsTable";
import type { DashboardData } from "./types";

type Props = { dash: DashboardData };

export function DashboardShell({ dash }: Props) {
  const active = dash.data.filter((e) => e.status === "active");
  const others = dash.data.filter((e) => e.status !== "active");

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            Dashboard
          </h1>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            All-events overview
          </p>
        </div>

        <Link
          href="/events"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
          style={{
            borderColor: "var(--border)",
            color: "var(--foreground)",
            background: "var(--card)",
          }}
        >
          <Calendar size={14} /> Manage Events
        </Link>
      </div>

      <DashboardStats dash={dash} />

      {active.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "#16a34a" }}
            />
            <h2
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color: "var(--muted-foreground)" }}
            >
              Live Now
            </h2>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {active.map((ev) => (
              <EventCard key={ev.id} ev={ev} highlight />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="space-y-3">
          <h2
            className="text-sm font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            All Events
          </h2>

          <EventsTable events={others} />
        </section>
      )}

      {dash.data.length === 0 && (
        <div
          className="rounded-2xl border py-20 text-center"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <Calendar
            size={40}
            className="mx-auto mb-3 opacity-20"
            style={{ color: "var(--muted-foreground)" }}
          />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No events yet.{" "}
            <Link
              href="/events"
              className="underline"
              style={{ color: "var(--brand-orange)" }}
            >
              Create your first event →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}