export type InvoiceSnapshot = {
  workspace_id: string;
  job_id: string;
  quote_id: string;
  currency: string;
  snapshot_subtotal_cents: number;
  snapshot_tax_cents: number;
  snapshot_total_cents: number;
  snapshot_summary: string | null;
};

type InvoiceSnapshotInput = {
  workspaceId: string;
  jobId: string;
  quoteId: string;
  currency?: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  summary?: string | null;
};

const SUMMARY_LIMIT = 160;

function clampCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded;
}

function normalizeCurrency(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 6) : "USD";
}

function normalizeSummary(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > SUMMARY_LIMIT) {
    return trimmed.slice(0, SUMMARY_LIMIT);
  }
  return trimmed;
}

export function buildInvoiceSnapshot(input: InvoiceSnapshotInput): InvoiceSnapshot {
  return {
    workspace_id: input.workspaceId,
    job_id: input.jobId,
    quote_id: input.quoteId,
    currency: normalizeCurrency(input.currency),
    snapshot_subtotal_cents: clampCents(input.subtotalCents),
    snapshot_tax_cents: clampCents(input.taxCents),
    snapshot_total_cents: clampCents(input.totalCents),
    snapshot_summary: normalizeSummary(input.summary),
  };
}
