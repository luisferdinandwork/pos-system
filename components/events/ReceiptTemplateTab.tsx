// components/events/ReceiptTemplateTab.tsx
"use client";

import { useEffect, useState } from "react";
import { Eye, ReceiptText, RefreshCw, Save } from "lucide-react";
import { buildReceiptHtml, type EventReceiptTemplate } from "@/lib/hooks/usePrintReceipt";

type ReceiptTemplateRow = EventReceiptTemplate & {
  id?: number | null;
  eventId?: number;
};

const emptyTemplate: ReceiptTemplateRow = {
  isActive: true,
  storeName: "",
  headline: "",
  address: "",
  phone: "",
  instagram: "",
  taxId: "",
  logoUrl: "",
  footerText: "Terima kasih!",
  returnPolicy: "",
  promoMessage: "",
  showEventName: true,
  showCashierName: true,
  showItemSku: true,
  showPaymentReference: true,
  showDiscountBreakdown: true,
  customCss: "",
};

export function ReceiptTemplateTab({
  eventId,
  eventName,
}: {
  eventId: number;
  eventName?: string | null;
}) {
  const [form, setForm] = useState<ReceiptTemplateRow>(emptyTemplate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/receipt-template`, {
        cache: "no-store",
      });
      const json = await res.json();
      setForm({ ...emptyTemplate, ...json });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [eventId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/events/${eventId}/receipt-template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save receipt template");

      setForm({ ...emptyTemplate, ...json });
      alert("Receipt template saved.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save receipt template");
    } finally {
      setSaving(false);
    }
  }

  function preview() {
    const html = buildReceiptHtml(
      {
        displayId: "20260500001",
        eventName: eventName ?? "Demo Event",
        cashierName: "Cashier Demo",
        totalAmount: "650000",
        discount: "50000",
        finalAmount: "600000",
        paymentMethod: "Cash",
        cashTendered: "650000",
        changeAmount: "50000",
        createdAt: new Date().toISOString(),
      },
      [
        {
          itemId: "SPE1040100370",
          productName: "SKYRUNNER EVR (370)",
          quantity: 1,
          unitPrice: "500000",
          discountAmt: "50000",
          finalPrice: "450000",
          subtotal: "450000",
          promoApplied: "Seed Promo",
        },
        {
          itemId: "SPE2040092M",
          productName: "SRC RUN FAST MENS TEE (M)",
          quantity: 1,
          unitPrice: "150000",
          discountAmt: "0",
          finalPrice: "150000",
          subtotal: "150000",
        },
      ],
      { template: form, eventName }
    );

    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  const inp = "w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  const ist = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="rounded-2xl border p-5 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,101,63,0.12)", color: "var(--brand-orange)" }}>
            <ReceiptText size={18} />
          </div>
          <div>
            <p className="font-bold" style={{ color: "var(--foreground)" }}>Receipt CMS</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Customize receipt copy and visibility for this event only.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading} className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" onClick={preview} className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            <Eye size={12} /> Preview
          </button>
          <button disabled={saving} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50" style={{ background: "var(--brand-orange)", color: "white" }}>
            <Save size={12} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Header</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Store / Brand Name">
              <input className={inp} style={ist} value={form.storeName ?? ""} onChange={(e) => setForm({ ...form, storeName: e.target.value })} placeholder={eventName ?? "Store name"} />
            </Field>
            <Field label="Headline">
              <input className={inp} style={ist} value={form.headline ?? ""} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Thank you for shopping with us" />
            </Field>
            <Field label="Phone">
              <input className={inp} style={ist} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+62…" />
            </Field>
            <Field label="Instagram">
              <input className={inp} style={ist} value={form.instagram ?? ""} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@yourbrand" />
            </Field>
            <Field label="Tax ID / NPWP">
              <input className={inp} style={ist} value={form.taxId ?? ""} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Logo URL">
              <input className={inp} style={ist} value={form.logoUrl ?? ""} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…" />
            </Field>
          </div>

          <Field label="Address">
            <textarea className={inp} style={ist} rows={2} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
        </div>

        <div className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Visibility</p>

          {[
            ["isActive", "Use custom receipt for this event"],
            ["showEventName", "Show event name"],
            ["showCashierName", "Show cashier name"],
            ["showItemSku", "Show item SKU"],
            ["showPaymentReference", "Show payment reference"],
            ["showDiscountBreakdown", "Show discount breakdown"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--muted)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{label}</span>
              <input type="checkbox" checked={Boolean((form as any)[key])} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Footer</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Footer Text">
            <textarea className={inp} style={ist} rows={3} value={form.footerText ?? ""} onChange={(e) => setForm({ ...form, footerText: e.target.value })} />
          </Field>
          <Field label="Return Policy">
            <textarea className={inp} style={ist} rows={3} value={form.returnPolicy ?? ""} onChange={(e) => setForm({ ...form, returnPolicy: e.target.value })} />
          </Field>
          <Field label="Promo Message">
            <textarea className={inp} style={ist} rows={3} value={form.promoMessage ?? ""} onChange={(e) => setForm({ ...form, promoMessage: e.target.value })} />
          </Field>
        </div>

        <Field label="Custom CSS optional">
          <textarea className={inp} style={{ ...ist, fontFamily: "monospace" }} rows={4} value={form.customCss ?? ""} onChange={(e) => setForm({ ...form, customCss: e.target.value })} placeholder="body { font-size: 12px; }" />
        </Field>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      {children}
    </label>
  );
}
