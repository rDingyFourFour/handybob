"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { parseEnvConfig } from "@/schemas/env";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  TWILIO_CALL_RECORDING_CALLBACK_PATH,
  TWILIO_CALL_STATUS_CALLBACK_PATH,
  TWILIO_OUTBOUND_VOICE_TWIML_PATH,
} from "@/lib/domain/twilio";
import {
  CallSessionRow,
  TWILIO_DIAL_FAILURE_STATUSES,
  TWILIO_DIAL_IN_PROGRESS_STATUSES,
  createCallSessionForJobQuote,
  markCallSessionDialRequested,
  setTwilioDialResultForCallSession,
  updateCallSessionAutomatedSpeechPlan,
} from "@/lib/domain/calls/sessions";
import { dialTwilioCall } from "@/lib/domain/twilio.server";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { truncateAskBobScriptSummary } from "@/lib/domain/askbob/summary";
import {
  ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT,
  ASKBOB_AUTOMATED_VOICE_DEFAULT,
} from "@/lib/domain/askbob/speechPlan";

const StartAskBobAutomatedCallSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  customerPhone: z.string().min(1),
  callIntents: z.array(z.string()).optional().nullable(),
  scriptSummary: z.string().optional().nullable(),
  scriptBody: z.string().min(1),
  voice: z.string().min(1).optional(),
  greetingStyle: z.string().min(1).optional(),
  allowVoicemail: z.boolean().optional(),
});

type StartAskBobAutomatedCallPayload = z.infer<typeof StartAskBobAutomatedCallSchema>;

export type StartAskBobAutomatedCallSuccess = {
  status: "success";
  code: "call_started" | "call_already_started";
  message: string;
  label: string;
  callId: string;
  twilioStatus?: string | null;
  twilioCallSid?: string | null;
};

export type StartAskBobAutomatedCallAlreadyInProgress = {
  status: "already_in_progress";
  code: "already_in_progress";
  message: string;
  callId: string;
  twilioStatus?: string | null;
  twilioCallSid?: string | null;
};

export type StartAskBobAutomatedCallFailure = {
  status: "failure";
  code: string;
  message: string;
  callId?: string;
  twilioStatus?: string | null;
  twilioCallSid?: string | null;
};

export type StartAskBobAutomatedCallResult =
  | StartAskBobAutomatedCallSuccess
  | StartAskBobAutomatedCallAlreadyInProgress
  | StartAskBobAutomatedCallFailure;

