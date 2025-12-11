"use server";

import OpenAI from "openai";
import type {
  AskBobContext,
  AskBobJobFollowupInput,
  AskBobJobFollowupResult,
  AskBobJobScheduleInput,
  AskBobJobScheduleResult,
  AskBobSchedulerSlot,
  AskBobUrgencyLevel,
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
  "State pricing as rough approximations (e.g., \"about $X-Y\"), note that rates vary by region and supplier, and do not guarantee any specific price.";

const SCOPE_LIMIT_GUARDRAILS =
  "Favor fewer, clearer actions over long lists, focus on the most critical 5-10 steps, and do not invent extra scope that cannot be backed by the prompt.";

const ASKBOB_PROFESSIONAL_VOICE_FRAGMENT = [
  "You assist a professional handyman or small home-services business owner.",
  "Keep guidance calm, confident, and practical for tradespeople working in the field.",
  "Use short paragraphs, numbered steps, and bullet lists instead of long walls of text, and put safety plus clear next actions first.",
  "Avoid emojis, jokes, slang, and casual phrases such as \"Hey there!\", \"No worries\", or \"I've got your back.\"",
  "If you are unsure about something, say so briefly and explain what additional information you need.",
].join(" ");

const MAX_DIAGNOSE_STEPS = 12;
const MAX_QUOTE_LINES = 20;
const MAX_MATERIAL_ITEMS = 25;
const MAX_MATERIAL_EXPLANATION_ITEMS = 25;
const MAX_FOLLOWUP_STEPS = 10;
const MAX_SCHEDULE_SUGGESTIONS = 3;

const JOB_DIAGNOSE_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, a technician-focused assistant for HandyBob. Respond with a strict JSON object only (no surrounding prose) containing the keys: steps (array of short, numbered actions a technician can follow), materials (array of { name, quantity?, notes? }), safetyCautions (array of short precautions), costTimeConsiderations (array of considerations about cost or time), and escalationGuidance (array of reasons to reschedule, call a specialist, or decline the job).",
  "Write for the technician, not the customer, and summarize the problem in one or two lines without repeating the full job description. Keep language neutral and professional.",
  "List safetyCautions first before any steps; each safety item should call out critical hazards, compliance reminders, or \"stop work\" triggers.",
  "Steps should be concise, ordered, and limited to the most critical 5-10 actions. Number them mentally and do not pad them with redundant detail.",
  "Cost/time considerations should include clearly labeled approximate ranges and remind the technician that actual cost depends on site conditions.",
  "Escalation guidance should note when to reschedule, bring in a specialist, or walk away because the job is unsafe or out of scope.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
].join(" ");

const QUOTE_GENERATE_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, a technician assistant focused on creating structured job quotes for HandyBob. Respond with JSON only (no prose) matching the keys: lines (array of { description, quantity, unit?, unitPrice?, lineTotal? }), materials (optional array of { name, quantity, unit?, estimatedUnitCost?, estimatedTotalCost? }), and notes (optional string). Keep the scope practical and concise.",
  "Base your quote on the job description and let the materials summary (when provided) guide the scope lines; treat diagnosis summaries as supporting context only.",
  "Each line item should have a clear service-style label, one short sentence describing the work (not selling language), and realistic rounded quantities or hours. Avoid precise decimals like 1.37.",
  "Use plain numerals for every amount, follow the existing currency style, and remind the technician that the pricing is an estimate that may change after a site inspection or if unforeseen conditions arise.",
  "When a materials summary is available, align the line items with those materials and mention the referenced materials in the notes if it adds clarity.",
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Do not guarantee prices and always label any estimate as approximate.",
].join(" ");

const MATERIALS_GENERATE_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, the HandyBob materials expert. Generate a structured materials checklist that matches the technician prompt.",
  "Base the materials list primarily on the job description when it is provided; treat technician notes and diagnosis summaries as supporting context and avoid inventing materials unrelated to the described work.",
  "The checklist is for the technician's prep work and shop shopping, not a customer-facing document. Group items as practical rows with a label, realistic quantity, and concise factual notes. Avoid generic toolkit fillers unless the description specifically asks for them.",
  "Use the notes field to convey a short preface sentence that clarifies this is a suggested materials checklist and that brands, SKUs, and final quantities depend on site conditions and technician preference.",
  "Keep item notes short, factual, and free of marketing phrases such as \"premium\" unless the request explicitly calls for that tone.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Return JSON only (no prose) that includes: items (array of { name, sku?, category?, quantity, unit?, estimatedUnitCost?, estimatedTotalCost?, notes? }) and notes (optional overall assumptions or constraints).",
  "Do not guarantee pricing and label all costs as estimates.",
  "Include modelLatencyMs in milliseconds so we can track how long the call took.",
].join(" ");

