"use server";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { getInvoiceFollowupTemplate } from "@/lib/domain/communications/followupMessages";

function parseFormValue(value: FormDataEntryValue | null): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

export async function createInvoiceFollowupMessageAction(
  formData: FormData,
): Promise<void> {
  const invoiceId = parseFormValue(formData.get("invoice_id"));
  const jobId = parseFormValue(formData.get("job_id")) || null;
  const customerId = parseFormValue(formData.get("customer_id")) || null;
  const workspaceIdFromForm = parseFormValue(formData.get("workspace_id")) || null;
  const recommendedChannel = parseFormValue(formData.get("recommended_channel")) || "email";
  const jobTitle = parseFormValue(formData.get("job_title")) || null;

  if (!invoiceId) {
    console.warn("[invoice-followup-action] Missing invoice_id");
    throw new Error("invoice_id missing");
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    console.warn("[invoice-followup-action] Unauthenticated action attempt", { invoiceId });
    throw new Error("Unauthenticated");
  }

  let resolvedWorkspaceId = workspaceIdFromForm;
  if (!resolvedWorkspaceId) {
    try {
      const { workspace } = await getCurrentWorkspace({ supabase });
      resolvedWorkspaceId = workspace?.id ?? null;
    } catch (error) {
      console.error("[invoice-followup-action] Workspace lookup failed", error);
      throw new Error("Workspace lookup failed");
    }
  }

  if (!resolvedWorkspaceId) {
    console.error("[invoice-followup-action] Workspace ID missing");
    throw new Error("Workspace missing");
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, status, due_at, job_id, customer_id, customer_name")
    .eq("workspace_id", resolvedWorkspaceId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error("[invoice-followup-action] Invoice lookup failed", {
      invoiceId,
      workspaceId: resolvedWorkspaceId,
      error: invoiceError,
    });
    throw new Error("Invoice lookup failed");
  }

  if (!invoice) {
    console.error("[invoice-followup-action] Invoice not found", { invoiceId });
    throw new Error("Invoice not found");
  }

  const template = getInvoiceFollowupTemplate({
    customerName: invoice.customer_name,
    jobTitle: jobTitle || undefined,
    invoiceNumber: invoice.invoice_number,
    total: invoice.total ?? undefined,
    status: invoice.status,
    dueDate: invoice.due_at,
  });

  const channel = recommendedChannel || "email";
  const via = "email";

  try {
    const { data: createdMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        workspace_id: resolvedWorkspaceId,
        user_id: user.id,
        job_id: jobId ?? invoice.job_id ?? null,
        customer_id: customerId ?? invoice.customer_id ?? null,
        invoice_id: invoice.id,
        direction: "outbound",
        status: "draft",
        channel,
        via,
        subject: template.subject,
        body: template.body,
      })
      .select("id")
      .single();

    if (insertError || !createdMessage?.id) {
      console.error("[invoice-followup-action] Message insert failed", {
        error: insertError,
        invoiceId,
        workspaceId: resolvedWorkspaceId,
        channel,
      });
      throw new Error("Failed to create follow-up message");
    }

    console.log("[invoice-followup-action]", {
      workspaceId: resolvedWorkspaceId,
      invoiceId,
      customerId,
      jobId,
      channel,
      messageId: createdMessage.id,
    });

    redirect(`/messages/${createdMessage.id}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("[invoice-followup-action] Unexpected error", error);
    throw new Error("Failed to create follow-up message");
  }
}
