// lib/transaction-ids.ts
// Shared helpers for cloud and local POS transaction IDs.
// Official format: EEEEYYYYMMSSSSS
//   EEEE  = 4-digit manual event code
//   YYYY  = transaction year
//   MM    = transaction month
//   SSSSS = 5-digit sequence for that event + month

export const EVENT_CODE_RE = /^\d{4}$/;
export const TRANSACTION_DISPLAY_ID_RE = /^\d{4}\d{6}\d{5}$/;

export function normalizeEventCode(value: unknown): string {
  const code = String(value ?? "").trim();

  if (!EVENT_CODE_RE.test(code)) {
    throw new Error("Event code must be exactly 4 digits, for example 1001.");
  }

  return code;
}

export function makeEventVerifierCode(eventCode: string): string {
  const code = normalizeEventCode(eventCode);
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EV-${code}-${randomPart}`;
}

export function getTransactionMonthPrefix(eventCode: string, date: Date) {
  const code = normalizeEventCode(eventCode);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${code}${yyyy}${mm}`;
}

export function formatEventTransactionDisplayId(
  eventCode: string,
  date: Date,
  sequence: number
) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("Transaction sequence must be a positive integer.");
  }

  return `${getTransactionMonthPrefix(eventCode, date)}${String(sequence).padStart(5, "0")}`;
}

export function parseEventTransactionSequence(displayId: string): number {
  if (!TRANSACTION_DISPLAY_ID_RE.test(displayId)) return 0;
  const seq = Number(displayId.slice(-5));
  return Number.isFinite(seq) ? seq : 0;
}
