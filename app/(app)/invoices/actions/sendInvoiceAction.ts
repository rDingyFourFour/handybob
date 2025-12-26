"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import { getInvoicePublicLink } from "@/lib/domain/invoices/publicInvoice";
import { ensureInvoicePublicToken } from "@/lib/domain/invoices/publicInvoice.server";
import {
  buildInvoiceLifecycleUpdate,
  guardInvoiceStatusTransition,
  normalizeInvoiceStatus,
  type InvoiceStatus,
} from "@/lib/domain/invoicesLifecycle";
import { sendInvoiceEmail } from "@/utils/email/sendInvoiceEmail";

type InvoiceSendRow = {
  id: string;
  workspace_id: string | null;
  job_id: string | null;
  invoice_status: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  customer_email: string | null;
  customer_name: string | null;
  invoice_number: number | null;
  snapshot_total_cents: number | null;
  due_at: string | null;
};

type WorkspaceBrandRow = {
  name: string | null;
  brand_name: string | null;
  brand_tagline: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
};

type SendInvoiceResult =
  | { success: true }
  | {
      success: false;
      code:
        | "invalid_input"
        | "unauthenticated"
        | "forbidden"
        | "workspace_not_found"
        | "not_found"
        | "invoice_not_sendable"
        | "missing_customer_email"
        | "email_send_failed"
        | "db_error";
      message: string;
    };

const sendInvoiceSchema = z.object({
  workspaceId: z.string().min(1),
  invoiceId: z.string().min(1),
  source: z.string().min(1),
});

function failure(code: SendInvoiceResult["code"], message: string): SendInvoiceResult {
  return { success: false, code, message };
}

export async function sendInvoiceAction(
  _prevState: SendInvoiceResult | null,
  formData: FormData,
): Promise<SendInvoiceResult> {
  const parsed = sendInvoiceSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    invoiceId: formData.get("invoiceId"),
    source: formData.get("source"),
  });

  if (!parsed.success) {
    console.log("[invoice-send-failure]", {
      reasonCode: "invalid_input",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
    return failure("invalid_input", "We couldn’t send that invoice. Please try again.");
  }

  const { workspaceId, invoiceId, source } = parsed.data;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch {
    console.log("[invoice-send-failure]", { workspaceId, invoiceId, source, reasonCode: "db_error" });
    return failure("db_error", "We couldn’t send that invoice right now.");
  }

  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });

  if (!workspaceResult.ok) {
    const code =
      workspaceResult.code === "unauthenticated"
        ? "unauthenticated"
        : workspaceResult.code === "workspace_not_found"
        ? "workspace_not_found"
        : "forbidden";
    console.log("[invoice-send-failure]", { workspaceId, invoiceId, source, reasonCode: code });
    return failure(code, "You no longer have access to send invoices.");
  }

  if (workspaceResult.membership.workspace.id !== workspaceId) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      source,
      reasonCode: "forbidden",
      workspaceFound: workspaceResult.membership.workspace.id,
    });
    return failure("forbidden", "You no longer have access to send this invoice.");
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from<InvoiceSendRow>("invoices")
    .select(
      `
        id,
        workspace_id,
        job_id,
        invoice_status,
        sent_at,
        paid_at,
        voided_at,
        customer_email,
        customer_name,
        invoice_number,
        snapshot_total_cents,
        due_at
      `,
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      source,
      reasonCode: "db_error",
    });
    return failure("db_error", "We couldn’t send that invoice right now.");
  }

  if (!invoice) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      source,
      reasonCode: "not_found",
    });
    return failure("not_found", "We couldn’t find that invoice.");
  }

  console.log("[invoice-send-request]", {
    workspaceId,
    invoiceId,
    jobId: invoice.job_id ?? null,
    source,
  });

  if (invoice.workspace_id !== workspaceId) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      jobId: invoice.job_id ?? null,
      source,
      reasonCode: "forbidden",
    });
    return failure("forbidden", "You no longer have access to send this invoice.");
  }

  if (!invoice.customer_email) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      jobId: invoice.job_id ?? null,
      source,
      reasonCode: "missing_customer_email",
    });
    return failure("missing_customer_email", "Add a customer email to send this invoice.");
  }

  const transition = guardInvoiceStatusTransition(invoice.invoice_status, "sent");
  if (!transition.allowed) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      jobId: invoice.job_id ?? null,
      source,
      reasonCode: "invoice_not_sendable",
      currentStatus: invoice.invoice_status ?? null,
    });
    return failure("invoice_not_sendable", "This invoice can’t be sent right now.");
  }

  const tokenResult = await ensureInvoicePublicToken({ workspaceId, invoiceId });
  if (!tokenResult.success) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      jobId: invoice.job_id ?? null,
      source,
      reasonCode: tokenResult.code,
    });
    return failure("db_error", "We couldn’t create the public invoice link.");
  }

  const publicUrl = getInvoicePublicLink(tokenResult.token);
  const { data: workspaceData } = await supabase
    .from<WorkspaceBrandRow>("workspaces")
    .select("name, brand_name, brand_tagline, business_email, business_phone, business_address")
    .eq("id", workspaceId)
    .maybeSingle();

  try {
    await sendInvoiceEmail({
      to: invoice.customer_email,
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      invoiceTotal: (invoice.snapshot_total_cents ?? 0) / 100,
      dueDate: invoice.due_at,
      publicUrl,
      workspace: workspaceData ?? undefined,
    });
  } catch {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      jobId: invoice.job_id ?? null,
      source,
      reasonCode: "email_send_failed",
    });
    return failure("email_send_failed", "We couldn’t send the email. Please try again.");
  }

  const currentStatus = normalizeInvoiceStatus(invoice.invoice_status) ?? "draft";
  const updatePayload = buildInvoiceLifecycleUpdate({
    currentStatus,
    targetStatus: "sent" as InvoiceStatus,
    sentAt: invoice.sent_at,
    paidAt: invoice.paid_at,
    voidedAt: invoice.voided_at,
  });

  const { error: updateError } = await supabase
    .from("invoices")
    .update(updatePayload)
    .eq("id", invoiceId);

  if (updateError) {
    console.log("[invoice-send-failure]", {
      workspaceId,
      invoiceId,
      jobId: invoice.job_id ?? null,
      source,
      reasonCode: "db_error",
    });
    return failure("db_error", "We couldn’t update the invoice status.");
  }

  console.log("[invoice-send-success]", {
    workspaceId,
    invoiceId,
    jobId: invoice.job_id ?? null,
    source,
  });

  return { success: true };
}
