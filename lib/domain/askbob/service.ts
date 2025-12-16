import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import { z } from "zod";
import {
  AskBobAfterCallSnapshotPayload,
  AskBobCallLiveGuidanceSnapshotPayload,
  AskBobContext,
  AskBobDiagnoseSnapshotPayload,
  AskBobJobAfterCallInput,
  CallLiveGuidanceInput,
  CallLiveGuidanceResult,
  CallLiveGuidanceMode,
  AskBobJobCallScriptInput,
  AskBobJobCallScriptResult,
  AskBobJobFollowupInput,
  AskBobJobFollowupResult,
  AskBobJobScheduleInput,
  AskBobJobScheduleResult,
  AskBobMaterialsExplainInput,
  AskBobMaterialsExplainResult,
  AskBobMaterialsGenerateInput,
  AskBobMaterialsGenerateResult,
  AskBobQuoteExplainInput,
  AskBobQuoteExplainResult,
  AskBobQuoteGenerateInput,
  AskBobQuoteGenerateResult,
  AskBobResponseData,
  AskBobResponseDTO,
  AskBobResponseDTOSection,
  AskBobJobTaskSnapshotTask,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobJobDiagnoseResult,
  askBobMaterialItemSchema,
  askBobResponseDataSchema,
} from "./types";
import {
  createAskBobSession,
  createAskBobResponse,
  getLastAskBobActivityForJob,
  getJobTaskSnapshotsForJob,
  upsertJobTaskSnapshot,
} from "./repository";
import {
  callAskBobMessageDraft,
  callAskBobModel,
  callAskBobQuoteExplain,
  callAskBobMaterialsExplain,
  callAskBobQuoteGenerate,
  callAskBobMaterialsGenerate,
  callAskBobJobFollowup,
  callAskBobJobSchedule,
  callAskBobJobCallScript,
  callAskBobJobAfterCall,
  callAskBobLiveGuidance,
} from "@/utils/openai/askbob";

type DbClient = SupabaseClient<Database>;

const MIN_PROMPT_LENGTH = 10;

export async function createAskBobSessionWithContext(
  supabase: DbClient,
  params: {
    context: AskBobContext;
    prompt: string;
  }
) {
  const session = await createAskBobSession(supabase, {
    workspaceId: params.context.workspaceId,
    userId: params.context.userId,
    prompt: params.prompt,
    jobId: params.context.jobId ?? null,
    customerId: params.context.customerId ?? null,
    quoteId: params.context.quoteId ?? null,
  });

  return session;
}

export async function saveAskBobResponse(
  supabase: DbClient,
  params: {
    sessionId: string;
    data: AskBobResponseData;
  }
) {
  const parsedData = askBobResponseDataSchema.parse(params.data);

  const response = await createAskBobResponse(supabase, {
    sessionId: params.sessionId,
    data: parsedData,
  });

  return response;
}

// Primary entry point for AskBob tasks. It routes between supported tasks and will grow over time.
export async function runAskBobTask(
  supabase: DbClient,
  input: AskBobTaskInput
): Promise<AskBobTaskResult> {
  if (input.task === "message.draft") {
    return runAskBobMessageDraftTask(input);
  }

  if (input.task === "quote.generate") {
    return runAskBobQuoteGenerateTask(input);
  }

  if (input.task === "materials.generate") {
    return runAskBobMaterialsGenerateTask(input);
  }

  if (input.task === "quote.explain") {
    return runAskBobQuoteExplainTask(input);
  }

  if (input.task === "job.followup") {
    return runAskBobJobFollowupTask(supabase, input);
  }

  if (input.task === "job.schedule") {
    return runAskBobJobScheduleTask(input);
  }

  if (input.task === "job.call_script") {
    return runAskBobJobCallScriptTask(supabase, input);
  }

  if (input.task === "job.after_call") {
    return runAskBobJobAfterCallTask(supabase, input);
  }

  if (input.task === "call.live_guidance") {
    return runAskBobLiveGuidanceTask(supabase, input);
  }

  if (input.task === "materials.explain") {
    return runAskBobMaterialsExplainTask(input);
  }

  const prompt = input.prompt?.trim();
  const extraDetails = input.extraDetails?.trim() ?? null;
  const jobTitle = input.jobTitle?.trim() ?? null;
  const context = input.context;

  if (!prompt || prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error("Please provide a bit more detail about the problem.");
  }

  try {
    const session = await createAskBobSessionWithContext(supabase, {
      context,
      prompt,
    });

    const modelResult = await callAskBobModel({
      prompt,
      context,
      extraDetails,
      jobTitle,
    });

    const response = await saveAskBobResponse(supabase, {
      sessionId: session.id,
      data: modelResult.data,
    });

    const dto = toAskBobResponseDTO({
      sessionId: session.id,
      responseId: response.id,
      createdAt: response.createdAt,
      data: modelResult.data,
    });
    const finalResult: AskBobJobDiagnoseResult = {
      ...dto,
      modelLatencyMs: modelResult.latencyMs,
    };

    if (context.jobId) {
      try {
        await recordAskBobJobTaskSnapshot(supabase, {
          workspaceId: context.workspaceId,
          jobId: context.jobId,
          task: "job.diagnose",
          result: finalResult,
        });
      } catch (snapshotError) {
        console.error("[askbob-snapshot-upsert] job diagnose failed", {
          workspaceId: context.workspaceId,
          jobId: context.jobId,
          error: snapshotError,
        });
      }
    }

    return finalResult;
  } catch (error) {
    throw error;
  }
}

