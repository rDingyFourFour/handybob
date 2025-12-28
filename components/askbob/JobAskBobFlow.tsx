"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel, { type MaterialsSummaryContext } from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import AskBobSchedulerPanel from "@/components/askbob/AskBobSchedulerPanel";
import AskBobCallAssistPanel from "@/components/askbob/AskBobCallAssistPanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobPanel, { type JobDiagnosisContext } from "@/components/askbob/JobAskBobPanel";
import JobAskBobAfterCallPanel from "@/components/askbob/JobAskBobAfterCallPanel";
import JobAskBobContainer from "@/components/askbob/JobAskBobContainer";
import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";
import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import AskBobStepReadinessBadge, {
  type AskBobStepReadiness,
} from "@/components/askbob/AskBobStepReadinessBadge";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  formatLatestCallOutcomeHint,
  formatLatestCallOutcomeReference,
  type LatestCallOutcomeForJob,
} from "@/lib/domain/calls/latestCallOutcome";
import type { CallAutomatedDialSnapshot } from "@/lib/domain/calls/sessions";
import {
  adaptAskBobMaterialsToSmartQuote,
  summarizeMaterialsSuggestion,
} from "@/lib/domain/quotes/materials-askbob-adapter";
import type {
  AskBobAfterCallSnapshotPayload,
  AskBobCallIntent,
  AskBobCallPersonaStyle,
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobJobFollowupResult,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
} from "@/lib/domain/askbob/types";
import { ASKBOB_CALL_PERSONA_DEFAULT, ASKBOB_CALL_PERSONA_LABELS } from "@/lib/domain/askbob/types";
import {
  AfterCallCacheReadReason,
  readAndClearAskBobAfterCallResult,
} from "@/utils/askbob/afterCallCache";
import {
  buildDiagnosisSummary,
  buildFollowupSummaryFromSnapshot,
  buildQuoteSummaryFromSnapshot,
} from "@/lib/domain/askbob/summary";
import {
  parsePublicBookingHandoffSignal,
  PUBLIC_BOOKING_HANDOFF_SESSION_KEY,
} from "@/lib/domain/publicBookingHandoff";

const MAX_SCRIPT_QUERY_LENGTH = 4000;
const PUBLIC_BOOKING_HANDOFF_MAX_AGE_MS = 15 * 60 * 1000;

const AFTER_CALL_HYDRATION_HINT =
  "AskBob couldn’t restore the last after-call draft. Generate a new summary to continue.";

const FOLLOWUP_CALL_INTENT_HINTS: { pattern: RegExp; intents: AskBobCallIntent[] }[] = [
  {
    pattern: /quote|decision|approval|proposal|estimate|scope/i,
    intents: ["quote_followup"],
  },
  {
    pattern: /invoice|payment|bill|balance|recover/i,
    intents: ["invoice_followup"],
  },
  {
    pattern: /schedule|visit|appointment|book|resched|confirm/i,
    intents: ["schedule_visit"],
  },
  {
    pattern: /intake|details|intro|new customer|diagnos/i,
    intents: ["intake_information"],
  },
  {
    pattern: /check[- ]?in|update|touch[- ]?base|relationship|follow[- ]?up/i,
    intents: ["general_checkin"],
  },
];

function mapFollowupCallPurposeToCallIntents(callPurpose?: string | null): AskBobCallIntent[] {
  if (!callPurpose?.trim()) {
    return ["general_checkin"];
  }
  const normalized = callPurpose.trim();
  const matchedIntents = new Set<AskBobCallIntent>();
  for (const hint of FOLLOWUP_CALL_INTENT_HINTS) {
    if (hint.pattern.test(normalized)) {
      hint.intents.forEach((intent) => matchedIntents.add(intent));
    }
  }
  if (!matchedIntents.size) {
    return ["general_checkin"];
  }
  return Array.from(matchedIntents);
}

export function buildAskBobCallAssistUrl(params: {
  jobId: string;
  customerId?: string | null;
  origin: string;
  scriptBody: string;
  scriptSummary?: string | null;
}) {
  const { jobId, customerId, origin, scriptBody, scriptSummary } = params;
  const scriptValue = scriptBody.trim().slice(0, MAX_SCRIPT_QUERY_LENGTH);
  const query = new URLSearchParams();
  query.set("jobId", jobId);
  if (customerId) {
    query.set("customerId", customerId);
  }
  query.set("origin", origin);
  if (scriptValue) {
    query.set("scriptBody", scriptValue);
  }
  if (scriptSummary) {
    query.set("scriptSummary", scriptSummary);
  }
  return `/calls/new?${query.toString()}`;
}

type JobAskBobFlowProps = {
  workspaceId: string;
  jobId: string;
  userId: string;
  customerId?: string | null;
  customerDisplayName?: string | null;
  customerPhoneNumber?: string | null;
  jobDescription?: string | null;
  jobTitle?: string | null;
  jobStatus?: string | null;
  askBobLastTaskLabel?: string | null;
  askBobLastUsedAtDisplay?: string | null;
  askBobLastUsedAtIso?: string | null;
  askBobRunsSummary?: string | null;
  initialLastQuoteId?: string | null;
  lastQuoteCreatedAt?: string | null;
  lastQuoteCreatedAtFriendly?: string | null;
  initialDiagnoseSnapshot?: AskBobDiagnoseSnapshotPayload | null;
  initialMaterialsSnapshot?: AskBobMaterialsSnapshotPayload | null;
  initialQuoteSnapshot?: AskBobQuoteSnapshotPayload | null;
  initialFollowupSnapshot?: AskBobFollowupSnapshotPayload | null;
  initialAfterCallSnapshot?: AskBobAfterCallSnapshotPayload | null;
  lastQuoteSummary?: string | null;
  latestCallLabel?: string | null;
  hasLatestCall?: boolean;
  callHistoryHint?: string | null;
  latestCallOutcome?: LatestCallOutcomeForJob | null;
  callSessionLatestCallOutcome?: LatestCallOutcomeForJob | null;
  afterCallCacheKey?: string | null;
  afterCallCacheCallId?: string | null;
  forcedAfterCallCallId?: string | null;
  forcedAfterCallHasTranscript?: boolean;
  automatedDialSnapshot?: CallAutomatedDialSnapshot | null;
};