const FROM_PLACEHOLDER = "workspace-default";
function normalizeCandidate(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export async function startAskBobAutomatedCall(
  payload: StartAskBobAutomatedCallPayload,
): Promise<StartAskBobAutomatedCallResult> {
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
      code: "invalid_payload",
      message: "We couldn’t start this call with the provided information.",
    };
  }

  const params = parsed.data;
  const normalizedCustomerPhone = normalizeCandidate(params.customerPhone);
  const normalizedScriptBody = normalizeCandidate(params.scriptBody ?? null);
  const normalizedScriptSummary = normalizeCandidate(params.scriptSummary ?? null);
  const successLabel = normalizedScriptSummary || "Automated call started";

  const emitActionRequestTelemetry = () => {
    console.log("[askbob-automated-call-action-request]", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      customerId: params.customerId ?? null,
      hasScriptBody: Boolean(normalizedScriptBody),
      hasCustomerPhone: Boolean(normalizedCustomerPhone),
    });
  };

  const emitActionFailureTelemetry = (
    reason: string,
    diagnostics: string,
    callId?: string | null,
  ) => {
    console.log("[askbob-automated-call-action-failure]", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      callId: callId ?? null,
      reason,
      diagnostics,
    });
  };

  const emitActionSuccessTelemetry = (callId: string, twilioCallSid: string) => {
    console.log("[askbob-automated-call-action-success]", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      callId,
      twilioCallSid,
    });
  };

  emitActionRequestTelemetry();

  if (!normalizedCustomerPhone) {
    logFailure("missing_customer_phone");
    emitActionFailureTelemetry(
      "missing_customer_phone",
      "Customer phone is required to place an automated call.",
    );
    return {
      status: "failure",
      code: "missing_customer_phone",
      message: "Add a customer phone number before placing an automated call.",
    };
  }

  if (!normalizedScriptBody) {
    logFailure("missing_script");
    emitActionFailureTelemetry("missing_script", "A call script body is required.");
    return {
      status: "failure",
      code: "missing_script",
      message: "Generate a script before placing an automated call.",
    };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logFailure("unauthenticated");
    emitActionFailureTelemetry("unauthenticated", "User must be signed in to place calls.");
    return {
      status: "failure",
      code: "unauthenticated",
      message: "Please sign in to place automated calls.",
    };
  }

  const { workspace } = await getCurrentWorkspace({ supabase });
  if (!workspace) {
    logFailure("workspace_required");
    emitActionFailureTelemetry("workspace_required", "Workspace context is required.");
    return {
      status: "failure",
      code: "workspace_required",
      message: "Workspace access is required to place automated calls.",
    };
  }

  if (workspace.id !== params.workspaceId) {
    logFailure("wrong_workspace");
    emitActionFailureTelemetry("wrong_workspace", "Job belongs to a different workspace.");
    return {
      status: "failure",
      code: "wrong_workspace",
      message: "This job does not belong to your workspace.",
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
    emitActionFailureTelemetry("job_not_found", "Job not found in workspace.");
    return {
      status: "failure",
      code: "job_not_found",
      message: "We couldn’t find that job in this workspace.",
    };
  }

  const resolvedCustomerId = jobRow.customer_id ?? params.customerId ?? null;
  if (!resolvedCustomerId) {
    logFailure("missing_customer");
    emitActionFailureTelemetry("missing_customer", "A customer is required to place an automated call.");
    return {
      status: "failure",
      code: "missing_customer",
      message: "Link a customer to this job before placing an automated call.",
    };
  }

  const logGuardOutcome = (
    outcome: "reused_existing_session" | "created_new_session_after_failure" | "rejected_due_to_completed_call" | "rejected_due_to_in_progress_call",
    extra: Record<string, unknown> = {},
  ) => {
    console.log(`[askbob-automated-call-action-${outcome}]`, {
      workspaceId: workspace.id,
      jobId: params.jobId,
      ...extra,
    });
  };

  const existingCallResponse = await supabase
    .from("calls")
    .select("id, twilio_call_sid, twilio_status")
    .eq("workspace_id", workspace.id)
    .eq("job_id", params.jobId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingCallResponse.error) {
    throw existingCallResponse.error;
  }

  const existingCallData = existingCallResponse.data;
  const existingCall = Array.isArray(existingCallData)
    ? (existingCallData[0] as CallSessionRow) ?? null
    : (existingCallData as CallSessionRow | null);

  if (existingCall) {
    const normalizedExistingStatus = existingCall.twilio_status?.toLowerCase() ?? null;
    const isTerminalFailure =
      normalizedExistingStatus !== null && TWILIO_DIAL_FAILURE_STATUSES.has(normalizedExistingStatus);
    const isCompleted = normalizedExistingStatus === "completed";
    const isDialingInProgress =
      normalizedExistingStatus !== null && TWILIO_DIAL_IN_PROGRESS_STATUSES.has(normalizedExistingStatus);

    if (isDialingInProgress) {
      logGuardOutcome("reused_existing_session", {
        callId: existingCall.id,
        twilioStatus: normalizedExistingStatus,
      });
      return {
        status: "already_in_progress",
        code: "already_in_progress",
        message: "Call is already in progress. Open call session.",
        callId: existingCall.id,
        twilioStatus: existingCall.twilio_status ?? null,
        twilioCallSid: existingCall.twilio_call_sid ?? null,
      };
    }

    if (isCompleted) {
      logGuardOutcome("rejected_due_to_completed_call", {
        callId: existingCall.id,
        twilioStatus: "completed",
      });
      return {
        status: "failure",
        code: "rejected_due_to_completed_call",
        message:
          "The automated call for this job already completed. Reach out if you need to place another one.",
        callId: existingCall.id,
        twilioStatus: existingCall.twilio_status ?? null,
        twilioCallSid: existingCall.twilio_call_sid ?? null,
      };
    }

    if (isTerminalFailure) {
      logGuardOutcome("created_new_session_after_failure", {
        previousCallId: existingCall.id,
        previousTwilioStatus: normalizedExistingStatus,
      });
    }
  }

  const envConfig = parseEnvConfig();
  const {
    data: workspacePhoneRow,
  } = await supabase
    .from("workspaces")
    .select("business_phone")
    .eq("id", workspace.id)
    .maybeSingle();
  const normalizedWorkspacePhone = normalizeCandidate(workspacePhoneRow?.business_phone);
  const normalizedDefaultFrom = normalizeCandidate(process.env.TWILIO_FROM_NUMBER ?? null);
  const outboundFromNumber = normalizedWorkspacePhone ?? normalizedDefaultFrom;
  const fromNumber = outboundFromNumber ?? FROM_PLACEHOLDER;
  const statusCallbackBaseUrl = envConfig.appUrl
    ? `${envConfig.appUrl.replace(/\/$/, "")}${TWILIO_CALL_STATUS_CALLBACK_PATH}`
    : null;
  const recordingCallbackBaseUrl = envConfig.appUrl
    ? `${envConfig.appUrl.replace(/\/$/, "")}${TWILIO_CALL_RECORDING_CALLBACK_PATH}`
    : null;
  const outboundVoiceUrl = envConfig.appUrl
    ? `${envConfig.appUrl.replace(/\/$/, "")}${TWILIO_OUTBOUND_VOICE_TWIML_PATH}`
    : null;
  const machineDetectionConfig = envConfig.twilioMachineDetectionEnabled
    ? { enabled: true }
    : undefined;

  const voiceSelection = normalizeCandidate(params.voice ?? null) ?? ASKBOB_AUTOMATED_VOICE_DEFAULT;
  const greetingStyleSelection =
    normalizeCandidate(params.greetingStyle ?? null) ?? ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT;
  const allowVoicemailSelection = Boolean(params.allowVoicemail);
  const titleSource = normalizedScriptSummary || normalizedScriptBody || "Automated call";
  const summaryOverride = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} ${truncateAskBobScriptSummary(titleSource)}`;
  const scriptBodyPayload = normalizedScriptBody ? normalizedScriptBody.slice(0, 4000) : null;

  const recordDialFailure = async (
    callEntry: CallSessionRow,
    failureReason: StartAskBobAutomatedCallFailure["code"],
    userMessage: string,
    diagnostics: string,
    twilioErrorCode?: string | null,
    twilioErrorMessage?: string | null,
  ): Promise<StartAskBobAutomatedCallFailure> => {
    await setTwilioDialResultForCallSession({
      supabase,
      workspaceId: workspace.id,
      callId: callEntry.id,
      twilioStatus: "failed",
      errorCode: twilioErrorCode ?? null,
      errorMessage: twilioErrorMessage ?? diagnostics,
    });
    emitActionFailureTelemetry(failureReason, diagnostics, callEntry.id);
    console.log("[calls-automated-dial-failure]", {
      callId: callEntry.id,
      workspaceId: callEntry.workspace_id,
      jobId: callEntry.job_id,
      reason: failureReason,
      diagnostics,
      twilioErrorCode,
    });
    return {
      status: "failure",
      code: failureReason,
      message: userMessage,
      callId: callEntry.id,
      twilioStatus: "failed",
    };
  };

  try {
    let call: CallSessionRow | null = null;
    if (!call) {
      call = await createCallSessionForJobQuote({
        supabase,
        workspaceId: workspace.id,
        userId: user.id,
        jobId: params.jobId,
        customerId: resolvedCustomerId,
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

      const initGateResult = await markCallSessionDialRequested({
        supabase,
        workspaceId: workspace.id,
        callId: call.id,
      });

      if (initGateResult.outcome === "already_in_progress") {
        logGuardOutcome("rejected_due_to_in_progress_call", {
          callId: call.id,
          twilioStatus: call.twilio_status ?? null,
        });
        return {
          status: "already_in_progress",
          code: "already_in_progress",
          message: "Call is already in progress. Open call session.",
          callId: call.id,
          twilioStatus: call.twilio_status ?? null,
          twilioCallSid: call.twilio_call_sid ?? null,
        };
      }

      if (initGateResult.outcome !== "allowed_to_dial") {
        logFailure("call_session_guard_error", {
          callId: call.id,
          workspaceId: workspace.id,
          guardOutcome: initGateResult.outcome,
        });
        throw new Error("call_session_guard_error");
      }
    }

    if (!call) {
      throw new Error("call_session_missing");
    }

    if (!outboundFromNumber) {
      return recordDialFailure(
        call,
        "twilio_not_configured",
        "Calls aren’t configured yet; please set up telephony to continue.",
        "No outbound phone number is configured for this workspace.",
      );
    }

    if (!statusCallbackBaseUrl) {
      return recordDialFailure(
        call,
        "twilio_not_configured",
        "Calls aren’t configured yet; please set up telephony to continue.",
        "Unable to resolve the Twilio status callback URL.",
      );
    }

    if (!recordingCallbackBaseUrl) {
      return recordDialFailure(
        call,
        "twilio_not_configured",
        "Calls aren’t configured yet; please set up telephony to continue.",
        "Unable to resolve the Twilio recording callback URL.",
      );
    }

    if (!outboundVoiceUrl) {
      return recordDialFailure(
        call,
        "twilio_not_configured",
        "Calls aren’t configured yet; please set up telephony to continue.",
        "Unable to resolve the Twilio outbound voice URL.",
      );
    }

    const outboundVoiceUrlWithParams = `${outboundVoiceUrl}?callId=${encodeURIComponent(
      call.id,
    )}&workspaceId=${encodeURIComponent(workspace.id)}`;

    await updateCallSessionAutomatedSpeechPlan({
      supabase,
      workspaceId: workspace.id,
      callId: call.id,
      plan: {
        voice: voiceSelection,
        greetingStyle: greetingStyleSelection,
        allowVoicemail: allowVoicemailSelection,
        scriptSummary: titleSource,
      },
    });
    console.log("[askbob-automated-call-speechplan-saved]", {
      workspaceId: workspace.id,
      callId: call.id,
      voice: voiceSelection,
      greetingStyle: greetingStyleSelection,
      allowVoicemail: allowVoicemailSelection,
    });

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
      machineDetection: machineDetectionConfig,
      recordCall: true,
      recordingCallbackUrl: recordingCallbackBaseUrl,
      twimlUrl: outboundVoiceUrlWithParams,
    });

    if (!dialResult.success) {
      const failureReason =
        dialResult.code === "twilio_not_configured" ? "twilio_not_configured" : "twilio_call_failed";
      const userMessage =
        failureReason === "twilio_not_configured"
          ? "Calls aren’t configured yet; please set up telephony to continue."
          : "We couldn’t start the automated call right now. Please try again.";
      return recordDialFailure(
        call,
        failureReason,
        userMessage,
        dialResult.message,
        dialResult.twilioErrorCode ?? null,
        dialResult.twilioErrorMessage ?? null,
      );
    }

    await setTwilioDialResultForCallSession({
      supabase,
      workspaceId: workspace.id,
      callId: call.id,
      twilioStatus: "initiated",
      twilioCallSid: dialResult.twilioCallSid,
    });

    console.log("[calls-automated-dial-success]", {
      callId: call.id,
      workspaceId: call.workspace_id,
      jobId: call.job_id,
      twilioStatus: "initiated",
    });

    emitActionSuccessTelemetry(call.id, dialResult.twilioCallSid);

    return {
      status: "success",
      code: "call_started",
      message: successLabel,
      callId: call.id,
      label: successLabel,
      twilioStatus: dialResult.initialStatus,
      twilioCallSid: dialResult.twilioCallSid,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logFailure("call_creation_failed", { error: errorMessage });
    emitActionFailureTelemetry("call_creation_failed", errorMessage);
    return {
      status: "failure",
      code: "call_creation_failed",
      message: "We couldn’t start the automated call right now. Please try again.",
    };
  }
}
