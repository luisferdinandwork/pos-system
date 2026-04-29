// app/(main)/events/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Calendar, MapPin, ArrowRight } from "lucide-react";
import Link from "next/link";

const STATUS_META = {
  draft:  { label: "Draft",  color: "#6b7280", bg: "rgba(107,114,128,0.1)"  },
  active: { label: "Active", color: "#16a34a", bg: "rgba(22,163,74,0.1)"    },
  closed: { label: "Closed", color: "#dc2626", bg: "rgba(220,38,38,0.1)"    },
};

type Event = {
  id: number; name: string; location: string | null;
  description: string | null; status: string;
  startDate: string | null; endDate: string | null;
};
type Form = Omit<Event, "id"> & { id?: number };

const empty = (): Form => ({
  name: "", location: "", description: "",
  status: "draft", startDate: "", endDate: "",
});

export default function EventsPage() {
  const [events, setEvents]   = useState<Event[]>([]);
  const [form, setForm]       = useState<Form>(empty());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]   = useState(false);

  async function load() {
    const r = await fetch("/api/events");
    setEvents(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/events", {
      method:  form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });
    setSaving(false); setShowForm(false); setForm(empty()); load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this event and all its products?")) return;
    await fetch(`/api/events?id=${id}`, { method: "DELETE" });
    load();
  }

  const cs  = { background: "var(--card)", borderColor: "var(--border)" };
  const inp = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1";
  const ist = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>Events</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {events.length} events total
          </p>
        </div>
        <button
          onClick={() => { setForm(empty()); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "var(--brand-orange)", color: "white" }}
        >
          <Plus size={15} /> New Event
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(30,16,78,0.3)", backdropFilter: "blur(3px)" }}>
          <div className="rounded-2xl border w-full max-w-lg shadow-2xl" style={cs}>
            <div className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}>
              <h2 className="font-bold" style={{ color: "var(--foreground)" }}>
                {form.id ? "Edit Event" : "New Event"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>Event Name *</label>
                <input required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Bazar Ramadan 2025" className={inp} style={ist} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>Location</label>
                <input value={form.location ?? ""}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Mall Kelapa Gading Lt.2" className={inp} style={ist} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>Description</label>
                <input value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={inp} style={ist} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>Start Date</label>
                  <input type="datetime-local" value={form.startDate ?? ""}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className={inp} style={ist} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>End Date</label>
                  <input type="datetime-local" value={form.endDate ?? ""}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className={inp} style={ist} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(STATUS_META).map(([val, meta]) => (
                    <button key={val} type="button"
                      onClick={() => setForm({ ...form, status: val })}
                      className="rounded-xl border py-2 text-sm font-semibold transition-all"
                      style={{
                        borderColor: form.status === val ? meta.color : "var(--border)",
                        background:  form.status === val ? meta.bg    : "transparent",
                        color:       form.status === val ? meta.color : "var(--muted-foreground)",
                      }}>
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                  style={{ background: "var(--brand-orange)", color: "white" }}>
                  {saving ? "Saving…" : form.id ? "Update" : "Create Event"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 rounded-xl text-sm border font-medium"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event cards grid */}
      {events.length === 0 ? (
        <div className="rounded-2xl border py-16 text-center" style={cs}>
          <Calendar size={40} className="mx-auto mb-3" style={{ color: "var(--muted-foreground)", opacity: 0.3 }} />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No events yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((ev) => {
            const meta = STATUS_META[ev.status as keyof typeof STATUS_META] ?? STATUS_META.draft;
            return (
              <div key={ev.id} className="rounded-2xl border overflow-hidden transition-all hover:shadow-md" style={cs}>
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base leading-snug" style={{ color: "var(--foreground)" }}>
                      {ev.name}
                    </h3>
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
                      style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  {ev.location && (
                    <div className="flex items-center gap-1 mt-2">
                      <MapPin size={12} style={{ color: "var(--muted-foreground)" }} />
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{ev.location}</span>
                    </div>
                  )}
                  {(ev.startDate || ev.endDate) && (
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar size={12} style={{ color: "var(--muted-foreground)" }} />
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {ev.startDate ? new Date(ev.startDate).toLocaleDateString("id-ID") : "?"}
                        {" — "}
                        {ev.endDate   ? new Date(ev.endDate).toLocaleDateString("id-ID")   : "?"}
                      </span>
                    </div>
                  )}
                  {ev.description && (
                    <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--muted-foreground)" }}>
                      {ev.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 px-4 py-3 border-t"
                  style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
                  <Link href={`/events/${ev.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all"
                    style={{ background: "var(--brand-orange)", color: "white" }}>
                    Manage <ArrowRight size={12} />
                  </Link>
                  <button onClick={() => { setForm({ ...ev, startDate: ev.startDate?.slice(0, 16) ?? "", endDate: ev.endDate?.slice(0, 16) ?? "" }); setShowForm(true); }}
                    className="p-2 rounded-lg transition-all"
                    style={{ background: "rgba(255,200,92,0.15)", color: "#b45309" }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(ev.id)}
                    className="p-2 rounded-lg transition-all"
                    style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}