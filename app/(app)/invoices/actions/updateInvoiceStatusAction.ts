"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import {
  INVOICE_STATUS_VALUES,
  guardInvoiceStatusTransition,
  buildInvoiceLifecycleUpdate,
  normalizeInvoiceStatus,
  type InvoiceStatus,
} from "@/lib/domain/invoicesLifecycle";

type InvoiceLifecycleRow = {
  id: string;
  workspace_id: string | null;
  job_id: string | null;
  invoice_status: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
};

type UpdateInvoiceStatusResult =
  | {
      success: true;
      code: "ok";
      invoiceId: string;
      jobId: string;
      newStatus: InvoiceStatus;
      sentAt: string | null;
      paidAt: string | null;
      voidedAt: string | null;
    }
  | {
      success: false;
      code:
        | "invalid_input"
        | "unauthenticated"
        | "forbidden"
        | "workspace_not_found"
        | "not_found"
        | "workspace_mismatch"
        | "job_mismatch"
        | "invalid_transition"
        | "db_error";
      reason: string;
    };

const updateInvoiceStatusSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  invoiceId: z.string().min(1),
  targetStatus: z.enum(INVOICE_STATUS_VALUES),
});

function failureResponse(code: UpdateInvoiceStatusResult["code"], reason: string) {
  return { success: false, code, reason } satisfies UpdateInvoiceStatusResult;
}

export async function updateInvoiceStatusAction(
  _prevState: UpdateInvoiceStatusResult | null,
  formData: FormData,
): Promise<UpdateInvoiceStatusResult> {
  const parsed = updateInvoiceStatusSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    jobId: formData.get("jobId"),
    invoiceId: formData.get("invoiceId"),
    targetStatus: formData.get("targetStatus"),
  });

  if (!parsed.success) {
    console.error("[invoices-status-action-failure]", {
      reasonCode: "invalid_input",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
    return failureResponse("invalid_input", "invalid_input");
  }

  const { workspaceId, jobId, invoiceId, targetStatus } = parsed.data;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "db_error",
      error,
    });
    return failureResponse("db_error", "db_error");
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
        : workspaceResult.code === "no_membership"
        ? "forbidden"
        : "workspace_not_found";
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: code,
    });
    return failureResponse(code, code);
  }

  const { workspace } = workspaceResult.membership;
  if (workspace.id !== workspaceId) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "workspace_mismatch",
      workspaceFound: workspace.id ?? null,
    });
    return failureResponse("workspace_mismatch", "workspace_mismatch");
  }

  const { data: invoiceById, error: invoiceError } = await supabase
    .from<InvoiceLifecycleRow>("invoices")
    .select("id, workspace_id, job_id, invoice_status, sent_at, paid_at, voided_at")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "db_error",
      error: invoiceError,
    });
    return failureResponse("db_error", "db_error");
  }

  console.log("[invoices-status-action-request]", {
    workspaceId,
    jobId,
    invoiceId,
    currentStatus: invoiceById?.invoice_status ?? null,
    targetStatus,
  });

  if (!invoiceById) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "not_found",
    });
    return failureResponse("not_found", "not_found");
  }

  if (invoiceById.workspace_id !== workspaceId) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "workspace_mismatch",
      invoiceWorkspaceId: invoiceById.workspace_id,
    });
    return failureResponse("workspace_mismatch", "workspace_mismatch");
  }

  if (invoiceById.job_id !== jobId) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "job_mismatch",
      invoiceJobId: invoiceById.job_id,
    });
    return failureResponse("job_mismatch", "job_mismatch");
  }

  const { data: jobInvoice, error: jobInvoiceError } = await supabase
    .from<Pick<InvoiceLifecycleRow, "id">>("invoices")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (jobInvoiceError) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "db_error",
      error: jobInvoiceError,
    });
    return failureResponse("db_error", "db_error");
  }

  if (!jobInvoice) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "not_found",
    });
    return failureResponse("not_found", "not_found");
  }

  if (jobInvoice.id !== invoiceId) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "job_mismatch",
      jobInvoiceId: jobInvoice.id,
    });
    return failureResponse("job_mismatch", "job_mismatch");
  }

  const transition = guardInvoiceStatusTransition(invoiceById.invoice_status, targetStatus);
  if (!transition.allowed) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "invalid_transition",
      currentStatus: invoiceById.invoice_status,
      targetStatus,
    });
    return failureResponse("invalid_transition", "invalid_transition");
  }

  const currentStatus = normalizeInvoiceStatus(invoiceById.invoice_status) ?? "draft";
  const updatePayload = buildInvoiceLifecycleUpdate({
    currentStatus,
    targetStatus,
    sentAt: invoiceById.sent_at,
    paidAt: invoiceById.paid_at,
    voidedAt: invoiceById.voided_at,
  });

  const { data: updatedInvoice, error: updateError } = await supabase
    .from<InvoiceLifecycleRow>("invoices")
    .update(updatePayload)
    .eq("id", invoiceId)
    .select("id, invoice_status, sent_at, paid_at, voided_at")
    .maybeSingle();

  if (updateError) {
    console.error("[invoices-status-action-failure]", {
      workspaceId,
      jobId,
      invoiceId,
      reasonCode: "db_error",
      error: updateError,
    });
    return failureResponse("db_error", "db_error");
  }

  const resolvedStatus =
    normalizeInvoiceStatus(updatedInvoice?.invoice_status ?? null) ?? updatePayload.invoice_status;

  console.log("[invoices-status-action-success]", {
    workspaceId,
    jobId,
    invoiceId,
    newStatus: resolvedStatus,
  });

  return {
    success: true,
    code: "ok",
    invoiceId,
    jobId,
    newStatus: resolvedStatus,
    sentAt: updatedInvoice?.sent_at ?? updatePayload.sent_at ?? invoiceById.sent_at,
    paidAt: updatedInvoice?.paid_at ?? updatePayload.paid_at ?? invoiceById.paid_at,
    voidedAt: updatedInvoice?.voided_at ?? updatePayload.voided_at ?? invoiceById.voided_at,
  };
}
