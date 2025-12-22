import { normalizePhone } from "@/utils/phones/normalizePhone";

type JobSnapshotInput = {
  id: string;
  title: string | null;
  workspace_id: string | null;
};

type CustomerSnapshotInput = {
  name: string | null;
  phone?: string | null;
};

type AppliedQuoteSnapshotInput = {
  id: string;
  job_id: string | null;
  workspace_id: string | null;
  status: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  client_message_template: string | null;
};

export type InvoicePricingSnapshot = {
  laborTotalCents: number;
  materialsTotalCents: number;
  tripFeeCents: number;
  taxTotalCents: number;
  totalCents: number;
  currency: string;
};

export type InvoiceSnapshot = {
  workspace_id: string;
  job_id: string;
  quote_id: string;
  currency: string;
  labor_total_cents: number;
  materials_total_cents: number;
  trip_fee_cents: number;
  tax_total_cents: number;
  total_cents: number;
  job_title_snapshot: string;
  customer_name_snapshot: string;
  customer_phone_snapshot: string | null;
  notes_snapshot: string | null;
};

type AppliedQuoteValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_applied_quote"
        | "quote_workspace_mismatch"
        | "job_workspace_mismatch"
        | "quote_not_applied"
        | "unknown";
    };

const JOB_TITLE_LIMIT = 140;
const CUSTOMER_NAME_LIMIT = 120;
const PHONE_LIMIT = 40;
const NOTES_LIMIT = 600;

function clampInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded;
}

function normalizeText(value: string | null | undefined, maxLength: number, fallback = "") {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function normalizeNullableText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function normalizeNullablePhone(value: string | null | undefined, maxLength: number) {
  const normalized = normalizePhone(value ?? null);
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    return normalized.slice(0, maxLength);
  }
  return normalized;
}

export function validateAppliedQuoteForJob(args: {
  workspaceId: string;
  jobId: string;
  jobWorkspaceId?: string | null;
  appliedQuote: AppliedQuoteSnapshotInput | null;
}): AppliedQuoteValidationResult {
  const { workspaceId, jobId, jobWorkspaceId, appliedQuote } = args;
  if (jobWorkspaceId && jobWorkspaceId !== workspaceId) {
    return { ok: false, reason: "job_workspace_mismatch" };
  }
  if (!appliedQuote) {
    return { ok: false, reason: "missing_applied_quote" };
  }
  if (appliedQuote.workspace_id && appliedQuote.workspace_id !== workspaceId) {
    return { ok: false, reason: "quote_workspace_mismatch" };
  }
  if (appliedQuote.job_id && appliedQuote.job_id !== jobId) {
    return { ok: false, reason: "quote_not_applied" };
  }
  if (appliedQuote.status && appliedQuote.status.toLowerCase() !== "accepted") {
    return { ok: false, reason: "quote_not_applied" };
  }
  return { ok: true };
}

export function buildInvoiceSnapshot(args: {
  workspaceId: string;
  job: JobSnapshotInput;
  customer: CustomerSnapshotInput | null;
  appliedQuote: AppliedQuoteSnapshotInput;
  pricing: InvoicePricingSnapshot;
}): InvoiceSnapshot {
  const jobTitle = normalizeText(args.job.title, JOB_TITLE_LIMIT, "");
  const customerName = normalizeText(args.customer?.name ?? null, CUSTOMER_NAME_LIMIT, "");
  const customerPhone = normalizeNullablePhone(args.customer?.phone ?? null, PHONE_LIMIT);
  const notes = normalizeNullableText(args.appliedQuote.client_message_template, NOTES_LIMIT);

  return {
    workspace_id: args.workspaceId,
    job_id: args.job.id,
    quote_id: args.appliedQuote.id,
    currency: normalizeText(args.pricing.currency, 6, "USD"),
    labor_total_cents: clampInteger(args.pricing.laborTotalCents),
    materials_total_cents: clampInteger(args.pricing.materialsTotalCents),
    trip_fee_cents: clampInteger(args.pricing.tripFeeCents),
    tax_total_cents: clampInteger(args.pricing.taxTotalCents),
    total_cents: clampInteger(args.pricing.totalCents),
    job_title_snapshot: jobTitle,
    customer_name_snapshot: customerName,
    customer_phone_snapshot: customerPhone,
    notes_snapshot: notes,
  };
}
