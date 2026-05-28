// components/events/EventUsersPanel.tsx
"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react";

// ─── Shared primitives (co-locate or import from ui/) ───────────────────────

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
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
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

type EventUser = {
  id: number;
  name: string;
  username: string;
  role: string;
  eventId: number | null;
  isActive: boolean;
  assignmentId?: number | null;
  assignmentActive?: boolean;
};

type Props = {
  eventId: number;
};

// ─── Tab type ────────────────────────────────────────────────────────────────

type Tab = "assign" | "create";

export function EventUsersPanel({ eventId }: Props) {
  const [users, setUsers] = useState<EventUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<EventUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("assign");

  const [existingUserId, setExistingUserId] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/users?includeAvailable=true`,
        { cache: "no-store" }
      );

      const data = await res.json().catch(() => ({
        users: [],
        availableUsers: [],
      }));

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load event users");
      }

      // Supports both response shapes:
      // 1. EventUser[] from the session-compatible API default
      // 2. { users: EventUser[], availableUsers: EventUser[] } for this Users tab
      const normalizedUsers = Array.isArray(data)
        ? data
        : Array.isArray(data?.users)
          ? data.users
          : [];

      const normalizedAvailableUsers = Array.isArray(data?.availableUsers)
        ? data.availableUsers
        : [];

      setUsers(normalizedUsers);
      setAvailableUsers(normalizedAvailableUsers);
    } catch (error) {
      console.error(error);
      setUsers([]);
      setAvailableUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function assignExistingUser(e: React.FormEvent) {
    e.preventDefault();
    if (!existingUserId) return;
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ existingUserId: Number(existingUserId) }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to assign user");
      return;
    }
    setExistingUserId("");
    load();
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password }),
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
    load();
  }

  async function toggleUser(user: EventUser) {
    await fetch(`/api/events/${eventId}/users`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id,
        isActive: !(user.assignmentActive ?? user.isActive),
      }),
    });
    load();
  }

  async function removeFromEvent(user: EventUser) {
    if (
      !confirm(
        `Remove "${user.username}" from this event? Their global account will not be deleted.`
      )
    )
      return;
    await fetch(`/api/events/${eventId}/users?id=${user.id}`, {
      method: "DELETE",
    });
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const activeCount = users.filter(
    (u) => u.assignmentActive ?? u.isActive
  ).length;

  return (
    <div className="space-y-5">
      {/* ── Add User Card ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Add User to Event
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Assign an existing cashier or create a new one for this event.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(
            [
              {
                id: "assign" as Tab,
                label: "Assign existing",
                icon: <Link2 size={14} />,
              },
              {
                id: "create" as Tab,
                label: "Create new",
                icon: <UserPlus size={14} />,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-orange-500 text-orange-600 dark:text-orange-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "assign" ? (
            /* Assign existing user */
            <form onSubmit={assignExistingUser}>
              <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <strong>Tip:</strong> Use this when a cashier already works at
                another event. One account, multiple events — no duplicate
                passwords to manage.
              </p>

              {availableUsers.length === 0 ? (
                <p className="text-sm text-gray-400">
                  All existing cashiers are already assigned to this event.
                </p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Select
                    value={existingUserId}
                    onChange={setExistingUserId}
                    placeholder="Choose a cashier…"
                    className="flex-1"
                  >
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} — {user.username}
                      </option>
                    ))}
                  </Select>

                  <button
                    type="submit"
                    disabled={saving || !existingUserId}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Link2 size={14} />
                    )}
                    Assign to this event
                  </button>
                </div>
              )}
            </form>
          ) : (
            /* Create new user */
            <form onSubmit={createUser}>
              <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2.5 text-xs text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                <strong>Tip:</strong> Only use this for a brand-new cashier.
                If they already have an account from another event, use
                "Assign existing" instead.
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Display name
                  </label>
                  <Input
                    value={name}
                    onChange={setName}
                    placeholder="Cashier 1"
                    icon={<User size={14} />}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Username
                  </label>
                  <Input
                    value={username}
                    onChange={setUsername}
                    placeholder="cashier_1"
                  />
                </div>

                <div>
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
              </div>

              <div className="mt-4">
                <button
                  type="submit"
                  disabled={
                    saving ||
                    !name.trim() ||
                    !username.trim() ||
                    !password.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {saving ? "Creating…" : "Create & Assign"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Users list ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Assigned Users
            </h3>
            {users.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {activeCount} active · {users.length} total
              </span>
            )}
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Users
              size={32}
              className="mb-3 text-gray-300 dark:text-gray-700"
            />
            <p className="text-sm font-medium text-gray-500">
              No users assigned yet
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Use the form above to add cashiers to this event.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {users.map((user) => {
              const active = user.assignmentActive ?? user.isActive;
              return (
                <div
                  key={user.id}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                    {user.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {user.name}
                    </p>
                    <p className="font-mono text-xs text-gray-400">
                      {user.username}
                    </p>
                  </div>

                  {/* Status toggle */}
                  <button
                    onClick={() => toggleUser(user)}
                    title={active ? "Click to disable" : "Click to enable"}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all hover:opacity-80 ${
                      active
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800"
                        : "bg-gray-100 text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        active ? "bg-emerald-500" : "bg-gray-400"
                      }`}
                    />
                    {active ? "Active" : "Disabled"}
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => removeFromEvent(user)}
                    title="Remove from event"
                    className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {users.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
            <p className="text-xs text-gray-400">
              Removing a user from this event doesn't delete their account —
              they'll still appear in other assigned events.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}