async function runAskBobMessageDraftTask(
  input: AskBobMessageDraftInput
): Promise<AskBobMessageDraftResult> {
  const purpose = input.purpose?.trim();
  if (!purpose) {
    throw new Error("Please provide a purpose for the message draft.");
  }

  const aggregatedPrompt = [
    purpose,
    input.extraDetails?.trim() ?? null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const modelResult = await callAskBobMessageDraft({
    prompt: aggregatedPrompt,
    context: input.context,
    purpose,
    tone: input.tone ?? null,
    extraDetails: input.extraDetails ?? null,
  });

  return {
    body: modelResult.body,
    suggestedChannel: modelResult.suggestedChannel,
    summary: modelResult.summary,
    modelLatencyMs: modelResult.latencyMs,
  };
}

async function runAskBobQuoteGenerateTask(
  input: AskBobQuoteGenerateInput
): Promise<AskBobQuoteGenerateResult> {
  const prompt = input.prompt?.trim();
  if (!prompt || prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error("Please provide a bit more detail about the problem.");
  }

  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const hasExtraDetails = Boolean(input.extraDetails?.trim());
  const jobTitle = input.jobTitle?.trim() ?? null;
  const hasJobTitle = Boolean(jobTitle);

  console.log("[askbob-quote-generate-request]", {
    workspaceId,
    userId,
    hasJobId: Boolean(context.jobId),
    hasCustomerId: Boolean(context.customerId),
    hasQuoteId: Boolean(context.quoteId),
    promptLength: prompt.length,
    hasExtraDetails,
    hasJobTitle,
  });

  try {
    const normalizedInput: AskBobQuoteGenerateInput = {
      ...input,
      prompt,
      extraDetails: input.extraDetails?.trim() ?? null,
      jobTitle,
    };

    const modelResult = await callAskBobQuoteGenerate(normalizedInput);

    console.log("[askbob-quote-generate-success]", {
      workspaceId,
      userId,
      modelLatencyMs: modelResult.result.modelLatencyMs,
      linesCount: modelResult.result.lines.length,
      materialsCount: modelResult.result.materials?.length ?? 0,
    });

    if (context.jobId) {
      try {
        await recordAskBobJobTaskSnapshot(supabase, {
          workspaceId: context.workspaceId,
          jobId: context.jobId,
          task: "quote.generate",
          result: modelResult.result,
        });
      } catch (snapshotError) {
        console.error("[askbob-snapshot-upsert] quote generate failed", {
          workspaceId: context.workspaceId,
          jobId: context.jobId,
          error: snapshotError,
        });
      }
    }

    return modelResult.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-quote-generate-failure]", {
      workspaceId: context.workspaceId,
      userId: context.userId,
      errorMessage: truncatedError,
    });

    throw error;
  }
}

export async function runAskBobQuoteExplainTask(
  input: AskBobQuoteExplainInput
): Promise<AskBobQuoteExplainResult> {
  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const lineCount = input.quoteSummary.lines.length;
  const hasMaterials = Boolean(input.quoteSummary.materials?.length);
  console.log("[askbob-quote-explain-request]", {
    workspaceId,
    userId,
    jobId: context.jobId ?? null,
    quoteId: context.quoteId ?? null,
    lineCount,
    hasMaterials,
    hasExtraDetails: Boolean(input.extraDetails?.trim()),
  });

  try {
    const modelResult = await callAskBobQuoteExplain(input);
    console.log("[askbob-quote-explain-success]", {
      workspaceId,
      userId,
      quoteId: context.quoteId ?? null,
      modelLatencyMs: modelResult.result.modelLatencyMs,
      explanationLength: modelResult.result.overallExplanation.length,
    });
    return modelResult.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-quote-explain-failure]", {
      workspaceId,
      userId,
      quoteId: context.quoteId ?? null,
      errorMessage: truncatedError,
    });
    throw error;
  }
}

