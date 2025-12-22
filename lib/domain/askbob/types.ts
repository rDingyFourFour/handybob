import { z } from "zod";
import type { CallSummarySignals } from "./callHistory";
import type { LatestCallOutcomeForJob } from "@/lib/domain/calls/latestCallOutcome";

// AskBob tasks are processed through a shared routing surface; future tasks might include
// "message.draft", "quote.generate", "materials.estimate", "followup.plan", etc.
export type AskBobTask =
  | "job.diagnose"
  | "message.draft"
  | "quote.generate"
  | "materials.generate"
  | "quote.explain"
  | "materials.explain"
  | "job.followup"
  | "job.schedule"
  | "job.call_script"
  | "job.after_call"
  | "call.post_enrichment";

export type AskBobJobTaskSnapshotTask =
  | "job.diagnose"
  | "materials.generate"
  | "quote.generate"
  | "job.followup"
  | "job.schedule"
  | "job.after_call"
  | "call.live_guidance"
  | "call.post_enrichment";

export interface AskBobDiagnoseSnapshotPayload {
  sessionId: string;
  responseId: string;
  createdAt: string;
  sections: AskBobResponseDTOSection[];
  materials?: AskBobMaterialItem[];
}

export interface AskBobMaterialsSnapshotPayload {
  items: AskBobMaterialItemResult[];
  notes?: string | null;
}

export interface AskBobQuoteSnapshotPayload {
  lines: AskBobQuoteLineResult[];
  materials?: AskBobQuoteMaterialLineResult[] | null;
  notes?: string | null;
}

export interface AskBobFollowupSnapshotPayload {
  recommendedAction: string;
  rationale: string;
  steps: AskBobJobFollowupResult["steps"];
  shouldSendMessage: boolean;
  shouldScheduleVisit: boolean;
  shouldCall: boolean;
  shouldWait: boolean;
  suggestedChannel?: AskBobJobFollowupResult["suggestedChannel"];
  suggestedDelayDays?: number | null;
  riskNotes?: string | null;
  callRecommended?: boolean;
  callPurpose?: string | null;
  callTone?: string | null;
  callUrgencyLabel?: string | null;
  modelLatencyMs?: number | null;
}

export interface AskBobJobScheduleSnapshotPayload {
  appointmentId: string;
  startAt: string;
  endAt: string | null;
  friendlyLabel?: string | null;
}

export interface AskBobJobTaskSnapshot {
  task: AskBobJobTaskSnapshotTask;
  payload:
    | AskBobDiagnoseSnapshotPayload
    | AskBobMaterialsSnapshotPayload
    | AskBobQuoteSnapshotPayload
    | AskBobFollowupSnapshotPayload
    | AskBobJobScheduleSnapshotPayload
    | AskBobAfterCallSnapshotPayload
    | AskBobCallLiveGuidanceSnapshotPayload
    | AskBobCallPostEnrichmentSnapshotPayload;
}

export type AskBobSection = "steps" | "materials" | "safety" | "costTime" | "escalation";

export type AskBobMaterialItem = {
  name: string;
  quantity?: string | null;
  notes?: string | null;
};

export interface AskBobResponseData {
  steps: string[];
  materials?: AskBobMaterialItem[];
  safetyCautions?: string[];
  costTimeConsiderations?: string[];
  escalationGuidance?: string[];
  rawModelOutput?: unknown;
}

export interface AskBobSession {
  id: string;
  workspaceId: string;
  userId: string;
  prompt: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
  createdAt: string;
}

export interface AskBobResponse extends AskBobResponseData {
  id: string;
  sessionId: string;
  createdAt: string;
}

export type AskBobLinkEntityType = "job" | "message" | "quote";

export interface AskBobLink {
  id: string;
  workspaceId: string;
  askbobResponseId: string;
  entityType: AskBobLinkEntityType;
  entityId: string;
  createdAt: string;
}

export interface AskBobTaskContext {
  workspaceId: string;
  userId: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
}

export type AskBobTaskContextWithJob = Omit<AskBobTaskContext, "jobId"> & {
  jobId: string;
};

export type AskBobContext = AskBobTaskContext;

export interface AskBobRequestInput {
  prompt: string;
  workspaceId: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
  extraDetails?: string | null;
  jobTitle?: string | null;
}

export interface AskBobResponseDTOSection {
  type: AskBobSection;
  title: string;
  items: string[];
}

export interface AskBobResponseDTO {
  sessionId: string;
  responseId: string;
  createdAt: string;
  sections: AskBobResponseDTOSection[];
  materials?: AskBobMaterialItem[];
}

