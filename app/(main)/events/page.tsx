// app/(main)/events/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EVENT_COMPANIES,
  inferEventCompany,
  type EventCompany,
} from "@/lib/transaction-ids";
import {
  AlertCircle,
  ArrowRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
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
} as const;

type EventStatus = keyof typeof STATUS_META;

type EventRow = {
  id: number;
  code: string;
  company?: string | null;
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
  code?: string;
  company: EventCompany | "";
  name: string;
  location: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
};

type DuplicateForm = {
  sourceEvent: EventRow;
  company: EventCompany;
  name: string;
  location: string;
  description: string;
  startDate: string;
  endDate: string;
};

type StatusFilter = "active" | "draft" | "closed" | "all";
type SortKey = "activeFirst" | "startAsc" | "startDesc" | "newest" | "nameAsc";
type ViewMode = "cards" | "table";

const PAGE_SIZE = 12;

function emptyForm(): Form {
  return {
    company: "",
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

  if (!date) return "No date";

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateButtonLabel(value: string | null | undefined): string {
  const date = ymdToDate(value);

  if (!date) return "Select date";

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusMeta(status: string) {
  return STATUS_META[status as EventStatus] ?? STATUS_META.draft;
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
    company: form.id ? undefined : form.company || undefined,
    name: form.name.trim(),
    location: form.location.trim() || null,
    description: form.description.trim() || null,
    status: form.status,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
  };
}

function getEventDateTime(value: string | null | undefined) {
  const date = ymdToDate(value);
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

function getEventUpdatedFallback(event: EventRow) {
  return Number(event.id || 0);
}

function statusRank(status: string) {
  if (status === "active") return 0;
  if (status === "draft") return 1;
  if (status === "closed") return 2;
  return 3;
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
        className="mb-1 block text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </label>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start rounded-xl border px-3 py-2 text-sm font-normal"
              style={{
                borderColor: "var(--border)",
                color: value ? "var(--foreground)" : "var(--muted-foreground)",
                background: "var(--card)",
              }}
            >
              <CalendarIcon size={15} className="mr-2" />
              {formatDateButtonLabel(value)}
            </Button>
          }
        />

        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => onChange(date ? dateToYmd(date) : "")}
          />

          {value && (
            <div className="border-t p-2" style={{ borderColor: "var(--border)" }}>
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange("")}>
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
      style={{
        background: meta.bg,
        color: meta.color,
      }}
    >
      {meta.label}
    </span>
  );
}

function EmptyState({
  statusFilter,
  search,
  onCreate,
  onReset,
}: {
  statusFilter: StatusFilter;
  search: string;
  onCreate: () => void;
  onReset: () => void;
}) {
  const hasFilter = statusFilter !== "active" || search.trim();

  return (
    <div
      className="rounded-3xl border p-10 text-center"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: "rgba(255,101,63,0.10)",
          color: "var(--brand-orange)",
        }}
      >
        <CalendarIcon size={24} />
      </div>

      <h3 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
        {hasFilter ? "No events match your filter" : "No active events yet"}
      </h3>

      <p
        className="mx-auto mt-1 max-w-md text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        {hasFilter
          ? "Try changing the status, search keyword, or sorting option."
          : "Create your first event or switch the filter to All Events to view older records."}
      </p>

      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        {hasFilter && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border px-4 py-2 text-sm font-bold"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
              background: "var(--card)",
            }}
          >
            Reset filters
          </button>
        )}

        <button
          type="button"
          onClick={onCreate}
          className="rounded-xl px-4 py-2 text-sm font-bold"
          style={{
            background: "var(--brand-orange)",
            color: "white",
          }}
        >
          Create Event
        </button>
      </div>
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
  const [loading, setLoading] = useState(true);

  // Default page state: show active events first, not all events.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortBy, setSortBy] = useState<SortKey>("startAsc");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [page, setPage] = useState(1);

  async function loadEvents() {
    setLoading(true);
    setPageError(null);

    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(getApiError(data, "Failed to load events"));
      }

      const rows = Array.isArray(data) ? data : Array.isArray(data.events) ? data.events : [];
      setEvents(rows);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sortBy, search]);

  const stats = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        const status = event.status as EventStatus;

        acc.total += 1;

        if (status === "active") acc.active += 1;
        else if (status === "draft") acc.draft += 1;
        else if (status === "closed") acc.closed += 1;

        return acc;
      },
      {
        total: 0,
        active: 0,
        draft: 0,
        closed: 0,
      },
    );
  }, [events]);

  const filteredEvents = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const rows = events.filter((event) => {
      const matchStatus = statusFilter === "all" || event.status === statusFilter;

      const matchKeyword =
        !keyword ||
        event.name.toLowerCase().includes(keyword) ||
        event.code.toLowerCase().includes(keyword) ||
        (event.location ?? "").toLowerCase().includes(keyword) ||
        (event.description ?? "").toLowerCase().includes(keyword) ||
        (event.verifierCode ?? "").toLowerCase().includes(keyword);

      return matchStatus && matchKeyword;
    });

    rows.sort((a, b) => {
      if (sortBy === "activeFirst") {
        const statusCompare = statusRank(a.status) - statusRank(b.status);
        if (statusCompare !== 0) return statusCompare;

        return getEventDateTime(a.startDate) - getEventDateTime(b.startDate);
      }

      if (sortBy === "startAsc") {
        const dateCompare = getEventDateTime(a.startDate) - getEventDateTime(b.startDate);
        if (dateCompare !== 0) return dateCompare;

        return a.name.localeCompare(b.name);
      }

      if (sortBy === "startDesc") {
        const dateCompare = getEventDateTime(b.startDate) - getEventDateTime(a.startDate);
        if (dateCompare !== 0) return dateCompare;

        return a.name.localeCompare(b.name);
      }

      if (sortBy === "nameAsc") {
        return a.name.localeCompare(b.name);
      }

      return getEventUpdatedFallback(b) - getEventUpdatedFallback(a);
    });

    return rows;
  }, [events, search, sortBy, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function startCreate() {
    setForm(emptyForm());
    setShowForm(true);
    setDuplicateForm(null);
    setPageError(null);
  }

  function startEdit(event: EventRow) {
    setForm({
      id: event.id,
      code: event.code ?? "",
      company: "",
      name: event.name ?? "",
      location: event.location ?? "",
      description: event.description ?? "",
      status: event.status ?? "draft",
      startDate: event.startDate ? String(event.startDate).slice(0, 10) : "",
      endDate: event.endDate ? String(event.endDate).slice(0, 10) : "",
    });

    setShowForm(true);
    setDuplicateForm(null);
    setPageError(null);
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm());
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();

    const payload = cleanFormPayload(form);

    if (!payload.name) {
      setPageError("Event name is required.");
      return;
    }

    if (!form.id && !payload.company) {
      setPageError("Please select a company (PRI or PNT).");
      return;
    }

    setSaving(true);
    setPageError(null);

    try {
      const res = await fetch(form.id ? `/api/events/${form.id}` : "/api/events", {
        method: form.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getApiError(data, "Failed to save event"));
      }

      closeForm();
      await loadEvents();

      if (payload.status === "active") {
        setStatusFilter("active");
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  function startDuplicate(event: EventRow) {
    const today = dateToYmd(new Date());

    setDuplicateForm({
      sourceEvent: event,
      company: inferEventCompany(event) ?? "PRI",
      name: `${event.name} Copy`,
      location: event.location ?? "",
      description: event.description ?? "",
      startDate: event.startDate ? String(event.startDate).slice(0, 10) : today,
      endDate: event.endDate ? String(event.endDate).slice(0, 10) : "",
    });

    setShowForm(false);
    setPageError(null);
  }

  async function duplicateEvent(e: React.FormEvent) {
    e.preventDefault();

    if (!duplicateForm) return;

    if (!duplicateForm.company || !duplicateForm.name.trim()) {
      setPageError("Company and event name are required.");
      return;
    }

    setDuplicating(duplicateForm.sourceEvent.id);
    setPageError(null);

    try {
      const res = await fetch(`/api/events/${duplicateForm.sourceEvent.id}/duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company: duplicateForm.company,
          name: duplicateForm.name.trim(),
          location: duplicateForm.location.trim() || null,
          description: duplicateForm.description.trim() || null,
          startDate: duplicateForm.startDate || null,
          endDate: duplicateForm.endDate || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getApiError(data, "Failed to duplicate event"));
      }

      setDuplicateForm(null);
      setStatusFilter("draft");
      await loadEvents();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to duplicate event");
    } finally {
      setDuplicating(null);
    }
  }

  async function deleteEvent(event: EventRow) {
    const confirmed = window.confirm(
      `Delete event "${event.name}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    setPageError(null);

    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getApiError(data, "Failed to delete event"));
      }

      await loadEvents();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to delete event");
    }
  }

  function resetFilters() {
    setStatusFilter("active");
    setSortBy("startAsc");
    setSearch("");
    setPage(1);
  }

  const statusOptions: Array<{
    key: StatusFilter;
    label: string;
    count: number;
  }> = [
    { key: "active", label: "Active", count: stats.active },
    { key: "draft", label: "Draft", count: stats.draft },
    { key: "closed", label: "Closed", count: stats.closed },
    { key: "all", label: "All", count: stats.total },
  ];

  return (
    <div className="space-y-6">
      <div
        className="rounded-3xl border p-5 md:p-6"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{
                  background: "rgba(255,101,63,0.10)",
                  color: "var(--brand-orange)",
                }}
              >
                <CalendarIcon size={22} />
              </div>

              <div>
                <p
                  className="text-xs font-bold uppercase tracking-[0.22em]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Event Management
                </p>

                <h1
                  className="text-2xl font-black tracking-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  Events
                </h1>
              </div>
            </div>

            <p
              className="mt-3 max-w-2xl text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Manage active POS events first. Use search, status tabs, sorting, and pagination
              when your event list becomes large.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={loadEvents}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                background: "var(--card)",
              }}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>

            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
              style={{
                background: "var(--brand-orange)",
                color: "white",
              }}
            >
              <Plus size={16} />
              New Event
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className="rounded-2xl border p-4 text-left transition hover:shadow-sm"
            style={{
              borderColor: statusFilter === "active" ? "var(--brand-orange)" : "var(--border)",
              background:
                statusFilter === "active" ? "rgba(255,101,63,0.06)" : "var(--background)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#16a34a" }}>
              Active
            </p>
            <p className="mt-1 text-2xl font-black" style={{ color: "var(--foreground)" }}>
              {stats.active}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("draft")}
            className="rounded-2xl border p-4 text-left transition hover:shadow-sm"
            style={{
              borderColor: statusFilter === "draft" ? "var(--brand-orange)" : "var(--border)",
              background:
                statusFilter === "draft" ? "rgba(255,101,63,0.06)" : "var(--background)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
              Draft
            </p>
            <p className="mt-1 text-2xl font-black" style={{ color: "var(--foreground)" }}>
              {stats.draft}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("closed")}
            className="rounded-2xl border p-4 text-left transition hover:shadow-sm"
            style={{
              borderColor: statusFilter === "closed" ? "var(--brand-orange)" : "var(--border)",
              background:
                statusFilter === "closed" ? "rgba(255,101,63,0.06)" : "var(--background)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#dc2626" }}>
              Closed
            </p>
            <p className="mt-1 text-2xl font-black" style={{ color: "var(--foreground)" }}>
              {stats.closed}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className="rounded-2xl border p-4 text-left transition hover:shadow-sm"
            style={{
              borderColor: statusFilter === "all" ? "var(--brand-orange)" : "var(--border)",
              background:
                statusFilter === "all" ? "rgba(255,101,63,0.06)" : "var(--background)",
            }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              All Events
            </p>
            <p className="mt-1 text-2xl font-black" style={{ color: "var(--foreground)" }}>
              {stats.total}
            </p>
          </button>
        </div>
      </div>

      {pageError && (
        <div
          className="flex items-start gap-3 rounded-2xl border p-4"
          style={{
            background: "rgba(220,38,38,0.08)",
            borderColor: "rgba(220,38,38,0.18)",
            color: "#dc2626",
          }}
        >
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold">Something went wrong</p>
            <p className="text-sm">{pageError}</p>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={saveEvent}
          className="rounded-3xl border p-5 md:p-6"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--foreground)" }}>
                {form.id ? "Edit Event" : "Create Event"}
              </h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Fill the event details. New events are saved as draft unless you choose active.
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl border p-2"
              style={{
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                {form.id ? "Event Code" : "Company"}
              </label>

              {form.id ? (
                <div
                  className="flex w-full items-center rounded-xl border px-3 py-2 text-sm font-mono"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                    background: "var(--background)",
                  }}
                >
                  {form.code || "—"}
                  <span className="ml-2 text-xs font-sans font-normal">(auto-generated)</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {EVENT_COMPANIES.map((company) => {
                    const selected = form.company === company.value;

                    return (
                      <button
                        key={company.value}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, company: company.value }))
                        }
                        className="rounded-xl border px-3 py-2 text-left text-sm transition"
                        style={{
                          borderColor: selected ? "#fb923c" : "var(--border)",
                          background: selected ? "rgba(251,146,60,0.1)" : "var(--input, var(--card))",
                          color: "var(--foreground)",
                        }}
                      >
                        <span className="block font-bold">{company.label}</span>
                        <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {company.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Event Name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
                placeholder="Jakarta Sneaker Expo"
              />
            </div>

            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Location
              </label>
              <input
                value={form.location}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
                placeholder="Jakarta"
              />
            </div>

            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <DateField
              label="Start Date"
              value={form.startDate}
              onChange={(value) => setForm((prev) => ({ ...prev, startDate: value }))}
            />

            <DateField
              label="End Date"
              value={form.endDate}
              onChange={(value) => setForm((prev) => ({ ...prev, endDate: value }))}
            />

            <div className="lg:col-span-2">
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
                placeholder="Optional notes for this event"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl border px-4 py-2 text-sm font-bold"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                background: "var(--card)",
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
              style={{
                background: "var(--brand-orange)",
                color: "white",
              }}
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {saving ? "Saving..." : form.id ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </form>
      )}

      {duplicateForm && (
        <form
          onSubmit={duplicateEvent}
          className="rounded-3xl border p-5 md:p-6"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--foreground)" }}>
                Duplicate Event
              </h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Create a new draft from “{duplicateForm.sourceEvent.name}”.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDuplicateForm(null)}
              className="rounded-xl border p-2"
              style={{
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Company
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_COMPANIES.map((company) => {
                  const selected = duplicateForm.company === company.value;

                  return (
                    <button
                      key={company.value}
                      type="button"
                      onClick={() =>
                        setDuplicateForm((prev) =>
                          prev ? { ...prev, company: company.value } : prev
                        )
                      }
                      className="rounded-xl border px-3 py-2 text-left text-sm transition"
                      style={{
                        borderColor: selected ? "#fb923c" : "var(--border)",
                        background: selected ? "rgba(251,146,60,0.1)" : "var(--input, var(--card))",
                        color: "var(--foreground)",
                      }}
                    >
                      <span className="block font-bold">{company.label}</span>
                      <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {company.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                The new event code will be generated automatically.
              </p>
            </div>

            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                New Event Name
              </label>
              <input
                value={duplicateForm.name}
                onChange={(e) =>
                  setDuplicateForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                }
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
              />
            </div>

            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Location
              </label>
              <input
                value={duplicateForm.location}
                onChange={(e) =>
                  setDuplicateForm((prev) =>
                    prev ? { ...prev, location: e.target.value } : prev,
                  )
                }
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
              />
            </div>

            <DateField
              label="Start Date"
              value={duplicateForm.startDate}
              onChange={(value) =>
                setDuplicateForm((prev) => (prev ? { ...prev, startDate: value } : prev))
              }
            />

            <DateField
              label="End Date"
              value={duplicateForm.endDate}
              onChange={(value) =>
                setDuplicateForm((prev) => (prev ? { ...prev, endDate: value } : prev))
              }
            />

            <div className="lg:col-span-2">
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Description
              </label>
              <textarea
                value={duplicateForm.description}
                onChange={(e) =>
                  setDuplicateForm((prev) =>
                    prev ? { ...prev, description: e.target.value } : prev,
                  )
                }
                rows={3}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setDuplicateForm(null)}
              className="rounded-xl border px-4 py-2 text-sm font-bold"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                background: "var(--card)",
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={duplicating === duplicateForm.sourceEvent.id}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
              style={{
                background: "var(--brand-orange)",
                color: "white",
              }}
            >
              {duplicating === duplicateForm.sourceEvent.id ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <Copy size={15} />
              )}
              {duplicating === duplicateForm.sourceEvent.id ? "Duplicating..." : "Duplicate Event"}
            </button>
          </div>
        </form>
      )}

      <div
        className="sticky top-4 z-10 rounded-3xl border p-4 shadow-sm"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setStatusFilter(option.key)}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"
                style={{
                  borderColor:
                    statusFilter === option.key ? "var(--brand-orange)" : "var(--border)",
                  color:
                    statusFilter === option.key
                      ? "var(--brand-orange)"
                      : "var(--muted-foreground)",
                  background:
                    statusFilter === option.key ? "rgba(255,101,63,0.08)" : "var(--card)",
                }}
              >
                <Filter size={14} />
                {option.label}
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{
                    background:
                      statusFilter === option.key
                        ? "rgba(255,101,63,0.12)"
                        : "var(--background)",
                    color:
                      statusFilter === option.key
                        ? "var(--brand-orange)"
                        : "var(--muted-foreground)",
                  }}
                >
                  {option.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div
              className="relative min-w-0 lg:w-72"
            >
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                  background: "var(--input, var(--card))",
                }}
                placeholder="Search name, code, location..."
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative">
                <SlidersHorizontal
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--muted-foreground)" }}
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="h-full rounded-xl border py-2 pl-9 pr-8 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-orange-400"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                    background: "var(--input, var(--card))",
                  }}
                >
                  <option value="startAsc">Start date ↑</option>
                  <option value="startDesc">Start date ↓</option>
                  <option value="activeFirst">Active first</option>
                  <option value="newest">Newest created</option>
                  <option value="nameAsc">Name A-Z</option>
                </select>
              </div>

              <div className="flex rounded-xl border p-1" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className="rounded-lg p-2"
                  style={{
                    background: viewMode === "cards" ? "rgba(255,101,63,0.10)" : "transparent",
                    color: viewMode === "cards" ? "var(--brand-orange)" : "var(--muted-foreground)",
                  }}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="rounded-lg p-2"
                  style={{
                    background: viewMode === "table" ? "rgba(255,101,63,0.10)" : "transparent",
                    color: viewMode === "table" ? "var(--brand-orange)" : "var(--muted-foreground)",
                  }}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-3 flex flex-col gap-2 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between"
          style={{
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
          }}
        >
          <span>
            Showing <b style={{ color: "var(--foreground)" }}>{paginatedEvents.length}</b> of{" "}
            <b style={{ color: "var(--foreground)" }}>{filteredEvents.length}</b> events
            {statusFilter === "active" ? " · default active view" : ""}
          </span>

          {(statusFilter !== "active" || search || sortBy !== "startAsc") && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-left text-xs font-bold"
              style={{ color: "var(--brand-orange)" }}
            >
              Reset to active events
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-48 animate-pulse rounded-3xl border"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          statusFilter={statusFilter}
          search={search}
          onCreate={startCreate}
          onReset={resetFilters}
        />
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginatedEvents.map((event) => (
            <div
              key={event.id}
              className="group rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:shadow-sm"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={event.status} />
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-mono font-bold"
                      style={{
                        background: "var(--background)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {event.code}
                    </span>
                    {inferEventCompany(event) && (
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          background: "rgba(251,146,60,0.12)",
                          color: "#c2410c",
                        }}
                      >
                        {inferEventCompany(event)}
                      </span>
                    )}
                  </div>

                  <h3
                    className="line-clamp-2 text-lg font-black leading-tight"
                    style={{ color: "var(--foreground)" }}
                  >
                    {event.name}
                  </h3>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(event)}
                    className="rounded-xl border p-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    <Pencil size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => startDuplicate(event)}
                    className="rounded-xl border p-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div
                  className="flex items-center gap-2 text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <MapPin size={15} className="flex-shrink-0" />
                  <span className="truncate">{event.location || "No location"}</span>
                </div>

                <div
                  className="grid grid-cols-2 gap-2 rounded-2xl p-3 text-sm"
                  style={{ background: "var(--background)" }}
                >
                  <div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Start
                    </p>
                    <p className="font-bold" style={{ color: "var(--foreground)" }}>
                      {formatDateLabel(event.startDate)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      End
                    </p>
                    <p className="font-bold" style={{ color: "var(--foreground)" }}>
                      {formatDateLabel(event.endDate)}
                    </p>
                  </div>
                </div>

                {event.description && (
                  <p
                    className="line-clamp-2 text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {event.description}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <Link
                  href={`/events/${event.id}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold"
                  style={{
                    background: "var(--brand-orange)",
                    color: "white",
                  }}
                >
                  Manage
                  <ArrowRight size={15} />
                </Link>

                <button
                  type="button"
                  onClick={() => deleteEvent(event)}
                  className="rounded-xl p-2.5"
                  style={{
                    background: "rgba(220,38,38,0.10)",
                    color: "#dc2626",
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-3xl border"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead style={{ background: "var(--background)" }}>
                <tr style={{ color: "var(--muted-foreground)" }}>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    Start
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    End
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {paginatedEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-black" style={{ color: "var(--foreground)" }}>
                          {event.name}
                        </p>
                        <p
                          className="mt-0.5 font-mono text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {event.code}
                          {inferEventCompany(event) && (
                            <span className="ml-1.5 font-sans font-bold" style={{ color: "#c2410c" }}>
                              {inferEventCompany(event)}
                            </span>
                          )}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <StatusBadge status={event.status} />
                    </td>

                    <td className="px-4 py-4" style={{ color: "var(--muted-foreground)" }}>
                      {event.location || "-"}
                    </td>

                    <td className="px-4 py-4 font-semibold" style={{ color: "var(--foreground)" }}>
                      {formatDateLabel(event.startDate)}
                    </td>

                    <td className="px-4 py-4 font-semibold" style={{ color: "var(--foreground)" }}>
                      {formatDateLabel(event.endDate)}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/events/${event.id}`}
                          className="rounded-xl px-3 py-2 text-xs font-bold"
                          style={{
                            background: "var(--brand-orange)",
                            color: "white",
                          }}
                        >
                          Manage
                        </Link>

                        <button
                          type="button"
                          onClick={() => startEdit(event)}
                          className="rounded-xl border p-2"
                          style={{
                            borderColor: "var(--border)",
                            color: "var(--muted-foreground)",
                          }}
                        >
                          <Pencil size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => startDuplicate(event)}
                          className="rounded-xl border p-2"
                          style={{
                            borderColor: "var(--border)",
                            color: "var(--muted-foreground)",
                          }}
                        >
                          <Copy size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteEvent(event)}
                          className="rounded-xl p-2"
                          style={{
                            background: "rgba(220,38,38,0.10)",
                            color: "#dc2626",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredEvents.length > PAGE_SIZE && (
        <div
          className="flex flex-col items-center justify-between gap-3 rounded-2xl border p-3 sm:flex-row"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Page{" "}
            <b style={{ color: "var(--foreground)" }}>
              {currentPage} / {pageCount}
            </b>
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold disabled:opacity-40"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                background: "var(--card)",
              }}
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
              disabled={currentPage >= pageCount}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold disabled:opacity-40"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                background: "var(--card)",
              }}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
