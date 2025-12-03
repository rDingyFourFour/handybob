"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { OutboundCallScriptResult } from "@/app/(app)/calls/outboundCallAiActions";
import { generateCallScriptForQuoteAction } from "@/app/(app)/quotes/[id]/callScriptActions";
import { createClient } from "@/utils/supabase/client";
import {
  createFollowupDraftFromCallSummaryAction,
  createMessageDraftFromFollowupAction,
  createNextActionSuggestionFromCallSummaryAction,
  createPhoneCallMessageAction,
  updateMessageOutcomeAction,
} from "./phoneCallMessageActions";
import {
  FollowupRecommendation,
  NextActionSuggestion,
} from "@/lib/domain/communications/followups";


export type PhoneMessageSummary = {
  id: string;
  channel: string | null;
  body: string | null;
  created_at: string | null;
  outcome?: string | null;
};

type JobCallScriptPanelProps = {
  quoteId: string | null;
  jobId: string;
  workspaceId: string;
  latestPhoneMessage?: PhoneMessageSummary | null;
  latestCallScript?: OutboundCallScriptResult | null;
  customerName?: string | null;
  customerFirstName?: string | null;
  customerPhone?: string | null;
  mode?: "job" | "callSession";
  context?: "job-sidebar" | "call-session";
  callId?: string | null;
};

function normalize(value?: string | null): string {
  if (!value) return "";
  return value.trim();
}

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString();
}

function describeFollowupRecommendation(recommendation: FollowupRecommendation): string {
  const channel = recommendation.recommendedChannel;
  const base =
    channel === "call"
      ? "Call the customer"
      : channel === "sms"
      ? "Send an SMS"
      : channel === "email"
      ? "Send an email"
      : "Send a follow-up";
  const timing = recommendation.recommendedDelayLabel
    ? ` ${recommendation.recommendedDelayLabel}`
    : "";
  return `${base}${timing}.`;
}

function buildPhoneCallNoteBodyFromScript(script: {
  opening?: string | null;
  keyPoints?: string[];
  closing?: string | null;
  subject?: string | null;
  callType?: string;
  outcome?: string;
  when?: Date;
}): string {
  const {
    callType = "Quote follow-up",
    outcome = "Draft / not yet updated",
    when = new Date(),
  } = script;
  const whenStr = when.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
  const headerLines = [
    `Call type: ${callType}`,
    `Outcome: ${outcome}`,
    `When: ${whenStr}`,
  ];
  const scriptLines: string[] = [];
  if (script.subject) {
    scriptLines.push(`Subject: ${script.subject}`);
    scriptLines.push("");
  }
  const opening = normalize(script.opening);
  if (opening) {
    scriptLines.push(opening);
    scriptLines.push("");
  }
  if (script.keyPoints && script.keyPoints.length) {
    scriptLines.push("Talking points:");
    script.keyPoints.forEach((point) => {
      const trimmed = normalize(point);
      if (trimmed) {
        scriptLines.push(`- ${trimmed}`);
      }
    });
    scriptLines.push("");
  }
  const closing = normalize(script.closing);
  if (closing) {
    scriptLines.push("Closing:");
    scriptLines.push(closing);
  }
  return [
    headerLines.join("\n"),
    "",
    "---",
    "",
    ...scriptLines.filter(Boolean),
  ].join("\n");
}

function buildCallScriptClipboardText(script: OutboundCallScriptResult): string {
  const lines: string[] = [];
  const pushLine = (value: string) => {
    if (value) {
      lines.push(value);
    }
  };

  if (script.subject) {
    pushLine(`Subject: ${script.subject}`);
    lines.push("");
  }
  if (script.opening) {
    pushLine(script.opening);
    lines.push("");
  }
  if (script.keyPoints?.length) {
    pushLine("Key points:");
    for (const point of script.keyPoints) {
      const trimmed = point?.trim();
      if (trimmed) {
        pushLine(`- ${trimmed}`);
      }
    }
    lines.push("");
  }
  if (script.closing) {
    pushLine(script.closing);
  }
  return lines.join("\n").trim();
}

function mapCallOutcomeToLabel(o){ if(o==="left_voicemail")return "Left voicemail"; if(o==="talked_to_customer")return "Talked to customer"; if(o==="no_answer")return "No answer"; if(o==="call_rescheduled")return "Call rescheduled"; return "Draft / not yet updated"; }

function formatSecondsAsMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}

const CALL_OUTCOME_OPTIONS = [
  { value: "", label: "Not recorded yet" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "talked_to_customer", label: "Talked to customer" },
  { value: "no_answer", label: "No answer" },
  { value: "call_rescheduled", label: "Call rescheduled" },
];

type FollowupDraft = {
  channel: string;
  subject?: string | null;
  body: string;
  recommendation?: FollowupRecommendation | null;
  outcome?: string | null;
  daysSinceQuote?: number | null;
  rawChannelSuggestion?: string | null;
};

// CHANGE: Badge styling helper for the inline outcome label shown on each call log.
function getOutcomeBadgeClasses(outcome?: string | null): string {
  if (!outcome) {
    return "border border-slate-800/60 bg-slate-900/40 text-slate-300/90";
  }
  switch (outcome) {
    case "scheduled":
    case "won":
    case "talked_to_customer":
      return "border border-emerald-200 bg-emerald-100 text-emerald-800";
    case "lost":
    case "call_rescheduled":
      return "border border-amber-200 bg-amber-100 text-amber-800";
    case "left_voicemail":
    case "no_answer":
      return "border border-amber-200 bg-amber-100 text-amber-800";
    default:
      return "border border-slate-800/60 bg-slate-900/40 text-slate-300/90";
  }
}

type CallOutcomeEditorProps = {
  messageId: string;
  workspaceId: string;
  initialOutcome?: string | null;
  onOutcomeChange?: (next: string | null) => void;
  size?: "xs" | "sm";
};