export interface AskBobJobDiagnoseInput {
  task: "job.diagnose";
  context: AskBobTaskContext;
  prompt: string;
  extraDetails?: string | null;
  jobTitle?: string | null;
}

export interface AskBobJobDiagnoseResult extends AskBobResponseDTO {
  modelLatencyMs: number;
}

export interface AskBobMessageDraftInput {
  task: "message.draft";
  context: AskBobTaskContext;
  purpose: string;
  tone?: string | null;
  extraDetails?: string | null;
}

export type SuggestedMessageChannel = "sms" | "email";

export interface AskBobMessageDraftResult {
  body: string;
  suggestedChannel?: SuggestedMessageChannel | null;
  summary?: string | null;
  modelLatencyMs: number;
}

export interface AskBobQuoteGenerateInput {
  task: "quote.generate";
  context: AskBobTaskContext;
  prompt: string;
  extraDetails?: string | null;
  jobTitle?: string | null;
}

export interface AskBobQuoteLineResult {
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
}

export interface AskBobQuoteMaterialLineResult {
  name: string;
  quantity: number;
  unit?: string | null;
  estimatedUnitCost?: number | null;
  estimatedTotalCost?: number | null;
}

export interface AskBobQuoteGenerateResult {
  lines: AskBobQuoteLineResult[];
  materials?: AskBobQuoteMaterialLineResult[] | null;
  notes?: string | null;
  modelLatencyMs: number;
  rawModelOutput?: unknown;
}

export interface AskBobQuoteExplainLineSummary {
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
}

export interface AskBobQuoteExplainMaterialSummary {
  name: string;
  quantity?: number | null;
  estimatedUnitCost?: number | null;
  estimatedTotalCost?: number | null;
}

export interface AskBobLineExplanation {
  lineIndex: number;
  explanation: string;
  inclusions?: string[] | null;
  exclusions?: string[] | null;
}

export interface AskBobQuoteExplainResult {
  overallExplanation: string;
  lineExplanations?: AskBobLineExplanation[];
  notes?: string | null;
  modelLatencyMs: number;
  rawModelOutput?: string | null;
}

export interface AskBobQuoteExplainInput {
  task: "quote.explain";
  context: AskBobTaskContext;
  quoteSummary: {
    id: string;
    jobId?: string | null;
    customerId?: string | null;
    subtotal?: number | null;
    tax?: number | null;
    total?: number | null;
    currency?: string | null;
    lines: AskBobQuoteExplainLineSummary[];
    materials?: AskBobQuoteExplainMaterialSummary[] | null;
  };
  extraDetails?: string | null;
}

export interface AskBobMaterialsExplainItemSummary {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  estimatedUnitCost?: number | null;
  estimatedTotalCost?: number | null;
}

export interface AskBobMaterialExplanation {
  itemIndex: number;
  explanation: string;
  inclusions?: string[] | null;
  exclusions?: string[] | null;
}

export interface AskBobMaterialsExplainResult {
  overallExplanation: string;
  itemExplanations?: AskBobMaterialExplanation[];
  notes?: string | null;
  modelLatencyMs: number;
  rawModelOutput?: string | null;
}

export interface AskBobMaterialsExplainInput {
  task: "materials.explain";
  context: AskBobTaskContext;
  materialsSummary: {
    id: string;
    jobId?: string | null;
    customerId?: string | null;
    subtotal?: number | null;
    tax?: number | null;
    total?: number | null;
    currency?: string | null;
    items: AskBobMaterialsExplainItemSummary[];
  };
  extraDetails?: string | null;
}

export interface AskBobMaterialsGenerateInput {
  task: "materials.generate";
  context: AskBobTaskContext;
  prompt: string;
  extraDetails?: string | null;
  jobTitle?: string | null;
}

export interface AskBobJobFollowupInput {
  task: "job.followup";
  context: AskBobTaskContext;
  jobTitle?: string | null;
  jobStatus: string;
  hasScheduledVisit: boolean;
  lastMessageAt?: string | null;
  lastCallAt?: string | null;
  lastQuoteAt?: string | null;
  lastInvoiceDueAt?: string | null;
  followupDueStatus: "none" | "due" | "overdue" | "upcoming";
  followupDueLabel: string;
  recommendedDelayDays?: number | null;
  hasOpenQuote: boolean;
  hasUnpaidInvoice: boolean;
  notesSummary?: string | null;
  hasQuoteContextForFollowup?: boolean;
  hasAskBobAppointment?: boolean;
  callSummarySignals?: CallSummarySignals | null;
  latestCallOutcome?: LatestCallOutcomeForJob | null;
  latestCallOutcomeContext?: string | null;
}

