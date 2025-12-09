"use server";

import OpenAI from "openai";
import type {
  AskBobContext,
  AskBobJobFollowupInput,
  AskBobJobFollowupResult,
  AskBobLineExplanation,
  AskBobMaterialExplanation,
  AskBobMaterialItem,
  AskBobMaterialItemResult,
  AskBobMaterialsExplainInput,
  AskBobMaterialsExplainResult,
  AskBobMaterialsGenerateInput,
  AskBobMaterialsGenerateResult,
  AskBobQuoteExplainInput,
  AskBobQuoteExplainResult,
  AskBobQuoteGenerateInput,
  AskBobQuoteGenerateResult,
  AskBobQuoteLineResult,
  AskBobQuoteMaterialLineResult,
  AskBobResponseData,
  SuggestedMessageChannel,
} from "@/lib/domain/askbob/types";

const SAFETY_GUARDRAILS =
  "Always mention critical safety hazards before any tooling or wiring steps, remind technicians to follow local building codes and manufacturer instructions, and when in doubt, consult a licensed professional rather than improvising.";

const COST_GUARDRAILS =
  "State pricing as rough approximations (e.g., “about $X–Y”), note that rates vary by region and supplier, and do not guarantee any specific price.";

const SCOPE_LIMIT_GUARDRAILS =
  "Favor fewer, clearer actions over long lists, focus on the most critical 5–10 steps, and do not invent extra scope that cannot be backed by the prompt.";

const MAX_DIAGNOSE_STEPS = 12;
const MAX_QUOTE_LINES = 20;
const MAX_MATERIAL_ITEMS = 25;
const MAX_MATERIAL_EXPLANATION_ITEMS = 25;
const MAX_FOLLOWUP_STEPS = 10;

const JOB_DIAGNOSE_INSTRUCTIONS = [
  "You are AskBob, a technician-focused assistant for HandyBob. Respond with a strict JSON object only (no surrounding prose) containing the keys: steps (array of strings describing the step-by-step solution), materials (array of { name, quantity?, notes? }), safetyCautions (array of short precautions), costTimeConsiderations (array of considerations about cost or time), and escalationGuidance (array of reasons to escalate).",
  "Always list safety cautions first, then the step-by-step solution, followed by cost/time considerations, and finally escalation guidance.",
  SAFETY_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Express cost and time notes as rough estimates and remind technicians that conditions vary locally.",
].join(" ");

const QUOTE_GENERATE_INSTRUCTIONS = [
  "You are AskBob, a technician assistant focused on creating structured job quotes for HandyBob. Respond with JSON only (no prose) matching the keys: lines (array of { description, quantity, unit?, unitPrice?, lineTotal? }), materials (optional array of { name, quantity, unit?, estimatedUnitCost?, estimatedTotalCost? }), and notes (optional string). Keep the scope practical and concise.",
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Do not guarantee prices and always label any estimate as approximate.",
].join(" ");

const MATERIALS_GENERATE_INSTRUCTIONS = [
  "You are AskBob, the HandyBob materials expert. Generate a structured materials checklist that matches the technician prompt.",
  "Base the materials list primarily on the job description when it is provided; treat technician notes and diagnosis summaries as supporting context and avoid inventing materials unrelated to the described work.",
  "When the job description is missing, rely on the technician notes and diagnosis context you do have.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Return JSON only (no prose) that includes: items (array of { name, sku?, category?, quantity, unit?, estimatedUnitCost?, estimatedTotalCost?, notes? }) and notes (optional overall assumptions or constraints).",
  "Do not guarantee pricing and label all costs as estimates.",
  "Include modelLatencyMs in milliseconds so we can track how long the call took.",
].join(" ");

const MATERIALS_EXPLAIN_INSTRUCTIONS = [
  "You are AskBob, the HandyBob materials explainer. Help a homeowner understand what this materials quote covers, what’s included, and what may vary.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Respond with strict JSON (no prose) matching the keys: overallExplanation (required string), itemExplanations (optional array of { itemIndex, explanation, inclusions?, exclusions? }), notes (optional), and modelLatencyMs (number).",
].join(" ");

