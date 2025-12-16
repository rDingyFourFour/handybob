"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import { CallLiveGuidanceResult } from "@/lib/domain/askbob/types";
import {
  buildCallOutcomePromptContext,
  formatLatestCallOutcomeReference,
  mapLegacyCallOutcomeToCode,
  normalizeCallOutcomeNotes,
  type LatestCallOutcomeForJob,
} from "@/lib/domain/calls/latestCallOutcome";
import {
  CALL_OUTCOME_CODE_VALUES,
  type CallOutcomeCode,
} from "@/lib/domain/communications/callOutcomes";
import { isAskBobScriptSummary } from "@/lib/domain/askbob/constants";

type CallLiveGuidanceActionSuccess = {
  success: true;
  result: CallLiveGuidanceResult;
};

type CallLiveGuidanceActionFailure = {
  success: false;
  code: string;
  message: string;
};

type CallLiveGuidanceActionResponse =
  | CallLiveGuidanceActionSuccess
  | CallLiveGuidanceActionFailure;

const NOTES_MAX_LENGTH = 2000;

function determineNotesLengthBucket(length: number): string {
  if (length === 0) {
    return "none";
  }
  if (length <= 200) {
    return "short";
  }
  if (length <= 500) {
    return "medium";
  }
  if (length <= 1000) {
    return "long";
  }
  return "very_long";
}

const callLiveGuidanceSchema = z.object({
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
  guidanceMode: z.enum(["intake", "scheduling"]),
  notesText: z.string().optional(),
  callGuidanceSessionId: z.string().min(1),
  cycleIndex: z
    .preprocess((value) => {
      if (typeof value === "string" && value.trim().length) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
      }
      return null;
    }, z.number().int().min(1)),
  priorGuidanceSummary: z.string().optional(),
});

function buildQuoteSummary(quote: { id: string; status?: string | null; total?: number | null }) {
  const segments = [`Quote ${quote.id.slice(0, 8)}…`];
  if (quote.status) {
    segments.push(`status: ${quote.status}`);
  }
  if (quote.total != null) {
    segments.push(`total: $${Number(quote.total).toFixed(2)}`);
  }
  return segments.join(" · ");
}

