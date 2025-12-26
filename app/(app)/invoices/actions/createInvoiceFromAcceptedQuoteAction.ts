"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import { createInvoiceFromAcceptedQuote } from "@/lib/domain/invoices/createInvoiceFromAcceptedQuote";

type CreateInvoiceActionResult = {
  success: boolean;
  code: string;
  invoiceId?: string | null;
};

const createInvoiceSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  quoteId: z.string().min(1),
});

export async function createInvoiceFromAcceptedQuoteAction(
  _prevState: CreateInvoiceActionResult | null,
  formData: FormData,
): Promise<CreateInvoiceActionResult> {
  const parsed = createInvoiceSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    jobId: formData.get("jobId"),
    quoteId: formData.get("quoteId"),
  });

  if (!parsed.success) {
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId: null,
      jobId: null,
      quoteId: null,
      code: "invalid_input",
    });
    return { success: false, code: "invalid_input" };
  }

  const { workspaceId, jobId, quoteId } = parsed.data;

  console.log("[invoice-create-from-accepted-quote-request]", {
    workspaceId,
    jobId,
    quoteId,
  });

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId,
      jobId,
      quoteId,
      code: "unknown_error",
      error,
    });
    return { success: false, code: "unknown_error" };
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
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId,
      jobId,
      quoteId,
      code,
    });
    return { success: false, code };
  }

  const { workspace, user } = workspaceResult.membership;

  if (workspace.id !== workspaceId) {
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId,
      jobId,
      quoteId,
      code: "forbidden",
    });
    return { success: false, code: "forbidden" };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, workspace_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId,
      jobId,
      quoteId,
      code: "unknown_error",
      error: jobError,
    });
    return { success: false, code: "unknown_error" };
  }

  if (!job) {
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId,
      jobId,
      quoteId,
      code: "job_not_found",
    });
    return { success: false, code: "job_not_found" };
  }

  if (job.workspace_id !== workspaceId) {
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId,
      jobId,
      quoteId,
      code: "forbidden",
    });
    return { success: false, code: "forbidden" };
  }

  const result = await createInvoiceFromAcceptedQuote({
    supabase,
    workspaceId,
    jobId,
    quoteId,
    userId: user.id,
  });

  if (!result.ok) {
    console.error("[invoice-create-from-accepted-quote-failure]", {
      workspaceId,
      jobId,
      quoteId,
      code: result.code,
    });
    return { success: false, code: result.code };
  }

  console.log("[invoice-create-from-accepted-quote-success]", {
    workspaceId,
    jobId,
    quoteId,
    invoiceId: result.invoice.id,
  });

  return {
    success: true,
    code: "ok",
    invoiceId: result.invoice.id,
  };
}
