"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatCurrency } from "@/utils/timeline/formatters";
import { deriveInvoiceFollowupRecommendation } from "@/lib/domain/communications/followupRecommendations";
import {
  findMatchingFollowupMessage,
  type FollowupMessageRef,
} from "@/lib/domain/communications/followupMessages";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function castFormValue(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export type CreateInvoiceFollowupMessageActionResult =
  | {
      success: true;
      messageId: string | null;
      recommendedChannel: string | null;
      primaryActionLabel: string;
      skipped?: boolean;
    }
  | { success: false; error: "auth_error" | "validation_error" | "db_error"; messageId: null };

export async function createInvoiceFollowupMessageAction(
  formData: FormData
): Promise<CreateInvoiceFollowupMessageActionResult> {
  const invoiceId = castFormValue(formData.get("invoiceId"));
  const workspaceIdFromForm = castFormValue(formData.get("workspaceId"));
  const jobIdFromForm = castFormValue(formData.get("jobId"));
  const customerIdFromForm = castFormValue(formData.get("customerId"));

  if (!invoiceId) {
    console.warn("[invoice-followup-action] Missing invoiceId");
    return { success: false, error: "validation_error", messageId: null };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    console.warn("[invoice-followup-action] No user in session");
    return { success: false, error: "auth_error", messageId: null };
  }

  let resolvedWorkspaceId = workspaceIdFromForm;
  if (!resolvedWorkspaceId) {
    try {
      const { workspace } = await getCurrentWorkspace({ supabase });
      resolvedWorkspaceId = workspace?.id ?? null;
    } catch (error) {
      console.error("[invoice-followup-action] Failed to resolve workspace", error);
      return { success: false, error: "validation_error", messageId: null };
    }
  }

  if (!resolvedWorkspaceId) {
    console.error("[invoice-followup-action] Workspace ID missing");
    return { success: false, error: "validation_error", messageId: null };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, invoice_number, workspace_id, customer_id, job_id, status, total, due_at, issued_at, quote_id")
    .eq("workspace_id", resolvedWorkspaceId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error("[invoice-followup-action] Failed to load invoice", {
      invoiceId,
      workspaceId: resolvedWorkspaceId,
      error: invoiceError,
    });
    return { success: false, error: "db_error", messageId: null };
  }

  if (!invoice) {
    console.warn("[invoice-followup-action] Invoice not found", { invoiceId });
    return { success: false, error: "validation_error", messageId: null };
  }

  const dueDate = invoice.due_at ? new Date(invoice.due_at) : null;
  const daysOverdue = dueDate
    ? Math.floor((Date.now() - dueDate.getTime()) / ONE_DAY_MS)
    : 0;

  const recommendation = deriveInvoiceFollowupRecommendation({
    outcome: invoice.status ?? "invoice_sent",
    daysSinceInvoiceSent: Math.max(daysOverdue, 0),
    status: invoice.status,
    metadata: {
      invoiceId: invoice.id,
      jobId: invoice.job_id ?? null,
      customerId: invoice.customer_id ?? null,
    },
  });

  if (recommendation.shouldSkipFollowup) {
    console.log("[invoice-followup-action] Skipping follow-up", { invoiceId });
    return {
      success: true,
      messageId: null,
      recommendedChannel: recommendation.recommendedChannel,
      primaryActionLabel: recommendation.primaryActionLabel,
      skipped: true,
    };
  }

  const { data: messageRows, error: messageError } = await supabase
    .from<FollowupMessageRef>("messages")
    .select("id, job_id, quote_id, invoice_id, channel, via, created_at")
    .eq("workspace_id", resolvedWorkspaceId)
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (messageError) {
    console.error("[invoice-followup-action] Failed to load existing follow-ups", {
      invoiceId,
      error: messageError,
    });
  }

  const matchingFollowup = findMatchingFollowupMessage({
    messages: messageRows ?? [],
    invoiceId: invoice.id,
    quoteId: invoice.quote_id ?? null,
    jobId: invoice.job_id ?? jobIdFromForm ?? null,
    recommendedChannel: recommendation.recommendedChannel,
  });

  if (matchingFollowup) {
    console.log("[invoice-followup-action] Existing follow-up found", {
      invoiceId,
      messageId: matchingFollowup.id,
    });
    return {
      success: true,
      messageId: matchingFollowup.id,
      recommendedChannel: matchingFollowup.channel,
      primaryActionLabel: recommendation.primaryActionLabel,
      skipped: true,
    };
  }

  const invoiceLabel = invoice.invoice_number
    ? `Invoice #${invoice.invoice_number}`
    : `Invoice ${invoice.id.slice(0, 8)}`;
  const amountLabel = invoice.total != null ? formatCurrency(invoice.total) : "the amount";
  const dueLabel = dueDate
    ? dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const subject = `Friendly reminder about ${invoiceLabel}`;
  const bodyLines = [
    "Hi there,",
    `Just a friendly reminder about ${invoiceLabel} for ${amountLabel}.`,
  ];
  if (dueLabel) {
    bodyLines.push(`It was due on ${dueLabel}.`);
  } else {
    bodyLines.push("Please let me know if you need more time.");
  }
  bodyLines.push("Let me know if you have any questions or would like to make a new plan.");
  const body = bodyLines.join("\n\n");

  const channel = recommendation.recommendedChannel ?? "email";
  const via = "email";
  const resolvedJobId = jobIdFromForm ?? invoice.job_id ?? null;
  const resolvedCustomerId = customerIdFromForm ?? invoice.customer_id ?? null;

  try {
    const { data: createdMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        workspace_id: resolvedWorkspaceId,
        user_id: user.id,
        job_id: resolvedJobId,
        quote_id: invoice.quote_id ?? null,
        invoice_id: invoice.id,
        customer_id: resolvedCustomerId,
        direction: "outbound",
        status: "draft",
        channel,
        via,
        subject,
        body,
      })
      .select("id")
      .single();

    if (insertError || !createdMessage?.id) {
      console.error("[invoice-followup-action] Message insert failed", {
        invoiceId,
        workspaceId: resolvedWorkspaceId,
        error: insertError,
      });
      return { success: false, error: "db_error", messageId: null };
    }

    console.log("[invoice-followup-created]", {
      invoiceId,
      messageId: createdMessage.id,
      jobId: resolvedJobId,
      customerId: resolvedCustomerId,
      recommendedChannel: channel,
    });

    return {
      success: true,
      messageId: createdMessage.id,
      recommendedChannel: channel,
      primaryActionLabel: recommendation.primaryActionLabel,
    };
  } catch (error) {
    console.error("[invoice-followup-action] Unexpected error", error);
    return { success: false, error: "db_error", messageId: null };
  }
}
