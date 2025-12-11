import { z } from "zod";

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
  | "job.schedule";

export type AskBobJobTaskSnapshotTask =
  | "job.diagnose"
  | "materials.generate"
  | "quote.generate"
  | "job.followup"
  | "job.schedule";

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
    | AskBobJobScheduleSnapshotPayload;
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
  modelLatencyMs: number;
  rawModelOutput?: unknown;
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
}

export interface AskBobJobScheduleResult {
  slots: AskBobSchedulerSlot[];
  rationale?: string | null;
  safetyNotes?: string | null;
  confirmWithCustomerNotes?: string | null;
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
  | AskBobJobScheduleInput;
export type AskBobTaskResult =
  | AskBobJobDiagnoseResult
  | AskBobMessageDraftResult
  | AskBobQuoteGenerateResult
  | AskBobMaterialsGenerateResult
  | AskBobQuoteExplainResult
  | AskBobMaterialsExplainResult
  | AskBobJobFollowupResult
  | AskBobJobScheduleResult;

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