const MATERIALS_EXPLAIN_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, the HandyBob materials explainer. Help a homeowner understand what this materials quote covers, what is included, what may vary, and why the technician selected these items.",
  "Start with a brief overview paragraph aimed at a homeowner, then follow with concise bullet points or itemized clarifications. Explain any necessary technical term in plain language.",
  "Reassure the homeowner that pricing is an estimate and that the technician will confirm details on site, noting that actual totals may change if additional issues are discovered.",
  "Avoid jargon unless it already appears in the quote, and do not promise guarantees or legal commitments.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Respond with strict JSON (no prose) matching the keys: overallExplanation (required string), itemExplanations (optional array of { itemIndex, explanation, inclusions?, exclusions? }), notes (optional), and modelLatencyMs (number).",
  "If you are uncertain about anything, say \"This quote is based on typical conditions; your actual price may change if we find additional issues.\"",
].join(" ");

const QUOTE_EXPLAIN_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, a technician assistant that explains existing quotes to cautious homeowners. Use plain, reassuring language, mention safety, and remind them that pricing is approximate.",
  "Begin with a short overview paragraph aimed at the homeowner, then provide a bullet list or line-by-line clarifications that cover the key services. Explain technical terms briefly when necessary.",
  "Reassure them that pricing is an estimate and that the technician will confirm details on site. If uncertain, say \"This quote is based on typical conditions; your actual price may change if we find additional issues.\"",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Respond with strict JSON matching the keys: overallExplanation (required string), lineExplanations (optional array of { lineIndex, explanation, inclusions?, exclusions? }), notes (optional), and modelLatencyMs (number).",
].join(" ");

const FOLLOWUP_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, the HandyBob follow-up advisor. Recommend practical next steps for the job while keeping the customer experience calm and respectful.",
  "Keep the tone professional, neutral, and polite; avoid pushy sales language and guilt-tripping phrases. Frame actions with phrases like \"It would be reasonable to...\" or \"Consider...\" instead of commanding language.",
  "Use the provided status signals (quote status, last message, visits, invoices, and diagnostics) when you build the rationale, and mention the key signals that led to the recommendation.",
  "Provide a short rationale and a numbered list of steps the technician can follow. Include any follow-up context, such as whether the quote is outstanding or a visit is scheduled.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
  "Review the follow-up context and respond with strict JSON matching the keys: recommendedAction (short required string), rationale (short paragraph), steps (array of { label, detail? }), shouldSendMessage (boolean), shouldScheduleVisit (boolean), shouldCall (boolean), shouldWait (boolean), suggestedChannel (optional 'sms' | 'email' | 'phone'), suggestedDelayDays (optional number), riskNotes (optional string), and modelLatencyMs (number).",
].join(" ");

const SCHEDULE_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, the HandyBob scheduler. Review the job context, diagnostics, and follow-up signals, then recommend 1-3 time windows for a real visit. Respond with JSON only (no prose) matching the keys: slots (array of { startAt, endAt, label, location?, reason?, guidance? }), rationale (optional string), safetyNotes (optional string), confirmWithCustomerNotes (optional string), and modelLatencyMs (number).",
  "Only suggest times later than the current moment, honor any available time windows, and explain why each window works (travel, prep, urgency, etc.). Express startAt and endAt in ISO 8601 format using the business timezone when possible, and limit the list to at most three slots. Include a short rationale for why each slot works and, when relevant, mention any customer confirmations or safety checks that should happen before the visit.",
  "If the provided context is too thin for confident suggestions, return an empty slots array and a rationale such as 'Need more details to propose a time.' Do not auto-book; AskBob just recommends windows.",
  SAFETY_GUARDRAILS,
  COST_GUARDRAILS,
  SCOPE_LIMIT_GUARDRAILS,
].join(" ");

