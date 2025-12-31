export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { mapWorkspaceResultToRouteOutcome, resolveWorkspaceContext } from "@/lib/domain/workspaces";
import CallStatusRefreshButton from "@/components/calls/CallStatusRefreshButton";
import AutomatedCallNotesCard from "./AutomatedCallNotesCard";
import CallRecordingLink from "@/components/calls/CallRecordingLink";
import HbCard from "@/components/ui/hb-card";
import JobCallScriptPanel, {
  type PhoneMessageSummary,
} from "@/app/(app)/jobs/[id]/JobCallScriptPanel";
import {
  deriveFollowupRecommendation,
  type FollowupRecommendation,
} from "@/lib/domain/communications/followupRecommendations";
import { normalizeCallOutcome } from "@/lib/domain/communications/callOutcomes";
import type { CallOutcomeCode } from "@/lib/domain/communications/callOutcomes";
import AskBobCallContextStrip from "./AskBobCallContextStrip";
import AskBobAfterCallCard from "./AskBobAfterCallCard";
import CallOutcomeCaptureCard from "./CallOutcomeCaptureCard";
import {
  getAskBobCallScriptBody,
  getAskBobCallScriptSource,
  isAskBobScriptSummary,
} from "@/lib/domain/askbob/constants";
import { formatTwilioStatusLabel } from "@/utils/calls/twilioStatusLabel";
import { getAutomatedCallVoiceLabel } from "@/lib/domain/askbob/automatedCallConfig";
import { getJobAskBobSnapshotsForJob } from "@/lib/domain/askbob/service";
import {
  buildCallAutomatedDialSnapshot,
  buildCallSessionFollowupReadiness,
  getCallSessionAutomatedSpeechPlan,
  getCallSessionJobAndCustomer,
  sanitizeAutomatedCallNotes,
} from "@/lib/domain/calls/sessions";
import { deriveCallSessionInstruction } from "@/lib/domain/calls/callSessionInstruction";
import LinkCallContextCard from "./LinkCallContextCard";
import AskBobLiveGuidanceCard from "./AskBobLiveGuidanceCard";
import PostCallEnrichmentCard from "./PostCallEnrichmentCard";
import CallManualNumberCard from "./CallManualNumberCard";
import CallSessionExperience from "./CallSessionExperience";
import { type CallWorkspacePanel } from "./callSessionTypes";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";

type CallRecord = {
  id: string;
  workspace_id: string;
  created_at: string | null;
  job_id: string | null;
  customer_id: string | null;
  direction: string | null;
  twilio_call_sid?: string | null;
  twilio_status?: string | null;
  twilio_status_updated_at?: string | null;
  twilio_error_code?: string | null;
  twilio_error_message?: string | null;
  twilio_recording_sid?: string | null;
  twilio_recording_url?: string | null;
  twilio_recording_duration_seconds?: number | null;
  twilio_recording_received_at?: string | null;
  from_number: string | null;
  to_number: string | null;
  outcome: string | null;
  outcome_notes: string | null;
  outcome_recorded_at: string | null;
  outcome_code: string | null;
  reached_customer: boolean | null;
  summary: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
};

type JobSummary = {
  id: string;
  title: string | null;
  status: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null; phone?: string | null }
    | Array<{ id: string | null; name: string | null; phone?: string | null }>
    | null;
};

type JobQuoteCandidate = {
  id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  smart_quote_used: boolean | null;
};

type MessageRecord = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  channel: string | null;
  via: string | null;
  subject: string | null;
  body: string | null;
  created_at: string | null;
  outcome: string | null;
};

type InboundCustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

