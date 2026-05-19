// components/events/ReceiptTemplateTab.tsx — with live preview
"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, ReceiptText, RefreshCw, Save, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { buildReceiptHtml, type EventReceiptTemplate } from "@/lib/hooks/usePrintReceipt";

type ReceiptTemplateRow = EventReceiptTemplate & { id?: number | null; eventId?: number };

const emptyTemplate: ReceiptTemplateRow = {
  isActive: true, storeName: "", headline: "", address: "", phone: "",
  instagram: "", taxId: "", logoUrl: "", footerText: "Terima kasih!",
  returnPolicy: "", promoMessage: "", showEventName: true,
  showCashierName: true, showItemSku: true, showPaymentReference: true,
  showDiscountBreakdown: true, customCss: "",
};

const DEMO_TXN = {
  displayId: "20260500001", eventName: "Demo Event", cashierName: "Cashier Demo",
  totalAmount: "650000", discount: "50000", finalAmount: "600000",
  paymentMethod: "Cash", cashTendered: "650000", changeAmount: "50000",
  createdAt: new Date().toISOString(),
};
const DEMO_ITEMS = [
  { itemId: "SPE1040100370", productName: "SKYRUNNER EVR (370)", quantity: 1, unitPrice: "500000", discountAmt: "50000", finalPrice: "450000", subtotal: "450000", promoApplied: "Seed Promo" },
  { itemId: "SPE2040092M", productName: "SRC RUN FAST TEE (M)", quantity: 1, unitPrice: "150000", discountAmt: "0", finalPrice: "150000", subtotal: "150000" },
];

// ── Field label wrapper — defined OUTSIDE the component to prevent remounting ──
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: "var(--muted-foreground)" }}>{label}</span>
      {children}
    </label>
  );
}

// ── Toggle row using shadcn Switch — defined OUTSIDE to prevent remounting ────
function Toggle({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
      style={{ background: "var(--muted)" }}>
      <Label className="text-sm cursor-pointer" style={{ color: "var(--foreground)" }}>{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

export function ReceiptTemplateTab({ eventId, eventName }: { eventId: number; eventName?: string | null }) {
  const [form,    setForm]    = useState<ReceiptTemplateRow>(emptyTemplate);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/events/${eventId}/receipt-template`, { cache: "no-store" });
      const json = await res.json();
      setForm({ ...emptyTemplate, ...json });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [eventId]);

  // Update iframe whenever form changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const html = buildReceiptHtml(
      { ...DEMO_TXN, eventName: form.storeName || eventName || "Demo Event" },
      DEMO_ITEMS,
      { template: form, eventName: form.storeName || eventName }
    );
    iframe.srcdoc = html;
  }, [form, eventName]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const res  = await fetch(`/api/events/${eventId}/receipt-template`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      setForm({ ...emptyTemplate, ...json });
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to save"); } finally { setSaving(false); }
  }

  const inp = "w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  const ist = { borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" };

  return (
    <form onSubmit={save} className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-2xl border px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,101,63,0.1)", color: "var(--brand-orange)" }}>
            <ReceiptText size={16} />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: "var(--foreground)" }}>Receipt Template</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Live preview updates as you type</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="p-2 rounded-xl border disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button type="button" onClick={() => setShowPreview(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPreview ? "Hide" : "Preview"}
          </button>
          <button disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{ background: "var(--brand-orange)", color: "white" }}>
            <Save size={13} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Two-column: form + live preview */}
      <div className="flex gap-4" style={{ alignItems: "flex-start" }}>

        {/* ── Edit form ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Header section */}
          <div className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Store Info</p>
            <div className="grid grid-cols-2 gap-3">
              <F label="Store / Brand Name"><input className={inp} style={ist} value={form.storeName ?? ""} onChange={e => setForm({ ...form, storeName: e.target.value })} placeholder={eventName ?? "Your store name"} /></F>
              <F label="Headline"><input className={inp} style={ist} value={form.headline ?? ""} onChange={e => setForm({ ...form, headline: e.target.value })} placeholder="Thank you!" /></F>
              <F label="Phone"><input className={inp} style={ist} value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+62…" /></F>
              <F label="Instagram"><input className={inp} style={ist} value={form.instagram ?? ""} onChange={e => setForm({ ...form, instagram: e.target.value })} placeholder="@yourbrand" /></F>
              <F label="Tax ID"><input className={inp} style={ist} value={form.taxId ?? ""} onChange={e => setForm({ ...form, taxId: e.target.value })} placeholder="Optional" /></F>
              <F label="Logo URL"><input className={inp} style={ist} value={form.logoUrl ?? ""} onChange={e => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…" /></F>
            </div>
            <F label="Address">
              <textarea className={inp} style={ist} rows={2} value={form.address ?? ""} onChange={e => setForm({ ...form, address: e.target.value })} />
            </F>
          </div>

          {/* Footer section */}
          <div className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Footer</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <F label="Footer Text"><textarea className={inp} style={ist} rows={3} value={form.footerText ?? ""} onChange={e => setForm({ ...form, footerText: e.target.value })} /></F>
              <F label="Return Policy"><textarea className={inp} style={ist} rows={3} value={form.returnPolicy ?? ""} onChange={e => setForm({ ...form, returnPolicy: e.target.value })} /></F>
              <F label="Promo Message"><textarea className={inp} style={ist} rows={3} value={form.promoMessage ?? ""} onChange={e => setForm({ ...form, promoMessage: e.target.value })} /></F>
            </div>
          </div>

          {/* Visibility toggles */}
          <div className="rounded-2xl border p-5 space-y-2" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>Visibility</p>
            <Toggle label="Use custom template for this event" value={!!form.isActive}       onChange={v => setForm(f => ({ ...f, isActive: v }))} />
            <Toggle label="Show event name"                    value={!!form.showEventName}    onChange={v => setForm(f => ({ ...f, showEventName: v }))} />
            <Toggle label="Show cashier name"                  value={!!form.showCashierName}  onChange={v => setForm(f => ({ ...f, showCashierName: v }))} />
            <Toggle label="Show item SKU"                      value={!!form.showItemSku}      onChange={v => setForm(f => ({ ...f, showItemSku: v }))} />
            <Toggle label="Show payment reference"             value={!!form.showPaymentReference} onChange={v => setForm(f => ({ ...f, showPaymentReference: v }))} />
            <Toggle label="Show discount breakdown"            value={!!form.showDiscountBreakdown} onChange={v => setForm(f => ({ ...f, showDiscountBreakdown: v }))} />
          </div>

          {/* Custom CSS */}
          <div className="rounded-2xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <F label="Custom CSS (optional)">
              <textarea className={inp} style={{ ...ist, fontFamily: "monospace", fontSize: "12px" }} rows={5}
                value={form.customCss ?? ""} onChange={e => setForm({ ...form, customCss: e.target.value })}
                placeholder="body { font-size: 12px; }" />
            </F>
          </div>
        </div>

        {/* ── Live preview ── */}
        {showPreview && (
          <div className="flex-shrink-0 sticky top-4" style={{ width: 320 }}>
            <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="px-3 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
                <Eye size={12} style={{ color: "var(--muted-foreground)" }} />
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Live Preview</p>
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>Demo data</span>
              </div>
              <div style={{ height: 580, overflow: "hidden" }}>
                <iframe
                  ref={iframeRef}
                  title="Receipt Preview"
                  style={{ width: "100%", height: "100%", border: "none", background: "white" }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}