const QUOTE_EXPLAIN_INSTRUCTIONS = [
  "You are AskBob, a technician assistant that explains existing quotes to cautious homeowners. Use plain, reassuring language, mention safety, and remind them that pricing is approximate.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Respond with strict JSON matching the keys: overallExplanation (required string), lineExplanations (optional array of { lineIndex, explanation, inclusions?, exclusions? }), notes (optional), and modelLatencyMs (number).",
].join(" ");

const FOLLOWUP_INSTRUCTIONS = [
  "You are AskBob, the HandyBob follow-up advisor. Recommend practical next steps for the job while keeping the customer experience calm and non-pushy.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Review the follow-up context and respond with strict JSON matching the keys: recommendedAction (short required string), rationale (short paragraph), steps (array of { label, detail? }), shouldSendMessage (boolean), shouldScheduleVisit (boolean), shouldCall (boolean), shouldWait (boolean), suggestedChannel (optional 'sms' | 'email' | 'phone'), suggestedDelayDays (optional number), riskNotes (optional string), and modelLatencyMs (number).",
].join(" ");

const DEFAULT_MODEL = process.env.OPENAI_ASKBOB_MODEL ?? "gpt-4.1";

type CallAskBobModelOptions = {
  prompt: string;
  context: AskBobContext;
};

type CallAskBobModelResult = {
  data: AskBobResponseData;
  latencyMs: number;
  modelName: string;
};

type CallAskBobMessageDraftOptions = {
  prompt: string;
  context: AskBobContext;
  purpose: string;
  tone?: string | null;
  extraDetails?: string | null;
};

type CallAskBobMessageDraftResult = {
  body: string;
  suggestedChannel?: SuggestedMessageChannel | null;
  summary?: string | null;
  latencyMs: number;
  modelName: string;
};

type CallAskBobQuoteGenerateResult = {
  result: AskBobQuoteGenerateResult;
  latencyMs: number;
  modelName: string;
};

type CallAskBobMaterialsGenerateResult = {
  result: AskBobMaterialsGenerateResult;
  latencyMs: number;
  modelName: string;
};

type CallAskBobQuoteExplainResult = {
  result: AskBobQuoteExplainResult;
  latencyMs: number;
  modelName: string;
};

type CallAskBobMaterialsExplainResult = {
  result: AskBobMaterialsExplainResult;
  latencyMs: number;
  modelName: string;
};

type CallAskBobJobFollowupResult = {
  result: AskBobJobFollowupResult;
  latencyMs: number;
  modelName: string;
};

type ModelPayload = Record<string, unknown>;

type LimitResult<T> = {
  items: T[];
  truncatedCount: number;
};

function limitArray<T>(items: T[], maxLength: number): LimitResult<T> {
  if (items.length <= maxLength) {
    return { items, truncatedCount: 0 };
  }
  return {
    items: items.slice(0, maxLength),
    truncatedCount: items.length - maxLength,
  };
}

export async function callAskBobModel({
  prompt,
  context,
}: CallAskBobModelOptions): Promise<CallAskBobModelResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const instructions = JOB_DIAGNOSE_INSTRUCTIONS;
  const userMessage = `Technician prompt:\n${prompt}\n\nContext: ${contextParts}`;

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const stepsRaw = ensureStringArray(payload.steps);
    const { items: steps, truncatedCount: stepsTruncated } = limitArray(
      stepsRaw,
      MAX_DIAGNOSE_STEPS,
    );
    if (stepsTruncated > 0) {
      console.log("[askbob-diagnose-truncated]", {
        workspaceId: context.workspaceId,
        userId: context.userId,
        jobId: context.jobId ?? null,
        stepsBefore: stepsRaw.length,
        stepsAfter: steps.length,
      });
    }
    const materials = normalizeMaterials(payload.materials);
    const rawSafetyCautions = Array.isArray(payload.safetyCautions)
      ? payload.safetyCautions
      : [];
    const safetyCautions = ensureStringArray(rawSafetyCautions);
    if (!Array.isArray(payload.safetyCautions)) {
      console.log("[askbob-diagnose-missing-safety]", {
        workspaceId: context.workspaceId,
        userId: context.userId,
        jobId: context.jobId ?? null,
      });
    }
    const costTimeConsiderations = ensureStringArray(payload.costTimeConsiderations);
    const escalationGuidance = ensureStringArray(payload.escalationGuidance);

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: true,
    });

    return {
      data: {
        steps,
        materials,
        safetyCautions,
        costTimeConsiderations: costTimeConsiderations.length ? costTimeConsiderations : undefined,
        escalationGuidance: escalationGuidance.length ? escalationGuidance : undefined,
        rawModelOutput: payload,
      },
      latencyMs,
      modelName,
    };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError = errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: false,
      errorMessage: truncatedError,
    });

    throw error;
  }
}

