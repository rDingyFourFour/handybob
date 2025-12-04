import { deriveFollowupRecommendation } from "./followupRecommendations";

export type FollowupMessageRef = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  channel: string | null;
  via: string | null;
  created_at: string | null;
};

export type CallFollowupDescriptor = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  created_at: string | null;
  outcome: string | null;
  daysSinceQuote: number | null;
  modelChannelSuggestion?: string | null;
};

type CollectCallFollowupMessageIdsArgs = {
  calls: CallFollowupDescriptor[];
  messages: FollowupMessageRef[];
};

export type CallFollowupMessageCollection = {
  messageIds: Set<string>;
  messageToCallId: Map<string, string>;
};

export function collectCallFollowupMessageIds({
  calls,
  messages,
}: CollectCallFollowupMessageIdsArgs): CallFollowupMessageCollection {
  const callFollowupIds = new Set<string>();
  const messageToCallId = new Map<string, string>();
  if (!calls.length || !messages.length) {
    return {
      messageIds: callFollowupIds,
      messageToCallId,
    };
  }
  for (const call of calls) {
    if (!call.outcome) {
      continue;
    }
    const recommendation = deriveFollowupRecommendation({
      outcome: call.outcome,
      daysSinceQuote: call.daysSinceQuote,
      modelChannelSuggestion: call.modelChannelSuggestion ?? null,
    });
    const recommendedChannel = recommendation?.recommendedChannel ?? null;
    if (!recommendedChannel) {
      continue;
    }
    const matchingMessage = findMatchingFollowupMessage({
      messages,
      recommendedChannel,
      jobId: call.job_id ?? null,
      quoteId: call.quote_id ?? null,
    });
    if (matchingMessage) {
      callFollowupIds.add(matchingMessage.id);
      messageToCallId.set(matchingMessage.id, call.id);
    }
  }
  return {
    messageIds: callFollowupIds,
    messageToCallId,
  };
}

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

type FindLatestFollowupMessageArgs = FindMatchingFollowupMessageArgs;

export function findLatestFollowupMessage({
  messages,
  invoiceId,
  jobId,
  quoteId,
  recommendedChannel,
}: FindLatestFollowupMessageArgs): FollowupMessageRef | null {
  const sortedMessages = [...messages]
    .filter((message) => Boolean(message.channel) && Boolean(message.created_at))
    .sort((a, b) => {
      const aTime = new Date(a.created_at!).getTime();
      const bTime = new Date(b.created_at!).getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
      return bTime - aTime;
    });

  const matchingByChannel = findMatchingFollowupMessage({
    messages: sortedMessages,
    invoiceId,
    jobId,
    quoteId,
    recommendedChannel,
  });
  if (matchingByChannel) {
    return matchingByChannel;
  }

  for (const message of sortedMessages) {
    if (invoiceId && message.invoice_id === invoiceId) {
      return message;
    }
    if (quoteId && message.quote_id === quoteId) {
      return message;
    }
    if (jobId && message.job_id === jobId) {
      return message;
    }
  }

  return sortedMessages[0] ?? null;
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
