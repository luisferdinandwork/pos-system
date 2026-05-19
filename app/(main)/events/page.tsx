// app/(main)/events/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Calendar as CalendarIcon,
  MapPin,
  ArrowRight,
  Copy,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const STATUS_META = {
  draft: {
    label: "Draft",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
  },
  active: {
    label: "Active",
    color: "#16a34a",
    bg: "rgba(22,163,74,0.1)",
  },
  closed: {
    label: "Closed",
    color: "#dc2626",
    bg: "rgba(220,38,38,0.1)",
  },
};

type EventRow = {
  id: number;
  code: string;
  verifierCode?: string | null;
  name: string;
  location: string | null;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
};

type Form = {
  id?: number;
  code: string;
  name: string;
  location: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
};

type DuplicateForm = {
  sourceEvent: EventRow;
  code: string;
  name: string;
  location: string;
  description: string;
  startDate: string;
  endDate: string;
};

function emptyForm(): Form {
  return {
    code: "",
    name: "",
    location: "",
    description: "",
    status: "draft",
    startDate: "",
    endDate: "",
  };
}

function dateToYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function ymdToDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;

  const raw = String(value).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? undefined : fallback;
  }

  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateLabel(value: string | null | undefined): string {
  const date = ymdToDate(value);

  if (!date) return "Select date";

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getApiError(result: unknown, fallback: string) {
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    typeof result.error === "string"
  ) {
    return result.error;
  }

  return fallback;
}

