"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import type {
  AskBobFollowupSnapshotPayload,
  AskBobJobFollowupResult,
  AskBobJobScheduleSuggestion,
} from "@/lib/domain/askbob/types";
import { runAskBobJobFollowupAction } from "@/app/(app)/askbob/followup-actions";
import { runAskBobJobScheduleAction, runAskBobScheduleAppointmentAction } from "@/app/(app)/askbob/job-schedule-actions";
import { draftAskBobJobFollowupMessageAction } from "@/app/(app)/askbob/followup-message-draft-actions";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";

type JobAskBobFollowupPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  diagnosisSummaryForFollowup?: string | null;
  materialsSummaryForFollowup?: string | null;
  hasQuoteContextForFollowup?: boolean;
  lastQuoteIdForFollowup?: string;
  lastQuoteCreatedAtForFollowup?: string;
  lastQuoteCreatedAtLabelForFollowup?: string;
  stepCompleted?: boolean;
  onFollowupCompleted?: () => void;
  resetToken?: number;
  onReset?: () => void;
  stepCollapsed?: boolean;
  onToggleStepCollapsed?: () => void;
  initialFollowupSnapshot?: AskBobFollowupSnapshotPayload | null;
  askBobAppointmentScheduled?: {
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  };
  onAskBobAppointmentScheduled?: (info: {
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  }) => void;
};

