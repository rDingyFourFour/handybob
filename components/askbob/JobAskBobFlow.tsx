"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel, { type MaterialsSummaryContext } from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import AskBobSchedulerPanel from "@/components/askbob/AskBobSchedulerPanel";
import AskBobCallAssistPanel from "@/components/askbob/AskBobCallAssistPanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobPanel, { type JobDiagnosisContext } from "@/components/askbob/JobAskBobPanel";
import JobAskBobContainer from "@/components/askbob/JobAskBobContainer";
import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";
import type { AskBobStepReadiness } from "@/components/askbob/AskBobStepReadinessBadge";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  formatLatestCallOutcomeHint,
  formatLatestCallOutcomeReference,
  type LatestCallOutcomeForJob,
} from "@/lib/domain/calls/latestCallOutcome";
import {
  adaptAskBobMaterialsToSmartQuote,
  summarizeMaterialsSuggestion,
} from "@/lib/domain/quotes/materials-askbob-adapter";
import type {
  AskBobCallIntent,
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobTaskSnapshotVersion,
  FollowUpRecommendation,
  AskBobJobFollowupResult,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
} from "@/lib/domain/askbob/types";
import {
  buildDiagnosisSummary,
  buildFollowupSummaryFromSnapshot,
  buildQuoteSummaryFromSnapshot,
} from "@/lib/domain/askbob/summary";
import {
  parsePublicBookingHandoffSignal,
  PUBLIC_BOOKING_HANDOFF_SESSION_KEY,
} from "@/lib/domain/publicBookingHandoff";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

const MAX_SCRIPT_QUERY_LENGTH = 4000;
const PUBLIC_BOOKING_HANDOFF_MAX_AGE_MS = 15 * 60 * 1000;

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
  diagnoseSnapshotHistory?: AskBobTaskSnapshotVersion<AskBobDiagnoseSnapshotPayload>[];
  materialsSnapshotHistory?: AskBobTaskSnapshotVersion<AskBobMaterialsSnapshotPayload>[];
  quoteSnapshotHistory?: AskBobTaskSnapshotVersion<AskBobQuoteSnapshotPayload>[];
  diagnoseLatestSnapshotVersion?: AskBobTaskSnapshotVersion<AskBobDiagnoseSnapshotPayload> | null;
  materialsLatestSnapshotVersion?: AskBobTaskSnapshotVersion<AskBobMaterialsSnapshotPayload> | null;
  quoteLatestSnapshotVersion?: AskBobTaskSnapshotVersion<AskBobQuoteSnapshotPayload> | null;
  initialFollowupSnapshot?: AskBobFollowupSnapshotPayload | null;
  lastQuoteSummary?: string | null;
  callHistoryHint?: string | null;
  latestCallOutcome?: LatestCallOutcomeForJob | null;
};

type SessionQuote = {
  quoteId: string;
  createdAtIso: string | null;
  friendlyLabel: string | null;
};

type FollowupRecommendationInput =
  | AskBobJobFollowupResult
  | AskBobFollowupSnapshotPayload
  | null
  | undefined;

const getRecommendationKey = (recommendation: FollowUpRecommendation | null) =>
  recommendation
    ? `${recommendation.recommendedNextAction}-${recommendation.suggestedChannel ?? "none"}`
    : null;

const getRecommendationTarget = (recommendation: FollowUpRecommendation | null) => {
  if (!recommendation) {
    return null;
  }
  return recommendation.recommendedNextAction === "schedule_appointment"
    ? "scheduler"
    : recommendation.recommendedNextAction === "call_customer"
      ? "callAssist"
      : "followup";
};

const getCollapsedDefaults = (recommendation: FollowUpRecommendation | null) => {
  if (!recommendation) {
    return {
      diagnose: false,
      materials: false,
      quote: false,
      followup: false,
      scheduler: false,
      callAssist: false,
    };
  }
  const target = getRecommendationTarget(recommendation);
  return {
    diagnose: target !== "diagnose",
    materials: target !== "materials",
    quote: target !== "quote",
    followup: target !== "followup",
    scheduler: target !== "scheduler",
    callAssist: target !== "callAssist",
  };
};

