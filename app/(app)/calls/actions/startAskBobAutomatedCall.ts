"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { parseEnvConfig } from "@/schemas/env";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
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
  diagnostics?: SerializedDiagnostics;
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

type SerializedDiagnostics = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  stack?: string;
  supabase?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSupabaseDiagnostics(value: unknown): SerializedDiagnostics["supabase"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const code =
    typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : undefined;
  const message = typeof value.message === "string" ? value.message : undefined;
  const details = typeof value.details === "string" ? value.details : undefined;
  const hint = typeof value.hint === "string" ? value.hint : undefined;
  if (!code && !message && !details && !hint) {
    return null;
  }
  return { code, message, details, hint };
}

function serializeDiagnostics(error: unknown): SerializedDiagnostics {
  const diagnostics: SerializedDiagnostics = {};
  if (error instanceof Error) {
    diagnostics.name = error.name;
    diagnostics.message = error.message;
    if (process.env.NODE_ENV !== "production") {
      diagnostics.stack = error.stack;
    }
  } else if (typeof error === "string") {
    diagnostics.message = error;
  } else if (isRecord(error)) {
    if (typeof error.name === "string") {
      diagnostics.name = error.name;
    }
    if (typeof error.message === "string") {
      diagnostics.message = error.message;
    }
    if (typeof error.code === "string" || typeof error.code === "number") {
      diagnostics.code = String(error.code);
    }
  }

  const supabaseDiagnostics =
    extractSupabaseDiagnostics(error) ||
    (isRecord(error) && "supabaseError" in error ? extractSupabaseDiagnostics(error.supabaseError) : null);
  if (supabaseDiagnostics) {
    diagnostics.supabase = supabaseDiagnostics;
    if (!diagnostics.message && supabaseDiagnostics.message) {
      diagnostics.message = supabaseDiagnostics.message;
    }
    if (!diagnostics.code && supabaseDiagnostics.code) {
      diagnostics.code = supabaseDiagnostics.code;
    }
  }

  if (!diagnostics.message) {
    diagnostics.message = "Unknown error.";
  }

  return diagnostics;
}

