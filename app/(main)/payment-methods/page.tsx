// app/(main)/payment-methods/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
  Banknote,
  CreditCard,
  Building2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type EdcMachine = {
  id: number;
  bankName: string;
  label: string;
  terminalId: string | null;
  isActive: boolean;
  sortOrder: number;
};

type PaymentMethod = {
  id: number;
  name: string;
  type: string;
  edcMethod: string | null;
  edcMachineId: number | null;
  provider: string | null;
  accountInfo: string | null;
  isActive: boolean;
  sortOrder: number;
};

// ── Metadata ──────────────────────────────────────────────────────────────────

const TOP_TYPES = [
  {
    value: "cash",
    label: "Cash",
    icon: "💵",
    color: "#16a34a",
    bg: "rgba(22,163,74,0.1)",
  },
  {
    value: "edc",
    label: "EDC",
    icon: "💳",
    color: "#0369a1",
    bg: "rgba(3,105,161,0.1)",
  },
] as const;

const EDC_METHODS = [
  { value: "debit", label: "Debit Card" },
  { value: "credit", label: "Credit Card" },
  { value: "qris", label: "QRIS" },
] as const;

const TYPE_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  cash: {
    label: "Cash",
    icon: <Banknote size={14} />,
    color: "#16a34a",
    bg: "rgba(22,163,74,0.1)",
  },
  edc: {
    label: "EDC",
    icon: <CreditCard size={14} />,
    color: "#0369a1",
    bg: "rgba(3,105,161,0.1)",
  },
};

