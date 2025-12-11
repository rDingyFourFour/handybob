"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { runAskBobJobScheduleAction } from "@/app/(app)/askbob/job-schedule-actions";
import { runAskBobScheduleAppointmentAction } from "@/app/(app)/askbob/job-schedule-actions";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import type { AskBobJobScheduleResult, AskBobSchedulerSlot } from "@/lib/domain/askbob/types";

type AskBobSchedulerPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  diagnosisSummaryForScheduler?: string | null;
  materialsSummaryForScheduler?: string | null;
  quoteSummaryForScheduler?: string | null;
  followupSummaryForScheduler?: string | null;
  stepCompleted?: boolean;
  stepCollapsed?: boolean;
  onToggleStepCollapsed?: () => void;
  resetToken?: number;
  onReset?: () => void;
  onAppointmentScheduled?: (info: {
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  }) => void;
  onScrollIntoView?: () => void;
};

export default function AskBobSchedulerPanel({
  workspaceId,
  jobId,
  jobTitle,
  jobDescription,
  customerId,
  diagnosisSummaryForScheduler,
  materialsSummaryForScheduler,
  quoteSummaryForScheduler,
  followupSummaryForScheduler,
  stepCompleted = false,
  stepCollapsed = false,
  onToggleStepCollapsed,
  resetToken,
  onReset,
  onAppointmentScheduled,
  onScrollIntoView,
}: AskBobSchedulerPanelProps) {
  const [schedulerResult, setSchedulerResult] = useState<AskBobJobScheduleResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [scheduledInfo, setScheduledInfo] = useState<{
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  } | null>(null);
  const [schedulingSlotId, setSchedulingSlotId] = useState<string | null>(null);
  const lastHandledResetToken = useRef<number | undefined>(undefined);

  const contextParts: string[] = [];
  if (jobTitle?.trim()) {
    contextParts.push("job title");
  }
  if (jobDescription?.trim()) {
    contextParts.push("job description");
  }
  if (diagnosisSummaryForScheduler?.trim()) {
    contextParts.push("AskBob diagnosis");
  }
  if (materialsSummaryForScheduler?.trim()) {
    contextParts.push("AskBob materials");
  }
  if (quoteSummaryForScheduler?.trim()) {
    contextParts.push("AskBob quote");
  }
  if (followupSummaryForScheduler?.trim()) {
    contextParts.push("AskBob follow-up");
  }
  if (customerId) {
    contextParts.push("customer info");
  }
  if (scheduledInfo) {
    contextParts.push("AskBob appointment");
  }
  const contextUsedText =
    contextParts.length > 0
      ? `Context used: ${contextParts.join(", ")}`
      : "Context used: none yet. Provide job and follow-up details on this page so AskBob can reference them.";

  const handleGenerate = async () => {
    setGenerateError(null);
    setAppointmentError(null);
    setSchedulerResult(null);
    setScheduledInfo(null);
    setSchedulingSlotId(null);
    setIsGenerating(true);

    try {
      const response = await runAskBobJobScheduleAction({
        workspaceId,
        jobId,
      });
      if (!response.ok) {
        setGenerateError("AskBob couldn’t suggest appointment times right now. Please try again.");
        return;
      }
      setSchedulerResult(response.schedulerResult as AskBobJobScheduleResult);
    } catch (error) {
      console.error("[askbob-job-scheduler-ui] client error", error);
      setGenerateError("AskBob couldn’t suggest appointment times right now. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScheduleSlot = async (slot: AskBobSchedulerSlot) => {
    setAppointmentError(null);
    setSchedulingSlotId(slot.startAt);
    setAppointmentLoading(true);

    try {
      const response = await runAskBobScheduleAppointmentAction({
        workspaceId,
        jobId,
        startAt: slot.startAt,
        endAt: slot.endAt ?? null,
        title: slot.label,
      });
      if (!response.ok) {
        setAppointmentError("AskBob couldn’t schedule the appointment right now. Please try again.");
        return;
      }
      const friendlyLabel =
        formatFriendlyDateTime(response.startAt, "") ||
        slot.label ||
        null;
      const info = {
        startAt: response.startAt,
        friendlyLabel,
        appointmentId: response.appointmentId,
      };
      setScheduledInfo(info);
      onAppointmentScheduled?.(info);
    } catch (error) {
      console.error("[askbob-job-scheduler-appointment] client error", error);
      setAppointmentError("AskBob couldn’t schedule the appointment right now. Please try again.");
    } finally {
      setAppointmentLoading(false);
      setSchedulingSlotId(null);
    }
  };

  const resetLocalState = useCallback(() => {
    setSchedulerResult(null);
    setGenerateError(null);
    setAppointmentError(null);
    setScheduledInfo(null);
    setSchedulingSlotId(null);
    setIsGenerating(false);
    setAppointmentLoading(false);
  }, []);

  const handleReset = useCallback(() => {
    resetLocalState();
    onReset?.();
  }, [onReset, resetLocalState]);

  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    if (lastHandledResetToken.current === resetToken) {
      return;
    }
    lastHandledResetToken.current = resetToken;
    resetLocalState();
  }, [resetToken, resetLocalState]);

  useEffect(() => {
    if (schedulerResult && onScrollIntoView) {
      onScrollIntoView();
    }
  }, [schedulerResult, onScrollIntoView]);

  const toggleLabel = stepCollapsed ? "Show step" : "Hide step";

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 6 · Schedule an appointment with AskBob</h2>
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
              onClick={onToggleStepCollapsed}
            >
              {toggleLabel}
            </HbButton>
            {(schedulerResult || generateError || scheduledInfo || appointmentError) && (
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
        <p className="text-sm text-slate-300">
          AskBob can propose a few appointment windows; choose one to turn it into a real visit.
        </p>
        <p className="text-xs text-slate-400">{contextUsedText}</p>
        {scheduledInfo && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <p className="m-0 text-xs text-slate-400">
              AskBob scheduled an appointment: {scheduledInfo.friendlyLabel ?? scheduledInfo.startAt}
            </p>
            {scheduledInfo.appointmentId && (
              <HbButton
                as={Link}
                href={`/appointments/${scheduledInfo.appointmentId}`}
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
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Use the job context to generate recommendations and apply a slot when you’re ready.
            </p>
            {generateError && <p className="text-xs text-rose-400">{generateError}</p>}
            <HbButton
              variant="primary"
              size="md"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating suggestions…" : "Generate appointment suggestions"}
            </HbButton>
            {schedulerResult?.rationale && (
              <p className="text-sm text-slate-300">{schedulerResult.rationale}</p>
            )}
            {schedulerResult?.safetyNotes && (
              <p className="text-xs text-amber-300">{schedulerResult.safetyNotes}</p>
            )}
            {schedulerResult?.confirmWithCustomerNotes && (
              <p className="text-xs text-slate-400">{schedulerResult.confirmWithCustomerNotes}</p>
            )}
            {schedulerResult && !schedulerResult.slots.length && (
              <p className="text-sm text-slate-400">AskBob couldn’t find any appointment windows right now.</p>
            )}
            {schedulerResult?.slots.length ? (
              <div className="space-y-3">
                {schedulerResult.slots.map((slot) => {
                  const startLabel = formatFriendlyDateTime(slot.startAt, "") ?? slot.startAt;
                  const endLabel = slot.endAt
                    ? formatFriendlyDateTime(slot.endAt, "") ?? slot.endAt
                    : null;
                  const shouldDim = schedulingSlotId && schedulingSlotId !== slot.startAt;
                  return (
                    <div
                      key={slot.startAt}
                      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 ${
                        schedulingSlotId === slot.startAt ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800"
                      } ${shouldDim ? "opacity-60" : "opacity-100"}`}
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-semibold text-slate-100">{slot.label}</p>
                        <p className="text-xs text-slate-400">
                          {startLabel}
                          {endLabel ? ` – ${endLabel}` : ""}
                        </p>
                        {slot.reason && (
                          <p className="text-xs text-slate-400">Reason: {slot.reason}</p>
                        )}
                        {slot.guidance && (
                          <p className="text-xs text-slate-400">Guidance: {slot.guidance}</p>
                        )}
                        {slot.urgency && (
                          <p className="text-xs text-slate-400 uppercase tracking-[0.3em]">
                            Urgency: {slot.urgency}
                          </p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <HbButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleScheduleSlot(slot)}
                          disabled={appointmentLoading && schedulingSlotId !== slot.startAt}
                        >
                          {appointmentLoading && schedulingSlotId === slot.startAt
                            ? "Scheduling..."
                            : "Schedule this slot"}
                        </HbButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {appointmentError && <p className="text-xs text-rose-400">{appointmentError}</p>}
          </div>
        </>
      )}
    </HbCard>
  );
}
