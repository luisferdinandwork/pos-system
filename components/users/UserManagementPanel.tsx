// components/users/UserManagementPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  User,
  Users,
  X,
  AlertCircle,
} from "lucide-react";

// ─── Shadcn-style primitives ────────────────────────────────────────────────

function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "admin" | "active" | "inactive";
}) {
  const styles: Record<string, string> = {
    default:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    admin:
      "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
    active:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    inactive:
      "bg-gray-100 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

function Select({
  value,
  onChange,
  children,
  disabled,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-8 text-sm text-gray-900 shadow-sm transition-colors focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-orange-500 dark:focus:ring-orange-900"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-gray-200 bg-white py-2 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-orange-500 dark:focus:ring-orange-900 ${
          icon ? "pl-9 pr-3" : "px-3"
        }`}
      />
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type EventOption = {
  id: number;
  code: string;
  name: string;
  status: string;
};

type ManagedUser = {
  id: number;
  name: string;
  username: string;
  role: "admin" | "user" | string;
  eventId: number | null;
  isActive: boolean;
  createdAt: string | null;
  events: {
    id: number;
    code: string;
    name: string;
    isActive: boolean;
  }[];
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function UserManagementPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [eventId, setEventId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [usersData, eventsData] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/users/event-options", { cache: "no-store" }).then((r) =>
          r.json()
        ),
      ]);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
    } finally {
      setLoading(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password.trim()) return;
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        username,
        password,
        role,
        eventId: role === "user" && eventId ? Number(eventId) : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to create user");
      return;
    }
    setName("");
    setUsername("");
    setPassword("");
    setRole("user");
    setEventId("");
    load();
  }

  async function toggleUser(user: ManagedUser) {
    await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    load();
  }

  async function deleteUser(user: ManagedUser) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`))
      return;
    await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    load();
  }

  async function assignEvent(user: ManagedUser, selectedEventId: string) {
    if (!selectedEventId) return;
    const res = await fetch(`/api/users/${user.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: Number(selectedEventId) }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to assign event");
      return;
    }
    load();
  }

  async function removeEvent(user: ManagedUser, removeEventId: number) {
    if (!confirm(`Remove access to this event for "${user.username}"?`)) return;
    await fetch(`/api/users/${user.id}/events?eventId=${removeEventId}`, {
      method: "DELETE",
    });
    load();
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((user) => roleFilter === "all" || user.role === roleFilter)
      .filter((user) => {
        if (!q) return true;
        return [
          user.name,
          user.username,
          user.role,
          ...user.events.map((e) => e.name),
          ...user.events.map((e) => e.code),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [search, roleFilter, users]);

  const adminCount = users.filter((u) => u.role === "admin").length;
  const cashierCount = users.filter((u) => u.role === "user").length;
  const activeCount = users.filter((u) => u.isActive).length;

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          User Management
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create and manage admin and cashier accounts across events.
        </p>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total users", value: users.length, icon: <Users size={16} /> },
          { label: "Admins", value: adminCount, icon: <ShieldCheck size={16} /> },
          { label: "Active", value: activeCount, icon: <User size={16} /> },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
              {stat.icon}
              <span className="text-xs font-medium">{stat.label}</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Create user form ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Create User
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            New accounts are active immediately upon creation.
          </p>
        </div>

        <form onSubmit={createUser} className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Display name
              </label>
              <Input
                value={name}
                onChange={setName}
                placeholder="Cashier Name"
                icon={<User size={14} />}
              />
            </div>

            <div className="lg:col-span-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Username
              </label>
              <Input
                value={username}
                onChange={setUsername}
                placeholder="cashier_1"
              />
            </div>

            <div className="lg:col-span-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Password
              </label>
              <Input
                value={password}
                onChange={setPassword}
                type="password"
                placeholder="••••••••"
                icon={<KeyRound size={14} />}
              />
            </div>

            <div className="lg:col-span-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Role
              </label>
              <Select value={role} onChange={(v) => setRole(v as "admin" | "user")}>
                <option value="user">Cashier / POS User</option>
                <option value="admin">Admin</option>
              </Select>
            </div>

            <div className="lg:col-span-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Assign to event{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <Select
                value={eventId}
                onChange={setEventId}
                disabled={role === "admin"}
                placeholder="No initial event"
              >
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.code} — {event.name}
                  </option>
                ))}
              </Select>
              {role === "admin" && (
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                  <AlertCircle size={11} />
                  Admins access all events
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !name.trim() || !username.trim() || !password.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {saving ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Users table ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {/* Table toolbar */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              All Users
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {filteredUsers.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Role filter tabs */}
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
              {(["all", "user", "admin"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRoleFilter(f)}
                  className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                    roleFilter === f
                      ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {f === "user" ? "Cashiers" : f === "admin" ? "Admins" : "All"}
                </button>
              ))}
            </div>

            <Input
              value={search}
              onChange={setSearch}
              placeholder="Search…"
              icon={<Search size={14} />}
              className="w-52"
            />

            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Table */}
        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={32} className="mb-3 text-gray-300 dark:text-gray-700" />
            <p className="text-sm font-medium text-gray-500">No users found</p>
            <p className="mt-1 text-xs text-gray-400">
              {search
                ? "Try adjusting your search"
                : "Create your first user above"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                    User
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                    Role
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                    Event Access
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filteredUsers.map((user) => {
                  const assignableEvents = events.filter(
                    (ev) => !user.events.some((item) => item.id === ev.id)
                  );
                  return (
                    <tr
                      key={user.id}
                      className="group transition-colors hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                    >
                      {/* User identity */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              user.role === "admin"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                                : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                            }`}
                          >
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {user.name}
                            </p>
                            <p className="font-mono text-xs text-gray-400">
                              {user.username}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        {user.role === "admin" ? (
                          <Badge variant="admin">
                            <ShieldCheck size={11} className="mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge>Cashier</Badge>
                        )}
                      </td>

                      {/* Event access — the key UX area */}
                      <td className="px-5 py-4">
                        {user.role === "admin" ? (
                          <span className="text-xs text-gray-400 italic">
                            All events
                          </span>
                        ) : (
                          <div className="space-y-2">
                            {/* Assigned event chips */}
                            <div className="flex flex-wrap gap-1.5">
                              {user.events.length === 0 ? (
                                <span className="text-xs text-gray-400">
                                  No events assigned
                                </span>
                              ) : (
                                user.events.map((event) => (
                                  <span
                                    key={event.id}
                                    className="group/chip inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                  >
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                                        event.isActive
                                          ? "bg-emerald-500"
                                          : "bg-gray-400"
                                      }`}
                                    />
                                    <span className="font-mono font-medium text-orange-600 dark:text-orange-400">
                                      {event.code}
                                    </span>
                                    <span className="hidden sm:inline">
                                      {event.name}
                                    </span>
                                    <button
                                      onClick={() =>
                                        removeEvent(user, event.id)
                                      }
                                      title="Remove from event"
                                      className="ml-0.5 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover/chip:opacity-100 dark:hover:bg-red-950"
                                    >
                                      <X size={11} />
                                    </button>
                                  </span>
                                ))
                              )}
                            </div>

                            {/* Assign additional event inline dropdown */}
                            {assignableEvents.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <Link2
                                  size={11}
                                  className="text-gray-300 dark:text-gray-600"
                                />
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    assignEvent(user, e.target.value);
                                    e.currentTarget.value = "";
                                  }}
                                  className="rounded-md border border-dashed border-gray-300 bg-transparent px-2 py-1 text-xs text-gray-500 transition-colors hover:border-orange-400 hover:text-orange-600 focus:border-orange-400 focus:outline-none dark:border-gray-600 dark:text-gray-400 dark:hover:border-orange-500 dark:hover:text-orange-400"
                                >
                                  <option value="" disabled>
                                    + Add event access…
                                  </option>
                                  {assignableEvents.map((ev) => (
                                    <option key={ev.id} value={ev.id}>
                                      {ev.code} — {ev.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status toggle */}
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleUser(user)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all hover:opacity-80 ${
                            user.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800"
                              : "bg-gray-100 text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              user.isActive ? "bg-emerald-500" : "bg-gray-400"
                            }`}
                          />
                          {user.isActive ? "Active" : "Disabled"}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => deleteUser(user)}
                          title="Delete user"
                          className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}