export interface AskBobJobFollowupResult {
  recommendedAction: string;
  rationale: string;
  steps: { label: string; detail?: string | null }[];
  shouldSendMessage: boolean;
  shouldScheduleVisit: boolean;
  shouldCall: boolean;
  shouldWait: boolean;
  suggestedChannel?: "sms" | "email" | "phone" | null;
  suggestedDelayDays?: number | null;
  riskNotes?: string | null;
  callRecommended?: boolean;
  callPurpose?: string | null;
  callTone?: string | null;
  callUrgencyLabel?: string | null;
  modelLatencyMs: number;
  rawModelOutput?: unknown;
}

export type AskBobAfterCallSuggestedChannel = "sms" | "phone" | "email" | "none";

export type AskBobAfterCallUrgencyLevel = "low" | "normal" | "high";

export interface AskBobJobAfterCallInput {
  task: "job.after_call";
  context: AskBobTaskContextWithJob;
  jobTitle?: string | null;
  jobDescription?: string | null;
  callId?: string | null;
  callOutcome?: string | null;
  callDurationSeconds?: number | null;
  callStartedAt?: string | null;
  callEndedAt?: string | null;
  callerName?: string | null;
  customerName?: string | null;
  phoneNumber?: string | null;
  existingCallSummary?: string | null;
  recentJobSignals?: string | null;
  callSummarySignals?: CallSummarySignals | null;
  latestCallOutcome?: LatestCallOutcomeForJob | null;
}

export interface AskBobJobAfterCallResult {
  afterCallSummary: string;
  recommendedActionLabel: string;
  recommendedActionSteps: string[];
  suggestedChannel: AskBobAfterCallSuggestedChannel;
  draftMessageBody?: string | null;
  urgencyLevel: AskBobAfterCallUrgencyLevel;
  notesForTech?: string | null;
  modelLatencyMs: number;
  rawModelOutput?: unknown;
}

export interface CallPostEnrichmentInput {
  task: "call.post_enrichment";
  workspaceId: string;
  callId: string;
  jobId?: string | null;
  direction: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  twilioStatus: string | null;
  hasRecording: boolean;
  hasNotes: boolean;
  notesText?: string | null;
}

export type CallPostEnrichmentConfidenceLabel = "low" | "medium" | "high";

export interface CallPostEnrichmentResult {
  summaryParagraph: string;
  keyMoments: string[];
  suggestedReachedCustomer: boolean | null;
  suggestedOutcomeCode: string | null;
  outcomeRationale: string | null;
  suggestedFollowupDraft: string;
  riskFlags: string[];
  confidenceLabel: CallPostEnrichmentConfidenceLabel;
}

export interface AskBobCallPostEnrichmentSnapshotPayload {
  callId: string;
  summaryParagraph: string;
  keyMoments: string[];
  suggestedReachedCustomer: boolean | null;
  suggestedOutcomeCode: string | null;
  outcomeRationale: string | null;
  suggestedFollowupDraft: string;
  riskFlags: string[];
  confidenceLabel: CallPostEnrichmentConfidenceLabel;
}

export interface AskBobAfterCallSnapshotPayload {
  afterCallSummary: string;
  recommendedActionLabel: string;
  recommendedActionSteps: string[];
  suggestedChannel: AskBobAfterCallSuggestedChannel;
  draftMessageBody?: string | null;
  urgencyLevel: AskBobAfterCallUrgencyLevel;
  notesForTech?: string | null;
  modelLatencyMs?: number | null;
}

export interface AskBobCallLiveGuidanceSnapshotPayload {
  callId: string;
  guidanceMode: CallLiveGuidanceMode;
  customerId: string;
  jobId?: string | null;
  callGuidanceSessionId: string;
  cycleIndex: number;
  summary: string;
  result: CallLiveGuidanceResult;
}

export type CallLiveGuidanceMode = "intake" | "scheduling";