export default function JobAskBobFollowupPanel({
  workspaceId,
  jobId,
  customerId,
  jobTitle,
  jobDescription,
  diagnosisSummaryForFollowup,
  materialsSummaryForFollowup,
  hasQuoteContextForFollowup,
  lastQuoteIdForFollowup,
  lastQuoteCreatedAtForFollowup,
  lastQuoteCreatedAtLabelForFollowup,
  stepCompleted,
  onFollowupCompleted,
  resetToken,
  onReset,
  stepCollapsed = false,
  onToggleStepCollapsed,
  initialFollowupSnapshot,
  askBobAppointmentScheduled,
  onAskBobAppointmentScheduled,
}: JobAskBobFollowupPanelProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initialFollowupResult = initialFollowupSnapshot
    ? {
        ...initialFollowupSnapshot,
        modelLatencyMs: initialFollowupSnapshot.modelLatencyMs ?? 0,
        rawModelOutput: null,
      }
    : null;
  const [result, setResult] = useState<AskBobJobFollowupResult | null>(initialFollowupResult);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleResult, setScheduleResult] = useState<{
    suggestions: AskBobJobScheduleSuggestion[];
    explanation?: string | null;
  } | null>(null);
  const [schedulingSuggestionId, setSchedulingSuggestionId] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const hasResetEffectRun = useRef(false);
  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    if (!hasResetEffectRun.current) {
      hasResetEffectRun.current = true;
      return;
    }
    setResult(null);
    setErrorMessage(null);
    setDraftError(null);
    setIsLoading(false);
    setIsDrafting(false);
  }, [resetToken]);
  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const normalizedDiagnosisSummary = diagnosisSummaryForFollowup?.trim() ?? "";
  const normalizedMaterialsSummary = materialsSummaryForFollowup?.trim() ?? "";
  const hasDiagnosisContext = Boolean(normalizedDiagnosisSummary);
  const hasMaterialsContext = Boolean(normalizedMaterialsSummary);
  const hasQuoteContext = Boolean(hasQuoteContextForFollowup);
  const contextParts: string[] = [];
  if (normalizedJobTitle) {
    contextParts.push("job title");
  }
  if (normalizedJobDescription) {
    contextParts.push("job description");
  }
  if (hasDiagnosisContext) {
    contextParts.push("AskBob diagnosis");
  }
  if (hasMaterialsContext) {
    contextParts.push("AskBob materials checklist");
  }
  if (hasQuoteContext) {
    contextParts.push("AskBob quote");
  }
  if (askBobAppointmentScheduled) {
    contextParts.push("AskBob appointment");
  }
  const contextUsedText =
    contextParts.length > 0
      ? `Context used: ${contextParts.join(", ")}`
      : "Context used: none yet. Provide job and follow-up details on this page so AskBob can reference them.";

  const fallbackFriendlyDate =
    lastQuoteCreatedAtForFollowup && !lastQuoteCreatedAtLabelForFollowup
      ? formatFriendlyDateTime(lastQuoteCreatedAtForFollowup, "")
      : null;
  const displayFriendlyDate = lastQuoteCreatedAtLabelForFollowup ?? fallbackFriendlyDate;
  const showQuoteContextLine = Boolean(hasQuoteContextForFollowup && lastQuoteIdForFollowup);
  const quoteContextLabel = displayFriendlyDate
    ? `Using your latest quote from ${displayFriendlyDate}.`
    : "Using your latest quote for this job.";
  const quoteDetailsHref = lastQuoteIdForFollowup ? `/quotes/${lastQuoteIdForFollowup}` : undefined;
  const hasFollowupResult = Boolean(result);
  const appointmentScheduledLabel = askBobAppointmentScheduled
    ? askBobAppointmentScheduled.friendlyLabel ||
      formatFriendlyDateTime(askBobAppointmentScheduled.startAt, "") ||
      null
    : null;
  const appointmentDetailsHref = askBobAppointmentScheduled?.appointmentId
    ? `/appointments/${askBobAppointmentScheduled.appointmentId}`
    : undefined;
  const handleReset = () => {
    setResult(null);
    setErrorMessage(null);
    setDraftError(null);
    setIsDrafting(false);
    setIsLoading(false);
    setScheduleError(null);
    setScheduleResult(null);
    setSchedulingSuggestionId(null);
    setAppointmentError(null);
    onReset?.();
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById("askbob-followup");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleRequest = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const response = await runAskBobJobFollowupAction({
        workspaceId,
        jobId,
        extraDetails: null,
        jobTitle: normalizedJobTitle || undefined,
        jobDescription: normalizedJobDescription || undefined,
        diagnosisSummary: normalizedDiagnosisSummary || undefined,
        materialsSummary: normalizedMaterialsSummary || undefined,
        hasQuoteContextForFollowup: hasQuoteContext,
        hasAskBobAppointment: Boolean(askBobAppointmentScheduled),
      });
      if (!response.ok) {
        setErrorMessage("AskBob couldn’t generate a follow-up suggestion right now. Please try again.");
        return;
      }
      setResult(response.followup);
      onFollowupCompleted?.();
    } catch (error) {
      console.error("[askbob-job-followup-ui] client error", error);
      setErrorMessage("AskBob couldn’t generate a follow-up suggestion right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetScheduleSuggestions = async () => {
    setScheduleError(null);
    setAppointmentError(null);
    setScheduleLoading(true);
    try {
      const response = await runAskBobJobScheduleAction({
        workspaceId,
        jobId,
      });
      if (!response.ok) {
        setScheduleResult(null);
        setScheduleError("AskBob couldn’t suggest appointment times right now. Please try again.");
        return;
      }
      setScheduleResult({
        suggestions: response.suggestions,
        explanation: response.explanation ?? null,
      });
    } catch (error) {
      console.error("[askbob-job-schedule-ui] client error", error);
      setScheduleResult(null);
      setScheduleError("AskBob couldn’t suggest appointment times right now. Please try again.");
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleScheduleAppointment = async (suggestion: AskBobJobScheduleSuggestion) => {
    setAppointmentError(null);
    setSchedulingSuggestionId(suggestion.startAt);
    try {
      const response = await runAskBobScheduleAppointmentAction({
        workspaceId,
        jobId,
        startAt: suggestion.startAt,
        endAt: suggestion.endAt ?? null,
        title: normalizedJobTitle ? `Visit for ${normalizedJobTitle}` : null,
      });
      if (!response.ok) {
        setAppointmentError("AskBob couldn’t schedule the appointment right now. Please try again.");
        return;
      }
      const friendlyLabel = formatFriendlyDateTime(response.startAt, "") ?? null;
      onAskBobAppointmentScheduled?.({
        startAt: response.startAt,
        friendlyLabel,
        appointmentId: response.appointmentId,
      });
    } catch (error) {
      console.error("[askbob-job-schedule-appointment] client error", error);
      setAppointmentError("AskBob couldn’t schedule the appointment right now. Please try again.");
    } finally {
      setSchedulingSuggestionId(null);
    }
  };

  useEffect(() => {
    console.log("[askbob-job-followup-ui-entry]", {
      workspaceId,
      jobId,
      hasCustomerId: Boolean(customerId),
      hasJobTitle: Boolean(normalizedJobTitle),
    });
    setDraftError(null);
  }, [workspaceId, jobId, customerId, normalizedJobTitle]);

  useEffect(() => {
    setDraftError(null);
  }, [result]);

  useEffect(() => {
    setScheduleError(null);
    setScheduleResult(null);
    setSchedulingSuggestionId(null);
    setAppointmentError(null);
  }, [result]);

  const followup = result;
  const showMessageCTAs = Boolean(followup?.shouldSendMessage && customerId);
  const followupDraftHint =
    showMessageCTAs && followup
      ? "This draft follows the guidance and stays editable before you send it."
      : null;
  const followupComposerHref = showMessageCTAs
    ? `/messages?${new URLSearchParams({
        compose: "1",
        customerId: customerId ?? "",
        jobId,
        origin: "askbob-followup",
      }).toString()}`
    : undefined;
  const handleComposeClick = () => {
    console.log("[askbob-job-followup-open-composer]", {
      workspaceId,
      jobId,
      customerId,
      shouldSendMessage: followup?.shouldSendMessage,
      suggestedChannel: followup?.suggestedChannel,
      hasJobTitle: Boolean(normalizedJobTitle),
    });
  };

  const handleDraftClick = async () => {
    if (!customerId || !jobId || !followup) {
      return;
    }

    console.log("[askbob-job-followup-draft-click]", {
      workspaceId,
      jobId,
      customerId,
      shouldSendMessage: followup.shouldSendMessage,
      suggestedChannel: followup.suggestedChannel,
      hasJobTitle: Boolean(normalizedJobTitle),
    });

    setDraftError(null);
    setIsDrafting(true);

    try {
      const response = await draftAskBobJobFollowupMessageAction({
        workspaceId,
        jobId,
        extraDetails: null,
        jobTitle: normalizedJobTitle || undefined,
      });

      if (!response.ok || !response.body?.trim()) {
        setDraftError("AskBob couldn’t draft a follow-up message right now. Try again or compose manually.");
        return;
      }

      const params = new URLSearchParams({
        compose: "1",
        customerId,
        jobId,
        origin: "askbob-followup",
      });
      const draftBody = response.body.trim();
      params.set("draftBody", draftBody);

      router.push(`/messages?${params.toString()}`);
    } catch (error) {
      console.error("[askbob-job-followup-draft-click] error", error);
      setDraftError("AskBob couldn’t draft a follow-up message right now. Try again or compose manually.");
    } finally {
      setIsDrafting(false);
    }
  };

  const signalText = result
    ? `Send message: ${result.shouldSendMessage ? "yes" : "no"} · Schedule visit: ${
        result.shouldScheduleVisit ? "yes" : "no"
      } · Call: ${result.shouldCall ? "yes" : "no"} · Wait: ${
        result.shouldWait ? "yes" : "no"
      }`
    : null;

  const toggleLabel = stepCollapsed ? "Show step" : "Hide step";
  const handleToggle = () => onToggleStepCollapsed?.();

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 5 · Plan the follow-up</h2>
            {stepCompleted && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.3em] text-emerald-200">
                Done
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={handleToggle}
            >
              {toggleLabel}
            </HbButton>
            {hasFollowupResult && (
              <HbButton
                variant="ghost"
                size="sm"
                className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
                onClick={handleReset}
              >
                Reset this step
              </HbButton>
            )}
          </div>
        </div>
        {askBobAppointmentScheduled && appointmentScheduledLabel && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <p className="m-0 text-xs text-slate-400">
              AskBob scheduled an appointment: {appointmentScheduledLabel}
            </p>
            {appointmentDetailsHref && (
              <HbButton
                as={Link}
                href={appointmentDetailsHref}
                variant="ghost"
                size="xs"
                className="px-2 py-0.5 text-[11px] uppercase tracking-[0.3em]"
              >
                View appointment
              </HbButton>
            )}
          </div>
        )}
      </div>
      {!stepCollapsed && (
        <>
          <p className="text-sm text-slate-300">
            AskBob summarizes the job’s status, quotes, calls, messages, and appointments to suggest a next step. Use it as a guide and
            rely on your judgment before you act.
          </p>
          {showQuoteContextLine && quoteDetailsHref && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <p className="m-0 text-xs text-slate-300">{quoteContextLabel}</p>
              <HbButton
                as={Link}
                href={quoteDetailsHref}
                variant="ghost"
                size="sm"
                className="px-2 py-0.5 text-[11px] uppercase tracking-[0.3em]"
              >
                View quote details
              </HbButton>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{contextUsedText}</p>
          <div className="flex flex-col gap-2">
            <HbButton
              size="sm"
              variant="secondary"
              disabled={isLoading}
              onClick={handleRequest}
            >
              {isLoading ? "Analyzing follow-up…" : "Get follow-up recommendation"}
            </HbButton>
            {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
          </div>
          {result && (
            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Suggested action</p>
                <p className="text-sm font-semibold text-slate-100">{result.recommendedAction}</p>
              </div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Why AskBob suggests this</p>
              <p className="text-sm text-slate-300">{result.rationale}</p>
              {result.steps.length > 0 && (
                <ol className="space-y-2 text-sm text-slate-300">
                  {result.steps.map((step, index) => (
                    <li key={`step-${index}`} className="space-y-1">
                      <p className="font-semibold text-slate-100">
                        {index + 1}. {step.label}
                      </p>
                      {step.detail && <p className="text-xs text-slate-500">{step.detail}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {signalText && (
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{signalText}</p>
              )}
              {result.riskNotes && (
                <p className="text-xs text-slate-500">Note: {result.riskNotes}</p>
              )}
              {showMessageCTAs && (
                <div className="space-y-2 pt-2">
                  <div className="space-y-2">
                    <HbButton
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      disabled={isDrafting}
                      onClick={handleDraftClick}
                    >
                      {isDrafting ? "Drafting…" : "Draft follow-up message with AskBob"}
                    </HbButton>
                    {draftError && <p className="text-sm text-rose-400">{draftError}</p>}
                  </div>
                  {followupComposerHref && (
                    <HbButton
                      as={Link}
                      href={followupComposerHref}
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={handleComposeClick}
                    >
                      Compose follow-up message
                    </HbButton>
                  )}
                  {followupDraftHint && (
                    <p className="text-xs text-slate-400">{followupDraftHint}</p>
                  )}
                </div>
              )}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    AskBob scheduling (optional)
                  </p>
                  <p className="text-sm text-slate-300">
                    Ask AskBob to suggest a few visit windows based on this job’s status and your working hours. Choose one to book the appointment immediately.
                  </p>
                </div>
                <div className="space-y-2">
                  <HbButton
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    disabled={scheduleLoading}
                    onClick={handleGetScheduleSuggestions}
                  >
                    {scheduleLoading
                      ? "Getting suggested times…"
                      : scheduleResult
                        ? "Refresh suggested times"
                        : "Get suggested times"}
                  </HbButton>
                  {scheduleError && <p className="text-sm text-rose-400">{scheduleError}</p>}
                </div>
                {scheduleResult?.explanation && (
                  <p className="text-xs text-slate-400">{scheduleResult.explanation}</p>
                )}
                {scheduleResult?.suggestions.length ? (
                  <div className="space-y-3">
                    {scheduleResult.suggestions.map((suggestion) => {
                      const friendlyTime = formatFriendlyDateTime(
                        suggestion.startAt,
                        "",
                      );
                      return (
                        <div
                          key={`${suggestion.startAt}-${suggestion.endAt}`}
                          className="space-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-100">
                              {friendlyTime || suggestion.label}
                            </p>
                            {suggestion.urgency && (
                              <span className="text-[11px] uppercase tracking-[0.3em] text-amber-400">
                                {suggestion.urgency}
                              </span>
                            )}
                          </div>
                          {suggestion.label && (
                            <p className="text-xs text-slate-400">{suggestion.label}</p>
                          )}
                          {suggestion.reason && (
                            <p className="text-xs text-slate-500">{suggestion.reason}</p>
                          )}
                          <HbButton
                            size="xs"
                            variant="secondary"
                            className="w-full"
                            disabled={schedulingSuggestionId === suggestion.startAt}
                            onClick={() => handleScheduleAppointment(suggestion)}
                          >
                            {schedulingSuggestionId === suggestion.startAt
                              ? "Scheduling…"
                              : "Schedule this appointment"}
                          </HbButton>
                        </div>
                      );
                    })}
                  </div>
                ) : scheduleResult ? (
                  <p className="text-sm text-slate-400">No suggestions available right now.</p>
                ) : null}
                {appointmentError && <p className="text-sm text-rose-400">{appointmentError}</p>}
                {askBobAppointmentScheduled && !schedulingSuggestionId && (
                  <div className="text-xs text-slate-300">
                    <p className="m-0">
                      Appointment scheduled for{" "}
                      {appointmentScheduledLabel ?? "the selected time"} by AskBob.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </HbCard>
  );
}
