// Shared AI payload definitions for reusable prompts and Responses API outputs.

export type TimelineEventType =
  | "job_created"
  | "job"
  | "message"
  | "call"
  | "appointment"
  | "quote"
  | "invoice"
  | "payment"
  | "customer_created";

export type TimelineEvent = {
  type: TimelineEventType;
  timestamp: string | null;
  title: string;
  detail?: string | null;
  status?: string | null;
  askBobScript?: boolean;
  callId?: string | null;
  hasOutcomeSuffix?: boolean;
};

export type JobTimelinePayload = {
  job: {
    id: string;
    title: string | null;
    description: string | null;
    category: string | null;
    urgency: string | null;
    status: string | null;
    created_at: string | null;
    customer: {
      name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
  };
  events: TimelineEvent[];
};

export type CustomerTimelinePayload = {
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string | null;
  };
  jobs: {
    id: string;
    title: string | null;
    status: string | null;
    urgency: string | null;
    created_at: string | null;
  }[];
  events: TimelineEvent[];
};

export type AiClassification = {
  ai_category: string | null;
  ai_urgency: string | null;
  ai_confidence: number | null;
};

export type AiInsights = {
  summary?: string | null;
  lead_title?: string | null;
  lead_description?: string | null;
  shouldCreateJob?: boolean;
  should_create_job?: boolean;
};

export type JobSummary = {
  overview: string;
  key_events: {
    label: string;
    timestamp: string | null;
    status?: string | null;
    reference?: string | null;
  }[];
  communication_patterns: string[];
  notes?: string | null;
};

export type AssistantReply = {
  summary: string;
  follow_up_message: string;
  next_actions: string[];
};