export interface CallLiveGuidanceInput {
  task: "call.live_guidance";
  workspaceId: string;
  callId: string;
  customerId: string;
  jobId?: string | null;
  guidanceMode: CallLiveGuidanceMode;
  fromNumber?: string | null;
  toNumber?: string | null;
  direction?: string | null;
  callerMetadata?: Record<string, string | null> | null;
  customerName?: string | null;
  jobTitle?: string | null;
  jobStatus?: string | null;
  quoteSummary?: string | null;
  quoteId?: string | null;
  latestCallOutcomeContext?: string | null;
  latestCallOutcomeLabel?: string | null;
  extraDetails?: string | null;
  notesText?: string | null;
  callGuidanceSessionId: string;
  cycleIndex: number;
  priorGuidanceSummary?: string | null;
  addressedObjectionsSummary?: string | null;
}

export const CALL_LIVE_GUIDANCE_OBJECTION_SIGNALS = [
  "pricing_concern",
  "timeline_conflict",
  "scope_dispute",
  "safety_concern",
  "trust_issue",
  "approval_required",
] as const;

export const CALL_LIVE_GUIDANCE_ESCALATION_SIGNALS = [
  "safety_critical",
  "supervisor_required",
  "regulatory_risk",
  "out_of_scope",
  "time_sensitive",
] as const;

export type CallLiveGuidanceObjectionSignal =
  (typeof CALL_LIVE_GUIDANCE_OBJECTION_SIGNALS)[number];

export type CallLiveGuidanceEscalationSignal =
  (typeof CALL_LIVE_GUIDANCE_ESCALATION_SIGNALS)[number];

export interface CallLiveGuidanceResult {
  openingLine: string;
  questions: string[];
  confirmations: string[];
  nextActions: string[];
  guardrails: string[];
  talkTrackNextLine: string;
  pauseNow: boolean;
  confirmBeforeProceeding: string;
  objectionSignals: CallLiveGuidanceObjectionSignal[];
  escalationSignal?: CallLiveGuidanceEscalationSignal | null;
  escalationReason?: string | null;
  modelLatencyMs?: number | null;
  rawModelOutput?: unknown;
  summary: string;
  phasedPlan: string[];
  nextBestQuestion: string;
  riskFlags: string[];
  changedRecommendation: boolean;
  changedReason?: string | null;
}

export interface AskBobWorkingHoursWindow {
  startAt: string;
  endAt: string;
}

export interface AskBobJobScheduleAvailability {
  workingHours: AskBobWorkingHoursWindow;
  preferredDays?: string[] | null;
  timezone?: string | null;
}

export type AskBobUrgencyLevel = "low" | "medium" | "high";

export interface AskBobSchedulerSlot {
  startAt: string;
  endAt: string;
  label: string;
  location?: string | null;
  reason?: string | null;
  guidance?: string | null;
  urgency?: AskBobUrgencyLevel | null;
}

export type AskBobJobScheduleSuggestion = AskBobSchedulerSlot;

export interface AskBobJobScheduleInput {
  task: "job.schedule";
  context: AskBobTaskContextWithJob;
  customerId?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  diagnosisSummary?: string | null;
  materialsSummary?: string | null;
  quoteSummary?: string | null;
  followupSummary?: string | null;
  extraDetails?: string | null;
  followupDueStatus?: "none" | "due" | "overdue" | "upcoming";
  followupDueLabel?: string;
  hasVisitScheduled?: boolean;
  hasQuote?: boolean;
  hasInvoice?: boolean;
  notesSummary?: string | null;
  availability?: AskBobJobScheduleAvailability;
  todayDateIso?: string | null;
  nowTimestamp?: number;
}

export interface AskBobJobScheduleResult {
  slots: AskBobSchedulerSlot[];
  rationale?: string | null;
  safetyNotes?: string | null;
  confirmWithCustomerNotes?: string | null;
  modelLatencyMs: number;
  rawModelOutput?: unknown;
}

export type AskBobCallPurpose = "intake" | "scheduling" | "followup";

export const ASKBOB_CALL_INTENTS = [
  "intake_information",
  "schedule_visit",
  "quote_followup",
  "invoice_followup",
  "general_checkin",
] as const;
export type AskBobCallIntent = (typeof ASKBOB_CALL_INTENTS)[number];

export const ASKBOB_CALL_INTENT_LABELS: Record<AskBobCallIntent, string> = {
  intake_information: "Gather more job info",
  schedule_visit: "Schedule or confirm a visit",
  quote_followup: "Follow up on a quote",
  invoice_followup: "Follow up on an invoice or payment",
  general_checkin: "General check-in",
};

export const ASKBOB_CALL_INTENT_DESCRIPTIONS: Record<AskBobCallIntent, string> = {
  intake_information:
    "Gather or verify scope, customer needs, and site details for a new or existing job.",
  schedule_visit: "Book or adjust an in-person visit, confirm timing, and clarify logistics.",
  quote_followup: "Follow up on a quote, review status, and guide the customer toward a decision.",
  invoice_followup: "Discuss invoicing, payment updates, or outstanding balances professionally.",
  general_checkin: "Have a light, relationship-focused check-in without heavy sales pressure.",
};