export async function runAskBobJobFollowupTask(
  supabase: DbClient,
  input: AskBobJobFollowupInput
): Promise<AskBobJobFollowupResult> {
  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const jobId = context.jobId ?? null;
  const jobTitle = input.jobTitle?.trim() ?? null;
  const hasQuoteContextForFollowup = Boolean(input.hasQuoteContextForFollowup);
  const hasAskBobAppointment = Boolean(input.hasAskBobAppointment);
  console.log("[askbob-job-followup-service-request]", {
    workspaceId,
    userId,
    jobId,
    jobStatus: input.jobStatus,
    followupDueStatus: input.followupDueStatus,
    hasOpenQuote: input.hasOpenQuote,
    hasUnpaidInvoice: input.hasUnpaidInvoice,
    hasJobTitle: Boolean(jobTitle),
    hasQuoteContextForFollowup,
    hasAskBobAppointment,
    hasCallRecommendation: false,
  });

  const trimmedFollowupLabel = input.followupDueLabel?.trim();
  const normalizedInput: AskBobJobFollowupInput = {
    ...input,
    jobTitle,
    followupDueLabel:
      trimmedFollowupLabel && trimmedFollowupLabel.length
        ? trimmedFollowupLabel
        : input.followupDueLabel,
    notesSummary:
      input.notesSummary && input.notesSummary.trim().length
        ? input.notesSummary.trim()
        : null,
    hasQuoteContextForFollowup: input.hasQuoteContextForFollowup,
  };

  try {
    const modelResult = await callAskBobJobFollowup(normalizedInput);
    const hasCallRecommendation = Boolean(modelResult.result.callRecommended);
    console.log("[askbob-job-followup-service-success]", {
      workspaceId,
      userId,
      jobId,
      modelLatencyMs: modelResult.result.modelLatencyMs,
      stepsCount: modelResult.result.steps.length,
      shouldSendMessage: modelResult.result.shouldSendMessage,
      shouldScheduleVisit: modelResult.result.shouldScheduleVisit,
      shouldCall: modelResult.result.shouldCall,
      shouldWait: modelResult.result.shouldWait,
      hasQuoteContextForFollowup,
      hasAskBobAppointment,
      hasCallRecommendation,
      callPurpose: modelResult.result.callPurpose ?? null,
      callTone: modelResult.result.callTone ?? null,
    });
    if (jobId) {
      try {
        await recordAskBobJobTaskSnapshot(supabase, {
          workspaceId: context.workspaceId,
          jobId,
          task: "job.followup",
          result: modelResult.result,
        });
      } catch (snapshotError) {
        console.error("[askbob-snapshot-upsert] job followup failed", {
          workspaceId: context.workspaceId,
          jobId,
          error: snapshotError,
        });
      }
    }
    return modelResult.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-job-followup-service-failure]", {
      workspaceId,
      userId,
      jobId,
      errorMessage: truncatedError,
      hasCallRecommendation: false,
    });
    throw error;
  }
}

export async function runAskBobJobAfterCallTask(
  supabase: DbClient,
  input: AskBobJobAfterCallInput
): Promise<AskBobJobAfterCallResult> {
  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const jobId = context.jobId;
  console.log("[askbob-after-call-request]", {
    workspaceId,
    userId,
    jobId,
    hasCallId: Boolean(input.callId),
    callOutcome: input.callOutcome ?? null,
    callDurationSeconds: input.callDurationSeconds ?? null,
  });

  try {
    const modelResult = await callAskBobJobAfterCall(input);
    const result = modelResult.result;
    console.log("[askbob-after-call-success]", {
      workspaceId,
      userId,
      jobId,
      modelLatencyMs: result.modelLatencyMs,
      recommendedActionLabel: result.recommendedActionLabel,
      suggestedChannel: result.suggestedChannel,
      urgencyLevel: result.urgencyLevel,
    });

    if (jobId) {
      try {
        await recordAskBobJobTaskSnapshot(supabase, {
          workspaceId: context.workspaceId,
          jobId,
          task: "job.after_call",
          result,
        });
      } catch (snapshotError) {
        console.error("[askbob-snapshot-upsert] job after call failed", {
          workspaceId: context.workspaceId,
          jobId,
          error: snapshotError,
        });
      }
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-after-call-failure]", {
      workspaceId,
      userId,
      jobId,
      errorMessage: truncatedError,
    });
    throw error;
  }
}

export async function runAskBobLiveGuidanceTask(
  supabase: DbClient,
  input: CallLiveGuidanceInput,
): Promise<CallLiveGuidanceResult> {
  const workspaceId = input.workspaceId;
  const callId = input.callId;
  const customerId = input.customerId;
  const jobId = input.jobId ?? null;
  const guidanceMode = input.guidanceMode;
  const notesText = input.notesText?.trim() ?? null;
  const notesPresent = Boolean(notesText);
  const notesLength = notesText?.length ?? 0;
  const notesLengthBucket = describeNotesLengthBucket(notesLength);
  const hasPriorGuidance = Boolean(input.priorGuidanceSummary);
  const direction = input.direction ?? null;
  const callGuidanceSessionId = input.callGuidanceSessionId;
  const cycleIndex = input.cycleIndex;

  console.log("[askbob-call-live-guidance-request]", {
    workspaceId,
    callId,
    customerId,
    jobId,
    guidanceMode,
    direction,
    hasJobContext: Boolean(jobId),
    callGuidanceSessionId,
    cycleIndex,
    notesPresent,
    notesLengthBucket,
    hasPriorGuidance,
  });
  console.log("[askbob-call-live-guidance-cycle-request]", {
    workspaceId,
    callId,
    customerId,
    jobId,
    guidanceMode,
    direction,
    callGuidanceSessionId,
    cycleIndex,
    notesPresent,
    notesLengthBucket,
  });

  try {
    const modelResult = await callAskBobLiveGuidance(input);
    const result = modelResult.result;
    const telemetryFields = {
      cycleIndex,
      objectionSignalsCount: result.objectionSignals.length,
      escalationSignal: result.escalationSignal ?? null,
      hasTalkTrackNextLine: Boolean(result.talkTrackNextLine?.trim()),
      pauseNow: result.pauseNow,
    };
    console.log("[askbob-call-live-guidance-success]", {
      workspaceId,
      callId,
      customerId,
      jobId,
      guidanceMode,
      modelLatencyMs: result.modelLatencyMs,
      ...telemetryFields,
    });
    console.log("[askbob-call-live-guidance-cycle-success]", {
      workspaceId,
      callId,
      customerId,
      jobId,
      guidanceMode,
      callGuidanceSessionId,
      ...telemetryFields,
      summary: result.summary,
    });

    if (jobId) {
      try {
        await recordAskBobJobTaskSnapshot(supabase, {
          workspaceId,
          jobId,
          task: "call.live_guidance",
          result,
          metadata: {
            callId,
            guidanceMode,
            customerId,
            callGuidanceSessionId,
            cycleIndex,
            priorGuidanceSummary: input.priorGuidanceSummary ?? null,
          },
        });
      } catch (snapshotError) {
        console.error("[askbob-snapshot-upsert] call live guidance failed", {
          workspaceId,
          jobId,
          callId,
          error: snapshotError,
        });
      }
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-call-live-guidance-failure]", {
      workspaceId,
      callId,
      customerId,
      jobId,
      guidanceMode,
      errorMessage: truncatedError,
    });
    console.error("[askbob-call-live-guidance-cycle-failure]", {
      workspaceId,
      callId,
      customerId,
      jobId,
      guidanceMode,
      callGuidanceSessionId,
      cycleIndex,
      errorMessage: truncatedError,
    });
    throw error;
  }
}