export async function callAskBobMessageDraft({
  prompt,
  context,
  purpose,
  tone,
  extraDetails,
}: CallAskBobMessageDraftOptions): Promise<CallAskBobMessageDraftResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const instructions =
    "You are AskBob, a technician assistant for HandyBob. Respond with a JSON object only (no surrounding prose) containing the keys: body (required, a brief customer-facing message), suggestedChannel (optional, 'sms' or 'email'), and summary (optional, a short explanation of the messaging goal). Keep the tone appropriate given the provided tone hint, mention any critical context, and keep the message concise.";
  const userMessage = [
    `Purpose: ${purpose}`,
    tone ? `Tone: ${tone}` : null,
    extraDetails ? `Details: ${extraDetails}` : null,
    `Prompt: ${prompt}`,
    `Context: ${contextParts}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: true,
      task: "message.draft",
    });

    const bodyRaw = payload.body;
    if (typeof bodyRaw !== "string" || !bodyRaw.trim()) {
      throw new Error("AskBob message draft is missing a body.");
    }

    const suggestedChannelRaw = payload.suggestedChannel;
    const suggestedChannel =
      suggestedChannelRaw === "sms" || suggestedChannelRaw === "email"
        ? (suggestedChannelRaw as SuggestedMessageChannel)
        : null;

    const summaryRaw = payload.summary;
    const summary = typeof summaryRaw === "string" && summaryRaw.trim() ? summaryRaw.trim() : null;

    return {
      body: bodyRaw.trim(),
      suggestedChannel,
      summary,
      latencyMs,
      modelName,
    };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError = errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: false,
      task: "message.draft",
      errorMessage: truncatedError,
    });

    throw error;
  }
}

export async function callAskBobQuoteExplain({
  context,
  quoteSummary,
  extraDetails,
}: AskBobQuoteExplainInput): Promise<CallAskBobQuoteExplainResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const instructions = QUOTE_EXPLAIN_INSTRUCTIONS;
  const messageParts = [
    `Context: ${contextParts}`,
    `Quote summary:\n${JSON.stringify(quoteSummary, null, 2)}`,
    extraDetails ? `Guidance: ${extraDetails.trim()}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: messageParts },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const overallExplanationRaw = payload.overallExplanation;
    const overallExplanation = normalizeNullableString(overallExplanationRaw);
    if (!overallExplanation) {
      throw new Error("AskBob quote explanation is missing an overall explanation.");
    }

    const lineExplanations = normalizeLineExplanations(
      payload.lineExplanations,
      quoteSummary.lines.length,
    );
    const notes = normalizeNullableString(payload.notes);

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: messageParts.length,
      latencyMs,
      success: true,
      task: "quote.explain",
    });

    const result: AskBobQuoteExplainResult = {
      overallExplanation,
      lineExplanations: lineExplanations.length ? lineExplanations : undefined,
      notes,
      modelLatencyMs: latencyMs,
      rawModelOutput:
        typeof messageContent === "string" ? messageContent.trim() : null,
    };

    return {
      result,
      latencyMs,
      modelName,
    };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: messageParts.length,
      latencyMs,
      success: false,
      task: "quote.explain",
      errorMessage: truncatedError,
    });

    throw error;
  }
}