function deriveFollowupRecommendation(input: FollowupRecommendationInput): FollowUpRecommendation | null {
  if (!input) {
    return null;
  }
  const suggestedChannelRaw = input.suggestedChannel ?? null;
  const suggestedChannel =
    suggestedChannelRaw === "phone" ? "call" : suggestedChannelRaw ?? null;
  const recommendedNextAction: FollowUpRecommendation["recommendedNextAction"] = input.shouldScheduleVisit
    ? "schedule_appointment"
    : input.shouldCall || input.callRecommended
      ? "call_customer"
      : input.shouldSendMessage
        ? "send_message"
        : input.shouldWait
          ? "wait"
          : "none";
  const rationale = input.rationale?.trim() ?? null;
  const recommendedActionLabel = input.recommendedAction?.trim() ?? null;
  return {
    recommendedNextAction,
    suggestedChannel,
    rationale,
    recommendedActionLabel,
  };
}

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
  diagnoseSnapshotHistory = [],
  materialsSnapshotHistory = [],
  quoteSnapshotHistory = [],
  diagnoseLatestSnapshotVersion = null,
  materialsLatestSnapshotVersion = null,
  quoteLatestSnapshotVersion = null,
  initialFollowupSnapshot,
  lastQuoteSummary,
  callHistoryHint,
  latestCallOutcome,
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
  const initialFollowupRecommendation = deriveFollowupRecommendation(initialFollowupSnapshot ?? null);
  const initialCollapsedDefaults = getCollapsedDefaults(initialFollowupRecommendation);
  const [followupRecommendation, setFollowupRecommendation] = useState<FollowUpRecommendation | null>(
    () => initialFollowupRecommendation,
  );
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
  const [
    callScriptFollowupCallIntents,
    setCallScriptFollowupCallIntents,
  ] = useState<AskBobCallIntent[] | null>(null);
  const [
    callScriptFollowupCallIntentsToken,
    setCallScriptFollowupCallIntentsToken,
  ] = useState(0);
  const [diagnoseCollapsed, setDiagnoseCollapsed] = useState(initialCollapsedDefaults.diagnose);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(initialCollapsedDefaults.materials);
  const [quoteCollapsed, setQuoteCollapsed] = useState(initialCollapsedDefaults.quote);
  const [followupCollapsed, setFollowupCollapsed] = useState(initialCollapsedDefaults.followup);
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
  const [schedulerCollapsed, setSchedulerCollapsed] = useState(initialCollapsedDefaults.scheduler);
  const [callScriptCollapsed, setCallScriptCollapsed] = useState(initialCollapsedDefaults.callAssist);
  const [callScriptResetToken, setCallScriptResetToken] = useState(0);
  const [schedulerResetToken, setSchedulerResetToken] = useState(0);
  const [callPrepVisible, setCallPrepVisible] = useState(false);
  const handoffCheckedJobIdRef = useRef<string | null>(null);
  const resolvedLatestCallOutcome = latestCallOutcome ?? null;
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

  const promptSeed = jobDescription ?? "";
  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const leadLogRef = useRef(false);
  const normalizedJobStatus = jobStatus?.trim().toLowerCase() ?? "";
  const router = useRouter();
  const hasJobBasics = Boolean(normalizedJobTitle || normalizedJobDescription);
  const hasCustomerPhone = Boolean(customerPhoneNumber?.trim());
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
  };
  type StageStatus = "not_started" | "drafted" | "completed";
  const stageStatusItems: Array<{ id: string; label: string; status: StageStatus; order: number }> = [
    {
      id: "diagnose",
      label: "Diagnose",
      status: diagnosisSummary?.trim() ? "drafted" : "not_started",
      order: 1,
    },
    {
      id: "materials",
      label: "Materials",
      status: materialsSummary?.trim() ? "drafted" : "not_started",
      order: 2,
    },
    {
      id: "quote",
      label: "Quote",
      status: quoteDone ? "completed" : hasQuoteSnapshotContext ? "drafted" : "not_started",
      order: 3,
    },
    {
      id: "followup",
      label: "Follow-up",
      status: followupSummary?.trim() ? "drafted" : "not_started",
      order: 4,
    },
    {
      id: "call-prep",
      label: "Call preparation",
      status: callScriptDone ? "completed" : callScriptSummary?.trim() ? "drafted" : "not_started",
      order: 5,
    },
  ];
  const jobPipelineNextAction = (() => {
    if (!stepReadiness.intake.isReady) {
      return "Add a job title or description to start AskBob recommendations.";
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
    return "Run follow-up guidance to decide the next customer touchpoint.";
  })();
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

  const appliedRecommendationRef = useRef<string | null>(getRecommendationKey(initialFollowupRecommendation));
  const applyRecommendationCollapse = (recommendation: FollowUpRecommendation | null) => {
    const key = getRecommendationKey(recommendation);
    if (appliedRecommendationRef.current === key) {
      return;
    }
    appliedRecommendationRef.current = key;
    const collapsedDefaults = getCollapsedDefaults(recommendation);
    setDiagnoseCollapsed(collapsedDefaults.diagnose);
    setMaterialsCollapsed(collapsedDefaults.materials);
    setQuoteCollapsed(collapsedDefaults.quote);
    setFollowupCollapsed(collapsedDefaults.followup);
    setSchedulerCollapsed(collapsedDefaults.scheduler);
    setCallScriptCollapsed(collapsedDefaults.callAssist);
  };

  const handleFollowupResult = useCallback(
    (result: AskBobJobFollowupResult | null) => {
      if (!result) {
        setFollowupCallRecommended(false);
        setFollowupCallPurpose(null);
        setFollowupCallTone(null);
        setFollowupRecommendation(null);
        applyRecommendationCollapse(null);
        return;
      }
      const recommendation = deriveFollowupRecommendation(result);
      setFollowupCallRecommended(Boolean(result.callRecommended));
      setFollowupCallPurpose(result.callPurpose ?? null);
      setFollowupCallTone(result.callTone ?? null);
      setFollowupRecommendation(recommendation);
      applyRecommendationCollapse(recommendation);
    },
    [],
  );

  const resetCallScriptState = () => {
    setCallScriptSummary(null);
    setCallScriptCollapsed(false);
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
      !callScriptDone
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

  const shouldShowScheduler =
    followupRecommendation?.recommendedNextAction === "schedule_appointment";
  const shouldShowCallPrep =
    followupRecommendation?.recommendedNextAction === "call_customer" || callPrepVisible;

  const handleShowCallPrep = () => {
    console.log("[askbob-job-assistant-call-prep-open]", {
      workspaceId,
      jobId,
      recommendation: followupRecommendation?.recommendedNextAction ?? null,
    });
    handleJumpToCallAssist();
  };

  const nextActionMessage =
    followupRecommendation?.recommendedActionLabel?.trim() || jobPipelineNextAction;
  const nextActionRationale = followupRecommendation?.rationale ?? null;
  const nextActionLabel = (() => {
    switch (followupRecommendation?.recommendedNextAction) {
      case "schedule_appointment":
        return "Review scheduling options";
      case "call_customer":
        return callSessionCopy.jobDetail.openCallSessionCta;
      case "send_message":
      case "wait":
      case "none":
        return "Review follow-up guidance";
      default:
        return "Get follow-up recommendation";
    }
  })();
  const handleAssistantNextAction = () => {
    console.log("[askbob-job-assistant-next-action-click]", {
      workspaceId,
      jobId,
      recommendation: followupRecommendation?.recommendedNextAction ?? null,
      suggestedChannel: followupRecommendation?.suggestedChannel ?? null,
    });
    if (followupRecommendation?.recommendedNextAction === "schedule_appointment") {
      scrollToSection("askbob-scheduler");
      return;
    }
    if (followupRecommendation?.recommendedNextAction === "call_customer") {
      void handleOpenCallSessionClick();
      return;
    }
    scrollToSection("askbob-followup");
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
    setCallPrepVisible(true);
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

  const handleStageSelect = (stageId: string) => {
    if (stageId === "call-prep") {
      handleShowCallPrep();
      return;
    }
    const sectionMap: Record<string, string> = {
      diagnose: "askbob-diagnose",
      materials: "askbob-materials",
      quote: "askbob-quote",
      followup: "askbob-followup",
    };
    const sectionId = sectionMap[stageId];
    if (sectionId) {
      scrollToSection(sectionId);
    }
  };

  return (
    <div className="space-y-6">
      <JobAskBobContainer
        workspaceId={workspaceId}
        jobId={jobId}
        askBobLastTaskLabel={askBobLastTaskLabel}
        askBobLastUsedAtDisplay={askBobLastUsedAtDisplay}
        askBobLastUsedAtIso={askBobLastUsedAtIso}
        askBobRunsSummary={askBobRunsSummary}
        stageStatusItems={stageStatusItems}
        nextActionLabel={nextActionLabel}
        nextActionMessage={nextActionMessage}
        nextActionRationale={nextActionRationale}
        nextActionErrorMessage={openCallSessionState.message}
        nextActionDisabled={openCallSessionState.status === "loading"}
        onNextAction={handleAssistantNextAction}
        onStageSelect={handleStageSelect}
        showCallPrepAction={!shouldShowCallPrep}
        onShowCallPrep={handleShowCallPrep}
      />
      <div className="space-y-8">
        <div data-testid="askbob-job-pipeline" className="space-y-4">
          <AskBobSection id="askbob-diagnose" testId="askbob-diagnose-section">
            <JobAskBobPanel
              workspaceId={workspaceId}
              jobId={jobId}
              customerId={customerId ?? undefined}
              jobDescription={promptSeed}
              jobTitle={normalizedJobTitle}
              initialDiagnoseSnapshot={initialDiagnoseSnapshot ?? undefined}
              diagnosisSnapshotHistory={diagnoseSnapshotHistory}
              latestSnapshotVersion={diagnoseLatestSnapshotVersion}
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
          <AskBobSection id="askbob-materials" testId="askbob-materials-section">
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
              materialsSnapshotHistory={materialsSnapshotHistory}
              latestSnapshotVersion={materialsLatestSnapshotVersion}
              stepCompleted={materialsDone}
              resetToken={materialsResetToken}
              stepCollapsed={materialsCollapsed}
              onToggleStepCollapsed={() =>
                handleToggleStep("materials", materialsCollapsed, setMaterialsCollapsed)
              }
              stepReadiness={stepReadiness.materials}
            />
          </AskBobSection>
          <AskBobSection id="askbob-quote" testId="askbob-quote-section">
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
              quoteSnapshotHistory={quoteSnapshotHistory}
              latestSnapshotVersion={quoteLatestSnapshotVersion}
              stepReadiness={stepReadiness.quote}
            />
          </AskBobSection>
        </div>
        <div data-testid="askbob-calling-pipeline" className="space-y-4">
          <AskBobSection id="askbob-followup" testId="askbob-followup-section">
            <JobAskBobFollowupPanel
              workspaceId={workspaceId}
              jobId={jobId}
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
              onFollowupSummaryUpdate={setFollowupSummary}
              onFollowupResult={handleFollowupResult}
              callHistoryHint={callHistoryHint ?? null}
              latestCallOutcome={resolvedLatestCallOutcome}
              latestCallOutcomeHint={latestCallOutcomeHint}
              stepReadiness={stepReadiness.followup}
            />
          </AskBobSection>
          {shouldShowScheduler && (
            <AskBobSection id="askbob-scheduler" testId="askbob-scheduler-section">
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
          )}
          {shouldShowCallPrep && (
            <AskBobSection id="askbob-call-script" testId="askbob-call-prep-section">
              <AskBobCallAssistPanel
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
                callScriptSummary={callScriptSummary}
                onCallScriptSummaryChange={setCallScriptSummary}
                latestCallOutcome={resolvedLatestCallOutcome}
                latestCallOutcomeLabel={latestCallOutcomeReference}
                stepReadiness={stepReadiness.callAssist}
              />
            </AskBobSection>
          )}
        </div>
      </div>
    </div>
  );
}
