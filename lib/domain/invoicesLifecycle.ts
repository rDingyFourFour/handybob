export const INVOICE_STATUS_VALUES = ["draft", "sent", "paid", "void"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUS_VALUES)[number];

export type InvoiceStatusTransitionResult =
  | { allowed: true }
  | { allowed: false; reason: "invalid_transition" | "unknown_status" };

const ALLOWED_TRANSITIONS: Record<InvoiceStatus, Set<InvoiceStatus>> = {
  draft: new Set(["sent", "void"]),
  sent: new Set(["paid", "void"]),
  paid: new Set(),
  void: new Set(),
};

export function normalizeInvoiceStatus(value: string | null | undefined): InvoiceStatus | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (INVOICE_STATUS_VALUES.includes(normalized as InvoiceStatus)) {
    return normalized as InvoiceStatus;
  }
  return null;
}

export function guardInvoiceStatusTransition(
  currentStatus: string | null | undefined,
  targetStatus: string | null | undefined,
): InvoiceStatusTransitionResult {
  const normalizedCurrent = normalizeInvoiceStatus(currentStatus);
  const normalizedTarget = normalizeInvoiceStatus(targetStatus);

  if (!normalizedCurrent || !normalizedTarget) {
    return { allowed: false, reason: "unknown_status" };
  }

  if (ALLOWED_TRANSITIONS[normalizedCurrent].has(normalizedTarget)) {
    return { allowed: true };
  }

  return { allowed: false, reason: "invalid_transition" };
}

export function buildInvoiceLifecycleUpdate(args: {
  currentStatus: InvoiceStatus;
  targetStatus: InvoiceStatus;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  now?: string;
}): { invoice_status: InvoiceStatus } &
  Partial<{ sent_at: string; paid_at: string; voided_at: string }> {
  const now = args.now ?? new Date().toISOString();
  const update: { invoice_status: InvoiceStatus } &
    Partial<{ sent_at: string; paid_at: string; voided_at: string }> = {
    invoice_status: args.targetStatus,
  };

  if (args.targetStatus === "sent" && !args.sentAt) {
    update.sent_at = now;
  }
  if (args.targetStatus === "paid" && !args.paidAt) {
    update.paid_at = now;
  }
  if (args.targetStatus === "void" && !args.voidedAt) {
    update.voided_at = now;
  }

  return update;
}