export async function startAskBobAutomatedCall(
  payload: StartAskBobAutomatedCallPayload,
): Promise<StartAskBobAutomatedCallResult> {
  const logFailure = (
    reason: string,
    diagnostics?: SerializedDiagnostics,
    extra: Record<string, unknown> = {},
  ) => {
    console.log("[askbob-automated-call-ui-failure]", {
      reason,
      workspaceId: payload.workspaceId,
      jobId: payload.jobId,
      diagnostics: diagnostics ?? null,
      ...extra,
    });
  };

  const parsed = StartAskBobAutomatedCallSchema.safeParse(payload);
  if (!parsed.success) {
    return buildFailureResponse({
      reason: "invalid_payload",
      message: "We couldn’t start this call with the provided information.",
      diagnostics: {
        message: "Invalid payload.",
        details: JSON.stringify(parsed.error.flatten()),
      },
      logExtra: { errors: parsed.error.flatten() },
    });
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
    diagnostics: SerializedDiagnostics,
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

  const buildFailureResponse = ({
    reason,
    message,
    diagnostics,
    callId,
    twilioStatus,
    twilioCallSid,
    logExtra,
  }: {
    reason: StartAskBobAutomatedCallFailure["code"];
    message: string;
    diagnostics: SerializedDiagnostics;
    callId?: string | null;
    twilioStatus?: string | null;
    twilioCallSid?: string | null;
    logExtra?: Record<string, unknown>;
  }): StartAskBobAutomatedCallFailure => {
    logFailure(reason, diagnostics, { callId: callId ?? null, ...logExtra });
    emitActionFailureTelemetry(reason, diagnostics, callId ?? null);
    return {
      status: "failure",
      code: reason,
      message,
      callId: callId ?? undefined,
      twilioStatus,
      twilioCallSid,
      diagnostics,
    };
  };

  emitActionRequestTelemetry();

  if (!normalizedCustomerPhone) {
    return buildFailureResponse({
      reason: "missing_customer_phone",
      message: "Add a customer phone number before placing an automated call.",
      diagnostics: {
        message: "Customer phone is required to place an automated call.",
      },
    });
  }

  if (!normalizedScriptBody) {
    return buildFailureResponse({
      reason: "missing_script",
      message: "Generate a script before placing an automated call.",
      diagnostics: {
        message: "A call script body is required.",
      },
    });
  }

  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });
  if (!workspaceResult.ok) {
    const failureReason =
      workspaceResult.code === "unauthenticated"
        ? "unauthenticated"
        : workspaceResult.code === "workspace_not_found"
        ? "workspace_not_found"
        : workspaceResult.code === "no_membership"
        ? "forbidden"
        : "unknown";
    return buildFailureResponse({
      reason: failureReason,
      message:
        failureReason === "unauthenticated"
          ? "Please sign in to place automated calls."
          : failureReason === "forbidden"
          ? "Workspace access is required to place automated calls."
          : "We couldn’t resolve workspace access for this call.",
      diagnostics: {
        message: workspaceResult.diagnostics?.message ?? "Workspace context is required.",
      },
    });
  }

  const { workspace, user } = workspaceResult.membership;

  if (workspace.id !== params.workspaceId) {
    return buildFailureResponse({
      reason: "forbidden",
      message: "This job does not belong to your workspace.",
      diagnostics: {
        message: "Job belongs to a different workspace.",
      },
    });
  }

  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id")
    .eq("id", params.jobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (jobError) {
    return buildFailureResponse({
      reason: "job_lookup_failed",
      message: "We couldn’t find that job in this workspace.",
      diagnostics: serializeDiagnostics(jobError),
    });
  }

  if (!jobRow) {
    return buildFailureResponse({
      reason: "job_not_found",
      message: "We couldn’t find that job in this workspace.",
      diagnostics: {
        message: "Job not found in workspace.",
      },
    });
  }

  const resolvedCustomerId = jobRow.customer_id ?? params.customerId ?? null;
  if (!resolvedCustomerId) {
    return buildFailureResponse({
      reason: "missing_customer",
      message: "Link a customer to this job before placing an automated call.",
      diagnostics: {
        message: "A customer is required to place an automated call.",
      },
    });
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

  let call: CallSessionRow | null = null;
  let callId: string | null = null;

  const existingCallResponse = await supabase
    .from("calls")
    .select("id, twilio_call_sid, twilio_status")
    .eq("workspace_id", workspace.id)
    .eq("job_id", params.jobId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingCallResponse.error) {
    return buildFailureResponse({
      reason: "call_creation_failed",
      message: "We couldn’t start the automated call right now. Please try again.",
      diagnostics: serializeDiagnostics(existingCallResponse.error),
    });
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
    diagnostics: SerializedDiagnostics,
    twilioErrorCode?: string | null,
    twilioErrorMessage?: string | null,
  ): Promise<StartAskBobAutomatedCallFailure> => {
    try {
      await setTwilioDialResultForCallSession({
        supabase,
        workspaceId: workspace.id,
        callId: callEntry.id,
        twilioStatus: "failed",
        errorCode: twilioErrorCode ?? null,
        errorMessage: twilioErrorMessage ?? diagnostics.message,
      });
    } catch (error) {
      return buildFailureResponse({
        reason: "call_metadata_update_failed",
        message: "We couldn’t save the call status after the dial attempt.",
        diagnostics: serializeDiagnostics(error),
        callId: callEntry.id,
        twilioStatus: "failed",
        logExtra: {
          originalReason: failureReason,
          originalDiagnostics: diagnostics,
        },
      });
    }

    console.log("[calls-automated-dial-failure]", {
      callId: callEntry.id,
      workspaceId: callEntry.workspace_id,
      jobId: callEntry.job_id,
      reason: failureReason,
      diagnostics,
      twilioErrorCode,
    });
    return buildFailureResponse({
      reason: failureReason,
      message: userMessage,
      diagnostics,
      callId: callEntry.id,
      twilioStatus: "failed",
      logExtra: { twilioErrorCode },
    });
  };

  const callResult = await createCallSessionForJobQuote({
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

  if (!callResult.success) {
    return buildFailureResponse({
      reason: "call_creation_failed",
      message: "We couldn’t start the automated call right now. Please try again.",
      diagnostics: serializeDiagnostics(callResult.error),
    });
  }

  call = callResult.call;
  callId = call.id;

  console.log("[calls-automated-call-session-created]", {
    callId,
    workspaceId: call.workspace_id,
    jobId: call.job_id,
  });

  let initGateResult: Awaited<ReturnType<typeof markCallSessionDialRequested>>;
  try {
    initGateResult = await markCallSessionDialRequested({
      supabase,
      workspaceId: workspace.id,
      callId,
    });
  } catch (error) {
    return buildFailureResponse({
      reason: "call_dial_request_failed",
      message: "We couldn’t queue the automated call right now. Please try again.",
      diagnostics: serializeDiagnostics(error),
      callId,
    });
  }

  if (initGateResult.outcome === "already_in_progress") {
    logGuardOutcome("rejected_due_to_in_progress_call", {
      callId,
      twilioStatus: call.twilio_status ?? null,
    });
    return {
      status: "already_in_progress",
      code: "already_in_progress",
      message: "Call is already in progress. Open call session.",
      callId,
      twilioStatus: call.twilio_status ?? null,
      twilioCallSid: call.twilio_call_sid ?? null,
    };
  }

  if (initGateResult.outcome !== "allowed_to_dial") {
    return buildFailureResponse({
      reason: "call_dial_request_failed",
      message: "We couldn’t queue the automated call right now. Please try again.",
      diagnostics: {
        message: "Call session guard did not allow dial.",
        details: JSON.stringify({ outcome: initGateResult.outcome }),
      },
      callId,
      logExtra: { guardOutcome: initGateResult.outcome },
    });
  }

  if (!outboundFromNumber) {
    return recordDialFailure(
      call,
      "twilio_not_configured",
      "Calls aren’t configured yet; please set up telephony to continue.",
      { message: "No outbound phone number is configured for this workspace." },
    );
  }

  if (!statusCallbackBaseUrl) {
    return recordDialFailure(
      call,
      "twilio_not_configured",
      "Calls aren’t configured yet; please set up telephony to continue.",
      { message: "Unable to resolve the Twilio status callback URL." },
    );
  }

  if (!recordingCallbackBaseUrl) {
    return recordDialFailure(
      call,
      "twilio_not_configured",
      "Calls aren’t configured yet; please set up telephony to continue.",
      { message: "Unable to resolve the Twilio recording callback URL." },
    );
  }

  if (!outboundVoiceUrl) {
    return recordDialFailure(
      call,
      "twilio_not_configured",
      "Calls aren’t configured yet; please set up telephony to continue.",
      { message: "Unable to resolve the Twilio outbound voice URL." },
    );
  }

  const outboundVoiceUrlWithParams = `${outboundVoiceUrl}?callId=${encodeURIComponent(
    callId,
  )}&workspaceId=${encodeURIComponent(workspace.id)}`;

  try {
    await updateCallSessionAutomatedSpeechPlan({
      supabase,
      workspaceId: workspace.id,
      callId,
      plan: {
        voice: voiceSelection,
        greetingStyle: greetingStyleSelection,
        allowVoicemail: allowVoicemailSelection,
        scriptSummary: titleSource,
      },
    });
  } catch (error) {
    return buildFailureResponse({
      reason: "call_speech_plan_failed",
      message: "We couldn’t save the call script settings. Please try again.",
      diagnostics: serializeDiagnostics(error),
      callId,
    });
  }

  console.log("[askbob-automated-call-speechplan-saved]", {
    workspaceId: workspace.id,
    callId,
    voice: voiceSelection,
    greetingStyle: greetingStyleSelection,
    allowVoicemail: allowVoicemailSelection,
  });

  const metadata = { callId, workspaceId: workspace.id };
  console.log("[calls-automated-dial-attempt]", {
    callId,
    workspaceId: call.workspace_id,
    jobId: call.job_id,
  });

  let dialResult: Awaited<ReturnType<typeof dialTwilioCall>>;
  try {
    dialResult = await dialTwilioCall({
      toPhone: normalizedCustomerPhone,
      fromPhone: outboundFromNumber,
      callbackUrl: statusCallbackBaseUrl,
      metadata,
      machineDetection: machineDetectionConfig,
      recordCall: true,
      recordingCallbackUrl: recordingCallbackBaseUrl,
      twimlUrl: outboundVoiceUrlWithParams,
    });
  } catch (error) {
    return buildFailureResponse({
      reason: "twilio_call_failed",
      message: "We couldn’t start the automated call right now. Please try again.",
      diagnostics: serializeDiagnostics(error),
      callId,
    });
  }

  if (!dialResult.success) {
    const failureReason =
      dialResult.code === "twilio_not_configured" ? "twilio_not_configured" : "twilio_call_failed";
    const userMessage =
      failureReason === "twilio_not_configured"
        ? "Calls aren’t configured yet; please set up telephony to continue."
        : "We couldn’t start the automated call right now. Please try again.";
    const failureDiagnostics: SerializedDiagnostics = {
      message: dialResult.message,
      code: dialResult.code,
      details: JSON.stringify({
        twilioErrorCode: dialResult.twilioErrorCode ?? null,
        twilioErrorMessage: dialResult.twilioErrorMessage ?? null,
      }),
    };
    return recordDialFailure(
      call,
      failureReason,
      userMessage,
      failureDiagnostics,
      dialResult.twilioErrorCode ?? null,
      dialResult.twilioErrorMessage ?? null,
    );
  }

  try {
    await setTwilioDialResultForCallSession({
      supabase,
      workspaceId: workspace.id,
      callId,
      twilioStatus: "initiated",
      twilioCallSid: dialResult.twilioCallSid,
    });
  } catch (error) {
    return buildFailureResponse({
      reason: "call_metadata_update_failed",
      message: "We couldn’t save the call status after starting the call.",
      diagnostics: serializeDiagnostics(error),
      callId,
    });
  }

  console.log("[calls-automated-dial-success]", {
    callId,
    workspaceId: call.workspace_id,
    jobId: call.job_id,
    twilioStatus: "initiated",
  });

  emitActionSuccessTelemetry(callId, dialResult.twilioCallSid);

  return {
    status: "success",
    code: "call_started",
    message: successLabel,
    callId,
    label: successLabel,
    twilioStatus: dialResult.initialStatus,
    twilioCallSid: dialResult.twilioCallSid,
  };
}
