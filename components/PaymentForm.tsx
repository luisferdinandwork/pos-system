// components/PaymentForm.tsx
"use client";
import { useState } from "react";
import { formatRupiah } from "@/lib/utils";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "qris", label: "QRIS" },
  { value: "edc_bca", label: "EDC BCA" },
  { value: "edc_mandiri", label: "EDC Mandiri" },
];

type Props = {
  total: number;
  onConfirm: (method: string, reference: string) => void;
  onCancel: () => void;
};

export default function PaymentForm({ total, onConfirm, onCancel }: Props) {
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const needsReference = method !== "cash";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(method, reference);
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-sm w-full">
      <h2 className="text-lg font-semibold text-gray-800">Payment</h2>
      <p className="text-2xl font-bold text-green-600">{formatRupiah(total)}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Payment method selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((pm) => (
              <button
                key={pm.value}
                type="button"
                onClick={() => {
                  setMethod(pm.value);
                  setReference("");
                }}
                className={`rounded-lg border py-2 text-sm font-medium transition ${
                  method === pm.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {pm.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reference input for non-cash */}
        {needsReference && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Reference / Approval Code
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Enter code or scan QR"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Confirm Payment
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );
}