const cs = { background: "var(--card)", borderColor: "var(--border)" };
const inp =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
const ist = {
  borderColor: "var(--border)",
  color: "var(--foreground)",
  background: "var(--card)",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [machines, setMachines] = useState<EdcMachine[]>([]);

  const [showMethodForm, setShowMethodForm] = useState(false);
  const [methodForm, setMethodForm] = useState<
    Partial<PaymentMethod> & { type: string }
  >({ type: "cash" });
  const [savingMethod, setSavingMethod] = useState(false);

  const [showMachineForm, setShowMachineForm] = useState(false);
  const [machineForm, setMachineForm] = useState<Partial<EdcMachine>>({});
  const [savingMachine, setSavingMachine] = useState(false);

  const [expandedMachines, setExpandedMachines] = useState<Set<number>>(
    new Set()
  );

  async function load() {
    const [m, mc] = await Promise.all([
      fetch("/api/payment-methods", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/edc-machines", { cache: "no-store" }).then((r) => r.json()),
    ]);

    const methodRows = Array.isArray(m)
      ? m.filter((method: PaymentMethod) =>
          method.type === "cash" || method.type === "edc"
        )
      : [];

    setMethods(methodRows);
    setMachines(Array.isArray(mc) ? mc : []);

    if (Array.isArray(mc) && mc.length > 0) {
      setExpandedMachines(new Set(mc.map((x: EdcMachine) => x.id)));
    }
  }

  useEffect(() => {
    load();
  }, []);

  // ── Payment method CRUD ────────────────────────────────────────────────────

  async function saveMethod(e: React.FormEvent) {
    e.preventDefault();
    setSavingMethod(true);

    const normalized: Partial<PaymentMethod> & { type: string } = {
      ...methodForm,
      provider: null,
      edcMethod: methodForm.type === "edc" ? methodForm.edcMethod ?? null : null,
      edcMachineId:
        methodForm.type === "edc" && methodForm.edcMachineId
          ? Number(methodForm.edcMachineId)
          : null,
      accountInfo: methodForm.accountInfo || null,
      sortOrder: Number(methodForm.sortOrder ?? 0),
      isActive: methodForm.isActive ?? true,
    };

    await fetch("/api/payment-methods", {
      method: methodForm.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });

    setSavingMethod(false);
    setShowMethodForm(false);
    setMethodForm({ type: "cash" });
    load();
  }

  async function toggleMethod(m: PaymentMethod) {
    await fetch("/api/payment-methods", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, isActive: !m.isActive }),
    });
    load();
  }

  async function deleteMethod(id: number) {
    if (!confirm("Delete this payment method?")) return;
    await fetch(`/api/payment-methods?id=${id}`, { method: "DELETE" });
    load();
  }

  // ── EDC machine CRUD ───────────────────────────────────────────────────────

  async function saveMachine(e: React.FormEvent) {
    e.preventDefault();
    setSavingMachine(true);

    await fetch("/api/edc-machines", {
      method: machineForm.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankName: machineForm.bankName || "EDC",
        label: machineForm.label || "EDC",
        terminalId: machineForm.terminalId || null,
        isActive: machineForm.isActive ?? true,
        sortOrder: Number(machineForm.sortOrder ?? 10),
        ...(machineForm.id ? { id: machineForm.id } : {}),
      }),
    });

    setSavingMachine(false);
    setShowMachineForm(false);
    setMachineForm({});
    load();
  }

  async function deleteMachine(id: number) {
    const childCount = methods.filter((m) => m.edcMachineId === id).length;
    if (
      !confirm(
        `Delete this EDC machine?${
          childCount > 0 ? ` ${childCount} sub-method(s) will be unlinked.` : ""
        }`
      )
    ) {
      return;
    }

    await fetch(`/api/edc-machines?id=${id}`, { method: "DELETE" });
    load();
  }

  function addEdcChild(machine: EdcMachine, edcMethod: string) {
    const meta = EDC_METHODS.find((m) => m.value === edcMethod);
    const label = meta?.label ?? edcMethod;

    setMethodForm({
      type: "edc",
      name: label,
      edcMethod,
      edcMachineId: machine.id,
      provider: null,
      accountInfo: null,
      isActive: true,
      sortOrder:
        machine.sortOrder +
        (edcMethod === "debit" ? 0 : edcMethod === "credit" ? 1 : 2),
    });

    setShowMethodForm(true);
  }

  function toggleMachineExpand(id: number) {
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Grouped data ───────────────────────────────────────────────────────────

  const cashMethods = methods.filter((m) => m.type === "cash");
  const edcMethods = methods.filter((m) => m.type === "edc");
  const activeCount = methods.filter((m) => m.isActive).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            Payment Methods
          </h1>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            {activeCount} active · {methods.length} total · Cash + EDC only
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMachineForm({
                bankName: "EDC",
                label: "EDC",
                isActive: true,
                sortOrder: 10,
              });
              setShowMachineForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
              background: "var(--card)",
            }}
          >
            <Building2 size={14} /> Add EDC Machine
          </button>

          <button
            onClick={() => {
              setMethodForm({
                type: "cash",
                name: "Cash",
                isActive: true,
                sortOrder: 0,
              });
              setShowMethodForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "var(--brand-orange)", color: "white" }}
          >
            <Plus size={15} /> Add Method
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Cash",
            value: cashMethods.length,
            color: TYPE_META.cash.color,
          },
          {
            label: "EDC Machines",
            value: machines.length,
            color: TYPE_META.edc.color,
          },
          {
            label: "EDC Methods",
            value: edcMethods.length,
            color: TYPE_META.edc.color,
          },
          {
            label: "Active",
            value: activeCount,
            color: "#f97316",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border px-4 py-3"
            style={cs}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--muted-foreground)" }}
            >
              {card.label}
            </p>
            <p className="text-xl font-black mt-1" style={{ color: card.color }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Cash ──────────────────────────────────────────────────────────── */}
      <SectionWrapper
        label="Cash"
        meta={TYPE_META.cash}
        onAdd={() => {
          setMethodForm({
            type: "cash",
            name: "Cash",
            isActive: true,
            sortOrder: 0,
          });
          setShowMethodForm(true);
        }}
      >
        {cashMethods.length === 0 ? (
          <EmptyRow label="cash" />
        ) : (
          cashMethods.map((m) => (
            <MethodRow
              key={m.id}
              m={m}
              meta={TYPE_META.cash}
              onToggle={toggleMethod}
              onEdit={() => {
                setMethodForm(m);
                setShowMethodForm(true);
              }}
              onDelete={deleteMethod}
            />
          ))
        )}
      </SectionWrapper>

      {/* ── EDC ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={cs}>
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{
            borderColor: "var(--border)",
            background: TYPE_META.edc.bg,
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: TYPE_META.edc.color }}>
              <CreditCard size={14} />
            </span>
            <span
              className="font-semibold text-sm"
              style={{ color: TYPE_META.edc.color }}
            >
              EDC
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: TYPE_META.edc.bg,
                color: TYPE_META.edc.color,
                border: `1px solid ${TYPE_META.edc.color}33`,
              }}
            >
              {machines.length} machine{machines.length !== 1 ? "s" : ""}
            </span>
          </div>

          <button
            onClick={() => {
              setMachineForm({
                bankName: "EDC",
                label: "EDC",
                isActive: true,
                sortOrder: machines.length + 10,
              });
              setShowMachineForm(true);
            }}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{
              background: TYPE_META.edc.bg,
              color: TYPE_META.edc.color,
              border: `1px solid ${TYPE_META.edc.color}44`,
            }}
          >
            <Plus size={11} /> Add Machine
          </button>
        </div>

        {machines.length === 0 ? (
          <EmptyRow label="EDC machine. Create one first, then add Debit Card, Credit Card, and QRIS inside it." />
        ) : (
          machines.map((machine) => {
            const children = edcMethods.filter(
              (m) => m.edcMachineId === machine.id
            );
            const isExpanded = expandedMachines.has(machine.id);

            return (
              <div
                key={machine.id}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="flex items-center gap-3 px-5 py-3"
                  style={{ background: "var(--muted)" }}
                >
                  <button
                    onClick={() => toggleMachineExpand(machine.id)}
                    style={{
                      color: "var(--muted-foreground)",
                      flexShrink: 0,
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>

                  <Building2
                    size={14}
                    style={{ color: TYPE_META.edc.color, flexShrink: 0 }}
                  />

                  <div className="flex-1 min-w-0">
                    <span
                      className="font-bold text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      {machine.label}
                    </span>
                    {machine.terminalId && (
                      <span
                        className="ml-2 text-xs font-mono"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        TID: {machine.terminalId}
                      </span>
                    )}
                    {!machine.isActive && (
                      <span
                        className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                        style={{
                          background: "var(--muted)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>

                  <span
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {children.length} method{children.length !== 1 ? "s" : ""}
                  </span>

                  {EDC_METHODS.filter(
                    (em) => !children.some((c) => c.edcMethod === em.value)
                  ).map((em) => (
                    <button
                      key={em.value}
                      onClick={() => addEdcChild(machine, em.value)}
                      className="text-[10px] px-2 py-1 rounded-lg font-semibold"
                      style={{
                        background: "rgba(3,105,161,0.08)",
                        color: TYPE_META.edc.color,
                      }}
                    >
                      + {em.label}
                    </button>
                  ))}

                  <button
                    onClick={() => {
                      setMachineForm(machine);
                      setShowMachineForm(true);
                    }}
                    className="p-1.5 rounded-lg"
                    style={{
                      background: "rgba(255,200,92,0.15)",
                      color: "#b45309",
                    }}
                  >
                    <Pencil size={12} />
                  </button>

                  <button
                    onClick={() => deleteMachine(machine.id)}
                    className="p-1.5 rounded-lg"
                    style={{
                      background: "rgba(220,38,38,0.1)",
                      color: "#dc2626",
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {children.length === 0 ? (
                      <p
                        className="px-14 py-4 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        No sub-methods. Use + Debit Card, + Credit Card, or + QRIS.
                      </p>
                    ) : (
                      children.map((m) => {
                        const edcLabel =
                          EDC_METHODS.find((em) => em.value === m.edcMethod)
                            ?.label ?? "EDC";

                        return (
                          <div
                            key={m.id}
                            className="pl-12"
                            style={{ opacity: m.isActive ? 1 : 0.5 }}
                          >
                            <MethodRow
                              m={m}
                              meta={{ ...TYPE_META.edc, label: edcLabel }}
                              subLabel={edcLabel}
                              onToggle={toggleMethod}
                              onEdit={() => {
                                setMethodForm(m);
                                setShowMethodForm(true);
                              }}
                              onDelete={deleteMethod}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {edcMethods.filter((m) => !m.edcMachineId).length > 0 && (
          <div className="border-t" style={{ borderColor: "var(--border)" }}>
            <p
              className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--muted-foreground)" }}
            >
              Unassigned EDC
            </p>
            {edcMethods
              .filter((m) => !m.edcMachineId)
              .map((m) => (
                <MethodRow
                  key={m.id}
                  m={m}
                  meta={TYPE_META.edc}
                  onToggle={toggleMethod}
                  onEdit={() => {
                    setMethodForm(m);
                    setShowMethodForm(true);
                  }}
                  onDelete={deleteMethod}
                />
              ))}
          </div>
        )}
      </div>

      {/* ── EDC Machine modal ─────────────────────────────────────────────── */}
      {showMachineForm && (
        <Modal
          title={machineForm.id ? "Edit EDC Machine" : "New EDC Machine"}
          onClose={() => {
            setShowMachineForm(false);
            setMachineForm({});
          }}
        >
          <form onSubmit={saveMachine} className="p-6 space-y-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Internal Name *
              </label>
              <input
                required
                value={machineForm.bankName ?? "EDC"}
                onChange={(e) =>
                  setMachineForm({ ...machineForm, bankName: e.target.value })
                }
                placeholder="EDC"
                className={inp}
                style={ist}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                This replaces the old bank-name grouping. Use “EDC” unless you
                have multiple physical terminals.
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Display Label *
              </label>
              <input
                required
                value={machineForm.label ?? "EDC"}
                onChange={(e) =>
                  setMachineForm({ ...machineForm, label: e.target.value })
                }
                placeholder="EDC"
                className={inp}
                style={ist}
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Terminal ID optional
              </label>
              <input
                value={machineForm.terminalId ?? ""}
                onChange={(e) =>
                  setMachineForm({
                    ...machineForm,
                    terminalId: e.target.value || null,
                  })
                }
                placeholder="TID printed on terminal"
                className={inp}
                style={ist}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Sort Order
                </label>
                <input
                  type="number"
                  min="0"
                  value={machineForm.sortOrder ?? 10}
                  onChange={(e) =>
                    setMachineForm({
                      ...machineForm,
                      sortOrder: Number(e.target.value),
                    })
                  }
                  className={inp}
                  style={ist}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Active
                </label>
                <ActiveToggle
                  value={machineForm.isActive ?? true}
                  onChange={(v) =>
                    setMachineForm({ ...machineForm, isActive: v })
                  }
                />
              </div>
            </div>

            <FormActions
              saving={savingMachine}
              isEdit={!!machineForm.id}
              saveLabel="Machine"
              onCancel={() => {
                setShowMachineForm(false);
                setMachineForm({});
              }}
            />
          </form>
        </Modal>
      )}

      {/* ── Payment method modal ───────────────────────────────────────────── */}
      {showMethodForm && (
        <Modal
          title={methodForm.id ? "Edit Payment Method" : "New Payment Method"}
          onClose={() => {
            setShowMethodForm(false);
            setMethodForm({ type: "cash" });
          }}
        >
          <form onSubmit={saveMethod} className="p-6 space-y-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Type *
              </label>

              <div className="grid grid-cols-2 gap-2">
                {TOP_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() =>
                      setMethodForm({
                        ...methodForm,
                        type: t.value,
                        edcMethod: null,
                        edcMachineId: null,
                        provider: null,
                      })
                    }
                    className="flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 text-xs font-medium transition-all"
                    style={{
                      borderColor:
                        methodForm.type === t.value ? t.color : "var(--border)",
                      background:
                        methodForm.type === t.value ? t.bg : "transparent",
                      color:
                        methodForm.type === t.value
                          ? t.color
                          : "var(--muted-foreground)",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {methodForm.type === "edc" && (
              <>
                <div>
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    EDC Machine *
                  </label>

                  <select
                    required
                    value={methodForm.edcMachineId ?? ""}
                    onChange={(e) =>
                      setMethodForm({
                        ...methodForm,
                        edcMachineId: Number(e.target.value),
                      })
                    }
                    className={inp}
                    style={ist}
                  >
                    <option value="">Select machine…</option>
                    {machines.map((mc) => (
                      <option key={mc.id} value={mc.id}>
                        {mc.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    EDC Method *
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    {EDC_METHODS.map((em) => (
                      <button
                        key={em.value}
                        type="button"
                        onClick={() =>
                          setMethodForm({
                            ...methodForm,
                            edcMethod: em.value,
                            name:
                              !methodForm.name || methodForm.name === "Cash"
                                ? em.label
                                : methodForm.name,
                          })
                        }
                        className="rounded-xl border py-2.5 text-sm font-semibold transition-all"
                        style={{
                          borderColor:
                            methodForm.edcMethod === em.value
                              ? TYPE_META.edc.color
                              : "var(--border)",
                          background:
                            methodForm.edcMethod === em.value
                              ? TYPE_META.edc.bg
                              : "transparent",
                          color:
                            methodForm.edcMethod === em.value
                              ? TYPE_META.edc.color
                              : "var(--muted-foreground)",
                        }}
                      >
                        {em.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Display Name *
              </label>
              <input
                required
                value={methodForm.name ?? ""}
                onChange={(e) =>
                  setMethodForm({ ...methodForm, name: e.target.value })
                }
                placeholder={
                  methodForm.type === "cash"
                    ? "Cash"
                    : "Debit Card / Credit Card / QRIS"
                }
                className={inp}
                style={ist}
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Account / Merchant Info{" "}
                <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                value={methodForm.accountInfo ?? ""}
                onChange={(e) =>
                  setMethodForm({
                    ...methodForm,
                    accountInfo: e.target.value || null,
                  })
                }
                placeholder="Merchant ID, terminal note, etc."
                className={inp}
                style={ist}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Sort Order
                </label>
                <input
                  type="number"
                  min="0"
                  value={methodForm.sortOrder ?? 0}
                  onChange={(e) =>
                    setMethodForm({
                      ...methodForm,
                      sortOrder: Number(e.target.value),
                    })
                  }
                  className={inp}
                  style={ist}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Active
                </label>
                <ActiveToggle
                  value={methodForm.isActive ?? true}
                  onChange={(v) =>
                    setMethodForm({ ...methodForm, isActive: v })
                  }
                />
              </div>
            </div>

            <FormActions
              saving={savingMethod}
              isEdit={!!methodForm.id}
              saveLabel="Method"
              onCancel={() => {
                setShowMethodForm(false);
                setMethodForm({ type: "cash" });
              }}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(30,16,78,0.3)",
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        className="rounded-2xl border w-full max-w-md shadow-2xl"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="font-bold" style={{ color: "var(--foreground)" }}>
            {title}
          </h2>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{
              background: "var(--muted)",
              color: "var(--muted-foreground)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function SectionWrapper({
  label,
  meta,
  onAdd,
  children,
}: {
  label: string;
  meta: { color: string; bg: string; icon: React.ReactNode };
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border)", background: meta.bg }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <span className="font-semibold text-sm" style={{ color: meta.color }}>
            {label}
          </span>
        </div>

        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium"
          style={{
            background: meta.bg,
            color: meta.color,
            border: `1px solid ${meta.color}44`,
          }}
        >
          <Plus size={11} /> Add
        </button>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <p
      className="px-5 py-6 text-center text-sm"
      style={{ color: "var(--muted-foreground)" }}
    >
      No {label} yet.
    </p>
  );
}

function MethodRow({
  m,
  meta,
  subLabel,
  onToggle,
  onEdit,
  onDelete,
}: {
  m: PaymentMethod;
  meta: { label: string; icon: React.ReactNode; color: string; bg: string };
  subLabel?: string;
  onToggle: (m: PaymentMethod) => void;
  onEdit: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-3.5 transition-colors"
      style={{ opacity: m.isActive ? 1 : 0.5 }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-semibold text-sm"
            style={{ color: "var(--foreground)" }}
          >
            {m.name}
          </span>

          {subLabel && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: meta.bg, color: meta.color }}
            >
              {subLabel}
            </span>
          )}

          {!m.isActive && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "var(--muted)",
                color: "var(--muted-foreground)",
              }}
            >
              Inactive
            </span>
          )}
        </div>

        {m.accountInfo && (
          <p
            className="text-xs mt-0.5 font-mono truncate"
            style={{ color: "var(--muted-foreground)" }}
          >
            {m.accountInfo}
          </p>
        )}
      </div>

      <span
        className="text-xs font-mono w-6 text-center"
        style={{ color: "var(--muted-foreground)" }}
      >
        #{m.sortOrder}
      </span>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onToggle(m)}
          className="p-1.5 rounded-lg"
          style={{
            background: m.isActive ? "rgba(22,163,74,0.1)" : "var(--muted)",
            color: m.isActive ? "#16a34a" : "var(--muted-foreground)",
          }}
        >
          {m.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
        </button>

        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg"
          style={{ background: "rgba(255,200,92,0.15)", color: "#b45309" }}
        >
          <Pencil size={13} />
        </button>

        <button
          onClick={() => onDelete(m.id)}
          className="p-1.5 rounded-lg"
          style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function ActiveToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium"
      style={{
        borderColor: value ? "#16a34a" : "var(--border)",
        background: value ? "rgba(22,163,74,0.1)" : "var(--muted)",
        color: value ? "#16a34a" : "var(--muted-foreground)",
      }}
    >
      {value ? (
        <>
          <ToggleRight size={16} /> Yes
        </>
      ) : (
        <>
          <ToggleLeft size={16} /> No
        </>
      )}
    </button>
  );
}

function FormActions({
  saving,
  isEdit,
  saveLabel,
  onCancel,
}: {
  saving: boolean;
  isEdit: boolean;
  saveLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40"
        style={{ background: "var(--brand-orange)", color: "white" }}
      >
        {saving ? "Saving…" : isEdit ? `Update ${saveLabel}` : `Create ${saveLabel}`}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="px-5 rounded-xl text-sm border font-medium"
        style={{
          borderColor: "var(--border)",
          color: "var(--muted-foreground)",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
