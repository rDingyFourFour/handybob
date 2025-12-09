import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobContext,
  AskBobJobFollowupInput,
  AskBobJobFollowupResult,
  AskBobMaterialsExplainInput,
  AskBobMaterialsExplainResult,
  AskBobMaterialsGenerateInput,
  AskBobMaterialsGenerateResult,
  AskBobMessageDraftInput,
  AskBobMessageDraftResult,
  AskBobQuoteExplainInput,
  AskBobQuoteExplainResult,
  AskBobQuoteGenerateInput,
  AskBobResponseData,
  AskBobResponseDTO,
  AskBobResponseDTOSection,
  AskBobTask,
  AskBobTaskInput,
  AskBobTaskResult,
  askBobResponseDataSchema,
} from "./types";
import {
  createAskBobSession,
  createAskBobResponse,
  getLastAskBobActivityForJob,
} from "./repository";
import {
  callAskBobMessageDraft,
  callAskBobModel,
  callAskBobQuoteExplain,
  callAskBobMaterialsExplain,
  callAskBobQuoteGenerate,
  callAskBobMaterialsGenerate,
  callAskBobJobFollowup,
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
    return runAskBobJobFollowupTask(input);
  }

  if (input.task === "materials.explain") {
    return runAskBobMaterialsExplainTask(input);
  }

  const prompt = input.prompt?.trim();

  if (!prompt || prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error("Please provide a bit more detail about the problem.");
  }

  try {
    const session = await createAskBobSessionWithContext(supabase, {
      context: input.context,
      prompt,
    });

    const modelResult = await callAskBobModel({
      prompt,
      context: input.context,
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

    return {
      ...dto,
      modelLatencyMs: modelResult.latencyMs,
    };
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

  console.log("[askbob-quote-generate-request]", {
    workspaceId,
    userId,
    hasJobId: Boolean(context.jobId),
    hasCustomerId: Boolean(context.customerId),
    hasQuoteId: Boolean(context.quoteId),
    promptLength: prompt.length,
    hasExtraDetails,
  });

  try {
    const normalizedInput: AskBobQuoteGenerateInput = {
      ...input,
      prompt,
      extraDetails: input.extraDetails?.trim() ?? null,
    };

    const modelResult = await callAskBobQuoteGenerate(normalizedInput);

    console.log("[askbob-quote-generate-success]", {
      workspaceId,
      userId,
      modelLatencyMs: modelResult.result.modelLatencyMs,
      linesCount: modelResult.result.lines.length,
      materialsCount: modelResult.result.materials?.length ?? 0,
    });

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
  input: AskBobJobFollowupInput
): Promise<AskBobJobFollowupResult> {
  const { context } = input;
  const workspaceId = context.workspaceId;
  const userId = context.userId;
  const jobId = context.jobId ?? null;
  console.log("[askbob-job-followup-service-request]", {
    workspaceId,
    userId,
    jobId,
    jobStatus: input.jobStatus,
    followupDueStatus: input.followupDueStatus,
    hasOpenQuote: input.hasOpenQuote,
    hasUnpaidInvoice: input.hasUnpaidInvoice,
  });

  const trimmedFollowupLabel = input.followupDueLabel?.trim();
  const normalizedInput: AskBobJobFollowupInput = {
    ...input,
    followupDueLabel:
      trimmedFollowupLabel && trimmedFollowupLabel.length
        ? trimmedFollowupLabel
        : input.followupDueLabel,
    notesSummary:
      input.notesSummary && input.notesSummary.trim().length
        ? input.notesSummary.trim()
        : null,
  };

  try {
    const modelResult = await callAskBobJobFollowup(normalizedInput);
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
    });
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

  console.log("[askbob-materials-request]", {
    workspaceId,
    userId,
    hasJobId: Boolean(context.jobId),
    hasCustomerId: Boolean(context.customerId),
    hasQuoteId: Boolean(context.quoteId),
    promptLength: prompt.length,
    hasExtraDetails,
  });

  try {
    const normalizedInput: AskBobMaterialsGenerateInput = {
      ...input,
      prompt,
      extraDetails: input.extraDetails?.trim() ?? null,
    };

    const modelResult = await callAskBobMaterialsGenerate(normalizedInput);

    console.log("[askbob-materials-success]", {
      workspaceId,
      userId,
      modelLatencyMs: modelResult.result.modelLatencyMs,
      itemsCount: modelResult.result.items.length,
    });

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

const TASK_LABELS: Record<AskBobTask, string> = {
  "job.diagnose": "Diagnosed issue",
  "message.draft": "Drafted customer message",
  "quote.generate": "Generated quote suggestion",
  "materials.generate": "Generated materials list",
  "quote.explain": "Explained quote",
  "materials.explain": "Explained materials quote",
  "job.followup": "Suggested follow-up action",
};

const TASK_SHORT_LABELS: Record<AskBobTask, string> = {
  "job.diagnose": "diagnose",
  "message.draft": "message",
  "quote.generate": "quote",
  "materials.generate": "materials",
  "quote.explain": "quote explain",
  "materials.explain": "materials explain",
  "job.followup": "follow-up",
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
