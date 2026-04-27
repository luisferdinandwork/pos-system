// app/payment-methods/page.tsx
"use client";
import { useEffect, useState } from "react";
import {
  Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight,
  GripVertical, Banknote, CreditCard, Wallet, QrCode,
} from "lucide-react";

const PAYMENT_TYPES = [
  { value: "cash",    label: "Cash",     icon: "💵" },
  { value: "qris",    label: "QRIS",     icon: "📱" },
  { value: "debit",   label: "Debit",    icon: "💳" },
  { value: "credit",  label: "Credit",   icon: "🏦" },
  { value: "ewallet", label: "E-Wallet", icon: "👛" },
] as const;

type PaymentMethod = {
  id: number;
  name: string;
  type: string;
  provider: string | null;
  accountInfo: string | null;
  isActive: boolean;
  sortOrder: number;
};

type FormState = Omit<PaymentMethod, "id"> & { id?: number };

const emptyForm = (): FormState => ({
  name: "", type: "cash", provider: "",
  accountInfo: "", isActive: true, sortOrder: 0,
});

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  cash:    { label: "Cash",     icon: <Banknote size={14} />,   color: "#16a34a", bg: "rgba(22,163,74,0.1)"   },
  qris:    { label: "QRIS",     icon: <QrCode size={14} />,     color: "#7c3aed", bg: "rgba(124,58,237,0.1)"  },
  debit:   { label: "Debit",    icon: <CreditCard size={14} />, color: "#0369a1", bg: "rgba(3,105,161,0.1)"   },
  credit:  { label: "Credit",   icon: <CreditCard size={14} />, color: "#b45309", bg: "rgba(180,83,9,0.1)"    },
  ewallet: { label: "E-Wallet", icon: <Wallet size={14} />,     color: "#be185d", bg: "rgba(190,24,93,0.1)"   },
};

const PRESETS: Record<string, { name: string; provider: string }[]> = {
  cash:    [{ name: "Cash",          provider: ""          }],
  qris:    [{ name: "QRIS",          provider: "GoPay"     },
            { name: "QRIS",          provider: "OVO"       },
            { name: "QRIS",          provider: "ShopeePay" },
            { name: "QRIS",          provider: "Dana"      }],
  debit:   [{ name: "EDC BCA",       provider: "BCA"       },
            { name: "EDC Mandiri",   provider: "Mandiri"   },
            { name: "EDC BNI",       provider: "BNI"       },
            { name: "EDC BRI",       provider: "BRI"       }],
  credit:  [{ name: "Credit BCA",    provider: "BCA"       },
            { name: "Credit Mandiri",provider: "Mandiri"   },
            { name: "Credit CIMB",   provider: "CIMB"      }],
  ewallet: [{ name: "GoPay",         provider: "Gojek"     },
            { name: "OVO",           provider: "OVO"       },
            { name: "Dana",          provider: "Dana"      },
            { name: "ShopeePay",     provider: "Shopee"    },
            { name: "LinkAja",       provider: "LinkAja"   }],
};