const MESSAGE_DRAFT_INSTRUCTIONS = [
  ASKBOB_PROFESSIONAL_VOICE_FRAGMENT,
  "You are AskBob, a technician assistant for HandyBob. Respond with a JSON object only (no surrounding prose) containing the keys: body (required, a brief customer-facing message), suggestedChannel (optional, 'sms' or 'email'), and summary (optional, a short explanation of the messaging goal). Keep the tone professional and respectful, and avoid emojis, slang, and excessive exclamation points.",
  "Use the customer's name if provided; otherwise, use a neutral greeting. Reflect any constraints from the follow-up context or quote status, and emphasize clarity plus concrete next steps such as scheduling, confirming approval, or clarifying scope.",
  "Set suggestedChannel to the channel that best fits the context. If you choose SMS, keep the body to one or two short paragraphs with no unnecessary greeting or closing. If you choose email, open with a neutral greeting, keep the body to 2-3 short paragraphs, and include a concise closing line. Make sure the body itself matches the channel you select.",
  "Mention the technician's role in verifying next steps, and remind the reader that pricing or materials are approximate when relevant.",
].join(" ");

const DEFAULT_MODEL = process.env.OPENAI_ASKBOB_MODEL ?? "gpt-4.1";

type CallAskBobModelOptions = {
  prompt: string;
  context: AskBobContext;
  extraDetails?: string | null;
  jobTitle?: string | null;
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

type CallAskBobJobScheduleResult = {
  result: AskBobJobScheduleResult;
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

function startsWithJobTitleLine(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  return value.trim().toLowerCase().startsWith("job title:");
}

export async function callAskBobModel({
  prompt,
  context,
  extraDetails,
  jobTitle,
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

  const extraDetailsContent = extraDetails?.trim() ?? null;
  const jobTitleLine = jobTitle && !startsWithJobTitleLine(extraDetailsContent) ? `Job title: ${jobTitle}` : null;
  const metadataParts = [jobTitleLine, extraDetailsContent].filter((part): part is string => Boolean(part));
  const metadataBlock = metadataParts.length ? metadataParts.join("\n\n") : null;

  const instructions = JOB_DIAGNOSE_INSTRUCTIONS;
  const userMessage = [
    `Technician prompt:\n${prompt}`,
    metadataBlock,
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

  const instructions = MESSAGE_DRAFT_INSTRUCTIONS;
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

  const jobTitleLine = input.jobTitle?.trim() ? `Job title: ${input.jobTitle?.trim()}` : null;
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
    hasQuoteContextForFollowup: input.hasQuoteContextForFollowup ?? false,
  };

  const messageParts = [
    `Context: ${contextParts}`,
    jobTitleLine,
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
    hasQuoteContextForFollowup: Boolean(input.hasQuoteContextForFollowup),
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

export async function callAskBobJobSchedule(
  input: AskBobJobScheduleInput
): Promise<CallAskBobJobScheduleResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const nowTimestamp = input.nowTimestamp ?? Date.now();
  const nowIso = new Date(nowTimestamp).toISOString();
  const todayDateIso =
    input.todayDateIso ?? new Date(nowTimestamp).toISOString().split("T")[0];

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

  const contextBlocks: string[] = [];
  const addContextBlock = (label: string, value?: string | null) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed.length) {
      return;
    }
    contextBlocks.push(`${label}:\n${trimmed}`);
  };
  addContextBlock("Job title", input.jobTitle);
  addContextBlock("Job description", input.jobDescription);
  addContextBlock("Diagnosis summary", input.diagnosisSummary);
  addContextBlock("Materials summary", input.materialsSummary);
  addContextBlock("Quote summary", input.quoteSummary);
  addContextBlock("Follow-up summary", input.followupSummary);
  const contextBlock = contextBlocks.length ? contextBlocks.join("\n\n") : null;
  const extraDetailsBlock =
    input.extraDetails && input.extraDetails.trim().length
      ? `Additional context:\n${input.extraDetails.trim()}`
      : null;
  const timingInstructions = [
    `Today is ${todayDateIso}.`,
    `The current moment is ${nowIso}.`,
    "Only propose appointment start times that are strictly in the future relative to today.",
    "Never suggest any time or date that has already passed; interpret ambiguous dates as today or later.",
  ].join("\n");
  const messageParts = [
    `Context: ${contextParts}`,
    contextBlock,
    extraDetailsBlock,
    timingInstructions,
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
        { role: "system", content: SCHEDULE_INSTRUCTIONS },
        { role: "user", content: messageParts },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const rawModelOutput =
      typeof messageContent === "string" ? messageContent.trim() : null;
    let payload: ModelPayload | null = null;
    let parseError: Error | null = null;
    try {
      payload = extractModelPayload(messageContent, {
        workspaceId: context.workspaceId,
        model: modelName,
      });
    } catch (error) {
      parseError = error instanceof Error ? error : new Error(String(error));
      console.error("[askbob-job-schedule-parse-failure]", {
        workspaceId: context.workspaceId,
        userId: context.userId,
        jobId: context.jobId ?? null,
        errorMessage: parseError.message,
      });
    }

    const slots = payload ? normalizeSchedulerSlots(payload.slots) : [];
    const { items: limitedSlots, truncatedCount } = limitArray(
      slots,
      MAX_SCHEDULE_SUGGESTIONS,
    );
    if (truncatedCount > 0) {
      console.log("[askbob-job-schedule-truncated]", {
        workspaceId: context.workspaceId,
        userId: context.userId,
        jobId: context.jobId ?? null,
        slotsBefore: slots.length,
        slotsAfter: limitedSlots.length,
      });
    }

    const rationale = payload ? normalizeNullableString(payload.rationale) : null;
    const safetyNotes = payload ? normalizeNullableString(payload.safetyNotes) : null;
    const confirmWithCustomerNotes = payload
      ? normalizeNullableString(payload.confirmWithCustomerNotes ?? payload.confirmNotes)
      : null;
    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: messageParts.length,
      latencyMs,
      success: true,
      task: "job.schedule",
    });

    const result: AskBobJobScheduleResult = {
      slots: limitedSlots,
      rationale,
      safetyNotes,
      confirmWithCustomerNotes,
      modelLatencyMs: latencyMs,
      rawModelOutput,
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
      promptLength: messageParts.length,
      latencyMs,
      success: false,
      task: "job.schedule",
      errorMessage: truncatedError,
    });
    throw error;
  }
}

