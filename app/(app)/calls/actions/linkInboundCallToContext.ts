"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { linkCallToCustomerJob } from "@/lib/domain/calls/sessions";

const linkInboundCallSchema = z.object({
  workspaceId: z.string().min(1),
  callId: z.string().min(1),
  customerId: z.string().min(1),
  jobId: z
    .preprocess((value) => {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }, z.string().min(1).nullable())
    .optional(),
});

export type LinkInboundCallToContextResponse =
  | { success: true; payload: Awaited<ReturnType<typeof linkCallToCustomerJob>> }
  | { success: false; code: string; message: string };

export async function linkInboundCallToContextAction(
  formData: FormData,
): Promise<LinkInboundCallToContextResponse> {
  const parsedInput = linkInboundCallSchema.safeParse({
    workspaceId: formData.get("workspaceId")?.toString() ?? "",
    callId: formData.get("callId")?.toString() ?? "",
    customerId: formData.get("customerId")?.toString() ?? "",
    jobId: formData.get("jobId")?.toString(),
  });

  if (!parsedInput.success) {
    console.error("[calls-inbound-link-action-failure] invalid form data", {
      errors: parsedInput.error.flatten(),
      source: "calls.session.link_card",
    });
    return {
      success: false,
      code: "invalid_form_data",
      message: "Unable to link the call context due to invalid input.",
    };
  }

  const { workspaceId, callId, customerId, jobId } = parsedInput.data;
  console.log("[calls-inbound-link-action-request]", {
    workspaceId,
    callId,
    customerId,
    jobId: jobId ?? null,
    source: "calls.session.link_card",
  });

  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const workspace = workspaceContext.workspace;

  if (!workspace) {
    console.error("[calls-inbound-link-action-failure] workspace missing", {
      workspaceId,
      callId,
      customerId,
      jobId: jobId ?? null,
      source: "calls.session.link_card",
    });
    return {
      success: false,
      code: "workspace_context_unavailable",
      message: "Workspace context is unavailable.",
    };
  }

  if (workspace.id !== workspaceId) {
    console.error("[calls-inbound-link-action-failure] workspace mismatch", {
      expected: workspaceId,
      actual: workspace.id,
      callId,
      customerId,
      jobId: jobId ?? null,
      source: "calls.session.link_card",
    });
    return {
      success: false,
      code: "cross_workspace",
      message: "Call belongs to a different workspace.",
    };
  }

  try {
    const { data: callRow, error: callError } = await supabase
      .from("calls")
      .select("id, workspace_id, direction")
      .eq("id", callId)
      .maybeSingle();

    if (callError) {
      console.error("[calls-inbound-link-action-failure] call query failed", {
        workspaceId,
        callId,
        error: callError,
        source: "calls.session.link_card",
      });
      return {
        success: false,
        code: "call_query_error",
        message: "Unable to load the call record.",
      };
    }

    if (!callRow) {
      console.error("[calls-inbound-link-action-failure] call not found", {
        workspaceId,
        callId,
        source: "calls.session.link_card",
      });
      return {
        success: false,
        code: "not_found",
        message: "Call not found.",
      };
    }

    if (callRow.workspace_id !== workspaceId) {
      console.error("[calls-inbound-link-action-failure] call cross workspace", {
        expectedWorkspaceId: workspaceId,
        actualWorkspaceId: callRow.workspace_id,
        callId,
        source: "calls.session.link_card",
      });
      return {
        success: false,
        code: "cross_workspace",
        message: "Call belongs to a different workspace.",
      };
    }

    if (callRow.direction !== "inbound") {
      console.error("[calls-inbound-link-action-failure] call not inbound", {
        callId,
        direction: callRow.direction,
        source: "calls.session.link_card",
      });
      return {
        success: false,
        code: "not_inbound",
        message: "Only inbound calls can be linked through this card.",
      };
    }

    const { data: customerRow, error: customerError } = await supabase
      .from("customers")
      .select("id, workspace_id")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError) {
      console.error("[calls-inbound-link-action-failure] customer query failed", {
        customerId,
        workspaceId,
        error: customerError,
        source: "calls.session.link_card",
      });
      return {
        success: false,
        code: "customer_query_error",
        message: "Unable to load the customer record.",
      };
    }

    if (!customerRow || customerRow.workspace_id !== workspaceId) {
      console.error("[calls-inbound-link-action-failure] customer invalid", {
        customerId,
        workspaceId,
        actualWorkspaceId: customerRow?.workspace_id ?? null,
        source: "calls.session.link_card",
      });
      return {
        success: false,
        code: "customer_not_found",
        message: "Customer not found in this workspace.",
      };
    }

    if (jobId) {
      const { data: jobRow, error: jobError } = await supabase
        .from("jobs")
        .select("id, workspace_id, customer_id")
        .eq("id", jobId)
        .maybeSingle();

      if (jobError) {
        console.error("[calls-inbound-link-action-failure] job query failed", {
          jobId,
          workspaceId,
          error: jobError,
          source: "calls.session.link_card",
        });
        return {
          success: false,
          code: "job_query_error",
          message: "Unable to load the job.",
        };
      }

      if (!jobRow) {
        console.error("[calls-inbound-link-action-failure] job not found", {
          jobId,
          source: "calls.session.link_card",
        });
        return {
          success: false,
          code: "job_not_found",
          message: "Job not found.",
        };
      }

      if (jobRow.workspace_id !== workspaceId) {
        console.error("[calls-inbound-link-action-failure] job cross workspace", {
          jobId,
          expectedWorkspaceId: workspaceId,
          actualWorkspaceId: jobRow.workspace_id,
          source: "calls.session.link_card",
        });
        return {
          success: false,
          code: "cross_workspace",
          message: "Job belongs to a different workspace.",
        };
      }

      if (jobRow.customer_id !== customerId) {
        console.error("[calls-inbound-link-action-failure] job-customer mismatch", {
          jobId,
          customerId,
          jobCustomerId: jobRow.customer_id,
          source: "calls.session.link_card",
        });
        return {
          success: false,
          code: "job_customer_mismatch",
          message: "Selected job does not belong to the chosen customer.",
        };
      }
    }

    const payload = await linkCallToCustomerJob({
      supabase,
      workspaceId,
      callId,
      customerId,
      jobId,
    });

    console.log("[calls-inbound-link-action-success]", {
      workspaceId,
      callId,
      customerId,
      jobId: jobId ?? null,
      source: "calls.session.link_card",
    });

    return {
      success: true,
      payload,
    };
  } catch (error) {
    console.error("[calls-inbound-link-action-failure] unexpected error", {
      workspaceId,
      callId,
      customerId,
      jobId: jobId ?? null,
      error,
      source: "calls.session.link_card",
    });
    return {
      success: false,
      code: "update_failed",
      message: "Unable to link the call at this time.",
    };
  }
}