export default function PaymentMethodsPage() {
  const [methods, setMethods]   = useState<PaymentMethod[]>([]);
  const [form, setForm]         = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);

  async function load() {
    const res = await fetch("/api/payment-methods");
    setMethods(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/payment-methods", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm(emptyForm());
    load();
  }

  async function handleToggle(m: PaymentMethod) {
    await fetch("/api/payment-methods", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, isActive: !m.isActive }),
    });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this payment method?")) return;
    await fetch(`/api/payment-methods?id=${id}`, { method: "DELETE" });
    load();
  }

  function applyPreset(preset: { name: string; provider: string }) {
    setForm((f) => ({ ...f, name: preset.name, provider: preset.provider }));
  }

  const grouped = PAYMENT_TYPES.map((t) => ({
    ...t,
    methods: methods.filter((m) => m.type === t.value),
  }));

  const cs = { background: "var(--card)", borderColor: "var(--border)" };
  const inputCls = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 transition-colors";
  const inputStyle = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            Payment Methods
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {methods.filter((m) => m.isActive).length} active · {methods.length} total
          </p>
        </div>
        <button
          onClick={() => { setForm(emptyForm()); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "var(--brand-orange)", color: "white" }}
        >
          <Plus size={15} /> Add Method
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(30,16,78,0.3)", backdropFilter: "blur(3px)" }}
        >
          <div className="rounded-2xl border w-full max-w-md shadow-2xl" style={cs}>
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <h2 className="font-bold" style={{ color: "var(--foreground)" }}>
                {form.id ? "Edit Payment Method" : "New Payment Method"}
              </h2>
              <button
                onClick={() => { setShowForm(false); setForm(emptyForm()); }}
                className="p-1.5 rounded-lg"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--muted-foreground)" }}>
                  Type *
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {PAYMENT_TYPES.map((t) => {
                    const meta = TYPE_META[t.value];
                    const active = form.type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, type: t.value, name: "", provider: "" })}
                        className="flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 text-xs font-medium transition-all"
                        style={{
                          borderColor: active ? meta.color : "var(--border)",
                          background:  active ? meta.bg   : "transparent",
                          color:       active ? meta.color : "var(--muted-foreground)",
                        }}
                      >
                        <span style={{ color: active ? meta.color : "var(--muted-foreground)" }}>
                          {meta.icon}
                        </span>
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick presets */}
              {PRESETS[form.type]?.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
                    style={{ color: "var(--muted-foreground)" }}>
                    Quick Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS[form.type].map((preset) => {
                      const isSelected = form.name === preset.name && form.provider === preset.provider;
                      return (
                        <button
                          key={preset.name + preset.provider}
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                          style={{
                            borderColor: isSelected ? TYPE_META[form.type].color : "var(--border)",
                            background:  isSelected ? TYPE_META[form.type].bg    : "var(--muted)",
                            color:       isSelected ? TYPE_META[form.type].color : "var(--foreground)",
                          }}
                        >
                          {preset.provider ? `${preset.name} · ${preset.provider}` : preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>
                  Display Name *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`e.g. ${PRESETS[form.type]?.[0]?.name ?? "Cash"}`}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Provider */}
              {form.type !== "cash" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>
                    Provider / Bank
                  </label>
                  <input
                    value={form.provider ?? ""}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    placeholder="e.g. BCA, Mandiri, GoPay"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Account info */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted-foreground)" }}>
                  Account / Merchant Info
                  <span className="ml-1 normal-case font-normal"
                    style={{ color: "var(--muted-foreground)" }}>
                    (optional)
                  </span>
                </label>
                <input
                  value={form.accountInfo ?? ""}
                  onChange={(e) => setForm({ ...form, accountInfo: e.target.value })}
                  placeholder="Account number, merchant ID, etc."
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Sort order + Active toggle */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--muted-foreground)" }}>
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isActive: !form.isActive })}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all"
                    style={{
                      borderColor: form.isActive ? "#16a34a" : "var(--border)",
                      background:  form.isActive ? "rgba(22,163,74,0.1)" : "var(--muted)",
                      color:       form.isActive ? "#16a34a" : "var(--muted-foreground)",
                    }}
                  >
                    {form.isActive
                      ? <><ToggleRight size={16} /> Yes</>
                      : <><ToggleLeft  size={16} /> No</>
                    }
                  </button>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold transition-all"
                  style={{ background: "var(--brand-orange)", color: "white" }}
                >
                  {saving ? "Saving…" : form.id ? "Update" : "Create Method"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(emptyForm()); }}
                  className="px-5 rounded-xl text-sm border font-medium"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grouped list */}
      <div className="space-y-4">
        {grouped.map(({ value, label, methods: group }) => {
          const meta = TYPE_META[value];
          return (
            <div key={value} className="rounded-2xl border overflow-hidden" style={cs}>
              {/* Group header */}
              <div
                className="flex items-center justify-between px-5 py-3 border-b"
                style={{ borderColor: "var(--border)", background: meta.bg }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="font-semibold text-sm" style={{ color: meta.color }}>
                    {label}
                  </span>
                  <span
                    className="ml-1 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: meta.bg,
                      color: meta.color,
                      border: `1px solid ${meta.color}33`,
                    }}
                  >
                    {group.length}
                  </span>
                </div>
                <button
                  onClick={() => { setForm({ ...emptyForm(), type: value }); setShowForm(true); }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                  style={{
                    background: meta.bg,
                    color: meta.color,
                    border: `1px solid ${meta.color}44`,
                  }}
                >
                  <Plus size={11} /> Add
                </button>
              </div>

              {group.length === 0 ? (
                <div
                  className="px-5 py-6 text-center text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  No {label.toLowerCase()} methods yet.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {group.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                      style={{ opacity: m.isActive ? 1 : 0.5 }}
                    >
                      <GripVertical size={14} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                            {m.name}
                          </span>
                          {m.provider && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: meta.bg, color: meta.color }}
                            >
                              {m.provider}
                            </span>
                          )}
                          {!m.isActive && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
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
                          onClick={() => handleToggle(m)}
                          title={m.isActive ? "Deactivate" : "Activate"}
                          className="p-1.5 rounded-lg transition-all"
                          style={{
                            background: m.isActive ? "rgba(22,163,74,0.1)" : "var(--muted)",
                            color:      m.isActive ? "#16a34a" : "var(--muted-foreground)",
                          }}
                        >
                          {m.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                        </button>
                        <button
                          onClick={() => { setForm({ ...m }); setShowForm(true); }}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ background: "rgba(255,200,92,0.15)", color: "#b45309" }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ background: "rgba(224,58,58,0.1)", color: "#e03a3a" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}