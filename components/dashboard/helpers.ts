// components/dashboard/helpers.ts
import type { EventStat } from "./types";

export function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getSellThroughPct(ev: EventStat) {
  if (!ev.originalUnits || ev.originalUnits <= 0) return 0;
  return clampPct((ev.itemsSold / ev.originalUnits) * 100);
}

export function getRevenuePct(ev: EventStat) {
  if (!ev.totalStockValue || ev.totalStockValue <= 0) return 0;
  return clampPct((ev.revenue / ev.totalStockValue) * 100);
}

export function getRemainingPct(ev: EventStat) {
  if (!ev.originalUnits || ev.originalUnits <= 0) return 0;
  return clampPct((ev.totalUnits / ev.originalUnits) * 100);
}

export function getDiscountPct(ev: EventStat) {
  if (!ev.revenue || ev.revenue <= 0) return 0;
  return clampPct((ev.discount / ev.revenue) * 100);
}

export function getEventHealthLabel(ev: EventStat) {
  const sell = getSellThroughPct(ev);
  const revenue = getRevenuePct(ev);

  if (sell >= 70 && revenue >= 70) {
    return {
      label: "Strong",
      color: "#16a34a",
      bg: "rgba(22,163,74,0.10)",
    };
  }

  if (sell >= 40 || revenue >= 40) {
    return {
      label: "Moderate",
      color: "#b45309",
      bg: "rgba(245,158,11,0.12)",
    };
  }

  return {
    label: "Early / Slow",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.10)",
  };
}