type SessionQuote = {
  quoteId: string;
  createdAtIso: string | null;
  friendlyLabel: string | null;
};

export default function JobAskBobFlow({
  workspaceId,
  jobId,
  userId,
  customerId,
  customerDisplayName,
  customerPhoneNumber,
  jobDescription,
  jobTitle,
  jobStatus,
  askBobLastTaskLabel,
  askBobLastUsedAtDisplay,
  askBobLastUsedAtIso,
  askBobRunsSummary,
  initialLastQuoteId,
  lastQuoteCreatedAt,
  lastQuoteCreatedAtFriendly,
  initialDiagnoseSnapshot,
  initialMaterialsSnapshot,
  initialQuoteSnapshot,
  initialFollowupSnapshot,
  initialAfterCallSnapshot,
  lastQuoteSummary,
  latestCallLabel,
  hasLatestCall,
  callHistoryHint,
  latestCallOutcome,
  callSessionLatestCallOutcome,
  afterCallCacheKey,
  afterCallCacheCallId,
  forcedAfterCallCallId,
  forcedAfterCallHasTranscript,
  automatedDialSnapshot,
}: JobAskBobFlowProps) {
  const diagnosisSummaryInitialValue = initialDiagnoseSnapshot
    ? buildDiagnosisSummary(initialDiagnoseSnapshot.response)
    : null;
  const materialsSuggestionInitialValue = initialMaterialsSnapshot
    ? adaptAskBobMaterialsToSmartQuote({
        items: initialMaterialsSnapshot.items,
        notes: initialMaterialsSnapshot.notes ?? null,
        modelLatencyMs: 0,
        rawModelOutput: null,
      })
    : null;
  const materialsSummaryInitialValue = materialsSuggestionInitialValue
    ? summarizeMaterialsSuggestion(materialsSuggestionInitialValue)
    : null;

  const [diagnosisSummary, setDiagnosisSummary] = useState<string | null>(
    diagnosisSummaryInitialValue,
  );
  const [diagnosisDone, setDiagnosisDone] = useState(false);
  const [materialsSummary, setMaterialsSummary] = useState<string | null>(
    materialsSummaryInitialValue ?? null,
  );
  const [materialsDone, setMaterialsDone] = useState(false);
  const [sessionQuote, setSessionQuote] = useState<SessionQuote | null>(null);
  const followupSummaryInitialValue = buildFollowupSummaryFromSnapshot(initialFollowupSnapshot);
  const quoteSummaryInitialValue = buildQuoteSummaryFromSnapshot(initialQuoteSnapshot ?? null);

  const [followupSummary, setFollowupSummary] = useState<string | null>(followupSummaryInitialValue);
  const [quoteSummary, setQuoteSummary] = useState<string | null>(quoteSummaryInitialValue);
  const [followupCallRecommended, setFollowupCallRecommended] = useState(
    Boolean(initialFollowupSnapshot?.callRecommended),
  );
  const [followupCallPurpose, setFollowupCallPurpose] = useState(
    initialFollowupSnapshot?.callPurpose ?? null,
  );
  const [followupCallTone, setFollowupCallTone] = useState(
    initialFollowupSnapshot?.callTone ?? null,
  );
  const [callScriptSummary, setCallScriptSummary] = useState<string | null>(null);
  const [callScriptPersona, setCallScriptPersona] = useState<AskBobCallPersonaStyle | null>(null);
  const [
    callScriptFollowupCallIntents,
    setCallScriptFollowupCallIntents,
  ] = useState<AskBobCallIntent[] | null>(null);
  const [
    callScriptFollowupCallIntentsToken,
    setCallScriptFollowupCallIntentsToken,
  ] = useState(0);
  const [diagnoseCollapsed, setDiagnoseCollapsed] = useState(false);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(false);
  const [quoteCollapsed, setQuoteCollapsed] = useState(false);
  const [followupCollapsed, setFollowupCollapsed] = useState(false);
  const [hasAutoCollapsedAllSteps, setHasAutoCollapsedAllSteps] = useState(false);
  const [followupDone, setFollowupDone] = useState(false);
  const [materialsResetToken, setMaterialsResetToken] = useState(0);
  const [quoteResetToken, setQuoteResetToken] = useState(0);
  const [followupResetToken, setFollowupResetToken] = useState(0);
  const [sessionAskBobAppointment, setSessionAskBobAppointment] = useState<{
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  } | null>(null);
  const [schedulerDone, setSchedulerDone] = useState(false);
  const [schedulerCollapsed, setSchedulerCollapsed] = useState(false);
  const [callScriptCollapsed, setCallScriptCollapsed] = useState(false);
  const [callScriptResetToken, setCallScriptResetToken] = useState(0);
  const [schedulerResetToken, setSchedulerResetToken] = useState(0);
  const [afterCallCollapsed, setAfterCallCollapsed] = useState(false);
  const [afterCallResetToken, setAfterCallResetToken] = useState(0);
  const automatedCallNotesForFollowup = null;
  const [hydratedAfterCallSnapshot, setHydratedAfterCallSnapshot] =
    useState<AskBobAfterCallSnapshotPayload | null>(null);
  const [afterCallHydrationHint, setAfterCallHydrationHint] = useState<string | null>(null);
  const afterCallCacheAttemptedRef = useRef(false);
  const afterCallHydrationEventSentRef = useRef(false);
  const afterCallCacheKeyRef = useRef(afterCallCacheKey);
  const afterCallCacheCallIdRef = useRef(afterCallCacheCallId);
  const [callSessionSnapshotMeta, setCallSessionSnapshotMeta] = useState<{
    workspaceId: string;
    jobId: string;
    callId: string | null;
  } | null>(null);
  const afterCallOverrideLoggedRef = useRef(false);
  const callSessionDraftLoggedRef = useRef(false);
  const previousJobContextRef = useRef({ jobId, workspaceId });
  const previousForcedAfterCallCallIdRef = useRef(forcedAfterCallCallId ?? null);
  const handoffCheckedJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    const previousContext = previousJobContextRef.current;
    if (previousContext.jobId !== jobId || previousContext.workspaceId !== workspaceId) {
      afterCallOverrideLoggedRef.current = false;
      callSessionDraftLoggedRef.current = false;
      afterCallHydrationEventSentRef.current = false;
      afterCallCacheAttemptedRef.current = false;
      startTransition(() => {
        setHydratedAfterCallSnapshot(null);
        setAfterCallHydrationHint(null);
        setCallSessionSnapshotMeta(null);
      });
    }
    previousJobContextRef.current = { jobId, workspaceId };
  }, [jobId, workspaceId]);

  useEffect(() => {
    afterCallCacheKeyRef.current = afterCallCacheKey;
    afterCallCacheCallIdRef.current = afterCallCacheCallId;
  }, [afterCallCacheCallId, afterCallCacheKey]);

  useEffect(() => {
    afterCallCacheAttemptedRef.current = false;
    afterCallHydrationEventSentRef.current = false;
  }, [afterCallCacheKey, afterCallCacheCallId, jobId, workspaceId, forcedAfterCallCallId]);

  useEffect(() => {
    const previousCallId = previousForcedAfterCallCallIdRef.current;
    const nextCallId = forcedAfterCallCallId ?? null;
    if (previousCallId !== nextCallId) {
      startTransition(() => {
        setHydratedAfterCallSnapshot(null);
        setAfterCallHydrationHint(null);
        setCallSessionSnapshotMeta(null);
      });
      callSessionDraftLoggedRef.current = false;
      afterCallHydrationEventSentRef.current = false;
      afterCallCacheAttemptedRef.current = false;
    }
    previousForcedAfterCallCallIdRef.current = nextCallId;
  }, [forcedAfterCallCallId]);
  useEffect(() => {
    if (afterCallCacheAttemptedRef.current) {
      return;
    }
    afterCallCacheAttemptedRef.current = true;
    const cacheKey = afterCallCacheKeyRef.current;
    const cacheCallId = afterCallCacheCallIdRef.current;
    if (!cacheKey) {
      return;
    }
    if (initialAfterCallSnapshot) {
      console.log("[askbob-after-call-job-hydrate-miss]", {
        jobId,
        callId: cacheCallId ?? null,
        cacheKey,
        reason: "snapshot_present",
      });
      return;
    }
    const sendHydrationEvent = (
      outcome: "hit" | "miss",
      missReason?: AfterCallCacheReadReason,
    ) => {
      if (afterCallHydrationEventSentRef.current) {
        return;
      }
      afterCallHydrationEventSentRef.current = true;
      const payload: Record<string, unknown> & {
        workspaceId: string;
        jobId: string;
        hasAfterCallKey: boolean;
        hasCallId: boolean;
        outcome: "hit" | "miss";
        missReason?: AfterCallCacheReadReason;
      } = {
        workspaceId,
        jobId,
        hasAfterCallKey: Boolean(cacheKey),
        hasCallId: Boolean(cacheCallId),
        outcome,
      };
      if (outcome === "miss") {
        payload.missReason = missReason ?? "no_cache_entry";
      }
      console.log("[askbob-after-call-job-hydrate]", payload);
    };
    const { payload, reason } = readAndClearAskBobAfterCallResult(cacheKey);
    if (!payload) {
      startTransition(() => {
        setAfterCallHydrationHint(AFTER_CALL_HYDRATION_HINT);
      });
      sendHydrationEvent("miss", reason ?? "no_cache_entry");
      console.log("[askbob-after-call-job-hydrate-miss]", {
        jobId,
        callId: cacheCallId ?? null,
        cacheKey,
        reason: reason ?? "not_found",
      });
      return;
    }
    if (
      payload.jobId !== jobId ||
      (afterCallCacheCallId && payload.callId !== afterCallCacheCallId)
    ) {
      startTransition(() => {
        setAfterCallHydrationHint(AFTER_CALL_HYDRATION_HINT);
      });
      sendHydrationEvent("miss", "wrong_shape");
      console.log("[askbob-after-call-job-hydrate-miss]", {
        jobId,
        callId: cacheCallId ?? null,
        cacheKey,
        reason: "mismatch",
      });
      return;
    }
    sendHydrationEvent("hit");
    const logPayload = {
      jobId,
      callId: payload.callId,
      cacheKey,
    };
    const snapshotMeta = {
      workspaceId,
      jobId,
      callId: payload.callId ?? null,
    };
    startTransition(() => {
      setAfterCallHydrationHint(null);
      setHydratedAfterCallSnapshot(payload.result);
      setCallSessionSnapshotMeta(snapshotMeta);
      console.log("[askbob-after-call-job-hydrate-hit]", logPayload);
    });
  }, [
    afterCallCacheCallId,
    afterCallCacheKey,
    initialAfterCallSnapshot,
    jobId,
    workspaceId,
    forcedAfterCallCallId,
  ]);
  useEffect(() => {
    if (!forcedAfterCallCallId || afterCallOverrideLoggedRef.current) {
      return;
    }
    console.log("[askbob-after-call-session-override-detected]", {
      callId: forcedAfterCallCallId,
      jobId,
      workspaceId,
    });
    afterCallOverrideLoggedRef.current = true;
  }, [forcedAfterCallCallId, jobId, workspaceId]);
  const callSessionSnapshot =
    forcedAfterCallCallId &&
    hydratedAfterCallSnapshot &&
    callSessionSnapshotMeta &&
    callSessionSnapshotMeta.workspaceId === workspaceId &&
    callSessionSnapshotMeta.jobId === jobId &&
    callSessionSnapshotMeta.callId === forcedAfterCallCallId
      ? hydratedAfterCallSnapshot
      : null;
  useEffect(() => {
    if (!callSessionSnapshot || callSessionDraftLoggedRef.current) {
      return;
    }
    console.log("[askbob-after-call-draft-source-call-session]", {
      callId: forcedAfterCallCallId,
      jobId,
    });
    callSessionDraftLoggedRef.current = true;
  }, [callSessionSnapshot, forcedAfterCallCallId, jobId]);
  const resolvedAfterCallSnapshot =
    callSessionSnapshot ?? initialAfterCallSnapshot ?? hydratedAfterCallSnapshot ?? null;
  const resolvedLatestCallOutcome =
    callSessionLatestCallOutcome ?? latestCallOutcome ?? null;
  const resolvedPreviousCallOutcome =
    callSessionLatestCallOutcome && latestCallOutcome ? latestCallOutcome : null;
  const latestCallOutcomeHint = resolvedLatestCallOutcome
    ? formatLatestCallOutcomeHint(resolvedLatestCallOutcome)
    : null;
  const latestCallOutcomeReference = resolvedLatestCallOutcome
    ? resolvedLatestCallOutcome.displayLabel ??
      formatLatestCallOutcomeReference(resolvedLatestCallOutcome)
    : null;

  const serverQuoteCandidate = initialLastQuoteId
    ? {
        quoteId: initialLastQuoteId,
        createdAtIso: lastQuoteCreatedAt ?? null,
        friendlyLabel: lastQuoteCreatedAtFriendly?.trim() ? lastQuoteCreatedAtFriendly : null,
      }
    : null;
  const effectiveLastQuote = sessionQuote ?? serverQuoteCandidate;
  const hasQuoteSnapshotContext = Boolean(initialQuoteSnapshot);
  const combinedHasQuoteContextForFollowup =
    Boolean(effectiveLastQuote?.quoteId) || hasQuoteSnapshotContext;
  const quoteDone = Boolean(sessionQuote);
  const callScriptDone = Boolean(callScriptSummary);
  const callScriptBaseLabel = "Step 7 Prepare a phone call with AskBob";
  const callScriptHint =
    callScriptDone &&
    callScriptPersona &&
    callScriptPersona !== ASKBOB_CALL_PERSONA_DEFAULT
      ? `Call script ready (${ASKBOB_CALL_PERSONA_LABELS[callScriptPersona]})`
      : null;
  const callScriptStepLabel = callScriptHint
    ? `${callScriptBaseLabel} · ${callScriptHint}`
    : callScriptBaseLabel;
  const afterCallDone = Boolean(resolvedAfterCallSnapshot?.afterCallSummary);

  const promptSeed = jobDescription ?? "";
  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const leadLogRef = useRef(false);
  const normalizedJobStatus = jobStatus?.trim().toLowerCase() ?? "";
  const router = useRouter();
  const hasJobBasics = Boolean(normalizedJobTitle || normalizedJobDescription);
  const hasCustomerPhone = Boolean(customerPhoneNumber?.trim());
  const callSessionId =
    forcedAfterCallCallId ??
    automatedDialSnapshot?.callId ??
    afterCallCacheCallId ??
    resolvedLatestCallOutcome?.callId ??
    null;
  const callSessionActiveOrTerminal = Boolean(
    automatedDialSnapshot?.isInProgress ||
      automatedDialSnapshot?.isTerminal ||
      forcedAfterCallCallId,
  );
  const isForcedCallSession = Boolean(forcedAfterCallCallId);
  const [openCallSessionState, setOpenCallSessionState] = useState<{
    status: "idle" | "loading" | "error";
    message: string | null;
  }>({ status: "idle", message: null });
  const stepReadiness: Record<string, AskBobStepReadiness> = {
    intake: {
      isReady: hasJobBasics,
      blockingReason: hasJobBasics ? null : "Add a job title or description first.",
    },
    diagnose: {
      isReady: hasJobBasics,
      blockingReason: hasJobBasics ? null : "Add a job title or description first.",
    },
    materials: {
      isReady: Boolean(diagnosisSummary?.trim()),
      blockingReason: diagnosisSummary?.trim() ? null : "Run Diagnose first.",
    },
    quote: {
      isReady: Boolean(diagnosisSummary?.trim()),
      blockingReason: diagnosisSummary?.trim() ? null : "Run Diagnose first.",
      hint: materialsSummary?.trim() ? null : "Materials checklist improves the quote.",
    },
    followup: {
      isReady: Boolean(
        diagnosisSummary?.trim() ||
          materialsSummary?.trim() ||
          combinedHasQuoteContextForFollowup,
      ),
      blockingReason: "Generate diagnosis, materials, or a quote first.",
    },
    scheduler: {
      isReady: true,
      blockingReason: null,
    },
    callAssist: {
      isReady: hasCustomerPhone,
      blockingReason: hasCustomerPhone ? null : "Add a customer phone number first.",
    },
    afterCall: {
      isReady: true,
      blockingReason: null,
    },
  };
  const stepStatusItems = [
    { label: "Step 1 Intake", done: true },
    { label: "Step 2 Diagnose", done: diagnosisDone },
    { label: "Step 3 Materials checklist", done: materialsDone },
    { label: "Step 4 Quote suggestion", done: quoteDone },
    { label: "Step 5 Follow-up guidance", done: followupDone },
    { label: "Step 6 Schedule visit", done: schedulerDone },
    { label: callScriptStepLabel, done: callScriptDone },
    {
      label: isForcedCallSession
        ? "Step 8 · After the call summary"
        : "Step 8 · Manual after-call (job-only)",
      done: afterCallDone,
    },
  ];
  const jobPipelineNextAction = (() => {
    if (!stepReadiness.intake.isReady) {
      return "Add a job title or description to start Step 1.";
    }
    if (!diagnosisSummary?.trim()) {
      return "Run Diagnose to capture the job summary.";
    }
    if (!materialsSummary?.trim()) {
      return "Generate a materials checklist next.";
    }
    if (!quoteDone && !hasQuoteSnapshotContext) {
      return "Draft a quote for the job scope.";
    }
    return "Job pipeline complete. Move to the calling pipeline when ready.";
  })();
  const callingPipelineNextAction = callSessionActiveOrTerminal && callSessionId
    ? "Open the call session to choose how to place the call."
    : "Open a call session to choose automated or manual guided calling.";
  const handleOpenCallSessionClick = async () => {
    console.log("[jobs-open-call-session-click]", {
      workspaceId,
      jobId,
    });
    setOpenCallSessionState({ status: "loading", message: null });
    const result = await openOrCreateCallSessionForJobAction({ jobId });
    if (!result.ok) {
      console.log("[jobs-open-call-session-result]", {
        workspaceId,
        jobId,
        code: result.code,
      });
      setOpenCallSessionState({ status: "error", message: result.message });
      return;
    }
    console.log("[job-detail-open-call-session-click]", {
      workspaceId,
      jobId,
      callId: result.callId,
      createdNew: result.createdNew,
    });
    console.log("[jobs-open-call-session-result]", {
      workspaceId,
      jobId,
    });
    setOpenCallSessionState({ status: "idle", message: null });
    router.push(`/calls/${result.callId}`);
  };
  const handleToggleStep = (
    stepKey: keyof typeof stepReadiness,
    isCollapsed: boolean,
    setCollapsed: (value: boolean) => void,
  ) => {
    const readiness = stepReadiness[stepKey];
    if (!readiness?.isReady && isCollapsed) {
      console.log("[askbob-job-step-blocked]", {
        workspaceId,
        jobId,
        step: stepKey,
        reason: readiness.blockingReason ?? "not_ready",
      });
      return;
    }
    setCollapsed(!isCollapsed);
  };

  useEffect(() => {
    if (leadLogRef.current) {
      return;
    }
    if (normalizedJobStatus !== "lead") {
      return;
    }
    leadLogRef.current = true;
    console.log("[askbob-lead-job-flow-mounted]", {
      workspaceId,
      jobId,
      hasJobTitle: Boolean(normalizedJobTitle),
      hasJobDescription: Boolean(jobDescription?.trim()),
    });
  }, [jobDescription, jobId, normalizedJobStatus, normalizedJobTitle, workspaceId]);

  const scrollToSection = useCallback((sectionId: string) => {
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById(sectionId);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (handoffCheckedJobIdRef.current === jobId) {
      return;
    }
    handoffCheckedJobIdRef.current = jobId;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      console.warn("[public-booking-owner-handoff-askbob-autostart-ignored]", {
        jobId,
        reason: "storage_unavailable",
        diagnostics: reason,
      });
      return;
    }
    if (!raw) {
      return;
    }
    const parsed = parsePublicBookingHandoffSignal(raw);
    if (!parsed) {
      console.log("[public-booking-owner-handoff-askbob-autostart-ignored]", {
        jobId,
        reason: "parse_failed",
      });
      return;
    }
    const ageMs = Date.now() - parsed.createdAt;
    if (parsed.jobId !== jobId) {
      console.log("[public-booking-owner-handoff-askbob-autostart-ignored]", {
        jobId,
        desiredStep: parsed.desiredStep,
        ageMs,
        reason: "wrong_job",
      });
      return;
    }
    if (parsed.desiredStep !== 1) {
      console.log("[public-booking-owner-handoff-askbob-autostart-ignored]", {
        jobId,
        desiredStep: parsed.desiredStep,
        ageMs,
        reason: "wrong_step",
      });
      return;
    }
    if (ageMs < 0 || ageMs > PUBLIC_BOOKING_HANDOFF_MAX_AGE_MS) {
      console.log("[public-booking-owner-handoff-askbob-autostart-ignored]", {
        jobId,
        desiredStep: parsed.desiredStep,
        ageMs,
        reason: "stale",
      });
      return;
    }
    console.log("[public-booking-owner-handoff-askbob-autostart-detected]", {
      jobId,
      desiredStep: parsed.desiredStep,
      ageMs,
    });
    Promise.resolve().then(() => {
      setDiagnoseCollapsed(false);
      scrollToSection("askbob-diagnose");
      try {
        window.sessionStorage.removeItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown";
        console.warn("[public-booking-owner-handoff-askbob-autostart-clear-failure]", {
          jobId,
          reason,
        });
      }
      console.log("[public-booking-owner-handoff-askbob-autostart-applied]", {
        jobId,
      });
    });
  }, [jobId, scrollToSection]);

  const handleDiagnoseComplete = (context: JobDiagnosisContext) => {
    const summary = context.diagnosisSummary?.trim() ?? null;
    setDiagnosisSummary(summary);
    setDiagnosisDone(Boolean(summary));
    setMaterialsSummary(null);
    setMaterialsDone(false);
    setSessionQuote(null);
    setFollowupDone(false);
    setMaterialsResetToken((value) => value + 1);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
  };

  const handleMaterialsSummaryChange = (context: MaterialsSummaryContext) => {
    const summary = context.materialsSummary?.trim() ?? null;
    setMaterialsSummary(summary);
    setMaterialsDone(Boolean(summary));
    setSessionQuote(null);
    setFollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    if (!summary) {
      setMaterialsResetToken((value) => value + 1);
    }
    handleSchedulerReset();
  };

  const handleAskBobQuoteApplied = (quoteId: string, createdAt?: string | null) => {
    const normalizedCreatedAt = createdAt?.trim() || new Date().toISOString();
    const friendlyDate = formatFriendlyDateTime(normalizedCreatedAt, "");
    const friendlyLabel = friendlyDate?.trim() ? friendlyDate : null;
    setSessionQuote({
      quoteId,
      createdAtIso: normalizedCreatedAt,
      friendlyLabel,
    });
    setFollowupDone(false);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
    const quoteSummaryText = friendlyLabel ? `Latest quote from ${friendlyLabel}.` : null;
    setQuoteSummary(quoteSummaryText);
  };

  const handleQuoteReset = () => {
    setSessionQuote(null);
    setFollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
    setQuoteSummary(quoteSummaryInitialValue);
  };

  const handleFollowupCompleted = () => {
    setFollowupDone(true);
    maybeAutoCollapseSteps();
  };

  const handleAfterCallSummaryChange = (summary: string | null) => {
    const normalized = summary?.trim() ?? null;
    if (normalized) {
      maybeAutoCollapseSteps();
    }
  };

  const handleFollowupResult = useCallback(
    (result: AskBobJobFollowupResult | null) => {
      if (!result) {
        setFollowupCallRecommended(false);
        setFollowupCallPurpose(null);
        setFollowupCallTone(null);
        return;
      }
      setFollowupCallRecommended(Boolean(result.callRecommended));
      setFollowupCallPurpose(result.callPurpose ?? null);
      setFollowupCallTone(result.callTone ?? null);
    },
    [],
  );

  const resetCallScriptState = () => {
    setCallScriptSummary(null);
    setCallScriptCollapsed(false);
    setCallScriptPersona(null);
    setCallScriptResetToken((value) => value + 1);
  };

  const handleSchedulerReset = () => {
    setSchedulerDone(false);
    setSchedulerCollapsed(false);
    setSessionAskBobAppointment(null);
    setSchedulerResetToken((value) => value + 1);
    resetCallScriptState();
  };

  const maybeAutoCollapseSteps = () => {
    if (
      hasAutoCollapsedAllSteps ||
      !diagnosisDone ||
      !materialsDone ||
      !quoteDone ||
      !followupDone ||
      !schedulerDone ||
      !callScriptDone ||
      !afterCallDone
    ) {
      return;
    }
    setDiagnoseCollapsed(true);
    setMaterialsCollapsed(true);
    setQuoteCollapsed(true);
    setFollowupCollapsed(true);
    setSchedulerCollapsed(true);
    setCallScriptCollapsed(true);
    setHasAutoCollapsedAllSteps(true);
  };

  const handleFollowupReset = () => {
    handleFollowupResult(null);
    setFollowupDone(false);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
  };

  const handleAfterCallReset = () => {
    setAfterCallResetToken((value) => value + 1);
    setAfterCallCollapsed(false);
  };

  const handleJumpToCallAssist = () => {
    console.log("[askbob-followup-to-call-assist-flow]", {
      workspaceId,
      userId,
      jobId,
      hasCallRecommendation: followupCallRecommended,
    });
    const trimmedFollowupCallPurpose = followupCallPurpose?.trim() ?? null;
    if (trimmedFollowupCallPurpose) {
      const mappedIntents = mapFollowupCallPurposeToCallIntents(trimmedFollowupCallPurpose);
      if (mappedIntents.length) {
        setCallScriptFollowupCallIntents(mappedIntents);
        setCallScriptFollowupCallIntentsToken((value) => value + 1);
      }
    }
    setCallScriptCollapsed(false);
    scrollToSection("askbob-call-script");
  };

  const handleAskBobAppointmentScheduled = (info: {
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  }) => {
    setSessionAskBobAppointment(info);
    setSchedulerDone(true);
    maybeAutoCollapseSteps();
  };

  return (
    <div className="space-y-6">
      <JobAskBobContainer
        askBobLastTaskLabel={askBobLastTaskLabel}
        askBobLastUsedAtDisplay={askBobLastUsedAtDisplay}
        askBobLastUsedAtIso={askBobLastUsedAtIso}
        askBobRunsSummary={askBobRunsSummary}
        stepStatusItems={stepStatusItems}
      />
      <div className="space-y-8">
        <div data-testid="askbob-job-pipeline" className="space-y-4">
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job pipeline</p>
              <p className="text-sm text-slate-300">
                Work through the job details, diagnosis, materials, and quote before you move into calling.
              </p>
            </div>
            <div className="space-y-1 text-xs text-slate-300">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Next best action</p>
              <p className="text-sm text-slate-200">{jobPipelineNextAction}</p>
            </div>
          </div>
          <AskBobSection id="askbob-intake">
            <HbCard className="space-y-2" data-testid="askbob-step-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h2 className="hb-heading-3 text-xl font-semibold">Step 1 · Intake basics</h2>
                  </div>
                  <AskBobStepReadinessBadge readiness={stepReadiness.intake} />
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Add a job title or description so AskBob can anchor every downstream step.
              </p>
            </HbCard>
          </AskBobSection>
          <AskBobSection id="askbob-diagnose">
            <JobAskBobPanel
              workspaceId={workspaceId}
              jobId={jobId}
              customerId={customerId ?? undefined}
              jobDescription={promptSeed}
              jobTitle={normalizedJobTitle}
              initialDiagnoseSnapshot={initialDiagnoseSnapshot ?? undefined}
              onDiagnoseSuccess={() => scrollToSection("askbob-materials")}
              onDiagnoseComplete={handleDiagnoseComplete}
              stepCompleted={diagnosisDone}
              stepCollapsed={diagnoseCollapsed}
              onToggleStepCollapsed={() =>
                handleToggleStep("diagnose", diagnoseCollapsed, setDiagnoseCollapsed)
              }
              stepReadiness={stepReadiness.diagnose}
            />
          </AskBobSection>
          <AskBobSection id="askbob-materials">
            <AskBobMaterialsPanel
              workspaceId={workspaceId}
              jobId={jobId}
              customerId={customerId ?? null}
              onMaterialsSuccess={() => scrollToSection("askbob-quote")}
              diagnosisSummaryForMaterials={diagnosisSummary}
              onMaterialsSummaryChange={handleMaterialsSummaryChange}
              jobDescription={jobDescription ?? null}
              jobTitle={normalizedJobTitle}
              initialMaterialsSnapshot={initialMaterialsSnapshot ?? undefined}
              stepCompleted={materialsDone}
              resetToken={materialsResetToken}
              stepCollapsed={materialsCollapsed}
              onToggleStepCollapsed={() =>
                handleToggleStep("materials", materialsCollapsed, setMaterialsCollapsed)
              }
              stepReadiness={stepReadiness.materials}
            />
          </AskBobSection>
          <AskBobSection id="askbob-quote">
            <AskBobQuotePanel
              workspaceId={workspaceId}
              jobId={jobId}
              customerId={customerId ?? null}
              onQuoteSuccess={() => scrollToSection("askbob-followup")}
              diagnosisSummaryForQuote={diagnosisSummary}
              materialsSummaryForQuote={materialsSummary}
              jobDescription={jobDescription ?? null}
              jobTitle={normalizedJobTitle}
              onQuoteApplied={handleAskBobQuoteApplied}
              onScrollToFollowup={() => scrollToSection("askbob-followup")}
              stepCompleted={quoteDone}
              resetToken={quoteResetToken}
              onQuoteReset={handleQuoteReset}
              stepCollapsed={quoteCollapsed}
              onToggleStepCollapsed={() =>
                handleToggleStep("quote", quoteCollapsed, setQuoteCollapsed)
              }
              initialQuoteSnapshot={initialQuoteSnapshot ?? undefined}
              stepReadiness={stepReadiness.quote}
            />
          </AskBobSection>
        </div>
        <div data-testid="askbob-calling-pipeline" className="space-y-4">
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calling pipeline</p>
                <p className="text-sm text-slate-300">
                  Use these steps when you want to script, run, or summarize a call from this job.
                </p>
              </div>
              <HbButton
                type="button"
                size="sm"
                variant="secondary"
                className="px-3"
                onClick={handleOpenCallSessionClick}
                disabled={openCallSessionState.status === "loading"}
              >
                {openCallSessionState.status === "loading"
                  ? "Opening call session..."
                  : "Open call session"}
              </HbButton>
            </div>
            <div className="space-y-1 text-xs text-slate-300">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Next best action</p>
              <p className="text-sm text-slate-200">{callingPipelineNextAction}</p>
            </div>
          {openCallSessionState.status === "error" && openCallSessionState.message && (
            <p className="text-xs text-rose-300">{openCallSessionState.message}</p>
          )}
        </div>
          <AskBobSection id="askbob-followup">
            <JobAskBobFollowupPanel
              workspaceId={workspaceId}
              jobId={jobId}
              userId={userId}
              customerId={customerId ?? null}
              jobTitle={normalizedJobTitle}
              jobDescription={jobDescription ?? null}
              diagnosisSummaryForFollowup={diagnosisSummary}
              materialsSummaryForFollowup={materialsSummary}
              hasQuoteContextForFollowup={combinedHasQuoteContextForFollowup}
              lastQuoteIdForFollowup={effectiveLastQuote?.quoteId ?? undefined}
              lastQuoteCreatedAtForFollowup={effectiveLastQuote?.createdAtIso ?? undefined}
              lastQuoteCreatedAtLabelForFollowup={effectiveLastQuote?.friendlyLabel ?? undefined}
              stepCompleted={followupDone}
              onFollowupCompleted={handleFollowupCompleted}
              resetToken={followupResetToken}
              onReset={handleFollowupReset}
              stepCollapsed={followupCollapsed}
              onToggleStepCollapsed={() =>
                handleToggleStep("followup", followupCollapsed, setFollowupCollapsed)
              }
              initialFollowupSnapshot={initialFollowupSnapshot ?? undefined}
              askBobAppointmentScheduled={sessionAskBobAppointment ?? undefined}
              onAskBobAppointmentScheduled={handleAskBobAppointmentScheduled}
              onFollowupSummaryUpdate={setFollowupSummary}
              onFollowupResult={handleFollowupResult}
              onJumpToCallAssist={handleJumpToCallAssist}
              callHistoryHint={callHistoryHint ?? null}
              latestCallOutcome={resolvedLatestCallOutcome}
              latestCallOutcomeHint={latestCallOutcomeHint}
              stepReadiness={stepReadiness.followup}
            />
          </AskBobSection>
          <AskBobSection id="askbob-scheduler">
            <AskBobSchedulerPanel
              workspaceId={workspaceId}
              jobId={jobId}
              customerId={customerId ?? null}
              jobTitle={normalizedJobTitle}
              jobDescription={jobDescription ?? null}
              diagnosisSummaryForScheduler={diagnosisSummary}
              materialsSummaryForScheduler={materialsSummary}
              quoteSummaryForScheduler={quoteSummary}
              followupSummaryForScheduler={followupSummary}
              stepCompleted={schedulerDone}
              resetToken={schedulerResetToken}
              onReset={handleSchedulerReset}
              stepCollapsed={schedulerCollapsed}
              onToggleStepCollapsed={() =>
                handleToggleStep("scheduler", schedulerCollapsed, setSchedulerCollapsed)
              }
              onAppointmentScheduled={handleAskBobAppointmentScheduled}
              onScrollIntoView={() => scrollToSection("askbob-scheduler")}
              stepReadiness={stepReadiness.scheduler}
            />
          </AskBobSection>
          <AskBobSection id="askbob-call-script">
            <AskBobCallAssistPanel
              stepNumber={7}
              stepCompleted={callScriptDone}
              stepCollapsed={callScriptCollapsed}
              onToggleCollapse={() =>
                handleToggleStep("callAssist", callScriptCollapsed, setCallScriptCollapsed)
              }
              workspaceId={workspaceId}
              userId={userId}
              jobId={jobId}
              customerId={customerId ?? null}
              customerDisplayName={customerDisplayName ?? null}
              customerPhoneNumber={customerPhoneNumber ?? null}
              jobTitle={normalizedJobTitle || null}
              jobDescription={jobDescription ?? null}
              diagnosisSummary={diagnosisSummary}
              materialsSummary={materialsSummary}
              lastQuoteSummary={lastQuoteSummary ?? null}
              followupSummary={followupSummary}
              followupCallRecommended={followupCallRecommended}
              followupCallPurpose={followupCallPurpose}
              followupCallTone={followupCallTone}
              followupCallIntents={callScriptFollowupCallIntents}
              followupCallIntentsToken={callScriptFollowupCallIntentsToken}
              resetToken={callScriptResetToken}
              onCallScriptPersonaChange={setCallScriptPersona}
              callScriptSummary={callScriptSummary}
              onCallScriptSummaryChange={setCallScriptSummary}
              latestCallOutcome={resolvedLatestCallOutcome}
              latestCallOutcomeLabel={latestCallOutcomeReference}
              stepReadiness={stepReadiness.callAssist}
            />
          </AskBobSection>
          <AskBobSection id="askbob-after-call">
            <JobAskBobAfterCallPanel
              workspaceId={workspaceId}
              jobId={jobId}
              jobTitle={normalizedJobTitle}
              jobDescription={jobDescription ?? null}
              latestCallLabel={latestCallLabel ?? null}
              hasCall={Boolean(hasLatestCall ?? latestCallLabel)}
              customerId={customerId ?? null}
              stepCompleted={afterCallDone}
              resetToken={afterCallResetToken}
              onReset={handleAfterCallReset}
              stepCollapsed={afterCallCollapsed}
              onToggleStepCollapsed={() =>
                handleToggleStep("afterCall", afterCallCollapsed, setAfterCallCollapsed)
              }
              initialAfterCallSnapshot={resolvedAfterCallSnapshot ?? undefined}
              onAfterCallSummaryChange={handleAfterCallSummaryChange}
              callHistoryHint={callHistoryHint ?? null}
              latestCallOutcome={resolvedLatestCallOutcome}
              previousCallOutcome={resolvedPreviousCallOutcome}
              afterCallHydrationHint={afterCallHydrationHint}
              automatedCallNotesForFollowup={automatedCallNotesForFollowup}
              forcedAfterCallCallId={forcedAfterCallCallId ?? undefined}
              forcedAfterCallHasTranscript={Boolean(forcedAfterCallHasTranscript)}
              stepReadiness={stepReadiness.afterCall}
            />
          </AskBobSection>
        </div>
      </div>
    </div>
  );
}
