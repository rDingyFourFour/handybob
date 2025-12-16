"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { parseEnvConfig } from "@/schemas/env";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  createCallSessionForJobQuote,
  attachTwilioMetadataToCallSession,
  updateCallSessionTwilioStatus,
} from "@/lib/domain/calls/sessions";
import { dialTwilioCall, TwilioConfigurationError } from "@/lib/domain/twilio";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";

const StartAskBobAutomatedCallSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  customerPhone: z.string().min(1),
  callIntents: z.array(z.string()).optional().nullable(),
  scriptSummary: z.string().optional().nullable(),
  scriptBody: z.string().optional().nullable(),
});

type StartAskBobAutomatedCallPayload = z.infer<typeof StartAskBobAutomatedCallSchema>;

type StartAskBobAutomatedCallSuccess = {
  status: "success";
  callId: string;
  label: string;
  twilioStatus?: string | null;
};

type StartAskBobAutomatedCallFailure = {
  status: "failure";
  reason: string;
  message: string;
  callId?: string;
};

const FROM_PLACEHOLDER = "workspace-default";

function normalizeCandidate(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function truncateForSummary(value: string, limit = 900) {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
}

export async function startAskBobAutomatedCall(
  payload: StartAskBobAutomatedCallPayload,
): Promise<
  StartAskBobAutomatedCallSuccess | StartAskBobAutomatedCallFailure
> {
  const logFailure = (reason: string, extra: Record<string, unknown> = {}) => {
    console.log("[askbob-automated-call-ui-failure]", {
      reason,
      workspaceId: payload.workspaceId,
      jobId: payload.jobId,
      ...extra,
    });
  };

  const parsed = StartAskBobAutomatedCallSchema.safeParse(payload);
  if (!parsed.success) {
    logFailure("invalid_payload", { errors: parsed.error.flatten() });
    return {
      status: "failure",
      reason: "invalid_payload",
      message: "We couldn’t start this call with the provided information.",
    };
  }

  const params = parsed.data;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logFailure("unauthenticated");
    return {
      status: "failure",
      reason: "unauthenticated",
      message: "Please sign in to place automated calls.",
    };
  }

  const { workspace } = await getCurrentWorkspace({ supabase });
  if (!workspace) {
    logFailure("workspace_required");
    return {
      status: "failure",
      reason: "workspace_required",
      message: "Workspace access is required to place automated calls.",
    };
  }

  if (workspace.id !== params.workspaceId) {
    logFailure("wrong_workspace");
    return {
      status: "failure",
      reason: "wrong_workspace",
      message: "This job does not belong to your workspace.",
    };
  }

  const envConfig = parseEnvConfig();
  const statusCallbackBaseUrl = envConfig.appUrl
    ? `${envConfig.appUrl.replace(/\/$/, "")}/api/twilio/calls/status`
    : null;

  const normalizedCustomerPhone = normalizeCandidate(params.customerPhone);
  if (!normalizedCustomerPhone) {
    logFailure("missing_customer_phone");
    return {
      status: "failure",
      reason: "missing_customer_phone",
      message: "Add a customer phone number before placing an automated call.",
    };
  }

  const { data: jobRow } = await supabase
    .from("jobs")
    .select("id, customer_id")
    .eq("id", params.jobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!jobRow) {
    logFailure("job_not_found");
    return {
      status: "failure",
      reason: "job_not_found",
      message: "We couldn’t find that job in this workspace.",
    };
  }

  const { data: workspacePhoneRow } = await supabase
    .from("workspaces")
    .select("business_phone")
    .eq("id", workspace.id)
    .maybeSingle();
  const normalizedWorkspacePhone = normalizeCandidate(workspacePhoneRow?.business_phone);
  const normalizedDefaultFrom = normalizeCandidate(process.env.TWILIO_FROM_NUMBER ?? null);
  const outboundFromNumber = normalizedWorkspacePhone ?? normalizedDefaultFrom;
  const fromNumber = outboundFromNumber ?? FROM_PLACEHOLDER;

  const trimmedScriptBody = normalizeCandidate(params.scriptBody ?? null);
  const trimmedScriptSummary = normalizeCandidate(params.scriptSummary ?? null);
  if (!trimmedScriptBody && !trimmedScriptSummary) {
    logFailure("missing_script");
    return {
      status: "failure",
      reason: "missing_script",
      message: "Generate a script before placing an automated call.",
    };
  }

  const titleSource = trimmedScriptSummary || trimmedScriptBody || "Automated call";
  const summaryOverride = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} ${truncateForSummary(titleSource)}`;
  const scriptBodyPayload = trimmedScriptBody ? trimmedScriptBody.slice(0, 4000) : null;

  try {
    const call = await createCallSessionForJobQuote({
      supabase,
      workspaceId: workspace.id,
      userId: user.id,
      jobId: params.jobId,
      customerId: jobRow.customer_id ?? params.customerId ?? null,
      fromNumber,
      toNumber: normalizedCustomerPhone,
      quoteId: null,
      scriptBody: scriptBodyPayload,
      summaryOverride,
    });

    console.log("[calls-automated-call-session-created]", {
      callId: call.id,
      workspaceId: call.workspace_id,
      jobId: call.job_id,
    });

    try {
      if (!outboundFromNumber) {
        throw new TwilioConfigurationError("No outbound phone number is configured for this workspace.");
      }
      if (!statusCallbackBaseUrl) {
        throw new TwilioConfigurationError("Unable to resolve the Twilio status callback URL.");
      }

      const metadata = { callId: call.id, workspaceId: workspace.id };
      console.log("[calls-automated-dial-attempt]", {
        callId: call.id,
        workspaceId: call.workspace_id,
        jobId: call.job_id,
      });

      const dialResult = await dialTwilioCall({
        toPhone: normalizedCustomerPhone,
        fromPhone: outboundFromNumber,
        callbackUrl: statusCallbackBaseUrl,
        metadata,
      });

      await attachTwilioMetadataToCallSession({
        supabase,
        callId: call.id,
        twilioCallSid: dialResult.twilioCallSid,
        initialStatus: dialResult.initialStatus,
      });

      console.log("[calls-automated-dial-success]", {
        callId: call.id,
        workspaceId: call.workspace_id,
        jobId: call.job_id,
        twilioStatus: dialResult.initialStatus,
      });

      const successLabel = trimmedScriptSummary || "Automated call started";
      return {
        status: "success",
        callId: call.id,
        label: successLabel,
        twilioStatus: dialResult.initialStatus,
      };
    } catch (dialError) {
      const errorMessage =
        dialError instanceof Error ? dialError.message : "We couldn’t start the automated call right now.";
      const failureReason = dialError instanceof TwilioConfigurationError ? "twilio_not_configured" : "twilio_call_failed";
      const userMessage =
        dialError instanceof TwilioConfigurationError
          ? "Calls aren’t configured yet; please set up telephony to continue."
          : "We couldn’t start the automated call right now. Please try again.";
      const errorCode =
        dialError && typeof dialError === "object" && "code" in dialError
          ? String((dialError as { code?: unknown }).code ?? "")
          : null;

      await updateCallSessionTwilioStatus({
        supabase,
        callId: call.id,
        twilioStatus: "failed",
        errorCode: errorCode ?? undefined,
        errorMessage,
      });

      logFailure(failureReason, { error: errorMessage, callId: call.id });
      console.log("[calls-automated-dial-failure]", {
        callId: call.id,
        workspaceId: call.workspace_id,
        jobId: call.job_id,
        reason: failureReason,
        error: errorMessage,
      });

      return {
        status: "failure",
        reason: failureReason,
        message: userMessage,
        callId: call.id,
      };
    }
  } catch (error) {
    logFailure("call_creation_failed", { error: error instanceof Error ? error.message : error });
    return {
      status: "failure",
      reason: "call_creation_failed",
      message: "We couldn’t start the automated call right now. Please try again.",
    };
  }
}