export async function callAskBobQuoteGenerate({
  prompt,
  context,
  extraDetails,
  jobTitle,
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
  const extraDetailsContent = extraDetails?.trim() ?? null;
  const jobTitleLine =
    jobTitle && !startsWithJobTitleLine(extraDetailsContent) ? `Job title: ${jobTitle}` : null;

  const messageParts = [
    `Technician prompt:\n${prompt}`,
    jobTitleLine,
    extraDetailsContent ? `Additional details: ${extraDetailsContent}` : null,
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
  jobTitle,
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
  const extraDetailsContent = extraDetails?.trim() ?? null;
  const jobTitleLine =
    jobTitle && !startsWithJobTitleLine(extraDetailsContent) ? `Job title: ${jobTitle}` : null;

  const messageParts = [
    `Technician prompt:\n${prompt}`,
    jobTitleLine,
    extraDetailsContent ? `Constraints: ${extraDetailsContent}` : null,
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

function normalizeSchedulerSlots(value: unknown): AskBobSchedulerSlot[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const startAt =
        normalizeNullableString(
          record.startAt ??
            record.start ??
            record.windowStart ??
            record.slotStart ??
            record.start_time ??
            record.startTime,
        ) ?? null;
      const endAt =
        normalizeNullableString(
          record.endAt ??
            record.end ??
            record.windowEnd ??
            record.slotEnd ??
            record.end_time ??
            record.endTime,
        ) ?? null;
      const label =
        normalizeNullableString(
          record.label ??
            record.summaryLabel ??
            record.title ??
            record.slotLabel ??
            record.windowLabel,
        ) ?? null;

      if (!startAt || !endAt || !label) {
        return null;
      }

      const location = normalizeNullableString(record.location ?? record.place);
      const reason = normalizeNullableString(
        record.reason ?? record.rationale ?? record.note ?? record.context ?? record.why,
      );
      const guidance = normalizeNullableString(
        record.guidance ?? record.details ?? record.notes ?? record.comment,
      );
      const urgencyCandidate = normalizeNullableString(
        record.urgency ?? record.priority ?? record.urgencyLevel ?? record.priorityLevel,
      );
      const urgencyNormalized = urgencyCandidate?.toLowerCase();
      const urgency =
        urgencyNormalized === "low" ||
        urgencyNormalized === "medium" ||
        urgencyNormalized === "high"
          ? (urgencyNormalized as AskBobUrgencyLevel)
          : undefined;

      const slot: AskBobSchedulerSlot = {
        startAt,
        endAt,
        label,
      };
      if (location) {
        slot.location = location;
      }
      if (reason) {
        slot.reason = reason;
      }
      if (guidance) {
        slot.guidance = guidance;
      }
      if (urgency) {
        slot.urgency = urgency;
      }
      return slot;
    })
    .filter((entry): entry is AskBobSchedulerSlot => Boolean(entry));

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
