export type FollowupMessageRef = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  channel: string | null;
  via: string | null;
  created_at: string | null;
};

type FindMatchingFollowupMessageArgs = {
  messages: FollowupMessageRef[];
  jobId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  recommendedChannel?: string | null;
};

export function findMatchingFollowupMessage({
  messages,
  recommendedChannel,
  jobId,
  quoteId,
  invoiceId,
}: FindMatchingFollowupMessageArgs): FollowupMessageRef | null {
  if (!recommendedChannel) {
    return null;
  }
  const normalizedRecommendationChannel = recommendedChannel.toLowerCase();

  return (
    messages.find((message) => {
      if (!message.channel) {
        return false;
      }
      if (!message.via) {
        return false;
      }
      if (message.channel.toLowerCase() !== normalizedRecommendationChannel) {
        return false;
      }
      if (invoiceId) {
        return message.invoice_id === invoiceId;
      }
      if (quoteId && message.quote_id !== quoteId) {
        return false;
      }
      if (jobId && message.job_id !== jobId) {
        return false;
      }
      return true;
    }) ?? null
  );
}

type InvoiceFollowupTemplateInput = {
  customerName?: string | null;
  jobTitle?: string | null;
  invoiceNumber?: number | null;
  total?: number | null;
  status?: string | null;
  dueDate?: string | null;
};

function formatInvoiceLabel(invoiceNumber?: number | null): string {
  if (typeof invoiceNumber === "number") {
    return `Invoice #${invoiceNumber}`;
  }
  return "this invoice";
}

function formatAmount(total?: number | null): string {
  if (typeof total === "number") {
    return `$${total.toFixed(2)}`;
  }
  return "the amount";
}

function formatStatus(status?: string | null): string {
  if (!status) {
    return "pending";
  }
  const trimmed = status.trim();
  if (!trimmed) {
    return "pending";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatDueDate(dueDate?: string | null): string | null {
  if (!dueDate) {
    return null;
  }
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString();
}

export function getInvoiceFollowupTemplate({
  customerName,
  jobTitle,
  invoiceNumber,
  total,
  status,
  dueDate,
}: InvoiceFollowupTemplateInput): { subject: string; body: string } {
  const invoiceLabel = formatInvoiceLabel(invoiceNumber);
  const statusLabel = formatStatus(status);
  const amountLabel = formatAmount(total);
  const dueLabel = formatDueDate(dueDate);
  const greeting = customerName ? `Hi ${customerName},` : "Hi there,";
  const jobContext = jobTitle ? ` for ${jobTitle}` : "";
  const dueContext = dueLabel ? ` It is due ${dueLabel}` : ` It is currently ${statusLabel.toLowerCase()}.`;
  const subject = `Quick follow-up about ${invoiceLabel}`;
  const bodyLines = [
    `${greeting}`,
    `Just checking in on ${invoiceLabel}${jobContext}.`,
    `The invoice is ${statusLabel.toLowerCase()} for ${amountLabel}.${dueContext}`,
    "Let me know if you have any questions or need more time—happy to help you get squared away.",
  ];
  const body = bodyLines.join("\n\n");
  return { subject, body };
}