type InboundJobOption = {
  id: string;
  title: string | null;
  customer_id: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTwilioStatusTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function formatUtcTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatRecordingDuration(seconds?: number | null) {
  if (seconds == null) {
    return null;
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  if (minutes > 0) {
    return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  return `${remainder}s`;
}

function calculateDaysSince(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

const TIMELINE_NOT_YET_LABEL = callSessionCopy.statusStrip.statuses.notYet;

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <Link
          href="/calls"
          className="text-sm font-semibold text-sky-300 hover:text-sky-200"
        >
          {callSessionCopy.header.backToCalls}
        </Link>
      </HbCard>
    </div>
  );
}

function buildMessagesHref({
  customerId,
  jobId,
}: {
  customerId: string | null;
  jobId: string | null;
}) {
  const params = new URLSearchParams({ compose: "1", origin: "calls-followup" });
  if (customerId) {
    params.set("customerId", customerId);
  }
  if (jobId) {
    params.set("jobId", jobId);
  }
  return `/messages?${params.toString()}`;
}

export default async function CallSessionPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await paramsPromise;

  if (!id || !id.trim()) {
    return (
      <MessageCard
        title="Call unavailable"
        body="We couldn’t resolve that call. Please return to the calls list."
      />
    );
  }

  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });
  const routeOutcome = mapWorkspaceResultToRouteOutcome(workspaceResult);
  if (routeOutcome?.redirectToLogin) {
    redirect("/login");
    return null;
  }
  if (routeOutcome?.showAccessDenied) {
    return <MessageCard title="Access denied" body={routeOutcome.message} />;
  }

  const workspace = workspaceResult.ok ? workspaceResult.membership.workspace : null;
  if (!workspace) {
    return (
      <MessageCard
        title="Workspace required"
        body="We can’t load workspace context right now. Try again in a moment."
      />
    );
  }

  console.log("[calls/[id]/page] Loading call session", { id, workspaceId: workspace.id });

  const {
    data: call,
    error: callError,
  } = await supabase
    .from<CallRecord>("calls")
    .select(
      "id, workspace_id, created_at, job_id, customer_id, direction, twilio_call_sid, twilio_status, twilio_status_updated_at, twilio_error_code, twilio_error_message, twilio_recording_sid, twilio_recording_url, twilio_recording_duration_seconds, twilio_recording_received_at, from_number, to_number, outcome, outcome_notes, outcome_recorded_at, outcome_code, reached_customer, summary, ai_summary, transcript"
    )
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();

  if (callError) {
    console.error("[calls/[id]/page] Supabase error loading call", {
      id,
      workspaceId: workspace.id,
      error: callError,
    });
    return (
      <MessageCard
        title="Call not found"
        body="We couldn’t find that call or it no longer exists for this workspace."
      />
    );
  }

  if (!call) {
    console.warn("[calls/[id]/page] Call not found in DB", { id, workspaceId: workspace.id });
    return (
      <MessageCard
        title="Call not found"
        body="We couldn’t find that call or it no longer exists for this workspace."
      />
    );
  }

  const callFromLabel = call.from_number?.trim() || "Unknown";
  const callToLabel = call.to_number?.trim() || "Unknown";
  const callDirectionNormalized = (call.direction ?? "outbound").toLowerCase();
  const isInboundCall = callDirectionNormalized === "inbound";
  const callSummaryRow = call.summary?.trim() ?? null;
  const askBobScriptSource = getAskBobCallScriptSource(call.ai_summary ?? null, callSummaryRow);
  const askBobScriptBody = getAskBobCallScriptBody(call.ai_summary ?? null, callSummaryRow);
  const isAskBobCallContext = Boolean(askBobScriptBody);
  const hasAskBobScriptHint =
    isAskBobScriptSummary(callSummaryRow) || isAskBobScriptSummary(call.ai_summary ?? null);

  const { jobId } = await getCallSessionJobAndCustomer({
    supabase,
    workspaceId: workspace.id,
    callId: call.id,
    existingJobId: call.job_id ?? null,
    existingCustomerId: call.customer_id ?? null,
  });
  const automatedSpeechPlan = await getCallSessionAutomatedSpeechPlan({
    supabase,
    workspaceId: workspace.id,
    callId: call.id,
    summary: call.summary ?? null,
  });
  const isAskBobAutomatedCall = Boolean(automatedSpeechPlan);
  const automaticVoiceLabel = getAutomatedCallVoiceLabel(automatedSpeechPlan?.voice ?? null);
  const automaticSummaryPreview = automatedSpeechPlan?.scriptSummary ?? null;
  const voicemailEnabled = automatedSpeechPlan?.allowVoicemail ?? null;
  const sanitizedAutomatedNotes = sanitizeAutomatedCallNotes(call.transcript ?? null);
  const automatedDialSnapshot = buildCallAutomatedDialSnapshot(call);
  const callReadiness = buildCallSessionFollowupReadiness({
    call,
    dialSnapshot: automatedDialSnapshot,
  });

  let askBobAfterCallSnapshot = null;
  let askBobPostCallEnrichmentSnapshot = null;
  if (jobId) {
    try {
      const snapshots = await getJobAskBobSnapshotsForJob(supabase, {
        workspaceId: workspace.id,
        jobId,
      });
      askBobAfterCallSnapshot = snapshots.afterCallSnapshot ?? null;
      askBobPostCallEnrichmentSnapshot = snapshots.postCallEnrichmentSnapshot ?? null;
    } catch (error) {
      console.error("[calls/[id]/page] Failed to load AskBob snapshots for job", {
        workspaceId: workspace.id,
        jobId,
        error,
      });
    }
  }

  const callHasOutcome =
    Boolean(call.outcome_recorded_at) ||
    Boolean(call.outcome_code) ||
    Boolean(call.outcome_notes?.trim());
  const callHasReachedFlag =
    call.reached_customer === true || call.reached_customer === false;
  const callSummaryValue = call.summary?.trim() ?? "";
  const callHasNotes = Boolean(
    (callSummaryValue && !isAskBobScriptSummary(callSummaryValue)) ||
      call.ai_summary?.trim() ||
      call.outcome_notes?.trim() ||
      call.transcript?.trim(),
  );
  const callSessionEnrichment = {
    isTerminal: automatedDialSnapshot.isTerminal,
    hasOutcome: callHasOutcome,
    hasReachedFlag: callHasReachedFlag,
    hasNotes: callHasNotes,
    hasRecordingMetadata: automatedDialSnapshot.hasRecordingMetadata,
    hasAskBobDraft: Boolean(askBobAfterCallSnapshot?.draftMessageBody?.trim()),
  };

  console.log("[calls-session-post-call-enrichment-visible]", {
    workspaceId: workspace.id,
    callId: call.id,
    direction: callDirectionNormalized,
    isTerminal: callSessionEnrichment.isTerminal,
    hasOutcome: callSessionEnrichment.hasOutcome,
    hasReachedFlag: callSessionEnrichment.hasReachedFlag,
    hasNotes: callSessionEnrichment.hasNotes,
    hasRecordingMetadata: callSessionEnrichment.hasRecordingMetadata,
    hasAskBobDraft: callSessionEnrichment.hasAskBobDraft,
  });
  const postCallEnrichmentResult =
    askBobPostCallEnrichmentSnapshot?.callId === call.id
      ? {
          summaryParagraph: askBobPostCallEnrichmentSnapshot.summaryParagraph,
          keyMoments: askBobPostCallEnrichmentSnapshot.keyMoments,
          suggestedReachedCustomer: askBobPostCallEnrichmentSnapshot.suggestedReachedCustomer,
          suggestedOutcomeCode: askBobPostCallEnrichmentSnapshot.suggestedOutcomeCode,
          outcomeRationale: askBobPostCallEnrichmentSnapshot.outcomeRationale,
          suggestedFollowupDraft: askBobPostCallEnrichmentSnapshot.suggestedFollowupDraft,
          riskFlags: askBobPostCallEnrichmentSnapshot.riskFlags,
          confidenceLabel: askBobPostCallEnrichmentSnapshot.confidenceLabel,
        }
      : null;

  if (isAskBobAutomatedCall) {
    console.log("[calls-session-askbob-automated-details-visible]", {
      callId: call.id,
      workspaceId: workspace.id,
      hasSpeechPlan: Boolean(automatedSpeechPlan),
      hasVoice: Boolean(automaticVoiceLabel),
      voicemailEnabledKnown: voicemailEnabled !== null,
    });
  }
  const hasExistingOutcome = callHasOutcome;
  if (hasExistingOutcome) {
    console.log("[calls-session-outcome-visible]", {
      workspaceId: workspace.id,
      jobId,
      callId: call.id,
      hasAskBobScript: Boolean(askBobScriptBody),
      hasLegacyOutcome: Boolean(call.outcome),
    });
  }
  const showOutcomeRequiredBanner = Boolean(
    automatedDialSnapshot.isTerminal && !hasExistingOutcome,
  );
  if (showOutcomeRequiredBanner) {
    console.log("[calls-after-call-outcome-required-visible]", {
      callId: call.id,
      workspaceId: workspace.id,
      status: automatedDialSnapshot.twilioStatus ?? call.twilio_status ?? null,
    });
  }

  let job: JobSummary | null = null;
  if (jobId) {
    const { data: jobRow, error: jobError } = await supabase
      .from<JobSummary>("jobs")
      .select("id, title, status, customer_id, customers(id, name, phone)")
      .eq("workspace_id", workspace.id)
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      console.error("[call-session] Failed to load job", jobError);
    }

    job = jobRow ?? null;
  }

  if (job) {
    console.log("[calls/[id]/page] Loaded job for call", {
      callId: call.id,
      jobId: job.id,
    });
  }
  let callScriptQuoteCandidate: JobQuoteCandidate | null = null;
  let callScriptQuoteId: string | null = null;
  if (job) {
    try {
      const { data: candidateQuotes, error: candidateError } = await supabase
        .from<JobQuoteCandidate>("quotes")
        .select("id, job_id, status, total, created_at, smart_quote_used")
        .eq("workspace_id", workspace.id)
        .eq("job_id", job.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (candidateError) {
        console.error("[calls/[id]/page] Failed to load quote candidate for job", {
          jobId: job.id,
          error: candidateError,
        });
      } else {
        const candidate = candidateQuotes?.[0] ?? null;
        callScriptQuoteCandidate = candidate;
        callScriptQuoteId = candidate?.id ?? null;
      }
    } catch (error) {
      console.error("[calls/[id]/page] Quote candidate query failed", error);
    }

    if (callScriptQuoteId) {
      console.log("[calls/[id]/page] Call script quote candidate", {
        callId: call.id,
        jobId: job.id,
        quoteId: callScriptQuoteId,
      });
    } else {
      console.log("[calls/[id]/page] No call script quote candidate for job", {
        callId: call.id,
        jobId: job.id,
      });
    }
  }

  const {
    data: workspaceCustomersRows,
    error: workspaceCustomersError,
  } = await supabase
    .from<InboundCustomerOption>("customers")
    .select("id, name, phone")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(400);
  if (workspaceCustomersError) {
    console.error("[calls/[id]/page] Failed to load workspace customers", {
      workspaceId: workspace.id,
      error: workspaceCustomersError,
    });
  }
  const customerOptions = workspaceCustomersRows ?? [];
  const {
    data: workspaceJobsRows,
    error: workspaceJobsError,
  } = await supabase
    .from<InboundJobOption>("jobs")
    .select("id, title, customer_id")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(400);
  if (workspaceJobsError) {
    console.error("[calls/[id]/page] Failed to load workspace jobs", {
      workspaceId: workspace.id,
      error: workspaceJobsError,
    });
  }
  const jobOptions = workspaceJobsRows ?? [];

  let messages: MessageRecord[] = [];
  if (jobId) {
    const messagesQuery = supabase
      .from<MessageRecord>("messages")
      .select(
        "id, job_id, quote_id, channel, via, subject, body, created_at, outcome"
      )
      .eq("workspace_id", workspace.id)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: messageRows, error: messageError } = await messagesQuery;
    if (messageError) {
      console.error("[call-session] Failed to load messages", messageError);
    }

    messages = messageRows ?? [];
  }

  const latestPhoneMessageSource = messages.find((message) => message.channel === "phone");
  const latestPhoneMessage: PhoneMessageSummary | null = latestPhoneMessageSource
    ? {
        id: latestPhoneMessageSource.id,
        channel: latestPhoneMessageSource.channel,
        body: latestPhoneMessageSource.body,
        created_at: latestPhoneMessageSource.created_at,
        outcome: latestPhoneMessageSource.outcome ?? null,
      }
    : null;

  const daysSinceQuote = calculateDaysSince(callScriptQuoteCandidate?.created_at ?? null);
  const followupRecommendation: FollowupRecommendation | null = deriveFollowupRecommendation({
    outcome: latestPhoneMessage?.outcome ?? null,
    daysSinceQuote,
    modelChannelSuggestion: null,
  });
  const shouldSkipFollowup = followupRecommendation?.shouldSkipFollowup ?? false;

  const latestPhoneMessageBody = latestPhoneMessage?.body?.trim();
  console.log("[calls/[id]] followup recommendation", {
    callId: call.id,
    jobId: job?.id ?? null,
    quoteId: callScriptQuoteCandidate?.id ?? null,
    recommendation: followupRecommendation,
  });

  const createdAtLabel = formatDate(call.created_at);
  const callSummary = latestPhoneMessageBody ?? "No summary recorded for this call yet.";
  const summaryMissing = !latestPhoneMessageBody;
  const twilioStatusLabel = formatTwilioStatusLabel(call.twilio_status ?? null);
  const twilioStatusUpdatedLabel = call.twilio_status_updated_at
    ? formatTwilioStatusTimestamp(call.twilio_status_updated_at)
    : null;
  const showTwilioStatus = Boolean(call.twilio_call_sid || call.twilio_status);

  if (showTwilioStatus) {
    console.log("[calls-session-twilio-status-visible]", {
      callId: call.id,
      twilioCallSid: call.twilio_call_sid ?? null,
      twilioStatus: call.twilio_status ?? null,
    });
  }

  const recordingCardVisible = Boolean(call.twilio_call_sid);
  const recordingAvailable = Boolean(call.twilio_recording_url);
  const recordingDurationLabel = formatRecordingDuration(call.twilio_recording_duration_seconds);
  const recordingProcessingHintVisible =
    Boolean(call.twilio_recording_url) && call.twilio_recording_duration_seconds == null;
  if (recordingCardVisible) {
    console.log("[calls-session-recording-visible]", {
      callId: call.id,
      workspaceId: workspace.id,
      recordingState: recordingAvailable ? "available" : "pending",
    });
  }

  const jobLink = jobId ? `/jobs/${jobId}` : undefined;
  const displayJobTitle =
    job?.title ?? (jobId ? `Job ${jobId.slice(0, 8)}…` : "Not linked to a job");
  const jobStatus = job?.status ?? "Status unknown";

  const quoteLink = callScriptQuoteId ? `/quotes/${callScriptQuoteId}` : undefined;
  const displayQuoteLabel = callScriptQuoteCandidate
    ? `Quote ${callScriptQuoteCandidate.id.slice(0, 8)}…${
        callScriptQuoteCandidate.total != null ? ` · total ${formatCurrency(callScriptQuoteCandidate.total)}` : ""
      }`
    : callScriptQuoteId
    ? `Quote ${callScriptQuoteId.slice(0, 8)}…`
    : "No quote linked";

  const customer =
    job && job.customers
      ? Array.isArray(job.customers) && job.customers.length > 0
        ? job.customers[0]
        : job.customers
      : null;
  const customerName = customer?.name ?? null;
  const customerPhone = customer?.phone ?? null;
  const customerId = customer?.id ?? null;
  const customerFirstName = customerName ? customerName.split(" ")[0] : null;
  const linkedCustomerId = call.customer_id ?? null;
  const hasCustomerPhone = Boolean(customerPhone?.trim());
  const manualMessagesHref = hasCustomerPhone
    ? buildMessagesHref({ customerId, jobId })
    : null;
  const scriptSummaryForManual = askBobScriptBody?.trim() || automaticSummaryPreview?.trim() || null;
  const hasScriptSummaryForManual = Boolean(scriptSummaryForManual);
  const automatedScriptBody = scriptSummaryForManual;
  const automatedScriptSummary = scriptSummaryForManual;
  const hasAutomatedScript = Boolean(automatedScriptBody?.trim());
  const hasAfterCallDraft =
    Boolean(askBobAfterCallSnapshot?.draftMessageBody?.trim()) ||
    Boolean(callSessionEnrichment.hasAskBobDraft);

  console.log("[calls-session-manual-escape-visible]", {
    workspaceId: workspace.id,
    callId: call.id,
    jobId,
    customerId,
    hasCustomerPhone,
    hasScriptSummary: hasScriptSummaryForManual,
  });

  const hasDialRequestedMarker = Boolean(call.twilio_call_sid || call.twilio_status);
  const hasTwilioSid = Boolean(call.twilio_call_sid);
  const hasTwilioStatus = Boolean(call.twilio_status);
  const createdTimestamp = formatUtcTimestamp(call.created_at);
  const timelineTwilioStatusLabel = formatTwilioStatusLabel(call.twilio_status ?? null);
  const twilioStatusTimestamp = formatUtcTimestamp(call.twilio_status_updated_at);
  const terminalTimestamp = automatedDialSnapshot.isTerminal
    ? formatUtcTimestamp(call.twilio_status_updated_at)
    : null;
  const outcomeTimestamp = formatUtcTimestamp(call.outcome_recorded_at);
  const hasRecordingDuration = call.twilio_recording_duration_seconds != null;
  const outcomeStatus = callHasOutcome && callHasReachedFlag
    ? callSessionCopy.statusStrip.statuses.outcomeSaved
    : callHasOutcome
    ? callSessionCopy.statusStrip.statuses.outcomeNeedsReach
    : callHasReachedFlag
    ? callSessionCopy.statusStrip.statuses.outcomeNeedsOutcome
    : TIMELINE_NOT_YET_LABEL;
  const afterCallStatus = hasAfterCallDraft
    ? callSessionCopy.statusStrip.statuses.followupDraftReady
    : callReadiness.isReady
    ? callSessionCopy.statusStrip.statuses.followupReady
    : TIMELINE_NOT_YET_LABEL;

  console.log("[calls-session-timeline-visible]", {
    workspaceId: workspace.id,
    callId: call.id,
    direction: call.direction ?? null,
    hasTwilioSid,
    hasTwilioStatus,
    isTerminal: automatedDialSnapshot.isTerminal,
    hasOutcome: callHasOutcome,
    hasRecordingMetadata: automatedDialSnapshot.hasRecordingMetadata,
    hasRecordingDuration,
    hasAfterCallDraft,
    component: "call-status-strip",
  });

  const callStatusStripItems = [
    {
      key: "created",
      label: callSessionCopy.statusStrip.labels.created,
      status: createdTimestamp
        ? callSessionCopy.statusStrip.statuses.created
        : TIMELINE_NOT_YET_LABEL,
      timestamp: createdTimestamp ?? TIMELINE_NOT_YET_LABEL,
    },
    {
      key: "status",
      label: callSessionCopy.statusStrip.labels.status,
      status:
        timelineTwilioStatusLabel ??
        (hasTwilioSid ? callSessionCopy.statusStrip.statuses.queued : TIMELINE_NOT_YET_LABEL),
      timestamp: twilioStatusTimestamp ?? TIMELINE_NOT_YET_LABEL,
    },
    {
      key: "terminal",
      label: callSessionCopy.statusStrip.labels.terminal,
      status: automatedDialSnapshot.isTerminal
        ? callSessionCopy.statusStrip.statuses.terminal
        : TIMELINE_NOT_YET_LABEL,
      timestamp: terminalTimestamp ?? TIMELINE_NOT_YET_LABEL,
    },
    {
      key: "outcome",
      label: callSessionCopy.statusStrip.labels.outcome,
      status: outcomeStatus,
      timestamp: outcomeTimestamp ?? TIMELINE_NOT_YET_LABEL,
    },
    {
      key: "after-call",
      label: callSessionCopy.statusStrip.labels.afterCall,
      status: afterCallStatus,
      timestamp: TIMELINE_NOT_YET_LABEL,
    },
  ];

  const statusLabelMap: Record<"terminal" | "outcome" | "after-call", string> = {
    terminal: callSessionCopy.statusStrip.labels.terminal,
    outcome: callSessionCopy.statusStrip.labels.outcome,
    "after-call": callSessionCopy.statusStrip.labels.afterCall,
  };

  const statusChips = callStatusStripItems
    .filter((item) => item.key in statusLabelMap)
    .map((item) => {
      const key = item.key as keyof typeof statusLabelMap;
      return {
        key: item.key,
        label: statusLabelMap[key],
        value: item.status,
      };
    });

  const statusBadgeLabel = automatedDialSnapshot.isTerminal
    ? callSessionCopy.statusStrip.statuses.terminal
    : hasDialRequestedMarker
    ? callSessionCopy.statusStrip.statuses.inProgress
    : callSessionCopy.statusStrip.statuses.created;

  const mainStatusValue =
    timelineTwilioStatusLabel ??
    (hasTwilioSid ? callSessionCopy.statusStrip.statuses.queued : TIMELINE_NOT_YET_LABEL);

  const afterCallDraftBody = askBobAfterCallSnapshot?.draftMessageBody?.trim() ?? null;
  const afterCallHasContext = Boolean(
    askBobScriptBody?.trim() || latestPhoneMessageBody?.trim() || call.outcome_notes?.trim(),
  );
  const hasAfterCallCard = Boolean(jobId && customerId);
  const canGenerateAfterCall =
    callReadiness.isReady && hasAfterCallCard && afterCallHasContext;
  const hasOutcomeGap = callReadiness.reasons.some(
    (reason) => reason === "missing_outcome" || reason === "missing_reached_flag",
  );
  const shouldRefreshStatus = hasDialRequestedMarker && !automatedDialSnapshot.isTerminal;
  const automatedOutcomeReason = callReadiness.reasons.includes("missing_outcome")
    ? "missing_outcome"
    : "missing_reached_flag";
  const canStartAutomatedCall = Boolean(jobId && customerPhone && hasAutomatedScript);
  const canStartGuidedCall = Boolean(hasCustomerPhone);
  const automatedDisabledReason = !hasCustomerPhone
    ? "missing_phone"
    : !hasAutomatedScript
    ? "missing_script"
    : null;
  const manualDisabledReason = !hasCustomerPhone ? "missing_phone" : null;

  const automatedCtaState = (() => {
    if (!hasDialRequestedMarker) {
      return {
        primaryCta: {
          kind: "start-automated-call",
          label: callSessionInstructionCopy.primaryCta.label.startAutomated,
          disabled: !canStartAutomatedCall,
          automatedCallPayload: canStartAutomatedCall
            ? {
                workspaceId: workspace.id,
                jobId: jobId ?? "",
                customerId,
                customerPhone: customerPhone ?? "",
                scriptBody: automatedScriptBody ?? "",
                scriptSummary: automatedScriptSummary,
                callId: call.id,
              }
            : null,
        },
        ctaReasonCode: canStartAutomatedCall ? "start_automated_call" : "missing_call_context",
      };
    }
    if (shouldRefreshStatus) {
      return {
        primaryCta: {
          kind: "refresh-status",
          label: callSessionInstructionCopy.primaryCta.label.refreshStatus,
          disabled: false,
        },
        ctaReasonCode: callReadiness.ctaReasonCode,
      };
    }
    if (automatedDialSnapshot.isTerminal && hasOutcomeGap) {
      return {
        primaryCta: {
          kind: "capture-outcome",
          label: callSessionInstructionCopy.primaryCta.label.captureOutcome,
          workspaceNavigate: { tab: "after", hash: "#call-outcome-capture" },
        },
        ctaReasonCode: automatedOutcomeReason,
      };
    }
    if (callReadiness.isReady && !hasAfterCallDraft && canGenerateAfterCall) {
      return {
        primaryCta: {
          kind: "generate-followup",
          label: callSessionInstructionCopy.primaryCta.label.generateFollowup,
          workspaceNavigate: { tab: "after", hash: "#askbob-after-call" },
        },
        ctaReasonCode: "ready",
      };
    }
    if (hasAfterCallDraft) {
      const isComposerEnabled = Boolean(afterCallDraftBody && jobId);
      const draftReasonCode = isComposerEnabled
        ? "draft_ready"
        : afterCallDraftBody
        ? "draft_missing_job"
        : "draft_missing_body";
      return {
        primaryCta: {
          kind: "open-composer",
          label: callSessionInstructionCopy.primaryCta.label.openComposer,
          disabled: !isComposerEnabled,
          workspaceNavigate: { tab: "after", hash: "#askbob-after-call" },
        },
        ctaReasonCode: draftReasonCode,
      };
    }
    const fallbackReasonCode = callReadiness.isReady
      ? hasAfterCallCard
        ? "missing_followup_context"
        : "missing_job_link"
      : callReadiness.ctaReasonCode;
    return {
      primaryCta: {
        kind: "generate-followup",
        label: callSessionInstructionCopy.primaryCta.label.generateFollowup,
        disabled: true,
        workspaceNavigate: { tab: "after", hash: "#askbob-after-call" },
      },
      ctaReasonCode: fallbackReasonCode,
    };
  })();

  const manualCtaState = (() => {
    if (shouldRefreshStatus) {
      return {
        primaryCta: {
          kind: "refresh-status",
          label: callSessionInstructionCopy.primaryCta.label.refreshStatus,
          disabled: false,
        },
        ctaReasonCode: callReadiness.ctaReasonCode,
      };
    }
    if (automatedDialSnapshot.isTerminal && hasOutcomeGap) {
      return {
        primaryCta: {
          kind: "capture-outcome",
          label: callSessionInstructionCopy.primaryCta.label.captureOutcome,
          workspaceNavigate: { tab: "after", hash: "#call-outcome-capture" },
        },
        ctaReasonCode: automatedOutcomeReason,
      };
    }
    if (!callHasOutcome && !automatedDialSnapshot.isTerminal) {
      return {
        primaryCta: {
          kind: "start-guided-call",
          label: callSessionInstructionCopy.primaryCta.label.startGuided,
          disabled: !canStartGuidedCall,
          workspaceNavigate: { tab: "during", hash: "#manual-call-tools" },
        },
        ctaReasonCode: canStartGuidedCall ? "start_guided_call" : "missing_call_context",
      };
    }
    if (callReadiness.isReady && !hasAfterCallDraft && canGenerateAfterCall) {
      return {
        primaryCta: {
          kind: "generate-followup",
          label: callSessionInstructionCopy.primaryCta.label.generateFollowup,
          workspaceNavigate: { tab: "after", hash: "#askbob-after-call" },
        },
        ctaReasonCode: "ready",
      };
    }
    if (hasAfterCallDraft) {
      const isComposerEnabled = Boolean(afterCallDraftBody && jobId);
      const draftReasonCode = isComposerEnabled
        ? "draft_ready"
        : afterCallDraftBody
        ? "draft_missing_job"
        : "draft_missing_body";
      return {
        primaryCta: {
          kind: "open-composer",
          label: callSessionInstructionCopy.primaryCta.label.openComposer,
          disabled: !isComposerEnabled,
          workspaceNavigate: { tab: "after", hash: "#askbob-after-call" },
        },
        ctaReasonCode: draftReasonCode,
      };
    }
    const fallbackReasonCode = callReadiness.isReady
      ? hasAfterCallCard
        ? "missing_followup_context"
        : "missing_job_link"
      : callReadiness.ctaReasonCode;
    return {
      primaryCta: {
        kind: "generate-followup",
        label: callSessionInstructionCopy.primaryCta.label.generateFollowup,
        disabled: true,
        workspaceNavigate: { tab: "after", hash: "#askbob-after-call" },
      },
      ctaReasonCode: fallbackReasonCode,
    };
  })();

  const unselectedCtaState = {
    primaryCta: {
      kind: "disabled",
      label: callSessionInstructionCopy.primaryCta.label.disabled,
      disabled: true,
    },
    ctaReasonCode: "select_call_mode",
  };

  const automatedInstruction = deriveCallSessionInstruction({
    callId: call.id,
    workspaceId: workspace.id,
    jobId: jobId ?? null,
    customerId,
    mode: "automated",
    primaryCta: automatedCtaState.primaryCta,
    ctaReasonCode: automatedCtaState.ctaReasonCode,
  });
  const manualInstruction = deriveCallSessionInstruction({
    callId: call.id,
    workspaceId: workspace.id,
    jobId: jobId ?? null,
    customerId,
    mode: "manual",
    primaryCta: manualCtaState.primaryCta,
    ctaReasonCode: manualCtaState.ctaReasonCode,
  });
  const unselectedInstruction = deriveCallSessionInstruction({
    callId: call.id,
    workspaceId: workspace.id,
    jobId: jobId ?? null,
    customerId,
    mode: "unselected",
    primaryCta: unselectedCtaState.primaryCta,
    ctaReasonCode: unselectedCtaState.ctaReasonCode,
  });

  const callControlModelBase = {
    workspaceId: workspace.id,
    callId: call.id,
    identity: {
      directionLabel: isInboundCall
        ? callSessionCopy.callControl.directionInbound
        : callSessionCopy.callControl.directionOutbound,
      isInbound: isInboundCall,
      from: callFromLabel,
      to: callToLabel,
      createdLabel: createdAtLabel,
    },
    headerContext: {
      customerName: customerName ?? null,
      jobTitle: job?.title ?? null,
    },
    statusStripItems: callStatusStripItems,
    secondaryActions: {
      jobHref: jobId ? `/jobs/${jobId}` : null,
      callsHref: "/calls",
      messagesHref: manualMessagesHref,
    },
    callContext: {
      jobId,
      customerId,
    },
    afterCallDraft: {
      body: afterCallDraftBody,
    },
  };

  const headerSubtitleTemplate = callSessionCopy.header.subtitleTemplate;
  const headerSubtitle =
    customerName && job?.title
      ? headerSubtitleTemplate
          .replace("{customerName}", customerName)
          .replace("{jobTitle}", job?.title)
      : callSessionCopy.header.subtitleFallback;

  const automatedCallControlModel = {
    ...callControlModelBase,
    primaryCta: automatedCtaState.primaryCta,
    instruction: automatedInstruction,
    ctaReasonCode: automatedCtaState.ctaReasonCode,
  };
  const manualCallControlModel = {
    ...callControlModelBase,
    primaryCta: manualCtaState.primaryCta,
    instruction: manualInstruction,
    ctaReasonCode: manualCtaState.ctaReasonCode,
  };
  const unselectedCallControlModel = {
    ...callControlModelBase,
    primaryCta: unselectedCtaState.primaryCta,
    instruction: unselectedInstruction,
    ctaReasonCode: unselectedCtaState.ctaReasonCode,
  };

  const showNoScriptPanel = !callScriptQuoteId;
  const manualWorkspacePanels: CallWorkspacePanel[] = [];
  if (isAskBobCallContext) {
    manualWorkspacePanels.push({
      id: "askbob-context",
      node: (
        <AskBobCallContextStrip
          callId={call.id}
          jobId={job?.id ?? jobId}
          scriptBody={askBobScriptBody}
          scriptSummary={askBobScriptSource}
        />
      ),
    });
  }
  if (showNoScriptPanel && !isAskBobCallContext) {
    manualWorkspacePanels.push({
      id: "no-script",
      node: (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call script</p>
          <h3 className="text-lg font-semibold text-white">No script yet</h3>
          <p className="text-sm text-slate-400">
            Attach a quote to generate a guided script and talking points.
          </p>
        </div>
      ),
    });
  }
  if (job) {
    manualWorkspacePanels.push({
      id: "job-script",
      node: (
        <>
          {console.log("[calls/[id]] Guided workspace context", {
            callId: call.id,
            jobId: job.id,
            quoteId: callScriptQuoteId,
            context: "call-session",
          })}
          <JobCallScriptPanel
            quoteId={callScriptQuoteId}
            jobId={job.id}
            workspaceId={workspace.id}
            latestPhoneMessage={latestPhoneMessage}
            customerName={customerName}
            customerFirstName={customerFirstName}
            customerPhone={customerPhone}
            mode="callSession"
            context="call-session"
            callId={call.id}
            isInboundCall={isInboundCall}
          />
        </>
      ),
    });
  } else {
    manualWorkspacePanels.push({
      id: "job-missing",
      node: (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
          Job record missing for this call. Please recreate the call from the job page or check your data.
        </div>
      ),
    });
  }
  if (call && job && callScriptQuoteCandidate) {
    manualWorkspacePanels.push({
      id: "manual-how-it-works",
      node: (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">How this works</p>
          <ol className="space-y-1 text-sm text-slate-400">
            <li className="flex gap-2">
              <span className="font-semibold text-slate-400">1.</span>
              <span>Review the script and key points in this panel.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-slate-400">2.</span>
              <span>Call the customer and walk through the guided checklist.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-slate-400">3.</span>
              <span>Log what happened and wrap up outcomes below.</span>
            </li>
          </ol>
        </div>
      ),
    });
  }
  manualWorkspacePanels.push({
    id: "manual-tools",
    node: (
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {callSessionCopy.manualTools.title}
          </p>
          <p className="text-sm text-slate-400">{callSessionCopy.manualTools.helper}</p>
        </div>
        <CallManualNumberCard
          workspaceId={workspace.id}
          callId={call.id}
          jobId={jobId}
          customerId={customerId}
          customerPhone={customerPhone}
          scriptSummary={scriptSummaryForManual}
        />
      </div>
    ),
  });
  if (isInboundCall) {
    manualWorkspacePanels.push({
      id: "link-inbound-context",
      node: (
        <LinkCallContextCard
          workspaceId={workspace.id}
          callId={call.id}
          direction={callDirectionNormalized}
          fromNumber={call.from_number ?? null}
          toNumber={call.to_number ?? null}
          customerId={linkedCustomerId}
          jobId={call.job_id ?? null}
          customerOptions={customerOptions}
          jobOptions={jobOptions}
        />
      ),
    });
  }
  if (isInboundCall && linkedCustomerId) {
    manualWorkspacePanels.push({
      id: "live-guidance",
      node: (
        <AskBobLiveGuidanceCard
          workspaceId={workspace.id}
          callId={call.id}
          direction={callDirectionNormalized}
          fromNumber={call.from_number ?? null}
          toNumber={call.to_number ?? null}
          customerId={linkedCustomerId}
          jobId={call.job_id ?? null}
          customerName={customerName}
          jobTitle={job?.title ?? null}
        />
      ),
    });
  }

  const manualFallbackNode = (
    <CallManualNumberCard
      workspaceId={workspace.id}
      callId={call.id}
      jobId={jobId}
      customerId={customerId}
      customerPhone={customerPhone}
      scriptSummary={scriptSummaryForManual}
    />
  );

  const automatedWorkspacePanels: CallWorkspacePanel[] = [];
  if (isAskBobCallContext) {
    automatedWorkspacePanels.push({
      id: "askbob-context",
      node: (
        <AskBobCallContextStrip
          callId={call.id}
          jobId={job?.id ?? jobId}
          scriptBody={askBobScriptBody}
          scriptSummary={askBobScriptSource}
        />
      ),
    });
  }
  if (isAskBobAutomatedCall) {
    automatedWorkspacePanels.push({
      id: "automated-notes",
      node: (
        <AutomatedCallNotesCard
          workspaceId={workspace.id}
          callId={call.id}
          initialNotes={sanitizedAutomatedNotes}
        />
      ),
    });
  } else {
    automatedWorkspacePanels.push({
      id: "automated-placeholder",
      node: (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
          Automated call notes appear here when an automated session is active.
        </div>
      ),
    });
  }

  const wrapUpOutcomeSection = (
    <CallOutcomeCaptureCard
      callId={call.id}
      workspaceId={workspace.id}
      initialOutcomeCode={call.outcome_code as CallOutcomeCode | null}
      initialReachedCustomer={call.reached_customer}
      initialNotes={call.outcome_notes}
      initialRecordedAt={call.outcome_recorded_at}
      initialLegacyOutcome={normalizeCallOutcome(call.outcome)}
      hasAskBobScriptHint={hasAskBobScriptHint}
      jobId={jobId}
      automatedDialSnapshot={automatedDialSnapshot}
      isAutomatedCallContext={isAskBobAutomatedCall}
      primaryVariant="secondary"
    />
  );

  const wrapUpAfterCallSection =
    jobId && customerId ? (
      <AskBobAfterCallCard
        callId={call.id}
        workspaceId={workspace.id}
        jobId={jobId}
        customerId={customerId}
        hasAskBobScriptBody={Boolean(askBobScriptBody)}
        callNotes={latestPhoneMessageBody ?? null}
        hasHumanNotes={Boolean(latestPhoneMessageBody)}
        hasOutcomeSaved={
          Boolean(call.outcome_recorded_at) ||
          Boolean(call.outcome_code) ||
          Boolean(call.outcome_notes?.trim())
        }
        hasOutcomeNotes={Boolean(call.outcome_notes?.trim())}
        callReadiness={callReadiness}
        generationSource="call_session"
        automatedDialSnapshot={automatedDialSnapshot}
        callSessionEnrichment={callSessionEnrichment}
        isAskBobAutomatedCall={isAskBobAutomatedCall}
        callDirection={call.direction ?? null}
        reachedCustomer={call.reached_customer}
        outcomeCode={call.outcome_code}
        callSessionDraftBody={askBobAfterCallSnapshot?.draftMessageBody ?? null}
        primaryVariant="secondary"
      />
    ) : null;

  const wrapUpEnrichmentSection = (
    <PostCallEnrichmentCard
      workspaceId={workspace.id}
      callId={call.id}
      jobId={jobId}
      customerId={customerId}
      direction={call.direction ?? null}
      isTerminal={callSessionEnrichment.isTerminal}
      hasRecordingMetadata={callSessionEnrichment.hasRecordingMetadata}
      hasOutcome={callSessionEnrichment.hasOutcome}
      initialResult={postCallEnrichmentResult}
      primaryVariant="secondary"
      hideFollowupComposer
    />
  );

  const callStatusDetails = (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Created</p>
          <p className="mt-1 text-base text-white">{createdAtLabel}</p>
        </div>
      </div>
      {showTwilioStatus && (
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
            <span>Twilio status</span>
            <CallStatusRefreshButton callId={call.id} />
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-white">{twilioStatusLabel ?? "Queued"}</span>
            {twilioStatusUpdatedLabel && (
              <span className="text-xs text-slate-500">
                Updated {twilioStatusUpdatedLabel}
              </span>
            )}
          </div>
        </div>
      )}
      {isAskBobAutomatedCall && (
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
            <span>Automated call</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Voice</p>
              <p className="text-sm text-white">{automaticVoiceLabel ?? "Not available"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                Voicemail
              </p>
              <p className="text-sm text-white">
                {voicemailEnabled === null
                  ? "Not available"
                  : voicemailEnabled
                  ? "Enabled"
                  : "Disabled"}
              </p>
            </div>
            <div className="sm:col-span-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                Speech plan summary
              </p>
              <p className="text-sm text-white">
                {automaticSummaryPreview ?? "Not available"}
              </p>
            </div>
          </div>
          <div className="pt-2 text-xs uppercase tracking-[0.3em] text-slate-500">
            Job access is available from the primary actions.
          </div>
        </div>
      )}
      {recordingCardVisible && (
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
            <span>Recording</span>
            <span className="rounded-full border border-slate-800/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              {recordingAvailable ? "Recording available" : "Recording pending"}
            </span>
          </div>
          {recordingAvailable ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {recordingDurationLabel && (
                <p className="text-xs text-slate-400">
                  Duration {recordingDurationLabel}
                </p>
              )}
              <div className="flex items-center gap-2">
                <CallRecordingLink callId={call.id} workspaceId={workspace.id} />
                {recordingProcessingHintVisible && (
                  <p className="text-[10px] text-slate-400">
                    If this fails, refresh in a minute
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              A recording will appear here after the call completes.
            </p>
          )}
        </div>
      )}
      {call.twilio_error_message && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          <p className="text-xs uppercase tracking-[0.3em] text-rose-200">Call failed</p>
          <p className="text-sm text-rose-100">{call.twilio_error_message}</p>
        </div>
      )}
    </div>
  );

  return (
    <CallSessionExperience
      callId={call.id}
      workspaceId={workspace.id}
      jobId={jobId ?? null}
      customerId={customerId}
      headerSubtitle={headerSubtitle}
      directionLabel={callControlModelBase.identity.directionLabel}
      isInbound={callControlModelBase.identity.isInbound}
      fromLabel={callControlModelBase.identity.from}
      toLabel={callControlModelBase.identity.to}
      createdLabel={callControlModelBase.identity.createdLabel}
      callSummary={callSummary}
      summaryMissing={summaryMissing}
      customerName={customerName}
      jobTitle={displayJobTitle}
      jobStatus={jobStatus}
      jobLink={jobLink}
      quoteLabel={displayQuoteLabel}
      quoteLink={quoteLink}
      quoteStatus={callScriptQuoteCandidate?.status ?? null}
      openMessagesHref={manualMessagesHref}
      mainStatusLabel={callSessionCopy.statusStrip.labels.status}
      mainStatusValue={mainStatusValue}
      statusBadgeLabel={statusBadgeLabel}
      statusChips={statusChips}
      callStatusDetails={callStatusDetails}
      automatedModel={automatedCallControlModel}
      manualModel={manualCallControlModel}
      unselectedModel={unselectedCallControlModel}
      automatedPanels={automatedWorkspacePanels}
      manualPanels={manualWorkspacePanels}
      automatedEligible={canStartAutomatedCall}
      manualEligible={canStartGuidedCall}
      automatedDisabledReason={automatedDisabledReason}
      manualDisabledReason={manualDisabledReason}
      manualFallbackNode={manualFallbackNode}
      showInProgressBanner={!automatedDialSnapshot.isTerminal}
      showOutcomeRequiredBanner={showOutcomeRequiredBanner}
      callOutcomePanel={wrapUpOutcomeSection}
      callFollowUpPanel={wrapUpAfterCallSection}
      callEnrichmentPanel={wrapUpEnrichmentSection}
      summaryHint={
        shouldSkipFollowup ? "No further follow-up recommended based on this outcome." : null
      }
    />
  );
}
