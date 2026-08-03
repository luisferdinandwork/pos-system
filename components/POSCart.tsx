// components/POSCart.tsx
"use client";
import { useState } from "react";
import { formatRupiah } from "@/lib/utils";

export type CartItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type Props = {
  items: CartItem[];
  onUpdateQty: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
  onCheckout: () => void;
};

export default function POSCart({ items, onUpdateQty, onRemove, onCheckout }: Props) {
  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  return (
    <div className="flex flex-col h-full rounded-xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-700">Cart</h2>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto divide-y">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            Scan or enter an item ID to add products.
          </p>
        ) : (
          items.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{item.productName}</p>
                <p className="text-xs text-gray-400">{formatRupiah(item.unitPrice)} each</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
                  className="h-6 w-6 rounded bg-gray-100 text-sm font-bold hover:bg-gray-200"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
                  className="h-6 w-6 rounded bg-gray-100 text-sm font-bold hover:bg-gray-200"
                >
                  +
                </button>
              </div>
              <p className="w-20 text-right text-sm font-semibold text-gray-700">
                {formatRupiah(item.unitPrice * item.quantity)}
              </p>
              <button
                onClick={() => onRemove(item.productId)}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Total + checkout */}
      <div className="border-t p-4 space-y-2">
        <div className="flex justify-between text-sm text-gray-500">
          <span>Subtotal</span>
          <span>{formatRupiah(total)}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-800">
          <span>Total</span>
          <span>{formatRupiah(total)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="mt-2 w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Proceed to Payment
        </button>
      </div>
    </div>
  );
}