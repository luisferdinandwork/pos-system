// lib/transaction-ids.ts
// Shared helpers for cloud and local POS transaction IDs.
//
// Event code format: EVT[A|B]NNNNN (auto-generated, see lib/events.ts)
//   EVT   = fixed prefix
//   A/B   = company letter (A = PRI, B = PNT)
//   NNNNN = 5-digit sequence, per company
//   e.g. "EVTA00001"
//
// Legacy event codes (LLLNNNNN, manually entered pre-automation) are still
// accepted for lookups/display so old events keep working, e.g. "JSE00001".
//
// Transaction display ID format: EVENTCODE-YYYYMM-SSSSS
//   EVENTCODE = the event code (either shape above)
//   YYYYMM    = transaction year + month
//   SSSSS     = 5-digit sequence for that event + month
//   e.g. "EVTA00001-202607-00001"

export const EVENT_CODE_RE = /^(?:[A-Z]{3}\d{5}|EVT[AB]\d{5})$/;
export const TRANSACTION_DISPLAY_ID_RE =
  /^(?:[A-Z]{3}\d{5}|EVT[AB]\d{5})-\d{6}-\d{5}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Event companies
// Determines the event code prefix: EVTA... for PRI, EVTB... for PNT.
// Kept dependency-free (no DB import) so client components can use it too.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENT_COMPANIES = [
  {
    value: "PRI",
    label: "PRI",
    name: "Prestasi Retail Innovation",
    codeLetter: "A",
  },
  {
    value: "PNT",
    label: "PNT",
    name: "Panatrade Caraka",
    codeLetter: "B",
  },
] as const;

export type EventCompany = (typeof EVENT_COMPANIES)[number]["value"];

export function isEventCompany(value: unknown): value is EventCompany {
  return EVENT_COMPANIES.some((company) => company.value === value);
}

export function getEventCodePrefix(company: EventCompany): string {
  const match = EVENT_COMPANIES.find((item) => item.value === company);

  if (!match) {
    throw new Error(`Invalid company "${company}".`);
  }

  return `EVT${match.codeLetter}`;
}

/**
 * Guesses the company of an existing event: prefers the stored `company`
 * column, then falls back to reading the code's prefix letter (for events
 * generated under this scheme without a stored company), then null for
 * old-format codes that predate both.
 */
export function inferEventCompany(event: {
  company?: string | null;
  code?: string | null;
}): EventCompany | null {
  if (isEventCompany(event.company)) {
    return event.company;
  }

  const match = /^EVT([AB])\d{5}$/.exec(String(event.code ?? "").toUpperCase());
  if (!match) return null;

  const found = EVENT_COMPANIES.find((item) => item.codeLetter === match[1]);
  return found?.value ?? null;
}

/**
 * Validates + normalizes an event code.
 * Uppercases letters and strips any separators (e.g. "jse-00001" -> "JSE00001"),
 * then enforces the final format (legacy or auto-generated).
 */
export function normalizeEventCode(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9]/g, "");

  if (!EVENT_CODE_RE.test(cleaned)) {
    throw new Error(
      "Event code must be in the format EVTA00001 / EVTB00001."
    );
  }

  return cleaned;
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
  return `${code}-${yyyy}${mm}`;
}

export function formatEventTransactionDisplayId(
  eventCode: string,
  date: Date,
  sequence: number
) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("Transaction sequence must be a positive integer.");
  }

  return `${getTransactionMonthPrefix(eventCode, date)}-${String(sequence).padStart(5, "0")}`;
}

export function parseEventTransactionSequence(displayId: string): number {
  if (!TRANSACTION_DISPLAY_ID_RE.test(displayId)) return 0;
  const seq = Number(displayId.slice(-5));
  return Number.isFinite(seq) ? seq : 0;
}