export async function runAskBobJobScheduleTask(
  input: AskBobJobScheduleInput
): Promise<AskBobJobScheduleResult> {
  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const jobId = context.jobId;
  const normalizedInput: AskBobJobScheduleInput = {
    ...input,
    jobTitle: input.jobTitle?.trim() ?? null,
    jobDescription: input.jobDescription?.trim() ?? null,
    diagnosisSummary: input.diagnosisSummary?.trim() ?? null,
    materialsSummary: input.materialsSummary?.trim() ?? null,
    quoteSummary: input.quoteSummary?.trim() ?? null,
    followupSummary: input.followupSummary?.trim() ?? null,
    extraDetails: input.extraDetails?.trim() ?? null,
    followupDueLabel:
      input.followupDueLabel && input.followupDueLabel.trim().length
        ? input.followupDueLabel.trim()
        : undefined,
    notesSummary:
      input.notesSummary && input.notesSummary.trim().length
        ? input.notesSummary.trim()
        : null,
    availability: input.availability,
  };

  console.log("[askbob-job-schedule-request]", {
    workspaceId,
    userId,
    jobId: jobId ?? null,
    hasJobTitle: Boolean(normalizedInput.jobTitle),
    hasJobDescription: Boolean(normalizedInput.jobDescription),
    hasDiagnosisSummary: Boolean(normalizedInput.diagnosisSummary),
    hasMaterialsSummary: Boolean(normalizedInput.materialsSummary),
    hasQuoteSummary: Boolean(normalizedInput.quoteSummary),
    hasFollowupSummary: Boolean(normalizedInput.followupSummary),
    hasExtraDetails: Boolean(normalizedInput.extraDetails),
    hasNotesSummary: Boolean(normalizedInput.notesSummary),
    followupDueStatus: normalizedInput.followupDueStatus ?? null,
  });

  try {
    const modelResult = await callAskBobJobSchedule(normalizedInput);
    console.log("[askbob-job-schedule-success]", {
      workspaceId,
      userId,
      jobId: jobId ?? null,
      slotsCount: modelResult.result.slots.length,
      modelLatencyMs: modelResult.result.modelLatencyMs,
    });

    return modelResult.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-job-schedule-failure]", {
      workspaceId,
      userId,
      jobId: jobId ?? null,
      errorMessage: truncatedError,
    });
    throw error;
  }
}

async function runAskBobJobCallScriptTask(
  _supabase: DbClient,
  input: AskBobJobCallScriptInput
): Promise<AskBobJobCallScriptResult> {
  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const jobId = context.jobId ?? null;
  const normalizedCallIntents = Array.isArray(input.callIntents) && input.callIntents.length
    ? Array.from(new Set(input.callIntents))
    : undefined;

  const normalizedInput: AskBobJobCallScriptInput = {
    ...input,
    jobTitle: input.jobTitle?.trim() ?? null,
    jobDescription: input.jobDescription?.trim() ?? null,
    diagnosisSummary: input.diagnosisSummary?.trim() ?? null,
    materialsSummary: input.materialsSummary?.trim() ?? null,
    lastQuoteSummary: input.lastQuoteSummary?.trim() ?? null,
    followupSummary: input.followupSummary?.trim() ?? null,
    callTone: input.callTone?.trim() ?? null,
    callPersonaStyle: input.callPersonaStyle ?? null,
    extraDetails: input.extraDetails?.trim() ?? null,
    callIntents: normalizedCallIntents ?? null,
    latestCallOutcome: input.latestCallOutcome ?? null,
    latestCallOutcomeContext: input.latestCallOutcomeContext?.trim() ?? null,
  };
  const hasPersonaStyle = Boolean(normalizedInput.callPersonaStyle);
  const personaStyle = normalizedInput.callPersonaStyle ?? null;
  const hasCallIntents = Boolean(normalizedInput.callIntents?.length);
  const callIntentsCount = normalizedInput.callIntents?.length ?? 0;

  console.log("[askbob-call-script-request]", {
    workspaceId,
    userId,
    jobId,
    hasCustomerId: Boolean(context.customerId),
    hasJobTitle: Boolean(normalizedInput.jobTitle),
    hasDiagnosisSummary: Boolean(normalizedInput.diagnosisSummary),
    hasMaterialsSummary: Boolean(normalizedInput.materialsSummary),
    hasLastQuoteSummary: Boolean(normalizedInput.lastQuoteSummary),
    hasFollowupSummary: Boolean(normalizedInput.followupSummary),
    hasLatestCallOutcome: Boolean(normalizedInput.latestCallOutcome),
    hasLatestCallOutcomeContext: Boolean(normalizedInput.latestCallOutcomeContext),
    callPurpose: normalizedInput.callPurpose,
    callTone: normalizedInput.callTone ?? null,
    hasPersonaStyle,
    personaStyle,
    hasCallIntents,
    callIntentsCount,
  });

  try {
    const modelResult = await callAskBobJobCallScript(normalizedInput);
    const result = modelResult.result;
    console.log("[askbob-call-script-success]", {
      workspaceId,
      userId,
      jobId,
      modelLatencyMs: result.modelLatencyMs,
      scriptLength: result.scriptBody.length,
      keyPointsCount: result.keyPoints.length,
      callPurpose: normalizedInput.callPurpose,
      hasPersonaStyle,
      personaStyle,
      hasCallIntents,
      callIntentsCount,
    });

    return {
      ...result,
      callIntents: normalizedInput.callIntents ?? null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-call-script-failure]", {
      workspaceId,
      userId,
      jobId,
      errorMessage: truncatedError,
      callPurpose: normalizedInput.callPurpose,
      hasPersonaStyle,
      personaStyle,
      hasCallIntents,
      callIntentsCount,
    });
    throw error;
  }
}