export async function callLiveGuidanceAction(
  formData: FormData,
): Promise<CallLiveGuidanceActionResponse> {
  "use server";
  const parsed = callLiveGuidanceSchema.safeParse({
    workspaceId: formData.get("workspaceId")?.toString() ?? "",
    callId: formData.get("callId")?.toString() ?? "",
    customerId: formData.get("customerId")?.toString() ?? "",
    jobId: formData.get("jobId")?.toString(),
    guidanceMode: formData.get("guidanceMode")?.toString() ?? "",
    notesText: formData.get("notesText")?.toString(),
    callGuidanceSessionId: formData.get("callGuidanceSessionId")?.toString() ?? "",
    cycleIndex: formData.get("cycleIndex")?.toString(),
    priorGuidanceSummary: formData.get("priorGuidanceSummary")?.toString(),
  });

  if (!parsed.success) {
    console.error("[askbob-call-live-guidance-failure] invalid form data", {
      errors: parsed.error.flatten(),
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "invalid_form_data",
      message: "Please provide all required fields to generate guidance.",
    };
  }

  const {
    workspaceId,
    callId,
    customerId,
    jobId,
    guidanceMode,
    notesText,
    callGuidanceSessionId,
    cycleIndex,
    priorGuidanceSummary,
  } = parsed.data;
  const normalizedNotes = notesText?.trim() ?? null;
  if (normalizedNotes && normalizedNotes.length > NOTES_MAX_LENGTH) {
    console.error("[askbob-call-live-guidance-failure] notes too long", {
      callId,
      workspaceId,
      notesLength: normalizedNotes.length,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "notes_too_long",
      message: `Live notes must be ${NOTES_MAX_LENGTH} characters or less.`,
    };
  }
  const notesLengthBucket = determineNotesLengthBucket(normalizedNotes?.length ?? 0);
  const notesPresent = Boolean(normalizedNotes);
  const guidanceSessionId = callGuidanceSessionId.trim();
  const normalizedPriorGuidanceSummary = priorGuidanceSummary?.trim() ?? null;
  console.log("[askbob-call-live-guidance-request]", {
    workspaceId,
    callId,
    customerId,
    jobId: jobId ?? null,
    guidanceMode,
    cycleIndex,
    callGuidanceSessionId: guidanceSessionId,
    notesPresent,
    notesLengthBucket,
    hasPriorGuidance: Boolean(normalizedPriorGuidanceSummary),
    source: "askbob.call-live-guidance",
  });

  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const workspace = workspaceContext.workspace;

  if (!workspace) {
    console.error("[askbob-call-live-guidance-failure] workspace missing", {
      workspaceId,
      callId,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "workspace_context_unavailable",
      message: "Unable to resolve workspace context.",
    };
  }

  if (workspace.id !== workspaceId) {
    console.error("[askbob-call-live-guidance-failure] workspace mismatch", {
      expected: workspaceId,
      actual: workspace.id,
      callId,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "cross_workspace",
      message: "This call does not belong to the selected workspace.",
    };
  }

  const { data: call, error: callError } = await supabase
    .from("calls")
    .select(
      "id, workspace_id, direction, job_id, customer_id, from_number, to_number, summary, ai_summary, outcome, outcome_code, outcome_notes, outcome_recorded_at, created_at",
    )
    .eq("id", callId)
    .maybeSingle();

  if (callError) {
    console.error("[askbob-call-live-guidance-failure] call query failed", {
      workspaceId,
      callId,
      error: callError,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "call_query_error",
      message: "Unable to load the call record.",
    };
  }

  if (!call) {
    console.error("[askbob-call-live-guidance-failure] call not found", {
      workspaceId,
      callId,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "call_not_found",
      message: "Call not found.",
    };
  }

  if (call.workspace_id !== workspaceId) {
    console.error("[askbob-call-live-guidance-failure] call cross workspace", {
      callId,
      workspaceId,
      actualWorkspaceId: call.workspace_id,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "cross_workspace",
      message: "Call belongs to a different workspace.",
    };
  }

  if ((call.direction ?? "outbound").toLowerCase() !== "inbound") {
    console.error("[askbob-call-live-guidance-failure] call not inbound", {
      callId,
      direction: call.direction,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "not_inbound",
      message: "AskBob live guidance is only available for inbound calls.",
    };
  }

  const callDirectionNormalized = (call.direction ?? "outbound").toLowerCase();

  if (!call.customer_id) {
    console.error("[askbob-call-live-guidance-failure] call missing customer", {
      callId,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "call_missing_customer",
      message: "This call has not been linked to a customer yet.",
    };
  }

  if (call.customer_id !== customerId) {
    console.error("[askbob-call-live-guidance-failure] customer mismatch", {
      callId,
      expected: customerId,
      actual: call.customer_id,
    });
    return {
      success: false,
      code: "customer_mismatch",
      message: "The selected customer does not match the call.",
    };
  }

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    console.error("[askbob-call-live-guidance-failure] customer query failed", {
      customerId,
      workspaceId,
      error: customerError,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "customer_query_error",
      message: "Unable to load the customer record.",
    };
  }

  if (!customerRow) {
    console.error("[askbob-call-live-guidance-failure] customer not found", {
      customerId,
      workspaceId,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "customer_not_found",
      message: "Customer not found in this workspace.",
    };
  }

  const resolvedJobId = jobId ?? call.job_id ?? null;
  let jobRow: { id: string; title: string | null; status: string | null; customer_id: string | null } | null =
    null;
  if (resolvedJobId) {
    const { data: fetchedJob, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, status, customer_id")
      .eq("workspace_id", workspaceId)
      .eq("id", resolvedJobId)
      .maybeSingle();

    if (jobError) {
      console.error("[askbob-call-live-guidance-failure] job query failed", {
        jobId: resolvedJobId,
        workspaceId,
        error: jobError,
        source: "askbob.call-live-guidance",
      });
      return {
        success: false,
        code: "job_query_error",
        message: "Unable to load the selected job.",
      };
    }

    if (!fetchedJob) {
      console.error("[askbob-call-live-guidance-failure] job not found", {
        jobId: resolvedJobId,
        source: "askbob.call-live-guidance",
      });
      return {
        success: false,
        code: "job_not_found",
        message: "Job not found.",
      };
    }

    if (fetchedJob.customer_id && fetchedJob.customer_id !== customerId) {
      console.error("[askbob-call-live-guidance-failure] job customer mismatch", {
        jobId: fetchedJob.id,
        jobCustomerId: fetchedJob.customer_id,
        customerId,
        source: "askbob.call-live-guidance",
      });
      return {
        success: false,
        code: "job_customer_mismatch",
        message: "Selected job belongs to a different customer.",
      };
    }

    jobRow = fetchedJob;
  }

  let latestQuoteSummary: string | null = null;
  let latestQuoteId: string | null = null;
  if (resolvedJobId) {
    const { data: latestQuotes, error: quoteError } = await supabase
      .from("quotes")
      .select("id, status, total")
      .eq("workspace_id", workspaceId)
      .eq("job_id", resolvedJobId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (quoteError) {
      console.error("[askbob-call-live-guidance-failure] quote query failed", {
        jobId: resolvedJobId,
        workspaceId,
        error: quoteError,
        source: "askbob.call-live-guidance",
      });
      return {
        success: false,
        code: "quote_query_error",
        message: "Unable to load quote context.",
      };
    }

    const latestQuote = latestQuotes?.[0] ?? null;
    if (latestQuote) {
      latestQuoteSummary = buildQuoteSummary(latestQuote);
      latestQuoteId = latestQuote.id;
    }
  }

  const trimmedOutcomeCode = call.outcome_code?.trim();
  const hasValidCode =
    trimmedOutcomeCode &&
    CALL_OUTCOME_CODE_VALUES.includes(trimmedOutcomeCode as CallOutcomeCode);
  const resolvedOutcomeCode = hasValidCode
    ? (trimmedOutcomeCode as CallOutcomeCode)
    : mapLegacyCallOutcomeToCode(call.outcome ?? null);
  const latestCallOutcome: LatestCallOutcomeForJob = {
    callId: call.id,
    occurredAt: call.outcome_recorded_at ?? call.created_at ?? null,
    reachedCustomer: call.reached_customer ?? null,
    outcomeCode: resolvedOutcomeCode,
    outcomeNotes: normalizeCallOutcomeNotes(call.outcome_notes),
    isAskBobAssisted: isAskBobScriptSummary(call.ai_summary ?? call.summary ?? null),
  };
  const callOutcomeContext = buildCallOutcomePromptContext(latestCallOutcome);
  const callOutcomeLabel = formatLatestCallOutcomeReference(latestCallOutcome);

  const callSummary = (call.ai_summary ?? call.summary ?? "").trim() || null;

  try {
    const serviceInput = {
      task: "call.live_guidance" as const,
      workspaceId,
      callId,
      customerId,
      jobId: resolvedJobId,
      guidanceMode,
      fromNumber: call.from_number ?? null,
      toNumber: call.to_number ?? null,
      direction: callDirectionNormalized,
      notesText: normalizedNotes,
      callGuidanceSessionId: guidanceSessionId,
      cycleIndex,
      priorGuidanceSummary: normalizedPriorGuidanceSummary,
      customerName: customerRow.name ?? null,
      jobTitle: jobRow?.title ?? null,
      jobStatus: jobRow?.status ?? null,
      quoteSummary: latestQuoteSummary,
      quoteId: latestQuoteId,
      latestCallOutcomeContext: callOutcomeContext,
      latestCallOutcomeLabel: callOutcomeLabel,
      extraDetails: callSummary,
    };

    console.log("[askbob-call-live-guidance-cycle-request]", {
      workspaceId,
      callId,
      customerId,
      jobId: resolvedJobId,
      guidanceMode,
      direction: callDirectionNormalized,
      callGuidanceSessionId: guidanceSessionId,
      cycleIndex,
      notesPresent,
      notesLengthBucket,
      hasPriorGuidance: Boolean(normalizedPriorGuidanceSummary),
      hasQuoteContext: Boolean(latestQuoteSummary),
      hasCallOutcome: Boolean(callOutcomeContext),
      source: "askbob.call-live-guidance",
    });

    const response = (await runAskBobTask(supabase, serviceInput)) as CallLiveGuidanceResult;
    console.log("[askbob-call-live-guidance-cycle-success]", {
      workspaceId,
      callId,
      customerId,
      jobId: resolvedJobId,
      guidanceMode,
      direction: callDirectionNormalized,
      callGuidanceSessionId: guidanceSessionId,
      cycleIndex,
      summary: response.summary,
      changedRecommendation: response.changedRecommendation,
      notesPresent,
      notesLengthBucket,
      source: "askbob.call-live-guidance",
    });
    console.log("[askbob-call-live-guidance-success]", {
      workspaceId,
      callId,
      customerId,
      jobId: resolvedJobId,
      guidanceMode,
      direction: callDirectionNormalized,
      callGuidanceSessionId: guidanceSessionId,
      cycleIndex,
      hasQuoteContext: Boolean(latestQuoteSummary),
      hasCallOutcome: Boolean(callOutcomeContext),
      notesPresent,
      notesLengthBucket,
      hasPriorGuidance: Boolean(normalizedPriorGuidanceSummary),
    });

    return {
      success: true,
      result: response,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-call-live-guidance-failure]", {
      workspaceId,
      callId,
      customerId,
      jobId: resolvedJobId,
      guidanceMode,
      errorMessage: truncatedError,
      source: "askbob.call-live-guidance",
    });
    console.error("[askbob-call-live-guidance-cycle-failure]", {
      workspaceId,
      callId,
      customerId,
      jobId: resolvedJobId,
      guidanceMode,
      callGuidanceSessionId: guidanceSessionId,
      cycleIndex,
      notesPresent,
      notesLengthBucket,
      errorMessage: truncatedError,
      source: "askbob.call-live-guidance",
    });
    return {
      success: false,
      code: "askbob_service_error",
      message: "AskBob could not generate live guidance right now.",
    };
  }
}