export const ASKBOB_CALL_PERSONA_STYLES = [
  "friendly_warm",
  "direct_concise",
  "professional_formal",
  "reassuring_supportive",
] as const;
export type AskBobCallPersonaStyle = (typeof ASKBOB_CALL_PERSONA_STYLES)[number];
export const ASKBOB_CALL_PERSONA_LABELS: Record<AskBobCallPersonaStyle, string> = {
  friendly_warm: "Friendly and warm",
  direct_concise: "Direct and concise",
  professional_formal: "Professional and formal",
  reassuring_supportive: "Reassuring and supportive",
};
export const ASKBOB_CALL_PERSONA_DEFAULT: AskBobCallPersonaStyle = "friendly_warm";

export interface AskBobJobCallScriptInput {
  task: "job.call_script";
  context: AskBobTaskContextWithJob;
  customerId?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  diagnosisSummary?: string | null;
  materialsSummary?: string | null;
  lastQuoteSummary?: string | null;
  followupSummary?: string | null;
  latestCallOutcome?: LatestCallOutcomeForJob | null;
  latestCallOutcomeContext?: string | null;
  callPurpose: AskBobCallPurpose;
  callTone?: string | null;
  callPersonaStyle?: AskBobCallPersonaStyle | null;
  extraDetails?: string | null;
  callIntents?: AskBobCallIntent[] | null;
}

export interface AskBobJobCallScriptResult {
  scriptBody: string;
  openingLine: string;
  closingLine: string;
  keyPoints: string[];
  suggestedDurationMinutes?: number | null;
  callIntents?: AskBobCallIntent[] | null;
  modelLatencyMs: number;
  rawModelOutput?: unknown;
}

export interface AskBobMaterialItemResult {
  name: string;
  sku?: string | null;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  estimatedUnitCost?: number | null;
  estimatedTotalCost?: number | null;
  notes?: string | null;
}

export interface AskBobMaterialsGenerateResult {
  items: AskBobMaterialItemResult[];
  notes?: string | null;
  modelLatencyMs: number;
  rawModelOutput?: string | null;
}

export type AskBobTaskInput =
  | AskBobJobDiagnoseInput
  | AskBobMessageDraftInput
  | AskBobQuoteGenerateInput
  | AskBobMaterialsGenerateInput
  | AskBobQuoteExplainInput
  | AskBobMaterialsExplainInput
  | AskBobJobFollowupInput
  | AskBobJobScheduleInput
  | AskBobJobCallScriptInput
  | AskBobJobAfterCallInput
  | CallLiveGuidanceInput
  | CallPostEnrichmentInput;
export type AskBobTaskResult =
  | AskBobJobDiagnoseResult
  | AskBobMessageDraftResult
  | AskBobQuoteGenerateResult
  | AskBobMaterialsGenerateResult
  | AskBobQuoteExplainResult
  | AskBobMaterialsExplainResult
  | AskBobJobFollowupResult
  | AskBobJobScheduleResult
  | AskBobJobCallScriptResult
  | AskBobJobAfterCallResult
  | CallLiveGuidanceResult
  | CallPostEnrichmentResult;

// Zod schemas for validation

export const askBobRequestInputSchema = z.object({
  prompt: z.string().min(10, "Please provide a bit more detail about the problem."),
  workspaceId: z.string().min(1, "Workspace is required."),
  jobId: z.string().min(1).optional().nullable(),
  customerId: z.string().min(1).optional().nullable(),
  quoteId: z.string().min(1).optional().nullable(),
  jobTitle: z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      if (!value) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
  extraDetails: z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      if (!value) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
});

export const askBobMaterialItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const askBobResponseDataSchema = z.object({
  steps: z.array(z.string()).default([]),
  materials: z.array(askBobMaterialItemSchema).optional(),
  safetyCautions: z.array(z.string()).optional(),
  costTimeConsiderations: z.array(z.string()).optional(),
  escalationGuidance: z.array(z.string()).optional(),
  rawModelOutput: z.unknown().optional(),
});

export type AskBobRequestInputSchema = z.infer<typeof askBobRequestInputSchema>;
export type AskBobResponseDataSchema = z.infer<typeof askBobResponseDataSchema>;

export type { CallSummarySignals } from "./callHistory";