function cleanFormPayload(form: Form) {
  return {
    id: form.id,
    code: form.code.trim(),
    name: form.name.trim(),
    location: form.location.trim() || null,
    description: form.description.trim() || null,
    status: form.status,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
  };
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = useMemo(() => ymdToDate(value), [value]);

  return (
    <div>
      <label
        className="block text-xs font-semibold uppercase tracking-wider mb-1"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </label>

      <Popover>
        <PopoverTrigger>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start rounded-lg border px-3 py-2 text-sm font-normal"
            style={{
              borderColor: "var(--border)",
              color: value ? "var(--foreground)" : "var(--muted-foreground)",
              background: "var(--card)",
            }}
          >
            <CalendarIcon size={15} className="mr-2" />
            {formatDateLabel(value)}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => onChange(date ? dateToYmd(date) : "")}
          />

          {value && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onChange("")}
              >
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [form, setForm] = useState<Form>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [duplicateForm, setDuplicateForm] = useState<DuplicateForm | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  async function load() {
    try {
      setPageError(null);

      const response = await fetch("/api/events", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(getApiError(result, "Failed to load events"));
      }

      setEvents(Array.isArray(result) ? result : []);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to load events"
      );
      setEvents([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreateForm() {
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEditForm(event: EventRow) {
    setForm({
      id: event.id,
      code: event.code ?? "",
      name: event.name,
      location: event.location ?? "",
      description: event.description ?? "",
      status: event.status,
      startDate: event.startDate ? String(event.startDate).slice(0, 10) : "",
      endDate: event.endDate ? String(event.endDate).slice(0, 10) : "",
    });

    setShowForm(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();

    const payload = cleanFormPayload(form);

    if (!/^\d{4}$/.test(payload.code)) {
      alert("Event code must be exactly 4 digits.");
      return;
    }

    if (!payload.name) {
      alert("Event name is required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/events", {
        method: form.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          getApiError(
            result,
            form.id ? "Failed to update event" : "Failed to create event"
          )
        );
      }

      setShowForm(false);
      setForm(emptyForm());
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  function openDuplicateForm(event: EventRow) {
    setDuplicateForm({
      sourceEvent: event,
      code: "",
      name: `${event.name} (Copy)`,
      location: event.location ?? "",
      description: event.description ?? "",
      startDate: "",
      endDate: "",
    });
  }

  async function handleDuplicate(event: React.FormEvent) {
    event.preventDefault();

    if (!duplicateForm) return;

    const code = duplicateForm.code.trim();

    if (!/^\d{4}$/.test(code)) {
      alert("New event code must be exactly 4 digits.");
      return;
    }

    setDuplicating(duplicateForm.sourceEvent.id);

    try {
      const response = await fetch(
        `/api/events/${duplicateForm.sourceEvent.id}/duplicate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            name: duplicateForm.name.trim(),
            location: duplicateForm.location.trim() || null,
            description: duplicateForm.description.trim() || null,
            startDate: duplicateForm.startDate || null,
            endDate: duplicateForm.endDate || null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(getApiError(result, "Failed to duplicate event"));
      }

      setDuplicateForm(null);
      await load();

      if (result.event) {
        openEditForm(result.event);
      }
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Failed to duplicate event"
      );
    } finally {
      setDuplicating(null);
    }
  }

  async function deleteEventWithLocalCleanup(id: number) {
    const ok = confirm(
      "Delete this event? This will also remove its local POS data on this computer."
    );

    if (!ok) return;

    const response = await fetch(`/api/events?id=${id}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (!response.ok) {
      if (
        response.status === 409 &&
        result.code === "LOCAL_POS_HAS_UNSYNCED_SALES"
      ) {
        const force = confirm(
          `${result.error}\n\nForce delete anyway? Unsynced local POS sales will be lost.`
        );

        if (!force) return;

        const forceResponse = await fetch(
          `/api/events?id=${id}&forceLocalDelete=true`,
          {
            method: "DELETE",
          }
        );

        const forceResult = await forceResponse.json();

        if (!forceResponse.ok) {
          alert(forceResult.error || "Failed to delete event");
          return;
        }

        await load();
        return;
      }

      alert(result.error || "Failed to delete event");
      return;
    }

    await load();
  }

  const cardStyle = {
    background: "var(--card)",
    borderColor: "var(--border)",
  };

  const inputClass =
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1";

  const inputStyle = {
    borderColor: "var(--border)",
    color: "var(--foreground)",
    background: "var(--card)",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            Events
          </h1>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            {events.length} events total
          </p>
        </div>

        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{
            background: "var(--brand-orange)",
            color: "white",
          }}
        >
          <Plus size={15} />
          New Event
        </button>
      </div>

      {pageError && (
        <div
          className="rounded-xl border px-4 py-3 flex items-start gap-2 text-sm"
          style={{
            borderColor: "rgba(220,38,38,0.3)",
            background: "rgba(220,38,38,0.08)",
            color: "#dc2626",
          }}
        >
          <AlertCircle size={16} className="mt-0.5" />
          <div>
            <p className="font-semibold">Failed to load events</p>
            <p>{pageError}</p>
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center mb-0"
          style={{
            background: "rgba(30,16,78,0.3)",
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            className="rounded-2xl border w-full max-w-xl shadow-2xl"
            style={cardStyle}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <h2
                className="font-bold"
                style={{ color: "var(--foreground)" }}
              >
                {form.id ? "Edit Event" : "New Event"}
              </h2>

              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg"
                style={{
                  background: "var(--muted)",
                  color: "var(--muted-foreground)",
                }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Event Code *
                  </label>
                  <input
                    required
                    inputMode="numeric"
                    maxLength={4}
                    value={form.code}
                    onChange={(event) => {
                      const code = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 4);

                      setForm({ ...form, code });
                    }}
                    placeholder="1207"
                    className={inputClass}
                    style={inputStyle}
                  />
                  <p
                    className="text-[11px] mt-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Used in transaction ID.
                  </p>
                </div>

                <div>
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Event Name *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    placeholder="e.g. Bazar Ramadan 2026"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Location
                </label>
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                  placeholder="e.g. Mall Kelapa Gading Lt.2"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Description
                </label>
                <input
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DateField
                  label="Start Date"
                  value={form.startDate}
                  onChange={(value) => setForm({ ...form, startDate: value })}
                />

                <DateField
                  label="End Date"
                  value={form.endDate}
                  onChange={(value) => setForm({ ...form, endDate: value })}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Status
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(STATUS_META).map(([value, meta]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, status: value })}
                      className="rounded-xl border py-2 text-sm font-semibold transition-all"
                      style={{
                        borderColor:
                          form.status === value
                            ? meta.color
                            : "var(--border)",
                        background:
                          form.status === value ? meta.bg : "transparent",
                        color:
                          form.status === value
                            ? meta.color
                            : "var(--muted-foreground)",
                      }}
                    >
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-60"
                  style={{
                    background: "var(--brand-orange)",
                    color: "white",
                  }}
                >
                  {saving ? "Saving…" : form.id ? "Update" : "Create Event"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 rounded-xl text-sm border font-medium"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {duplicateForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(30,16,78,0.3)",
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            className="rounded-2xl border w-full max-w-xl shadow-2xl"
            style={cardStyle}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <h2
                className="font-bold"
                style={{ color: "var(--foreground)" }}
              >
                Duplicate Event
              </h2>

              <button
                onClick={() => setDuplicateForm(null)}
                className="p-1.5 rounded-lg"
                style={{
                  background: "var(--muted)",
                  color: "var(--muted-foreground)",
                }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleDuplicate} className="p-6 space-y-4">
              <p
                className="text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                Duplicating{" "}
                <span
                  className="font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  {duplicateForm.sourceEvent.name}
                </span>
                . Items and promos will be copied, stock will start from 0.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
                <div>
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    New Code *
                  </label>
                  <input
                    required
                    inputMode="numeric"
                    maxLength={4}
                    value={duplicateForm.code}
                    onChange={(event) => {
                      const code = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 4);

                      setDuplicateForm({ ...duplicateForm, code });
                    }}
                    placeholder="1208"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    New Event Name *
                  </label>
                  <input
                    required
                    value={duplicateForm.name}
                    onChange={(event) =>
                      setDuplicateForm({
                        ...duplicateForm,
                        name: event.target.value,
                      })
                    }
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Location
                </label>
                <input
                  value={duplicateForm.location}
                  onChange={(event) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      location: event.target.value,
                    })
                  }
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Description
                </label>
                <input
                  value={duplicateForm.description}
                  onChange={(event) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      description: event.target.value,
                    })
                  }
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DateField
                  label="Start Date"
                  value={duplicateForm.startDate}
                  onChange={(value) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      startDate: value,
                    })
                  }
                />

                <DateField
                  label="End Date"
                  value={duplicateForm.endDate}
                  onChange={(value) =>
                    setDuplicateForm({
                      ...duplicateForm,
                      endDate: value,
                    })
                  }
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={duplicating === duplicateForm.sourceEvent.id}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-60"
                  style={{
                    background: "var(--brand-orange)",
                    color: "white",
                  }}
                >
                  {duplicating === duplicateForm.sourceEvent.id
                    ? "Duplicating…"
                    : "Duplicate Event"}
                </button>

                <button
                  type="button"
                  onClick={() => setDuplicateForm(null)}
                  className="px-5 rounded-xl text-sm border font-medium"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-2xl border py-16 text-center" style={cardStyle}>
          <CalendarIcon
            size={40}
            className="mx-auto mb-3"
            style={{
              color: "var(--muted-foreground)",
              opacity: 0.3,
            }}
          />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No events yet. Create your first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => {
            const meta =
              STATUS_META[event.status as keyof typeof STATUS_META] ??
              STATUS_META.draft;

            const isDuplicating = duplicating === event.id;

            return (
              <div
                key={event.id}
                className="rounded-2xl border overflow-hidden transition-all hover:shadow-md"
                style={cardStyle}
              >
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div
                        className="inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold mb-2"
                        style={{
                          background: "var(--muted)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        Code: {event.code}
                      </div>

                      <h3
                        className="font-bold text-base leading-snug"
                        style={{ color: "var(--foreground)" }}
                      >
                        {event.name}
                      </h3>
                    </div>

                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
                      style={{
                        background: meta.bg,
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  {event.location && (
                    <div className="flex items-center gap-1 mt-2">
                      <MapPin
                        size={12}
                        style={{ color: "var(--muted-foreground)" }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {event.location}
                      </span>
                    </div>
                  )}

                  {(event.startDate || event.endDate) && (
                    <div className="flex items-center gap-1 mt-1">
                      <CalendarIcon
                        size={12}
                        style={{ color: "var(--muted-foreground)" }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {event.startDate
                          ? formatDateLabel(event.startDate)
                          : "?"}
                        {" — "}
                        {event.endDate ? formatDateLabel(event.endDate) : "?"}
                      </span>
                    </div>
                  )}

                  {event.description && (
                    <p
                      className="text-xs mt-2 line-clamp-2"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {event.description}
                    </p>
                  )}
                </div>

                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditForm(event)}
                      className="p-2 rounded-lg"
                      title="Edit event"
                      style={{
                        background: "rgba(255,200,92,0.15)",
                        color: "#b45309",
                      }}
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      onClick={() => openDuplicateForm(event)}
                      disabled={isDuplicating}
                      className="p-2 rounded-lg disabled:opacity-50 transition-all"
                      title="Duplicate event"
                      style={{
                        background: "rgba(3,105,161,0.1)",
                        color: "#0369a1",
                      }}
                    >
                      {isDuplicating ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>

                    <button
                      onClick={() => deleteEventWithLocalCleanup(event.id)}
                      className="p-2 rounded-lg"
                      title="Delete event"
                      style={{
                        background: "rgba(220,38,38,0.1)",
                        color: "#dc2626",
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <Link
                    href={`/events/${event.id}`}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                    style={{
                      background: "var(--brand-orange)",
                      color: "white",
                    }}
                  >
                    Manage <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}