export async function callAskBobMaterialsExplain({
  context,
  materialsSummary,
  extraDetails,
}: AskBobMaterialsExplainInput): Promise<CallAskBobMaterialsExplainResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const instructions = MATERIALS_EXPLAIN_INSTRUCTIONS;
  const messageParts = [
    `Context: ${contextParts}`,
    `Materials summary:\n${JSON.stringify(materialsSummary, null, 2)}`,
    extraDetails ? `Guidance: ${extraDetails.trim()}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: messageParts },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const overallExplanation = normalizeNullableString(payload.overallExplanation);
    if (!overallExplanation) {
      throw new Error("AskBob materials explanation is missing an overall explanation.");
    }

    const maxExplanations = Math.min(
      materialsSummary.items.length,
      MAX_MATERIAL_EXPLANATION_ITEMS,
    );
    const itemExplanations = normalizeMaterialExplanations(
      payload.itemExplanations,
      maxExplanations,
    );
    const notes = normalizeNullableString(payload.notes);

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: messageParts.length,
      latencyMs,
      success: true,
      task: "materials.explain",
    });

    const result: AskBobMaterialsExplainResult = {
      overallExplanation,
      itemExplanations: itemExplanations.length ? itemExplanations : undefined,
      notes,
      modelLatencyMs: latencyMs,
      rawModelOutput:
        typeof messageContent === "string" ? messageContent.trim() : null,
    };

    return {
      result,
      latencyMs,
      modelName,
    };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: messageParts.length,
      latencyMs,
      success: false,
      task: "materials.explain",
      errorMessage: truncatedError,
    });

    throw error;
  }
}

export async function callAskBobJobFollowup(
  input: AskBobJobFollowupInput,
): Promise<CallAskBobJobFollowupResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const { context } = input;
  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const followupContext = {
    jobStatus: input.jobStatus,
    hasScheduledVisit: input.hasScheduledVisit,
    lastMessageAt: input.lastMessageAt ?? null,
    lastCallAt: input.lastCallAt ?? null,
    lastQuoteAt: input.lastQuoteAt ?? null,
    lastInvoiceDueAt: input.lastInvoiceDueAt ?? null,
    followupDueStatus: input.followupDueStatus,
    followupDueLabel: input.followupDueLabel,
    recommendedDelayDays: input.recommendedDelayDays ?? null,
    hasOpenQuote: input.hasOpenQuote,
    hasUnpaidInvoice: input.hasUnpaidInvoice,
    notesSummary: input.notesSummary ?? null,
  };

  const messageParts = [
    `Context: ${contextParts}`,
    `Follow-up context:\n${JSON.stringify(followupContext, null, 2)}`,
    input.notesSummary ? `Notes: ${input.notesSummary}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  console.log("[askbob-job-followup-request]", {
    workspaceId: context.workspaceId,
    userId: context.userId,
    jobId: context.jobId ?? null,
    jobStatus: input.jobStatus,
    followupDueStatus: input.followupDueStatus,
    hasOpenQuote: input.hasOpenQuote,
    hasUnpaidInvoice: input.hasUnpaidInvoice,
    promptLength: messageParts.length,
  });

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: FOLLOWUP_INSTRUCTIONS },
        { role: "user", content: messageParts },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const recommendedAction = normalizeNullableString(payload.recommendedAction);
    if (!recommendedAction) {
      throw new Error("AskBob job follow-up is missing a recommended action.");
    }
    const rationale = normalizeNullableString(payload.rationale);
    if (!rationale) {
      throw new Error("AskBob job follow-up is missing a rationale.");
    }

    const rawSteps = normalizeFollowupSteps(payload.steps);
    const { items: steps, truncatedCount } = limitArray(rawSteps, MAX_FOLLOWUP_STEPS);
    if (truncatedCount > 0) {
      console.log("[askbob-job-followup-truncated]", {
        workspaceId: context.workspaceId,
        userId: context.userId,
        jobId: context.jobId ?? null,
        stepsBefore: rawSteps.length,
        stepsAfter: steps.length,
      });
    }

    const shouldSendMessage = parseBooleanFlag(payload.shouldSendMessage);
    const shouldScheduleVisit = parseBooleanFlag(payload.shouldScheduleVisit);
    const shouldCall = parseBooleanFlag(payload.shouldCall);
    const shouldWait = parseBooleanFlag(payload.shouldWait);
    const suggestedChannelRaw = normalizeNullableString(payload.suggestedChannel);
    const suggestedChannel =
      suggestedChannelRaw === "sms" ||
      suggestedChannelRaw === "email" ||
      suggestedChannelRaw === "phone"
        ? suggestedChannelRaw
        : undefined;
    const suggestedDelayDays = normalizeNumber(payload.suggestedDelayDays);
    const riskNotes = normalizeNullableString(payload.riskNotes);

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: messageParts.length,
      latencyMs,
      success: true,
      task: "job.followup",
    });

    const result: AskBobJobFollowupResult = {
      recommendedAction,
      rationale,
      steps,
      shouldSendMessage,
      shouldScheduleVisit,
      shouldCall,
      shouldWait,
      suggestedChannel,
      suggestedDelayDays,
      riskNotes,
      modelLatencyMs: latencyMs,
      rawModelOutput: typeof messageContent === "string" ? messageContent.trim() : null,
    };

    console.log("[askbob-job-followup-success]", {
      workspaceId: context.workspaceId,
      userId: context.userId,
      jobId: context.jobId ?? null,
      modelLatencyMs: latencyMs,
      stepsCount: steps.length,
      shouldSendMessage,
      shouldScheduleVisit,
      shouldCall,
      shouldWait,
    });

    return {
      result,
      latencyMs,
      modelName,
    };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: messageParts.length,
      latencyMs,
      success: false,
      task: "job.followup",
      errorMessage: truncatedError,
    });

    console.error("[askbob-job-followup-failure]", {
      workspaceId: context.workspaceId,
      userId: context.userId,
      jobId: context.jobId ?? null,
      errorMessage: truncatedError,
    });

    throw error;
  }
}