function CallOutcomeEditor({
  messageId,
  workspaceId,
  initialOutcome,
  onOutcomeChange,
  size = "sm",
}: CallOutcomeEditorProps) {
  const [outcomeValue, setOutcomeValue] = useState(initialOutcome ?? "");
  const [isPending, startTransition] = useTransition();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setOutcomeValue(nextValue);
    startTransition(async () => {
      const result = await updateMessageOutcomeAction({
        messageId,
        workspaceId,
        outcome: nextValue || null,
      });
      if (!result.ok) {
        console.error("[call-outcome-editor] Failed to persist outcome", result.error);
      } else {
        onOutcomeChange?.(nextValue || null);
      }
    });
  };

  const baseTextClass = size === "xs" ? "text-[10px]" : "text-xs";
  const selectTextClass = size === "xs" ? "text-[11px]" : "text-xs";

  return (
    <div className={`space-y-1 ${baseTextClass} text-slate-400`}>
      <label
        htmlFor={`call-outcome-${messageId}`}
        className={`uppercase tracking-[0.3em] ${baseTextClass}`}
      >
        Outcome
      </label>
      <select
        id={`call-outcome-${messageId}`}
        disabled={isPending}
        value={outcomeValue}
        onChange={handleChange}
        className={`w-full rounded border border-slate-800/60 bg-slate-950 px-3 py-1 text-slate-100 focus:border-slate-600 focus:outline-none ${selectTextClass}`}
      >
        {CALL_OUTCOME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function JobCallScriptPanel({
  quoteId,
  jobId,
  workspaceId,
  latestPhoneMessage: initialLatestPhoneMessage = null,
  latestCallScript: initialLatestCallScript = null,
  customerName = null,
  customerFirstName = null,
  customerPhone = null,
  mode = "job",
  context = "job-sidebar",
  callId = null,
}: JobCallScriptPanelProps) {
  const normalizedContext =
    context ?? (mode === "callSession" ? "call-session" : "job-sidebar");
  const isCallSession = normalizedContext === "call-session";
  const isJobSidebar = normalizedContext === "job-sidebar";
  const [callScriptResult, setCallScriptResult] = useState<OutboundCallScriptResult | null>(
    initialLatestCallScript ?? null,
  );
  const [callScriptError, setCallScriptError] = useState<string | null>(null);
  const [callScriptCopied, setCallScriptCopied] = useState(false);
  const [hasUsedCallScript, setHasUsedCallScript] = useState(false);
  // CHANGE: Track checklist state for generated key points.
  const [coveredKeyPoints, setCoveredKeyPoints] = useState<boolean[]>(() =>
    initialLatestCallScript?.keyPoints?.map(() => false) ?? [],
  );
  const [callOutcomeNotes, setCallOutcomeNotes] = useState("");
  const [callOutcome, setCallOutcome] = useState("not_set");
  const [isSavingCallOutcome, setIsSavingCallOutcome] = useState(false);
  const [lastCallOutcomeSaved, setLastCallOutcomeSaved] = useState(false);
  const [callOutcomeError, setCallOutcomeError] = useState<string | null>(null);
  const supabaseClient = useMemo(() => createClient(), []);
  const [callLogs, setCallLogs] = useState<PhoneMessageSummary[]>(() =>
    initialLatestPhoneMessage ? [initialLatestPhoneMessage] : [],
  );
  const [callLogsLoading, setCallLogsLoading] = useState(false);
  const [callLogsError, setCallLogsError] = useState<string | null>(null);
  const [showCallLogList, setShowCallLogList] = useState(false);
  // CHANGE: Track whether the agent is currently using the guided call mode.
  const [inGuidedCall, setInGuidedCall] = useState(false);
  // CHANGE: Track the call summary UI state for ending guided calls.
  const [showCallSummary, setShowCallSummary] = useState(false);
  // CHANGE: Track when the guided call started so we can compute duration.
  const [guidedCallStartedAt, setGuidedCallStartedAt] = useState<number | null>(null);
  const [guidedCallElapsedSeconds, setGuidedCallElapsedSeconds] = useState(0);
  const [summarySaved, setSummarySaved] = useState(false);
  // CHANGE: Track the most recent guided-call duration for displaying in the summary card.
  const [lastGuidedCallDurationSeconds, setLastGuidedCallDurationSeconds] = useState<number | null>(null);
  const [callSummaryNote, setCallSummaryNote] = useState("");
  const [callSummaryOutcome, setCallSummaryOutcome] = useState<string | null>(null);
  const [savingCallSummary, setSavingCallSummary] = useState(false);
  const [loadingFollowupDraft, setLoadingFollowupDraft] = useState(false);
  const [followupDraft, setFollowupDraft] = useState<FollowupDraft | null>(null);
  const [savingFollowupMessage, setSavingFollowupMessage] = useState(false);
  const [loadingNextActionSuggestion, setLoadingNextActionSuggestion] = useState(false);
  const [nextActionSuggestion, setNextActionSuggestion] = useState<NextActionSuggestion | null>(null);
  const [savingNextActionPlan, setSavingNextActionPlan] = useState(false);
  // CHANGE: Track which outcome filter is active for the log list.
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | string>("all");
  const [showGuidedCall, setShowGuidedCall] = useState(false);
  const [hasAutoGeneratedScript, setHasAutoGeneratedScript] = useState(false);
  const [isPending, startTransition] = useTransition();
  const callScriptLoading = isPending;
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoggedViewRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    setCallScriptResult(initialLatestCallScript ?? null);
  }, [initialLatestCallScript]);

  useEffect(() => {
    if (!jobId || !workspaceId) {
      setCallLogs([]);
      setCallLogsError(null);
      setCallLogsLoading(false);
      return undefined;
    }

    let canceled = false;
    setCallLogsLoading(true);
    setCallLogsError(null);

    const loadCallLogs = async () => {
      try {
        const { data, error } = await supabaseClient
          .from<PhoneMessageSummary>("messages")
          .select("id, channel, body, created_at, outcome")
          .eq("workspace_id", workspaceId)
          .eq("job_id", jobId)
          .eq("channel", "phone")
          .order("created_at", { ascending: false });
        if (canceled) return;
        if (error) {
          console.error("[job-call-script-panel] Failed to load call logs", error);
          setCallLogsError("Unable to load call notes right now.");
          setCallLogs([]);
        } else {
          setCallLogs(data ?? []);
        }
      } catch (error) {
        if (canceled) return;
        console.error("[job-call-script-panel] Failed to load call logs", error);
        setCallLogsError("Unable to load call notes right now.");
      } finally {
        if (!canceled) {
          setCallLogsLoading(false);
        }
      }
    };

    void loadCallLogs();

    return () => {
      canceled = true;
    };
  }, [jobId, supabaseClient, workspaceId]);

  const exitGuidedCall = useCallback((options?: { keepSummaryCard?: boolean }) => {
    const keepSummaryCard = options?.keepSummaryCard ?? false;
    setInGuidedCall(false);
    setShowGuidedCall(false);
    setShowCallSummary(keepSummaryCard);
    setCallSummaryNote("");
    setCallSummaryOutcome(null);
    if (!keepSummaryCard) {
      setSummarySaved(false);
    }
    // CHANGE: Reset the guided call timestamp when closing this mode.
    setGuidedCallStartedAt(null);
    setGuidedCallElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (!callScriptResult) {
      exitGuidedCall();
    }
  }, [callScriptResult, exitGuidedCall]);

  useEffect(() => {
    if (!isCallSession) {
      exitGuidedCall();
    }
  }, [isCallSession, exitGuidedCall]);

  useEffect(() => {
    if (!isCallSession) {
      setSummarySaved(false);
    }
  }, [isCallSession]);

  useEffect(() => {
    setHasAutoGeneratedScript(false);
  }, [callId, isCallSession]);

  useEffect(() => {
    // CHANGE: Reset checklist whenever the script subject or key point count changes.
    // CHANGE: Depend only on the array of key points to satisfy hooks linting.
    setCoveredKeyPoints(callScriptResult?.keyPoints?.map(() => false) ?? []);
  }, [callScriptResult?.keyPoints]);

  useEffect(() => {
    if (!inGuidedCall || !guidedCallStartedAt) {
      setGuidedCallElapsedSeconds(0);
      return;
    }
    // CHANGE: Maintain a live guided-call timer for the UI.
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.round((now - guidedCallStartedAt) / 1000));
      setGuidedCallElapsedSeconds(elapsed);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [inGuidedCall, guidedCallStartedAt]);

  const runCallScriptAction = useCallback(async () => {
    console.log("[call-script-ui] generate clicked", {
      quoteId,
      jobId,
      workspaceId,
      callId,
    });
    if (!quoteId) {
      const message = "Attach a quote to this job to generate a guided call script.";
      setCallScriptError(message);
      return;
    }
    setCallScriptError(null);
    setCallScriptCopied(false);

    try {
      const response = await generateCallScriptForQuoteAction({ quoteId });
      if (response.ok) {
      setCallScriptResult(response.data);
      setHasUsedCallScript(false);
      setCallScriptError(null);
    } else {
      setCallScriptError(response.message ?? "We couldn’t generate a call script. Please try again.");
    }
  } catch (error) {
    console.error("[call-script-ui] generateCallScriptForQuoteAction failed", error);
    setCallScriptError("We couldn’t generate a call script. Please try again.");
  }
}, [quoteId, jobId, workspaceId, callId]);

  const handleGenerateCallScript = useCallback(() => {
    if (!quoteId) {
      setCallScriptError("Attach a quote to this job to generate a guided call script.");
      return;
    }
    if (callScriptLoading) {
      return;
    }
    setCallScriptError(null);
    setCallScriptCopied(false);
    console.log("[call-script-metrics]", {
      event: "call_script_generate_click",
      quoteId,
      jobId,
      workspaceId,
      callId,
    });
    startTransition(() => runCallScriptAction());
  }, [callScriptLoading, quoteId, jobId, workspaceId, callId, startTransition, runCallScriptAction]);

  useEffect(() => {
    if (
      !isCallSession ||
      !quoteId ||
      Boolean(callScriptResult) ||
      callScriptLoading ||
      hasAutoGeneratedScript
    ) {
      return;
    }
    setHasAutoGeneratedScript(true);
    handleGenerateCallScript();
  }, [
    isCallSession,
    quoteId,
    callScriptResult,
    callScriptLoading,
    hasAutoGeneratedScript,
    handleGenerateCallScript,
    callId,
  ]);

  const handleCopyCallScript = async () => {
    if (!callScriptResult) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      const text = buildCallScriptClipboardText(callScriptResult);
      await navigator.clipboard.writeText(text);
      setCallScriptCopied(true);
      console.log("[call-script-metrics]", {
        event: "call_script_copy",
        quoteId,
        jobId,
        workspaceId,
        callId,
      });
      console.log("[call-script-ui] copied", {
        quoteId,
        jobId,
        workspaceId,
        callId,
      });
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCallScriptCopied(false);
      }, 2000);
    } catch (error) {
      console.log("[call-script-ui] copy failed", {
        quoteId,
        jobId,
        workspaceId,
        callId,
        error,
      });
    }
  };

  // CHANGE: Toggle guided-call mode and optionally scroll to the script checklist.
  const handleToggleGuidedCall = (options?: { restart?: boolean; source?: string }) => {
    if (!isCallSession) {
      return;
    }
    if (!callScriptResult) {
      return;
    }
    if (!inGuidedCall) {
      const { restart, source } = options ?? {};
      setSummarySaved(false);
      setFollowupDraft(null);
      setNextActionSuggestion(null);
      setLoadingFollowupDraft(false);
      setLoadingNextActionSuggestion(false);
      setInGuidedCall(true);
      // CHANGE: Capture the guided call start time for later duration tracking.
      setGuidedCallStartedAt(Date.now());
      if (restart) {
        console.log("[guided-call-panel] Restarting guided call", {
          callId,
          source,
        });
      }
      setShowGuidedCall(true);
      if (typeof document !== "undefined") {
        document
          .getElementById("phone-call-script-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      setShowCallSummary(true);
    }
  };

  const dispatchSummaryStatus = useCallback(
    (status: "needed" | "recorded") => {
      if (!callId || typeof window === "undefined") {
        return;
      }
      window.dispatchEvent(
        new CustomEvent("handybob:callSummaryStatus", {
          detail: { callId, status },
        }),
      );
    },
    [callId],
  );

  const handleSkipCallSummary = () => {
    setFollowupDraft(null);
    setLoadingFollowupDraft(false);
    setNextActionSuggestion(null);
    setLoadingNextActionSuggestion(false);
    dispatchSummaryStatus("needed");
    exitGuidedCall();
  };

  const handleSaveCallSummary = async () => {
    if (savingCallSummary || !callScriptResult) {
      return;
    }
    const trimmedNote = callSummaryNote.trim();
    const outcomeLabel = callSummaryOutcome ? mapCallOutcomeToLabel(callSummaryOutcome) : undefined;
    if (!trimmedNote && !outcomeLabel) {
      return;
    }
    setSavingCallSummary(true);
    try {
      const endedAt = Date.now();
      const startedAt = guidedCallStartedAt ?? endedAt;
      const durationSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
      setLastGuidedCallDurationSeconds(durationSeconds);
      const formattedOutcomeForBody = callSummaryOutcome?.replace(/_/g, " ");
      const summaryLines: string[] = [];
      if (formattedOutcomeForBody) {
        summaryLines.push(`Outcome: ${formattedOutcomeForBody}`);
      }
      if (trimmedNote) {
        summaryLines.push(trimmedNote);
      }
      // CHANGE: Inline a quick call-session footer for future agents to read.
      summaryLines.push("");
      summaryLines.push(
        `Call session: guided, approx. duration ${durationSeconds}s (startedAt=${new Date(
          startedAt,
        ).toISOString()}, endedAt=${new Date(endedAt).toISOString()})`,
      );
      const body = summaryLines.join("\n\n");
      const result = await createPhoneCallMessageAction({
        jobId,
        quoteId,
        workspaceId,
        subject: callScriptResult.subject ?? "Guided call summary",
        noteBody: body,
        script: {
          subject: callScriptResult.subject,
          opening: callScriptResult.opening,
          keyPoints: callScriptResult.keyPoints,
          closing: callScriptResult.closing,
          outcome: outcomeLabel ?? undefined,
        },
      });
      if (result.ok) {
        const newLog: PhoneMessageSummary = {
          id: result.messageId,
          channel: "phone",
          body,
          created_at: new Date().toISOString(),
          outcome: outcomeLabel ?? "Guided call summary",
        };
        setCallLogs((prev) => [newLog, ...prev.filter((log) => log.id !== newLog.id)]);
        const summaryNoteForDraft = trimmedNote;
        const summaryOutcomeValue = callSummaryOutcome ?? null;
        setSummarySaved(true);
        dispatchSummaryStatus("recorded");
        exitGuidedCall({ keepSummaryCard: true });
        setLoadingFollowupDraft(true);
        setFollowupDraft(null);
        try {
          const draft = await createFollowupDraftFromCallSummaryAction({
            workspaceId,
            jobId,
            quoteId,
            summaryNote: summaryNoteForDraft,
            outcome: summaryOutcomeValue,
          });
          if (draft) {
            setFollowupDraft({
              channel: draft.channelSuggestion ?? "email",
              subject: draft.subject ?? null,
              body: draft.body,
              recommendation: draft.recommendation ?? null,
              outcome: draft.outcome ?? null,
              daysSinceQuote: draft.daysSinceQuote ?? null,
              rawChannelSuggestion: draft.channelSuggestion ?? null,
            });
          }
        } catch (error) {
          console.error(
            "[job-call-script-panel] Failed to create follow-up draft from call summary",
            error,
          );
        } finally {
        setLoadingFollowupDraft(false);
      }
        setLoadingNextActionSuggestion(true);
        setNextActionSuggestion(null);
        try {
          const suggestion = await createNextActionSuggestionFromCallSummaryAction({
            workspaceId,
            jobId,
            quoteId,
            outcome: summaryOutcomeValue,
            summaryNote: summaryNoteForDraft,
          });
          if (suggestion) {
            setNextActionSuggestion(suggestion);
          }
        } catch (error) {
          console.error(
            "[job-call-script-panel] Failed to create next action suggestion from call summary",
            error,
          );
        } finally {
          setLoadingNextActionSuggestion(false);
        }
    } else {
      console.error("[job-call-script-panel] Failed to save guided call summary", result.error);
    }
    } catch (error) {
      console.error("[job-call-script-panel] Failed to save guided call summary", error);
    } finally {
      setSavingCallSummary(false);
    }
  };

  const handleCreateFollowupMessageFromDraft = async () => {
    if (!followupDraft || savingFollowupMessage) {
      return;
    }
    setSavingFollowupMessage(true);
    try {
      const result = await createMessageDraftFromFollowupAction({
        workspaceId,
        jobId,
        quoteId,
        callId,
        channel: followupDraft.channel,
        subject: followupDraft.subject ?? "Quick follow-up after our call",
        body: followupDraft.body,
        outcome: followupDraft.outcome ?? null,
        daysSinceQuote: followupDraft.daysSinceQuote ?? null,
        modelChannelSuggestion: followupDraft.rawChannelSuggestion ?? null,
      });
      if (result.ok && result.messageId) {
        setFollowupDraft(null);
        router.push(`/messages/${result.messageId}`);
      } else {
        console.error(
          "[job-call-script-panel] Failed to create follow-up message from draft",
          result.error,
        );
      }
    } catch (error) {
      console.error("[job-call-script-panel] Failed to create follow-up message from draft", error);
    } finally {
      setSavingFollowupMessage(false);
    }
  };

  const handleLogNextActionPlan = async () => {
    if (!nextActionSuggestion || savingNextActionPlan) {
      return;
    }
    setSavingNextActionPlan(true);
    try {
      const lines: string[] = [];
      lines.push(`Recommended next step: ${nextActionSuggestion.label}`);
      if (nextActionSuggestion.timingHint) {
        lines.push(`Suggested timing: ${nextActionSuggestion.timingHint}`);
      }
      lines.push("");
      lines.push(`Reason: ${nextActionSuggestion.reason}`);
      const result = await createMessageDraftFromFollowupAction({
        workspaceId,
        jobId,
        quoteId,
        channel: nextActionSuggestion.channelHint ?? "planning",
        subject: "Planned next action (phone agent)",
        body: lines.join("\n"),
        status: "draft",
      });
      if (result.ok) {
        setNextActionSuggestion(null);
        router.refresh();
      } else {
        console.error(
          "[job-call-script-panel] Failed to log next action plan",
          result.error,
        );
      }
    } catch (error) {
      console.error("[job-call-script-panel] Failed to log next action plan", error);
    } finally {
      setSavingNextActionPlan(false);
    }
  };

  // CHANGE: Derive progress/checklist metrics for talking points.
  const keyPoints = callScriptResult?.keyPoints ?? [];
  const totalPoints = keyPoints.length;
  const coveredCount = coveredKeyPoints.filter(Boolean).length;
  const hasPoints = totalPoints > 0;
  const progressPercent = hasPoints ? (coveredCount / totalPoints) * 100 : 0;

  useEffect(() => {
    if (!callScriptResult) {
      hasLoggedViewRef.current = false;
    } else if (!hasLoggedViewRef.current) {
      console.log("[call-script-metrics]", {
        event: "call_script_view",
        quoteId,
        jobId,
        workspaceId,
        callId,
      });
      hasLoggedViewRef.current = true;
    }

    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, [callScriptResult, quoteId, jobId, workspaceId, callId]);

  useEffect(() => {
    if (isCallSession && (!quoteId || !jobId)) {
      console.log("[JobCallScriptPanel] Skipping guided controls in call-session (missing context)", {
        callId,
        jobId,
        quoteId,
      });
    }
  }, [isCallSession, jobId, quoteId, callId]);

  const handleMarkScriptUsed = () => {
    if (hasUsedCallScript || !callScriptResult) {
      return;
    }
    setHasUsedCallScript(true);
    console.log("[call-script-metrics]", {
      event: "call_script_used",
      source: "job_detail",
      quoteId,
      jobId,
      workspaceId,
      callId,
      subjectLength: callScriptResult.subject?.length ?? null,
      keyPointsCount: Array.isArray(callScriptResult.keyPoints)
        ? callScriptResult.keyPoints.length
        : null,
    });
  };

  const handleSaveCallNotes = async () => {
    if (!callScriptResult || isSavingCallOutcome) {
      return;
    }

    setIsSavingCallOutcome(true);
    setCallOutcomeError(null);
    const outcomeLabel = mapCallOutcomeToLabel(callOutcome);
    const trimmedNotes = callOutcomeNotes.trim();
    const normalizedKeyPoints = Array.isArray(callScriptResult.keyPoints)
      ? callScriptResult.keyPoints.filter(Boolean)
      : [];
    const combinedKeyPoints = trimmedNotes ? [...normalizedKeyPoints, trimmedNotes] : normalizedKeyPoints;
    const body = buildPhoneCallNoteBodyFromScript({
      subject: callScriptResult.subject,
      opening: callScriptResult.opening,
      keyPoints: combinedKeyPoints,
      closing: callScriptResult.closing,
      outcome: outcomeLabel,
    });
    try {
      const result = await createPhoneCallMessageAction({
        jobId,
        quoteId,
        workspaceId,
        subject: callScriptResult.subject || "Phone call about your HandyBob quote",
        noteBody: body,
        script: {
          opening: callScriptResult.opening,
          keyPoints: combinedKeyPoints,
          closing: callScriptResult.closing,
          subject: callScriptResult.subject,
          outcome: outcomeLabel,
        },
      });
      if (result.ok) {
        setCallOutcomeNotes("");
        setLastCallOutcomeSaved(true);
        setCallOutcomeError(null);
        const newLog: PhoneMessageSummary = {
          id: result.messageId,
          channel: "phone",
          body,
          created_at: new Date().toISOString(),
          outcome: outcomeLabel,
        };
        setCallLogs((prev) => [newLog, ...prev.filter((log) => log.id !== newLog.id)]);
        console.log("[call-script-metrics]", {
          event: "phone_call_note_saved",
          jobId,
          quoteId,
          workspaceId,
          callId,
          messageId: result.messageId,
        });
      } else {
        setCallOutcomeError("Could not save call note. Please try again.");
      }
    } catch (error) {
      console.error("[job-call-script-panel] createPhoneCallMessageAction failed", error);
      setCallOutcomeError("Could not save call note. Please try again.");
    } finally {
      setIsSavingCallOutcome(false);
    }
  };

  // CHANGE: Derive the subset of call logs matching the currently selected outcome filter.
  const filteredCallLogs = useMemo(() => {
    if (outcomeFilter === "all") {
      return callLogs;
    }
    // CHANGE: Treat missing outcomes as an empty string so the “Not recorded yet” pill works.
    return callLogs.filter((log) => (log.outcome ?? "") === outcomeFilter);
  }, [callLogs, outcomeFilter]);

  const latestCallLog = callLogs[0] ?? null;
  const latestLogBody = latestCallLog?.body?.trim();
  const latestLogTimestamp = latestCallLog
    ? formatTimestamp(latestCallLog.created_at)
    : null;

  const handleCallLogOutcomeChange = (logId: string, nextOutcome: string | null) => {
    setCallLogs((prev) =>
      prev.map((log) => (log.id === logId ? { ...log, outcome: nextOutcome } : log)),
    );
  };

  const headerTitle = isCallSession ? "Guided call workspace" : "Phone agent";
  const headerSubtext = isCallSession
    ? "Work through the script during the call and capture the summary/outcome when you wrap up."
    : isJobSidebar
    ? "Use the phone agent workspace to run guided calls and log summaries. This panel is for previewing and refining call scripts."
    : "Use this to guide a quick call with the customer about their quote.";
  const scriptHeading = isCallSession ? "Call script workspace" : "Phone call script";
  const scriptCopy = isCallSession
    ? "Use this guided workspace while you’re actually on a call."
    : "Use this to guide a quick call with the customer about their quote.";
  const callTypeLabel = "Quote follow-up";
  const jobCallsNewHref = jobId
    ? `/calls/new?jobId=${encodeURIComponent(jobId)}${
        quoteId ? `&quoteId=${encodeURIComponent(quoteId)}` : ""
      }`
    : null;

  const hasCallScript = Boolean(callScriptResult);
  const customerDisplayName = customerName ?? customerFirstName ?? "Customer";
  const cleanedCustomerPhone = customerPhone
    ? customerPhone.replace(/[^+\d]/g, "")
    : null;
  const callScriptKeyPoints = callScriptResult?.keyPoints ?? [];
  const scriptKeyPoints = callScriptKeyPoints
    .map((point) => point?.trim() ?? "")
    .filter(Boolean);

  return (
    <HbCard className="space-y-4">
      {mode === "job" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 text-xs text-slate-400">
            <p className="text-[11px] uppercase tracking-[0.4em] text-slate-500">{headerTitle}</p>
            <p className="text-sm font-semibold text-slate-100">{headerSubtext}</p>
          </div>
          {isJobSidebar && jobCallsNewHref && (
            <HbButton
              as={Link}
              href={jobCallsNewHref}
              size="sm"
              variant="primary"
              className="uppercase tracking-[0.3em]"
            >
              Open phone agent
            </HbButton>
          )}
        </div>
      )}
      <div className="space-y-1">
        {isCallSession ? (
          <>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Guided call workspace</p>
            <h3 className="text-base font-semibold text-slate-100">{scriptHeading}</h3>
            <p className="text-xs text-slate-400">{scriptCopy}</p>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-slate-100">{scriptHeading}</h3>
            <p className="text-xs text-slate-400">{scriptCopy}</p>
          </>
        )}
      </div>
      {isCallSession && quoteId && (
        <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Guided call tools</p>
              <p className="text-sm text-slate-400">
                Use this script while you’re on the call, then log a quick summary so we can suggest a follow-up.
              </p>
            </div>
            {inGuidedCall && (
              <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200">
                Guided call in progress
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HbButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleToggleGuidedCall}
              disabled={!hasCallScript || callScriptLoading}
            >
              {inGuidedCall ? "End guided call" : "Start guided call"}
            </HbButton>
            <HbButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerateCallScript}
              disabled={!quoteId || callScriptLoading || inGuidedCall}
            >
              {callScriptResult ? "Regenerate call script" : "Generate call script"}
            </HbButton>
          </div>
          {callScriptLoading && !callScriptResult && (
            <p className="text-xs text-slate-400">Preparing call script…</p>
          )}
        </div>
      )}
      {!quoteId && (
        <div className="rounded-2xl border border-amber-500/60 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="text-sm font-semibold text-amber-100">No quote attached yet</p>
          <p className="text-xs text-amber-200">
            Guided call scripts are generated from a quote. Create or attach a quote to this job, then return to this workspace.
          </p>
          {isCallSession ? (
            jobId ? (
              <HbButton as={Link} href={`/quotes?jobId=${encodeURIComponent(jobId)}`} size="sm" className="mt-3">
                Open job quotes
              </HbButton>
            ) : (
              <p className="text-xs text-slate-300 mt-3">
                This call isn’t linked to a job, so we can’t attach a quote yet.
              </p>
            )
          ) : null}
        </div>
      )}
      <div className="space-y-2 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Latest note</p>
          <div className="flex items-center gap-2">
            {lastGuidedCallDurationSeconds != null && (
              <span className="rounded-full border border-slate-800/60 bg-slate-900/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-300">
                Last call: {formatSecondsAsMmSs(lastGuidedCallDurationSeconds)}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-[0.4em] text-slate-500">
              {latestCallLog ? (latestCallLog.channel === "phone" ? "Phone" : "Call") : "Notes"}
            </span>
          </div>
        </div>
        {latestCallLog ? (
          <>
            <div className="space-y-1 text-xs text-slate-400">
              <CallOutcomeEditor
                key={`call-outcome-${latestCallLog.id}-${latestCallLog.outcome ?? "unset"}`}
                messageId={latestCallLog.id}
                workspaceId={workspaceId}
                initialOutcome={latestCallLog.outcome}
                onOutcomeChange={(nextOutcome) =>
                  handleCallLogOutcomeChange(latestCallLog.id, nextOutcome)
                }
              />
              <p>Call type: {callTypeLabel}</p>
              {latestLogTimestamp && <p>Call time: {latestLogTimestamp}</p>}
            </div>
            <div className="max-h-44 overflow-auto rounded border border-slate-800/60 bg-slate-950/60 px-3 py-3 text-xs text-slate-200 whitespace-pre-wrap">
              {latestLogBody}
            </div>
            <div className="flex justify-end">
              {callLogs.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-slate-300 transition hover:text-white"
                  onClick={() => setShowCallLogList((value) => !value)}
                >
                  {showCallLogList ? "Hide notes" : "View all notes"}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            No call notes yet. End a guided call with a summary to see it here.
          </p>
        )}
      </div>
      {showCallLogList && (
        <div className="space-y-3">
          {callLogsLoading ? (
            <p className="text-xs text-slate-400">Loading call notes…</p>
          ) : callLogsError ? (
            <p className="text-xs text-rose-400">{callLogsError}</p>
          ) : callLogs.length === 0 ? (
            <p className="text-xs text-slate-400">No call notes recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {/* // CHANGE: Filter pills let the agent narrow call logs by recorded outcome. */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Outcome
                </span>
                <button
                  type="button"
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                    outcomeFilter === "all"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-700/60 bg-slate-950/40 text-slate-300 hover:border-slate-500"
                  }`}
                  onClick={() => setOutcomeFilter("all")}
                >
                  All
                </button>
                {CALL_OUTCOME_OPTIONS.map((option) => (
                  <button
                    key={`outcome-filter-${option.value}`}
                    type="button"
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                      outcomeFilter === option.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-700/60 bg-slate-950/40 text-slate-300 hover:border-slate-500"
                    }`}
                    onClick={() => setOutcomeFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {filteredCallLogs.length === 0 ? (
                <p className="text-xs text-slate-400">No call notes match this outcome.</p>
              ) : (
                <div className="space-y-3">
                  {filteredCallLogs.map((log) => (
                    <article
                      key={log.id}
                      className="space-y-2 rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-sm text-slate-100"
                    >
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                        <span>{log.channel === "phone" ? "Phone note" : "Call note"}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">
                            {formatTimestamp(log.created_at) ?? "—"}
                          </span>
                          {/* // CHANGE: Badge shows the recorded outcome next to the timestamp. */}
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize tracking-[0.3em] ${getOutcomeBadgeClasses(
                              log.outcome,
                            )}`}
                          >
                            {log.outcome ? log.outcome.replace(/_/g, " ") : "No outcome"}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">
                        <CallOutcomeEditor
                          key={`inline-call-outcome-${log.id}-${log.outcome ?? "unset"}`}
                          messageId={log.id}
                          workspaceId={workspaceId}
                          initialOutcome={log.outcome}
                          onOutcomeChange={(nextOutcome) =>
                            handleCallLogOutcomeChange(log.id, nextOutcome)
                          }
                          size="xs"
                        />
                      </div>
                      <p className="text-xs text-slate-200 whitespace-pre-wrap">
                        {log.body || "No note body recorded."}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {!isCallSession && (
          <HbButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleGenerateCallScript}
            disabled={!quoteId || callScriptLoading || inGuidedCall}
            title={
              !quoteId
                ? "Attach a quote to generate a guided call script"
                : inGuidedCall
                  ? "End guided call before regenerating the script"
                  : undefined
            }
            className={
              !quoteId || inGuidedCall
                ? "cursor-not-allowed border-slate-700 bg-slate-800/60 text-slate-500"
                : ""
            }
          >
            {callScriptResult ? "Regenerate call script" : "Generate call script"}
          </HbButton>
        )}
        {callScriptResult && (
          <HbButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyCallScript}
            disabled={callScriptLoading}
          >
            Copy script
          </HbButton>
        )}
        {callScriptLoading && !isCallSession && (
          <p className="text-xs text-slate-400">Generating…</p>
        )}
        {callScriptCopied && (
          <p className="text-xs text-emerald-400">Copied to clipboard.</p>
        )}
      </div>
      {isCallSession && quoteId && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Guided call</p>
            <p className="text-xs text-slate-400">
              Use guided mode to walk through the script live, check off talking points, then jot a quick summary.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleGuidedCall}
            disabled={!hasCallScript}
            className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition ${
              inGuidedCall
                ? "border border-rose-500/60 bg-transparent text-rose-300 hover:bg-rose-500/10"
                : "border border-slate-500/60 bg-slate-50/5 text-slate-100 hover:bg-slate-50/10"
            }`}
          >
            {inGuidedCall ? "End & log call" : "Start guided call"}
          </button>
        </div>
      )}
      {callScriptError && (
        <p className="text-sm text-rose-400">{callScriptError}</p>
      )}
      {isCallSession && showGuidedCall && callScriptResult && (
        <div className="space-y-6 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call log</p>
            <div className="space-y-1 text-sm text-slate-100">
              <p>Call type: {callTypeLabel}</p>
              {latestCallLog?.id ? (
                <CallOutcomeEditor
                  key={`guided-outcome-${latestCallLog.id}-${latestCallLog.outcome ?? "unset"}`}
                  messageId={latestCallLog.id}
                  workspaceId={workspaceId}
                  initialOutcome={latestCallLog.outcome}
                  onOutcomeChange={(nextOutcome) =>
                    handleCallLogOutcomeChange(latestCallLog.id, nextOutcome)
                  }
                  size="xs"
                />
              ) : (
                <p className="text-xs italic text-slate-500">Outcome: Not recorded yet.</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Dial info</p>
            <p className="text-sm font-semibold text-slate-100">{customerDisplayName}</p>
            {customerPhone && cleanedCustomerPhone ? (
              <a
                className="text-sm text-sky-300 transition hover:text-sky-200"
                href={`tel:${cleanedCustomerPhone}`}
              >
                {customerPhone}
              </a>
            ) : (
              <p className="text-xs italic text-slate-500">No phone number on file.</p>
            )}
          </div>
          <div className="space-y-4 text-sm text-slate-200">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Script subject</p>
              <p className="text-sm text-slate-100">{callScriptResult.subject}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Opening</p>
              <p className="text-sm text-slate-100">{callScriptResult.opening}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Talking points</p>
              {scriptKeyPoints.length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-200">
                  {scriptKeyPoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="mt-[0.125rem] h-2 w-2 rounded-full border border-slate-600 bg-slate-900" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No talking points available.</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Closing</p>
              <p className="text-sm text-slate-100">{callScriptResult.closing}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-800/60 pt-3 text-xs text-slate-400">
            <p>Use this panel while you’re on the call, then set the outcome.</p>
            <HbButton
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowGuidedCall(false);
                setInGuidedCall(false);
                // CHANGE: Ensure the duration tracker resets when dismissing the panel.
                setGuidedCallStartedAt(null);
                setGuidedCallElapsedSeconds(0);
              }}
            >
              Done
            </HbButton>
          </div>
        </div>
      )}
      {callScriptResult ? (
        <>
          <section
            id="phone-call-script-section"
            className={`space-y-3 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100 transition ${
              inGuidedCall
                ? "border-emerald-500/70 bg-slate-950/70 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">CALL SCRIPT</p>
              {callScriptResult.channelSuggestion && (
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Channel: {callScriptResult.channelSuggestion}
                </span>
              )}
            </div>
            {inGuidedCall && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-emerald-500/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                  In guided call
                </span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-200">
                  {formatSecondsAsMmSs(guidedCallElapsedSeconds)}
                </span>
              </div>
            )}
          <div>
            <p className="text-sm font-semibold text-slate-50">{callScriptResult.subject}</p>
            <p className="text-xs text-slate-400">{callScriptResult.opening}</p>
          </div>
          {hasPoints && (
            // CHANGE: Draw extra emphasis on the checklist while guided mode is active.
            <div
              className={`space-y-3 pb-2 transition ${
                inGuidedCall ? "rounded-lg border border-emerald-500/40 bg-slate-900/80" : ""
              }`}
            >
              <div className="space-y-1 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                <p>
                  {coveredCount} of {totalPoints} talking points covered
                </p>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <ul className="space-y-2 text-sm text-slate-200">
                {keyPoints.map((point, index) => {
                  const checked = coveredKeyPoints[index] ?? false;
                  return (
                    <li
                      key={index}
                      className="flex items-start gap-3 rounded-md px-2 py-1 transition hover:bg-slate-900"
                    >
                      <button
                        type="button"
                        aria-pressed={checked}
                        className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                          checked
                            ? "border-emerald-500 bg-emerald-500 text-slate-50"
                            : "border-slate-600 bg-slate-900 text-slate-400"
                        }`}
                        onClick={() =>
                          setCoveredKeyPoints((prev) => {
                            const next = [...prev];
                            next[index] = !next[index];
                            return next;
                          })
                        }
                      >
                        {checked && <span>✓</span>}
                      </button>
                      <p
                        className={`flex-1 whitespace-pre-wrap text-sm ${
                          checked ? "line-through text-slate-500" : "text-slate-200"
                        }`}
                      >
                        {point}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-400">{callScriptResult.closing}</p>
          <div className="flex justify-end">
            {hasUsedCallScript ? (
              <p className="text-xs text-emerald-400">Script marked as used for this job.</p>
            ) : (
              <HbButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMarkScriptUsed}
              >
                Mark script used
              </HbButton>
            )}
          </div>
          <div className="space-y-2 border-t border-slate-800/60 pt-4">
            <div className="space-y-1">
              <label
                htmlFor="call-outcome-select"
                className="text-xs uppercase tracking-[0.3em] text-slate-500"
              >
                Call outcome
              </label>
              <p className="text-xs text-slate-400">
                After the call, jot down how it went to save a phone note in your messages log.
              </p>
              <select
                id="call-outcome-select"
                className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-600 focus:outline-none"
                value={callOutcome}
                onChange={(event) => {
                  setCallOutcome(event.target.value);
                  if (lastCallOutcomeSaved) {
                    setLastCallOutcomeSaved(false);
                  }
                  if (callOutcomeError) {
                    setCallOutcomeError(null);
                  }
                }}
              >
                <option value="not_set">not_set</option>
                <option value="left_voicemail">left_voicemail</option>
                <option value="talked_to_customer">talked_to_customer</option>
                <option value="no_answer">no_answer</option>
              </select>
            </div>
            <textarea
              className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-600 focus:outline-none"
              rows={3}
              placeholder="Summarize what happened during the call..."
              value={callOutcomeNotes}
              onChange={(event) => {
                setCallOutcomeNotes(event.target.value);
                if (lastCallOutcomeSaved) {
                  setLastCallOutcomeSaved(false);
                }
                if (callOutcomeError) {
                  setCallOutcomeError(null);
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <HbButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSaveCallNotes}
                disabled={isSavingCallOutcome || !callOutcomeNotes.trim()}
              >
                {isSavingCallOutcome ? "Saving…" : "Save call notes"}
              </HbButton>
              {lastCallOutcomeSaved && (
                <p className="text-xs text-emerald-400">Call notes saved.</p>
              )}
            </div>
            {callOutcomeError && <p className="text-sm text-rose-400">{callOutcomeError}</p>}
          </div>
          </section>
      {isCallSession && showCallSummary && (
        <div className="mt-4 space-y-4 rounded-lg border-t border-emerald-500/60 bg-slate-950/60 p-4 text-sm text-slate-100 shadow-lg shadow-emerald-900/30">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
            <p>Call summary</p>
            <button
              type="button"
              className="text-xs text-slate-400 transition hover:text-slate-200"
              onClick={handleSkipCallSummary}
            >
              Skip
            </button>
          </div>
          <p className="text-xs text-slate-300">
            When you’re done talking, jot a quick note and outcome — this completes the call for your queue and can trigger a follow-up.
          </p>
          {summarySaved && (
            <p className="text-xs text-emerald-400">Summary saved and call marked complete.</p>
          )}
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
              Call note
            </label>
            <textarea
              rows={3}
              value={callSummaryNote}
              onChange={(event) => setCallSummaryNote(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. Left voicemail with details, customer asked to call back tomorrow at 4pm..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
              Outcome
            </label>
            <div className="flex flex-wrap gap-2">
              {CALL_OUTCOME_OPTIONS.map((option) => (
                <button
                  key={`summary-outcome-${option.value}`}
                  type="button"
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                    callSummaryOutcome === option.value
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  }`}
                  onClick={() =>
                    setCallSummaryOutcome((prev) =>
                      prev === option.value ? null : option.value,
                    )
                  }
                >
                  {option.label ?? option.value.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
          {!callSummaryNote.trim() && !callSummaryOutcome && (
            <p className="text-xs text-slate-500">Even a short note (1–2 sentences) is fine.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-400 transition hover:bg-slate-800"
              onClick={handleSkipCallSummary}
              disabled={savingCallSummary}
            >
              Skip logging
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
              disabled={
                savingCallSummary || (!callSummaryNote.trim() && !callSummaryOutcome)
              }
              onClick={handleSaveCallSummary}
            >
              {savingCallSummary ? "Saving…" : "Save summary"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            This ends guided mode without logging a note; the call will stay marked as needing a summary.
          </p>
        </div>
      )}
          {isCallSession && loadingFollowupDraft && !followupDraft && (
            <p className="text-xs text-slate-400">
              Preparing a follow-up suggestion…
            </p>
          )}
          {isCallSession && followupDraft && (
            <div className="space-y-3 rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-100 shadow-lg">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-400">
                <p className="font-semibold">Suggested follow-up</p>
                <span className="text-[11px] text-slate-400">
                  {followupDraft.channel === "sms" ? "Text" : followupDraft.channel}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                HandyBob drafted a follow-up for you. Review it or discard.
              </p>
              {followupDraft.recommendation && !isJobSidebar && (
                <div className="space-y-1 rounded-md border border-slate-800/60 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-200">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                    Next recommended step
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {describeFollowupRecommendation(followupDraft.recommendation)}
                  </p>
                  {followupDraft.recommendation.reason && (
                    <p className="text-xs text-slate-500">
                      {followupDraft.recommendation.reason}
                    </p>
                  )}
                </div>
              )}
              {followupDraft.subject && (
                <p className="text-sm font-semibold text-slate-100">{followupDraft.subject}</p>
              )}
              <p className="text-xs text-slate-200 whitespace-pre-wrap">
                {followupDraft.body.length > 180
                  ? `${followupDraft.body.slice(0, 180)}…`
                  : followupDraft.body}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-slate-300 hover:bg-slate-900"
                  onClick={() => setFollowupDraft(null)}
                  disabled={savingFollowupMessage}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full bg-sky-500 px-3 py-1.5 font-semibold text-sky-950 hover:bg-sky-400"
                  onClick={handleCreateFollowupMessageFromDraft}
                  disabled={savingFollowupMessage}
                >
                  {savingFollowupMessage ? "Opening…" : "Open draft"}
                </button>
              </div>
            </div>
          )}
          {isCallSession && loadingNextActionSuggestion && !nextActionSuggestion && (
            <p className="text-xs text-slate-400">
              Thinking about the best next step…
            </p>
          )}
          {isCallSession && nextActionSuggestion && (
            <div className="space-y-3 rounded-lg border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-100 shadow-lg">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-400">
                <p>Next step</p>
                <span className="text-[11px] text-slate-400">
                  {nextActionSuggestion.type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                HandyBob’s suggestion based on this call.
              </p>
              <p className="text-sm font-semibold text-slate-100">{nextActionSuggestion.label}</p>
              {nextActionSuggestion.timingHint && (
                <p className="text-xs text-slate-500">
                  When: {nextActionSuggestion.timingHint}
                </p>
              )}
              <p className="text-xs text-slate-200">{nextActionSuggestion.reason}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-slate-300 hover:bg-slate-900"
                  onClick={() => setNextActionSuggestion(null)}
                  disabled={savingNextActionPlan}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1.5 font-semibold text-emerald-950 hover:bg-emerald-400"
                  onClick={handleLogNextActionPlan}
                  disabled={savingNextActionPlan}
                >
                  {savingNextActionPlan ? "Logging…" : "Log this plan"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
          <p className="text-sm text-slate-400">
            No call script generated yet. Generate a script to see talking points here.
          </p>
        </div>
      )}
    </HbCard>
  );
}