export async function runAskBobMaterialsExplainTask(
  input: AskBobMaterialsExplainInput
): Promise<AskBobMaterialsExplainResult> {
  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const itemsCount = input.materialsSummary.items.length;
  console.log("[askbob-materials-explain-request]", {
    workspaceId,
    userId,
    jobId: context.jobId ?? null,
    quoteId: context.quoteId ?? null,
    materialsQuoteId: input.materialsSummary.id,
    itemsCount,
    hasExtraDetails: Boolean(input.extraDetails?.trim()),
  });

  try {
    const modelResult = await callAskBobMaterialsExplain(input);
    console.log("[askbob-materials-explain-success]", {
      workspaceId,
      userId,
      quoteId: context.quoteId ?? null,
      materialsQuoteId: input.materialsSummary.id,
      modelLatencyMs: modelResult.result.modelLatencyMs,
      explanationLength: modelResult.result.overallExplanation.length,
    });
    return modelResult.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-materials-explain-failure]", {
      workspaceId,
      userId,
      quoteId: context.quoteId ?? null,
      materialsQuoteId: input.materialsSummary.id,
      errorMessage: truncatedError,
    });
    throw error;
  }
}

async function runAskBobMaterialsGenerateTask(
  input: AskBobMaterialsGenerateInput
): Promise<AskBobMaterialsGenerateResult> {
  const prompt = input.prompt?.trim();
  if (!prompt || prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error("Please provide a bit more detail about the problem.");
  }

  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const hasExtraDetails = Boolean(input.extraDetails?.trim());
  const jobTitle = input.jobTitle?.trim() ?? null;
  const hasJobTitle = Boolean(jobTitle);

  console.log("[askbob-materials-request]", {
    workspaceId,
    userId,
    hasJobId: Boolean(context.jobId),
    hasCustomerId: Boolean(context.customerId),
    hasQuoteId: Boolean(context.quoteId),
    promptLength: prompt.length,
    hasExtraDetails,
    hasJobTitle,
  });

  try {
    const normalizedInput: AskBobMaterialsGenerateInput = {
      ...input,
      prompt,
      extraDetails: input.extraDetails?.trim() ?? null,
      jobTitle,
    };

    const modelResult = await callAskBobMaterialsGenerate(normalizedInput);

    console.log("[askbob-materials-success]", {
      workspaceId,
      userId,
      modelLatencyMs: modelResult.result.modelLatencyMs,
      itemsCount: modelResult.result.items.length,
    });

    if (context.jobId) {
      try {
        await recordAskBobJobTaskSnapshot(supabase, {
          workspaceId: context.workspaceId,
          jobId: context.jobId,
          task: "materials.generate",
          result: modelResult.result,
        });
      } catch (snapshotError) {
        console.error("[askbob-snapshot-upsert] materials generate failed", {
          workspaceId: context.workspaceId,
          jobId: context.jobId,
          error: snapshotError,
        });
      }
    }

    return modelResult.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-materials-failure]", {
      workspaceId: context.workspaceId,
      userId: context.userId,
      jobId: context.jobId ?? null,
      errorMessage: truncatedError,
    });

    throw error;
  }
}

function buildDiagnoseSnapshotPayload(result: AskBobJobDiagnoseResult): AskBobDiagnoseSnapshotPayload {
  return {
    sessionId: result.sessionId,
    responseId: result.responseId,
    createdAt: result.createdAt,
    sections: result.sections,
    materials: result.materials,
  };
}

function buildMaterialsSnapshotPayload(result: AskBobMaterialsGenerateResult): AskBobMaterialsSnapshotPayload {
  return {
    items: result.items,
    notes: result.notes ?? null,
  };
}