export async function callAskBobQuoteGenerate({
  prompt,
  context,
  extraDetails,
}: AskBobQuoteGenerateInput): Promise<CallAskBobQuoteGenerateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const instructions = QUOTE_GENERATE_INSTRUCTIONS;

  const messageParts = [
    `Technician prompt:\n${prompt}`,
    extraDetails ? `Additional details: ${extraDetails}` : null,
    `Context: ${contextParts}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: messageParts },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const lines = normalizeQuoteLines(payload.lines);
    const materials = normalizeQuoteMaterials(payload.materials);
    const notes = normalizeNullableString(payload.notes);
    const { items: cappedLines, truncatedCount: truncatedLines } = limitArray(
      lines,
      MAX_QUOTE_LINES,
    );
    if (truncatedLines > 0) {
      console.log("[askbob-quote-truncated]", {
        workspaceId: context.workspaceId,
        userId: context.userId,
        jobId: context.jobId ?? null,
        linesBefore: lines.length,
        linesAfter: cappedLines.length,
      });
    }

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: true,
      task: "quote.generate",
    });

    return {
      result: {
        lines: cappedLines,
        materials: materials.length ? materials : undefined,
        notes,
        modelLatencyMs: latencyMs,
        rawModelOutput: payload,
      },
      latencyMs,
      modelName,
    };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError = errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: false,
      task: "quote.generate",
      errorMessage: truncatedError,
    });

    throw error;
  }
}

export async function callAskBobMaterialsGenerate({
  prompt,
  context,
  extraDetails,
}: AskBobMaterialsGenerateInput): Promise<CallAskBobMaterialsGenerateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const instructions = MATERIALS_GENERATE_INSTRUCTIONS;

  const messageParts = [
    `Technician prompt:\n${prompt}`,
    extraDetails ? `Constraints: ${extraDetails}` : null,
    `Context: ${contextParts}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: messageParts },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const items = normalizeMaterialsGenerateItems(payload.items);
    const notes = normalizeNullableString(payload.notes);
    const { items: cappedItems, truncatedCount: truncatedItems } = limitArray(
      items,
      MAX_MATERIAL_ITEMS,
    );
    if (truncatedItems > 0) {
      console.log("[askbob-materials-truncated]", {
        workspaceId: context.workspaceId,
        userId: context.userId,
        jobId: context.jobId ?? null,
        itemsBefore: items.length,
        itemsAfter: cappedItems.length,
      });
    }

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: true,
      task: "materials.generate",
    });

    const result: AskBobMaterialsGenerateResult = {
      items: cappedItems,
      notes,
      modelLatencyMs: latencyMs,
      rawModelOutput:
        typeof messageContent === "string" ? messageContent.trim() : null,
    };

    return { result, latencyMs, modelName };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: false,
      task: "materials.generate",
      errorMessage: truncatedError,
    });

    throw error;
  }
}

