// components/ProductForm.tsx
"use client";
import { useState } from "react";
import { generateItemId } from "@/lib/utils";

type Product = {
  id?: number;
  itemId: string;
  name: string;
  price: string | number;
  stock: number;
};

type Props = {
  initial?: Product;
  onSave: (data: Product) => void;
  onCancel?: () => void;
};

export default function ProductForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Product>(
    initial ?? { itemId: generateItemId(), name: "", price: "", stock: 0 }
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Item ID</label>
        <input
          name="itemId"
          value={form.itemId}
          onChange={handleChange}
          required
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Price (Rp)</label>
        <input
          name="price"
          type="number"
          min="0"
          value={form.price}
          onChange={handleChange}
          required
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Stock</label>
        <input
          name="stock"
          type="number"
          min="0"
          value={form.stock}
          onChange={handleChange}
          required
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}