function buildQuoteSnapshotPayload(result: AskBobQuoteGenerateResult): AskBobQuoteSnapshotPayload {
  return {
    lines: result.lines,
    materials: result.materials ?? null,
    notes: result.notes ?? null,
  };
}

function buildFollowupSnapshotPayload(result: AskBobJobFollowupResult): AskBobFollowupSnapshotPayload {
  return {
    recommendedAction: result.recommendedAction,
    rationale: result.rationale,
    steps: result.steps,
    shouldSendMessage: result.shouldSendMessage,
    shouldScheduleVisit: result.shouldScheduleVisit,
    shouldCall: result.shouldCall,
    shouldWait: result.shouldWait,
    suggestedChannel: result.suggestedChannel ?? null,
    suggestedDelayDays: result.suggestedDelayDays ?? null,
    riskNotes: result.riskNotes ?? null,
    callRecommended: result.callRecommended ?? false,
    callPurpose: result.callPurpose ?? null,
    callTone: result.callTone ?? null,
    callUrgencyLabel: result.callUrgencyLabel ?? null,
    modelLatencyMs: result.modelLatencyMs ?? null,
  };
}

function buildAfterCallSnapshotPayload(result: AskBobJobAfterCallResult): AskBobAfterCallSnapshotPayload {
  return {
    afterCallSummary: result.afterCallSummary,
    recommendedActionLabel: result.recommendedActionLabel,
    recommendedActionSteps: result.recommendedActionSteps,
    suggestedChannel: result.suggestedChannel,
    draftMessageBody: result.draftMessageBody ?? null,
    urgencyLevel: result.urgencyLevel,
    notesForTech: result.notesForTech ?? null,
    modelLatencyMs: result.modelLatencyMs ?? null,
  };
}

function buildCallLiveGuidanceSnapshotPayload(
  result: CallLiveGuidanceResult,
  metadata:
    | {
        callId?: string;
        guidanceMode?: CallLiveGuidanceMode;
        customerId?: string;
        callGuidanceSessionId?: string;
        cycleIndex?: number;
      }
    | undefined,
  jobId: string,
): AskBobCallLiveGuidanceSnapshotPayload {
  return {
    callId: metadata?.callId ?? "unknown",
    guidanceMode: metadata?.guidanceMode ?? "intake",
    customerId: metadata?.customerId ?? "unknown",
    jobId,
    callGuidanceSessionId: metadata?.callGuidanceSessionId ?? "unknown",
    cycleIndex: metadata?.cycleIndex ?? 0,
    summary: result.summary,
    result,
  };
}

function buildScheduleSnapshotPayload(
  result: AskBobJobScheduleSnapshotPayload,
): AskBobJobScheduleSnapshotPayload {
  return {
    appointmentId: result.appointmentId,
    startAt: result.startAt,
    endAt: result.endAt,
    friendlyLabel:
      result.friendlyLabel && result.friendlyLabel.trim()
        ? result.friendlyLabel.trim()
        : null,
  };
}

export async function recordAskBobJobTaskSnapshot(
  supabase: DbClient,
  params: {
    workspaceId: string;
    jobId: string;
    task: AskBobJobTaskSnapshotTask;
    result:
      | AskBobJobDiagnoseResult
      | AskBobMaterialsGenerateResult
      | AskBobQuoteGenerateResult
      | AskBobJobFollowupResult
      | AskBobJobScheduleSnapshotPayload
      | AskBobJobAfterCallResult
      | CallLiveGuidanceResult;
    metadata?: {
      callId?: string;
      guidanceMode?: CallLiveGuidanceMode;
      customerId?: string;
      callGuidanceSessionId?: string;
      cycleIndex?: number;
      priorGuidanceSummary?: string | null;
    };
  }
): Promise<void> {
  let payload:
    | AskBobDiagnoseSnapshotPayload
    | AskBobMaterialsSnapshotPayload
    | AskBobQuoteSnapshotPayload
    | AskBobFollowupSnapshotPayload
    | AskBobJobScheduleSnapshotPayload
    | AskBobCallLiveGuidanceSnapshotPayload
    | null = null;
  let summary: string | null = null;

  switch (params.task) {
    case "job.diagnose": {
      const result = params.result as AskBobJobDiagnoseResult;
      payload = buildDiagnoseSnapshotPayload(result);
      const sectionsCount = payload.sections.length;
      const materialsCount = payload.materials?.length ?? 0;
      summary = `sections:${sectionsCount},materials:${materialsCount}`;
      break;
    }
    case "materials.generate": {
      const result = params.result as AskBobMaterialsGenerateResult;
      payload = buildMaterialsSnapshotPayload(result);
      summary = `items:${payload.items.length}`;
      break;
    }
    case "quote.generate": {
      const result = params.result as AskBobQuoteGenerateResult;
      payload = buildQuoteSnapshotPayload(result);
      summary = `lines:${payload.lines.length},materials:${payload.materials?.length ?? 0}`;
      break;
    }
    case "job.followup": {
      const result = params.result as AskBobJobFollowupResult;
      payload = buildFollowupSnapshotPayload(result);
      summary = `steps:${payload.steps.length},message:${payload.shouldSendMessage ? 1 : 0}`;
      break;
    }
    case "job.schedule": {
      const result = params.result as AskBobJobScheduleSnapshotPayload;
      payload = buildScheduleSnapshotPayload(result);
      summary = `appointment:${payload.appointmentId}`;
      break;
    }
    case "job.after_call": {
      const result = params.result as AskBobJobAfterCallResult;
      payload = buildAfterCallSnapshotPayload(result);
      summary = `action:${payload.recommendedActionLabel},steps:${payload.recommendedActionSteps.length}`;
      break;
    }
    case "call.live_guidance": {
      const result = params.result as CallLiveGuidanceResult;
      payload = buildCallLiveGuidanceSnapshotPayload(result, params.metadata, params.jobId);
      summary = `guidance:${payload.guidanceMode}`;
      break;
    }
  }

  if (!payload) {
    return;
  }

  try {
    await upsertJobTaskSnapshot(supabase, {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      task: params.task,
      payload,
    });
    console.log("[askbob-snapshot-upsert]", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      task: params.task,
      summary,
    });
  } catch (error) {
    console.error("[askbob-snapshot-upsert] Failed to persist snapshot", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      task: params.task,
      error,
    });
  }
}