function extractModelPayload(
  rawContent: unknown,
  meta: { workspaceId: string; model: string }
): ModelPayload {
  const candidates = Array.isArray(rawContent) ? rawContent : [rawContent];

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate);
    } catch {
      continue;
    }
  }

  logJsonParseError(candidates[0], meta);
  throw new Error("AskBob model returned invalid JSON");
}

function parseJsonCandidate(candidate: unknown): ModelPayload {
  if (typeof candidate === "object" && candidate !== null) {
    return candidate as ModelPayload;
  }

  if (typeof candidate === "string") {
    const cleaned = cleanJsonString(candidate);
    return JSON.parse(cleaned);
  }

  throw new Error("AskBob model returned invalid JSON");
}

function cleanJsonString(value: string): string {
  let trimmed = value.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    trimmed = fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    trimmed = trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function logJsonParseError(candidate: unknown, meta: { workspaceId: string; model: string }) {
  console.warn("[askbob-json-parse-error]", {
    workspaceId: meta.workspaceId,
    model: meta.model,
    rawSnippet: getCandidateSnippet(candidate),
    candidateType: describeCandidateType(candidate),
  });
}

function getCandidateSnippet(candidate: unknown): string {
  if (candidate === undefined) {
    return "undefined";
  }
  if (candidate === null) {
    return "null";
  }
  if (typeof candidate === "string") {
    return cleanJsonString(candidate).slice(0, 200);
  }
  try {
    return JSON.stringify(candidate).replace(/\s+/g, " ").slice(0, 200);
  } catch {
    return String(candidate).slice(0, 200);
  }
}

function describeCandidateType(candidate: unknown): string {
  if (candidate === null) {
    return "null";
  }
  if (Array.isArray(candidate)) {
    return "array";
  }
  return typeof candidate;
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLineExplanations(
  value: unknown,
  maxLines: number,
): AskBobLineExplanation[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const lineIndexRaw = record.lineIndex;
      if (typeof lineIndexRaw !== "number" || Number.isNaN(lineIndexRaw)) {
        return null;
      }
      const explanationRaw = record.explanation;
      const explanation = normalizeNullableString(explanationRaw);
      if (!explanation) return null;

      const clampedMax = maxLines > 0 ? maxLines - 1 : Number(lineIndexRaw);
      const lineIndex = Math.max(
        0,
        Math.min(clampedMax, Math.floor(lineIndexRaw)),
      );
      const inclusions = ensureStringArray(record.inclusions);
      const exclusions = ensureStringArray(record.exclusions);

      const item: AskBobLineExplanation = {
        lineIndex,
        explanation,
      };
      if (inclusions.length) {
        item.inclusions = inclusions;
      }
      if (exclusions.length) {
        item.exclusions = exclusions;
      }

      return item;
    })
    .filter((entry): entry is AskBobLineExplanation => Boolean(entry));

  const limit = maxLines > 0 ? maxLines : normalized.length;
  return limitArray(normalized, limit).items;
}

function normalizeMaterialExplanations(
  value: unknown,
  maxItems: number,
): AskBobMaterialExplanation[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const itemIndexRaw = record.itemIndex;
      if (typeof itemIndexRaw !== "number" || Number.isNaN(itemIndexRaw)) {
        return null;
      }
      const explanation = normalizeNullableString(record.explanation);
      if (!explanation) return null;

      const boundedMax = maxItems > 0 ? maxItems - 1 : Math.floor(itemIndexRaw);
      const itemIndex = Math.max(
        0,
        Math.min(boundedMax, Math.floor(itemIndexRaw)),
      );
      const inclusions = ensureStringArray(record.inclusions);
      const exclusions = ensureStringArray(record.exclusions);

      const item: AskBobMaterialExplanation = {
        itemIndex,
        explanation,
      };
      if (inclusions.length) {
        item.inclusions = inclusions;
      }
      if (exclusions.length) {
        item.exclusions = exclusions;
      }

      return item;
    })
    .filter((entry): entry is AskBobMaterialExplanation => Boolean(entry));

  const limit = maxItems > 0 ? maxItems : normalized.length;
  return limitArray(normalized, limit).items;
}