const askBobSectionTypeSchema = z.enum(["steps", "materials", "safety", "costTime", "escalation"]);
const askBobResponseSectionSchema = z.object({
  type: askBobSectionTypeSchema,
  title: z.string(),
  items: z.array(z.string()),
});
const diagnoseSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  responseId: z.string().min(1),
  createdAt: z.string(),
  sections: z.array(askBobResponseSectionSchema),
  materials: z.array(askBobMaterialItemSchema).optional(),
});
const askBobMaterialItemResultSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  quantity: z.number(),
  unit: z.string().optional().nullable(),
  estimatedUnitCost: z.number().nullable().optional(),
  estimatedTotalCost: z.number().nullable().optional(),
  notes: z.string().optional().nullable(),
});
const materialsSnapshotSchema = z.object({
  items: z.array(askBobMaterialItemResultSchema),
  notes: z.string().optional().nullable(),
});
const quoteLineSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit: z.string().optional().nullable(),
  unitPrice: z.number().nullable().optional(),
  lineTotal: z.number().nullable().optional(),
});
const quoteMaterialLineSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string().optional().nullable(),
  estimatedUnitCost: z.number().nullable().optional(),
  estimatedTotalCost: z.number().nullable().optional(),
});
const quoteSnapshotSchema = z.object({
  lines: z.array(quoteLineSchema),
  materials: z.array(quoteMaterialLineSchema).optional().nullable(),
  notes: z.string().optional().nullable(),
});
const followupStepSchema = z.object({
  label: z.string(),
  detail: z.string().optional().nullable(),
});
const followupSnapshotSchema = z.object({
  recommendedAction: z.string(),
  rationale: z.string(),
  steps: z.array(followupStepSchema),
  shouldSendMessage: z.boolean(),
  shouldScheduleVisit: z.boolean(),
  shouldCall: z.boolean(),
  shouldWait: z.boolean(),
  suggestedChannel: z.enum(["sms", "email", "phone"]).optional().nullable(),
  suggestedDelayDays: z.number().optional().nullable(),
  riskNotes: z.string().optional().nullable(),
  callRecommended: z.boolean().optional(),
  callPurpose: z.string().optional().nullable(),
  callTone: z.string().optional().nullable(),
  callUrgencyLabel: z.string().optional().nullable(),
  modelLatencyMs: z.number().optional().nullable(),
});

const afterCallSnapshotSchema = z.object({
  afterCallSummary: z.string(),
  recommendedActionLabel: z.string(),
  recommendedActionSteps: z.array(z.string()),
  suggestedChannel: z.enum(["sms", "phone", "email", "none"]),
  draftMessageBody: z.string().optional().nullable(),
  urgencyLevel: z.enum(["low", "normal", "high"]),
  notesForTech: z.string().optional().nullable(),
  modelLatencyMs: z.number().optional().nullable(),
});

export async function getJobAskBobSnapshotsForJob(
  supabase: DbClient,
  params: { workspaceId: string; jobId: string }
): Promise<{
  diagnoseSnapshot: AskBobDiagnoseSnapshotPayload | null;
  materialsSnapshot: AskBobMaterialsSnapshotPayload | null;
  quoteSnapshot: AskBobQuoteSnapshotPayload | null;
  followupSnapshot: AskBobFollowupSnapshotPayload | null;
  afterCallSnapshot: AskBobAfterCallSnapshotPayload | null;
}> {
  const rows = await getJobTaskSnapshotsForJob(supabase, params);
  const snapshots = {
    diagnoseSnapshot: null,
    materialsSnapshot: null,
    quoteSnapshot: null,
    followupSnapshot: null,
    afterCallSnapshot: null,
  };
  const counts = {
    diagnose: 0,
    materials: 0,
    quote: 0,
    followup: 0,
    afterCall: 0,
  };

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    switch (row.task) {
      case "job.diagnose": {
        const parsed = diagnoseSnapshotSchema.safeParse(row.payload);
        if (parsed.success) {
          snapshots.diagnoseSnapshot = parsed.data;
          counts.diagnose += 1;
        } else {
          console.warn("[askbob-snapshot-decode-error]", {
            workspaceId: params.workspaceId,
            jobId: params.jobId,
            task: row.task,
            errors: parsed.error.errors.map((error) => error.message),
          });
        }
        break;
      }
      case "materials.generate": {
        const parsed = materialsSnapshotSchema.safeParse(row.payload);
        if (parsed.success) {
          snapshots.materialsSnapshot = parsed.data;
          counts.materials += 1;
        } else {
          console.warn("[askbob-snapshot-decode-error]", {
            workspaceId: params.workspaceId,
            jobId: params.jobId,
            task: row.task,
            errors: parsed.error.errors.map((error) => error.message),
          });
        }
        break;
      }
      case "quote.generate": {
        const parsed = quoteSnapshotSchema.safeParse(row.payload);
        if (parsed.success) {
          snapshots.quoteSnapshot = parsed.data;
          counts.quote += 1;
        } else {
          console.warn("[askbob-snapshot-decode-error]", {
            workspaceId: params.workspaceId,
            jobId: params.jobId,
            task: row.task,
            errors: parsed.error.errors.map((error) => error.message),
          });
        }
        break;
      }
      case "job.followup": {
        const parsed = followupSnapshotSchema.safeParse(row.payload);
        if (parsed.success) {
          snapshots.followupSnapshot = parsed.data;
          counts.followup += 1;
        } else {
          console.warn("[askbob-snapshot-decode-error]", {
            workspaceId: params.workspaceId,
            jobId: params.jobId,
            task: row.task,
            errors: parsed.error.errors.map((error) => error.message),
          });
        }
        break;
      }
      case "job.after_call": {
        const parsed = afterCallSnapshotSchema.safeParse(row.payload);
        if (parsed.success) {
          snapshots.afterCallSnapshot = parsed.data;
          counts.afterCall += 1;
        } else {
          console.warn("[askbob-snapshot-decode-error]", {
            workspaceId: params.workspaceId,
            jobId: params.jobId,
            task: row.task,
            errors: parsed.error.errors.map((error) => error.message),
          });
        }
        break;
      }
    }
  }

  const totalLoaded =
    counts.diagnose + counts.materials + counts.quote + counts.followup + counts.afterCall;
  if (totalLoaded > 0) {
    console.log("[askbob-snapshot-load]", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      counts,
    });
  }

  return snapshots;
}

const TASK_LABELS: Record<AskBobTask, string> = {
  "job.diagnose": "Diagnosed issue",
  "message.draft": "Drafted customer message",
  "quote.generate": "Generated quote suggestion",
  "materials.generate": "Generated materials list",
  "quote.explain": "Explained quote",
  "materials.explain": "Explained materials quote",
  "job.followup": "Suggested follow-up action",
  "job.schedule": "Scheduled appointment",
  "job.after_call": "Summarized last call",
};

const TASK_SHORT_LABELS: Record<AskBobTask, string> = {
  "job.diagnose": "diagnose",
  "message.draft": "message",
  "quote.generate": "quote",
  "materials.generate": "materials",
  "quote.explain": "quote explain",
  "materials.explain": "materials explain",
  "job.followup": "follow-up",
  "job.schedule": "scheduled appointment",
  "job.after_call": "after call",
};

export async function getJobAskBobHudSummary(
  supabase: DbClient,
  params: { workspaceId: string; jobId: string }
): Promise<{
  lastTaskLabel: string | null;
  lastUsedAt: string | null;
  totalRunsCount: number;
  tasksSeen: string[];
}> {
  const activity = await getLastAskBobActivityForJob(supabase, params);
  if (!activity) {
    return {
      lastTaskLabel: null,
      lastUsedAt: null,
      totalRunsCount: 0,
      tasksSeen: [],
    };
  }

  const label = TASK_LABELS[activity.task] ?? "Used AskBob";
  const seen = activity.tasksSeen ?? [];
  const normalized = [
    ...new Set(seen.map((task) => TASK_SHORT_LABELS[task] ?? "askbob")),
  ].slice(0, 3);
  return {
    lastTaskLabel: label,
    lastUsedAt: activity.createdAt,
    totalRunsCount: activity.totalRunsCount ?? 0,
    tasksSeen: normalized,
  };
}

export function toAskBobResponseDTO(input: {
  sessionId: string;
  responseId: string;
  createdAt: string;
  data: AskBobResponseData;
}): AskBobResponseDTO {
  const sections: AskBobResponseDTOSection[] = [];

  if (input.data.steps && input.data.steps.length > 0) {
    sections.push({
      type: "steps",
      title: "Step-by-step solution",
      items: input.data.steps,
    });
  }

  if (input.data.safetyCautions && input.data.safetyCautions.length > 0) {
    sections.push({
      type: "safety",
      title: "Safety cautions",
      items: input.data.safetyCautions,
    });
  }

  if (input.data.costTimeConsiderations && input.data.costTimeConsiderations.length > 0) {
    sections.push({
      type: "costTime",
      title: "Cost and time considerations",
      items: input.data.costTimeConsiderations,
    });
  }

  if (input.data.escalationGuidance && input.data.escalationGuidance.length > 0) {
    sections.push({
      type: "escalation",
      title: "When to escalate",
      items: input.data.escalationGuidance,
    });
  }

  return {
    sessionId: input.sessionId,
    responseId: input.responseId,
    createdAt: input.createdAt,
    sections,
    materials: input.data.materials,
  };
}

function describeNotesLengthBucket(length: number): string {
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