function normalizeMaterials(value: unknown): AskBobMaterialItem[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized: AskBobMaterialItem[] = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidateName = (item as Record<string, unknown>).name;
      const name =
        typeof candidateName === "string" ? candidateName.trim() : candidateName === undefined ? "" : String(candidateName).trim();
      if (!name) return null;

      const quantityRaw = (item as Record<string, unknown>).quantity;
      const quantity =
        quantityRaw === null || quantityRaw === undefined
          ? null
          : typeof quantityRaw === "string"
          ? quantityRaw.trim() || null
          : String(quantityRaw).trim() || null;

      const notesRaw = (item as Record<string, unknown>).notes;
      const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : null;

      return { name, quantity, notes };
    })
    .filter((material): material is AskBobMaterialItem => Boolean(material));

  return normalized.length ? normalized : undefined;
}

function normalizeQuoteLines(value: unknown): AskBobQuoteLineResult[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const description =
        normalizeNullableString(record.description ?? record.label ?? record.scope);
      if (!description) {
        return null;
      }
      const quantity =
        normalizeNumber(record.quantity ?? record.qty ?? record.amount) ?? 1;
      const unit = normalizeNullableString(record.unit ?? record.units);
      const unitPrice = normalizeNumber(
        record.unitPrice ?? record.price ?? record.rate ?? record.unit_cost ?? record.cost
      );
      const lineTotal = normalizeNumber(record.lineTotal ?? record.total ?? record.amount);

      return {
        description,
        quantity,
        unit,
        unitPrice,
        lineTotal,
      };
    })
    .filter((line): line is AskBobQuoteLineResult => Boolean(line));

  return normalized;
}

function normalizeQuoteMaterials(value: unknown): AskBobQuoteMaterialLineResult[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name =
        normalizeNullableString(record.name ?? record.label ?? record.item) ?? null;
      if (!name) {
        return null;
      }
      const quantity = normalizeNumber(record.quantity ?? record.qty ?? record.amount) ?? 1;
      const unit = normalizeNullableString(record.unit ?? record.units);
      const estimatedUnitCost = normalizeNumber(
        record.estimatedUnitCost ?? record.unit_cost ?? record.unitCost
      );
      const estimatedTotalCost = normalizeNumber(
        record.estimatedTotalCost ?? record.total ?? record.estimated_total
      );

      return {
        name,
        quantity,
        unit,
        estimatedUnitCost,
        estimatedTotalCost,
      };
    })
    .filter(
      (material): material is AskBobQuoteMaterialLineResult => Boolean(material)
    );

  return normalized;
}

function normalizeMaterialsGenerateItems(value: unknown): AskBobMaterialItemResult[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name =
        normalizeNullableString(
          record.name ?? record.label ?? record.item ?? record.description
        ) ?? null;
      if (!name) {
        return null;
      }

      const quantity =
        normalizeNumber(record.quantity ?? record.qty ?? record.amount) ?? 1;
      const sku = normalizeNullableString(
        record.sku ?? record.partNumber ?? record.part_number
      );
      const category = normalizeNullableString(
        record.category ?? record.group ?? record.type ?? record.segment
      );
      const unit = normalizeNullableString(record.unit ?? record.units);
      const estimatedUnitCost = normalizeNumber(
        record.estimatedUnitCost ??
          record.unit_cost ??
          record.unitCost ??
          record.cost ??
          record.price
      );
      const estimatedTotalCost = normalizeNumber(
        record.estimatedTotalCost ??
          record.total ??
          record.lineTotal ??
          record.amount ??
          record.estimated_total
      );
      const notes = normalizeNullableString(
        record.notes ?? record.note ?? record.details ?? record.description
      );

      return {
        name,
        sku,
        category,
        quantity,
        unit,
        estimatedUnitCost,
        estimatedTotalCost,
        notes,
      };
    })
    .filter((material): material is AskBobMaterialItemResult => Boolean(material));

  return normalized;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeFollowupSteps(value: unknown): { label: string; detail?: string | null }[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const label =
        normalizeNullableString(record.label ?? record.action ?? record.recommendedAction) ??
        null;
      if (!label) return null;
      const detail = normalizeNullableString(
        record.detail ?? record.description ?? record.notes,
      );
      const step: { label: string; detail?: string | null } = { label };
      if (detail) {
        step.detail = detail;
      }
      return step;
    })
    .filter(
      (entry): entry is { label: string; detail?: string | null } => Boolean(entry),
    );

  return normalized;
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
}
