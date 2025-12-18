"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";

import {
  getCallSessionDialStatus,
  type GetCallSessionDialStatusResult,
} from "@/app/(app)/calls/actions/getCallSessionDialStatus";
import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { type StartCallWithScriptPayload } from "@/components/askbob/AskBobCallAssistPanel";
import {
  startAskBobAutomatedCall,
  type StartAskBobAutomatedCallResult,
} from "@/app/(app)/calls/actions/startAskBobAutomatedCall";
import { saveAutomatedCallNotesAction } from "@/app/(app)/calls/actions/saveAutomatedCallNotesAction";
import { formatTwilioStatusLabel } from "@/utils/calls/twilioStatusLabel";
import {
  ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT,
  ASKBOB_AUTOMATED_VOICE_DEFAULT,
} from "@/lib/domain/askbob/speechPlan";

const SCRIPT_PREVIEW_LIMIT = 360;
const VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy (neutral)" },
  { value: "samantha", label: "Samantha (friendly)" },
  { value: "david", label: "David (calm)" },
];
const GREETING_STYLE_OPTIONS = [
  { value: "Professional", label: "Professional" },
  { value: "Friendly", label: "Friendly" },
  { value: "Warm", label: "Warm" },
];
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 30;
const TERMINAL_GRACE_ATTEMPTS = 3;
const NOTES_AUTOSAVE_DEBOUNCE_MS = 750;
const NOTES_SAVE_MIN_INTERVAL_MS = 2000;

const truncatePreview = (value: string, limit: number) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
};

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

type StatusState = "idle" | "calling" | "success" | "failure" | "already_in_progress";

type Props = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  customerDisplayName?: string | null;
  customerPhoneNumber?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  callScriptBody?: string | null;
  callScriptSummary?: string | null;
  latestCallOutcomeLabel?: string | null;
  stepCompleted?: boolean;
  stepCollapsed?: boolean;
  onToggleCollapse?: () => void;
  resetToken?: number;
  onReset?: () => void;
  onStartCallWithScript?: (payload: StartCallWithScriptPayload) => void;
  onAutomatedCallSuccess?: (summary: string) => void;
  onAutomatedCallNotesChange?: (notes: string | null) => void;
};

export default function AskBobAutomatedCallPanel({
  workspaceId,
  jobId,
  customerId,
  customerDisplayName,
  customerPhoneNumber,
  jobTitle,
  jobDescription,
  callScriptBody,
  callScriptSummary,
  latestCallOutcomeLabel,
  stepCompleted = false,
  stepCollapsed = false,
  onToggleCollapse,
  resetToken,
  onReset,
  onStartCallWithScript,
  onAutomatedCallSuccess,
  onAutomatedCallNotesChange,
}: Props) {
  const [status, setStatus] = useState<StatusState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [twilioStatus, setTwilioStatus] = useState<string | null>(null);
  const [resultTwilioCallSid, setResultTwilioCallSid] = useState<string | null>(null);
  const [resultCode, setResultCode] = useState<string | null>(null);
  const [isPlacingCall, setIsPlacingCall] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<GetCallSessionDialStatusResult | null>(null);
  const [pollHintVisible, setPollHintVisible] = useState(false);
  const [voice, setVoice] = useState(ASKBOB_AUTOMATED_VOICE_DEFAULT);
  const [greetingStyle, setGreetingStyle] = useState(ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT);
  const [allowVoicemail, setAllowVoicemail] = useState(false);
  const hasResetEffectRunRef = useRef(false);
  const preservedSuccessSessionRef = useRef<string | null>(null);
  const guardVisibleLoggedRef = useRef(false);
  const [notesInput, setNotesInput] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const notesRef = useRef("");
  const notesDirtyRef = useRef(false);
  const lastSavedNotesRef = useRef<string | null>(null);
  const lastNotesEditedAtRef = useRef(0);
  const lastSaveTimestampRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandVersionRef = useRef(stepCollapsed ? 0 : 1);
  const previousCollapsedRef = useRef(stepCollapsed);
  const notesVisibilityLoggedRef = useRef<{ callId: string; expandVersion: number } | null>(null);
  const parentNotesValueRef = useRef<string | null>(null);
  const onAutomatedCallNotesChangeRef = useRef(onAutomatedCallNotesChange);
  const notifyParentOfNotes = useCallback((value: string | null) => {
    const callback = onAutomatedCallNotesChangeRef.current;
    if (!callback) {
      parentNotesValueRef.current = value;
      return;
    }
    if (parentNotesValueRef.current === value) {
      return;
    }
    parentNotesValueRef.current = value;
    callback(value);
  }, []);

  const normalizedCustomerName = customerDisplayName?.trim() ?? null;
  const normalizedCustomerPhone = customerPhoneNumber?.trim() ?? null;
  const trimmedScriptBody = callScriptBody?.trim() ?? null;
  const trimmedScriptSummary = callScriptSummary?.trim() ?? null;
  const hasScriptContent = Boolean(trimmedScriptBody || trimmedScriptSummary);
  const scriptPreview = trimmedScriptBody || trimmedScriptSummary || "";
  const previewText = scriptPreview ? truncatePreview(scriptPreview, SCRIPT_PREVIEW_LIMIT) : null;
  const hasCustomerPhone = Boolean(normalizedCustomerPhone);
  const toggleLabel = stepCollapsed ? "Show step" : "Hide step";

  const contextParts = useMemo(() => {
    const parts: string[] = [];
    if (jobTitle?.trim()) {
      parts.push("job title");
    }
    if (jobDescription?.trim()) {
      parts.push("job description");
    }
    if (trimmedScriptSummary) {
      parts.push("latest call script");
    }
    if (latestCallOutcomeLabel) {
      parts.push("latest call outcome");
    }
    return parts;
  }, [jobTitle, jobDescription, trimmedScriptSummary, latestCallOutcomeLabel]);

  const contextText = contextParts.length
    ? `Context used: ${contextParts.join(", ")}`
    : "Context used: none yet. Provide job and call details so AskBob knows what to reference.";

  const canPlaceCall = Boolean(workspaceId && jobId && hasCustomerPhone && hasScriptContent && !isPlacingCall);
  const canOpenCallWorkspace = Boolean(trimmedScriptBody && hasCustomerPhone && onStartCallWithScript && !isPlacingCall);

  const handleLocalReset = useCallback(
    (options?: { force?: boolean }) => {
      const shouldPreserveStatus =
        !options?.force &&
        (status === "success" || status === "already_in_progress") &&
        callSessionId &&
        preservedSuccessSessionRef.current === callSessionId;
      if (shouldPreserveStatus) {
        return;
      }
      setStatus("idle");
      setStatusMessage(null);
      setCallSessionId(null);
      setTwilioStatus(null);
      setResultTwilioCallSid(null);
      setResultCode(null);
      setIsPlacingCall(false);
      setSessionStatus(null);
      setPollHintVisible(false);
      preservedSuccessSessionRef.current = null;
    },
    [status, callSessionId],
  );
  const handleLocalResetRef = useRef(handleLocalReset);
  useEffect(() => {
    handleLocalResetRef.current = handleLocalReset;
  }, [handleLocalReset]);

  const handleReset = () => {
    handleLocalReset({ force: true });
    onReset?.();
    setVoice(ASKBOB_AUTOMATED_VOICE_DEFAULT);
    setGreetingStyle(ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT);
    setAllowVoicemail(false);
  };

  const handleVoiceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextVoice = event.target.value;
    setVoice(nextVoice);
    console.log("[askbob-automated-call-voice-change]", {
      workspaceId,
      jobId,
      callId: callSessionId ?? null,
      voice: nextVoice,
    });
  };

  const handleGreetingStyleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setGreetingStyle(event.target.value);
  };

  const handleVoicemailToggle = () => {
    const nextValue = !allowVoicemail;
    setAllowVoicemail(nextValue);
    console.log("[askbob-automated-call-voicemail-toggle]", {
      workspaceId,
      jobId,
      callId: callSessionId ?? null,
      allowVoicemail: nextValue,
    });
  };

  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    if (!hasResetEffectRunRef.current) {
      hasResetEffectRunRef.current = true;
      return;
    }
    handleLocalResetRef.current?.();
  }, [resetToken]);

  useEffect(() => {
    if (!hasScriptContent) {
      handleLocalResetRef.current?.();
    }
  }, [hasScriptContent]);

  useEffect(() => {
    if (!hasScriptContent) {
      setVoice(ASKBOB_AUTOMATED_VOICE_DEFAULT);
      setGreetingStyle(ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT);
      setAllowVoicemail(false);
    }
  }, [hasScriptContent]);

  useEffect(() => {
    onAutomatedCallNotesChangeRef.current = onAutomatedCallNotesChange;
  }, [onAutomatedCallNotesChange]);

  useEffect(() => {
    if (stepCollapsed) {
      guardVisibleLoggedRef.current = false;
      return;
    }
    if (!guardVisibleLoggedRef.current) {
      console.log("[askbob-automated-call-robocall-guard-visible]", {
        workspaceId,
        jobId,
        callId: callSessionId ?? null,
      });
      guardVisibleLoggedRef.current = true;
    }
  }, [stepCollapsed, workspaceId, jobId, callSessionId]);

  useEffect(() => {
    if (previousCollapsedRef.current && !stepCollapsed) {
      expandVersionRef.current += 1;
    }
    previousCollapsedRef.current = stepCollapsed;
  }, [stepCollapsed]);

  useEffect(() => {
    if (!callSessionId) {
      setNotesInput("");
      notesRef.current = "";
      notesDirtyRef.current = false;
      setNotesDirty(false);
      setSaveState("idle");
      lastSavedNotesRef.current = null;
      notifyParentOfNotes(null);
      setNotesLoaded(false);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      return;
    }
    setNotesLoaded(false);
    notesDirtyRef.current = false;
    setNotesDirty(false);
    setSaveState("idle");
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, [callSessionId, notifyParentOfNotes]);

  useEffect(() => {
    if (status === "success" || status === "already_in_progress") {
      preservedSuccessSessionRef.current = callSessionId;
    } else if (status !== "success" && status !== "already_in_progress") {
      preservedSuccessSessionRef.current = null;
    }
  }, [status, callSessionId]);

  useEffect(() => {
    if (status !== "success" && status !== "already_in_progress") {
      setSessionStatus(null);
      setPollHintVisible(false);
    }
  }, [status]);

  useEffect(() => {
    if (!callSessionId) {
      return;
    }
    if (!sessionStatus) {
      return;
    }
    const serverNotes = sessionStatus.automatedCallNotes;
    setNotesLoaded(true);
    if (!notesDirtyRef.current) {
      const value = serverNotes ?? "";
      setNotesInput(value);
      notesRef.current = value;
      lastSavedNotesRef.current = serverNotes;
      setNotesDirty(false);
      setSaveState("idle");
      notifyParentOfNotes(serverNotes);
    }
  }, [callSessionId, sessionStatus, notifyParentOfNotes]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, []);

  const notesEditorVisible = Boolean(
    callSessionId && !stepCollapsed && (status === "success" || status === "already_in_progress"),
  );
  useEffect(() => {
    if (!notesEditorVisible || !callSessionId || !notesLoaded) {
      return;
    }
    const expandVersion = expandVersionRef.current;
    const logged = notesVisibilityLoggedRef.current;
    if (logged?.callId === callSessionId && logged.expandVersion === expandVersion) {
      return;
    }
    console.log("[askbob-automated-call-notes-visible]", {
      workspaceId,
      callId: callSessionId,
      hasExistingNotes: Boolean(lastSavedNotesRef.current),
    });
    notesVisibilityLoggedRef.current = { callId: callSessionId, expandVersion };
  }, [notesEditorVisible, callSessionId, notesLoaded, workspaceId]);

  useEffect(() => {
    if (
      !callSessionId ||
      stepCollapsed ||
      (status !== "success" && status !== "already_in_progress")
    ) {
      return;
    }

    let attempts = 0;
    let graceRemaining = TERMINAL_GRACE_ATTEMPTS;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stopPolling = (showHint: boolean) => {
      stopped = true;
    if (timer) {
        clearTimeout(timer);
      }
      setPollHintVisible(showHint);
    };

    const scheduleNext = () => {
      if (!stopped) {
        timer = setTimeout(runPoll, POLL_INTERVAL_MS);
      }
    };

    const runPoll = async () => {
      if (stopped) {
        return;
      }
      attempts += 1;

      try {
        const payload = await getCallSessionDialStatus({ callId: callSessionId });
        if (stopped) {
          return;
        }
        setSessionStatus(payload);
        setTwilioStatus(payload.twilioStatus ?? null);

        if (payload.isTerminal) {
          if (payload.hasRecording) {
            stopPolling(false);
            return;
          }
          graceRemaining -= 1;
          if (graceRemaining <= 0) {
            stopPolling(true);
            return;
          }
        }

        if (attempts >= MAX_POLL_ATTEMPTS) {
          stopPolling(true);
          return;
        }

        scheduleNext();
      } catch {
        if (stopped) {
          return;
        }
        stopPolling(true);
      }
    };

    runPoll();

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [callSessionId, stepCollapsed, status]);

  const runNotesSave = useCallback(async () => {
    if (!callSessionId || !notesDirtyRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastSaveTimestampRef.current < NOTES_SAVE_MIN_INTERVAL_MS) {
      const delay = NOTES_SAVE_MIN_INTERVAL_MS - (now - lastSaveTimestampRef.current);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(runNotesSave, delay);
      return;
    }
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSaveState("saving");
    const editedAt = lastNotesEditedAtRef.current;
    const valueToSave = notesRef.current;
    try {
      const result = await saveAutomatedCallNotesAction({
        workspaceId,
        callId: callSessionId,
        notes: valueToSave,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      lastSaveTimestampRef.current = Date.now();
      lastSavedNotesRef.current = result.notes;
      notifyParentOfNotes(result.notes);
      if (lastNotesEditedAtRef.current === editedAt) {
        const normalized = result.notes ?? "";
        setNotesInput(normalized);
        notesRef.current = normalized;
        notesDirtyRef.current = false;
        setNotesDirty(false);
        setSaveState("saved");
      } else {
        notesDirtyRef.current = true;
        setNotesDirty(true);
        setSaveState("idle");
      }
    } catch {
      notesDirtyRef.current = true;
      setNotesDirty(true);
      setSaveState("error");
    }
  }, [callSessionId, workspaceId, notifyParentOfNotes]);

  const scheduleNotesSave = useCallback(
    (options?: { immediate?: boolean; force?: boolean }) => {
      if (!callSessionId) {
        return;
      }
      if (!notesDirtyRef.current && !options?.force) {
        return;
      }
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      const delay = options?.immediate ? 0 : NOTES_AUTOSAVE_DEBOUNCE_MS;
      autosaveTimerRef.current = setTimeout(runNotesSave, delay);
    },
    [callSessionId, runNotesSave],
  );

  const handleNotesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
      setNotesInput(nextValue);
      notesRef.current = nextValue;
      notesDirtyRef.current = true;
      setNotesDirty(true);
      setSaveState("idle");
      lastNotesEditedAtRef.current = Date.now();
      scheduleNotesSave();
    },
    [scheduleNotesSave],
  );

  const handleManualNotesSave = useCallback(() => {
    scheduleNotesSave({ immediate: true, force: true });
  }, [scheduleNotesSave]);

  const handlePlaceCall = useCallback(async () => {
    if (!canPlaceCall || !normalizedCustomerPhone) {
      return;
    }
    setIsPlacingCall(true);
    setStatus("calling");
    setStatusMessage("Placing your automated call...");
    setCallSessionId(null);
    setTwilioStatus(null);
    setResultCode(null);
    console.log("[askbob-automated-call-ui-request]", {
      workspaceId,
      jobId,
      hasScriptBody: Boolean(trimmedScriptBody),
      hasCustomerPhone,
    });
    console.log("[askbob-automated-call-ui-submit]", {
      workspaceId,
      jobId,
      customerId: customerId ?? null,
      hasScriptBody: Boolean(trimmedScriptBody),
      hasCustomerPhone,
    });

    let actionResult: StartAskBobAutomatedCallResult | null = null;

    try {
      actionResult = await startAskBobAutomatedCall({
        workspaceId,
        jobId,
        customerId: customerId ?? null,
        customerPhone: normalizedCustomerPhone,
        scriptBody: trimmedScriptBody,
        scriptSummary: trimmedScriptSummary,
        voice,
        greetingStyle,
        allowVoicemail,
      });

      setCallSessionId(actionResult.callId ?? null);
      setTwilioStatus(actionResult.twilioStatus ?? null);
      setResultTwilioCallSid(actionResult.twilioCallSid ?? null);
      setStatusMessage(actionResult.message ?? null);

      if (actionResult.status === "success") {
        setStatus("success");
        onAutomatedCallSuccess?.(actionResult.label);
      } else if (actionResult.status === "already_in_progress") {
        setStatus("already_in_progress");
      } else {
        setStatus("failure");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to start the call right now.";
      setStatus("failure");
      setStatusMessage(errorMessage);
      setResultTwilioCallSid(null);
      actionResult = {
        status: "failure",
        code: "unexpected_error",
        message: errorMessage,
      };
    } finally {
      const outcome = actionResult?.status ?? "failure";
      const finalCode = actionResult?.code ?? "unexpected_error";
      console.log("[askbob-automated-call-ui-result]", {
        workspaceId,
        jobId,
        callId: actionResult?.callId ?? null,
        outcome,
        code: finalCode,
      });
      setResultCode(finalCode);
      setIsPlacingCall(false);
    }
  }, [
    allowVoicemail,
    canPlaceCall,
    customerId,
    greetingStyle,
    jobId,
    normalizedCustomerPhone,
    onAutomatedCallSuccess,
    trimmedScriptBody,
    trimmedScriptSummary,
    voice,
    workspaceId,
    hasCustomerPhone,
  ]);

  const handleOpenCallWorkspace = () => {
    if (!canOpenCallWorkspace || !trimmedScriptBody) {
      return;
    }
    onStartCallWithScript?.({
      jobId,
      customerId: customerId ?? null,
      customerDisplayName: customerDisplayName ?? null,
      customerPhone: normalizedCustomerPhone,
      scriptBody: trimmedScriptBody,
      scriptSummary: trimmedScriptSummary ?? null,
    });
  };

  const twilioStatusLabel = useMemo(() => formatTwilioStatusLabel(twilioStatus), [twilioStatus]);
  const statusCopy = useMemo(() => {
    if (status === "calling") {
      return "Placing the AskBob automated call...";
    }
    if (status === "already_in_progress") {
      return statusMessage ?? "Call already started. Open call session.";
    }
    if (status === "success") {
      return statusMessage ?? "Call started.";
    }
    if (status === "failure") {
      return statusMessage ?? "Couldn’t place the call. Try again.";
    }
    return "Generate a script in Step 7 and then place an automated call when you’re ready.";
  }, [status, statusMessage]);
  const showSuccessBanner = (status === "success" || status === "already_in_progress") && Boolean(callSessionId);
  const sessionRecordingDurationLabel = sessionStatus?.recordingDurationSeconds
    ? formatRecordingDuration(sessionStatus.recordingDurationSeconds)
    : null;
  const successBannerTitle =
    status === "already_in_progress" || resultCode === "call_already_started"
      ? "Call already started"
      : "Call started";
  const notesSaveStatusText =
    saveState === "saving"
      ? "Saving..."
      : saveState === "saved"
      ? "Saved"
      : saveState === "error"
      ? "Failed to save"
      : null;
  const canTriggerNotesSave = Boolean(callSessionId && (notesDirty || saveState === "error"));

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 9 · AskBob automated call</h2>
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
              onClick={onToggleCollapse}
            >
              {toggleLabel}
            </HbButton>
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={handleReset}
            >
              Reset this step
            </HbButton>
          </div>
        </div>
        {!stepCollapsed && (
          <>
            <p className="text-sm text-slate-400">
              AskBob can place an outbound call with the script you prepared in Step 7. Use this when you’re ready to
              have the customer called automatically.
            </p>
            <p className="text-xs text-slate-500">{contextText}</p>
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Script preview</p>
              {previewText ? (
                <p className="mt-2 whitespace-pre-line text-sm text-slate-200">{previewText}</p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Generate a call script from Step 7 so AskBob knows what to say when placing the automated call.
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="voice-control"
                  className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500"
                >
                  Voice
                </label>
                <select
                  id="voice-control"
                  className="w-full rounded border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  value={voice}
                  onChange={handleVoiceChange}
                  disabled={!hasScriptContent}
                >
                  {VOICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="greeting-style-control"
                  className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500"
                >
                  Greeting style
                </label>
                <select
                  id="greeting-style-control"
                  className="w-full rounded border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  value={greetingStyle}
                  onChange={handleGreetingStyleChange}
                  disabled={!hasScriptContent}
                >
                  {GREETING_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border border-slate-700 bg-slate-900 text-emerald-400 checked:border-emerald-400"
                    checked={allowVoicemail}
                    onChange={handleVoicemailToggle}
                    disabled={!hasScriptContent}
                  />
                  Leave voicemail if unanswered
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {normalizedCustomerName && (
                <p className="text-sm text-slate-200">Customer: {normalizedCustomerName}</p>
              )}
              {hasCustomerPhone ? (
                <p className="text-sm text-slate-400">Phone: {normalizedCustomerPhone}</p>
              ) : (
                <p className="text-xs text-rose-300">No customer phone on file</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <HbButton
                variant="primary"
                size="md"
                onClick={handlePlaceCall}
                disabled={!canPlaceCall}
              >
                {isPlacingCall ? "Placing automated call…" : "Place automated call"}
              </HbButton>
              <HbButton variant="secondary" size="md" onClick={handleOpenCallWorkspace} disabled={!canOpenCallWorkspace}>
                Open call workspace instead
              </HbButton>
            </div>
            <p className="text-[11px] text-amber-300">
              Automated calls are for job-related follow-ups only.
            </p>
            <div className="space-y-3 text-sm">
              {status === "idle" && (
                <p className="text-slate-400">{statusCopy}</p>
              )}
              {status === "calling" && (
                <p className="text-slate-400">{statusMessage}</p>
              )}
              {showSuccessBanner && (
                <div className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-slate-200">
                  <span className="text-emerald-200 font-semibold">{successBannerTitle}</span>
                  {status === "already_in_progress" && statusMessage && (
                    <p className="text-sm text-slate-200">{statusMessage}</p>
                  )}
                  {twilioStatusLabel && (
                    <p className="text-xs text-slate-300">Twilio status: {twilioStatusLabel}</p>
                  )}
                  {sessionStatus ? (
                    <p className="text-xs text-slate-300">
                      Recording: {sessionStatus.hasRecording ? "ready" : "processing"}
                      {sessionStatus.hasRecording && sessionRecordingDurationLabel
                        ? ` · ${sessionRecordingDurationLabel}`
                        : ""}
                    </p>
                  ) : resultTwilioCallSid ? (
                    <p className="text-xs text-slate-300">
                      A recording will appear in the call session after the call completes.
                    </p>
                  ) : null}
                  <Link
                    href={`/calls/${callSessionId}`}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-200 shadow-sm transition hover:bg-emerald-500/20"
                  >
                    Open call session
                  </Link>
                  {pollHintVisible && (
                    <p className="text-[11px] text-slate-400">
                      If polling stops updating, open the call session page for the latest state.
                    </p>
                  )}
                </div>
              )}
              {status === "failure" && (
                <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.3em] text-rose-200">Call failed</p>
                    <p className="text-sm text-rose-100">{statusMessage}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <HbButton variant="ghost" size="sm" onClick={handlePlaceCall} disabled={!canPlaceCall}>
                      Try again
                    </HbButton>
                    {callSessionId && (
                      <Link
                        href={`/calls/${callSessionId}`}
                        className="text-emerald-400 underline-offset-2 hover:text-emerald-200"
                      >
                        View call details
                      </Link>
                    )}
                  </div>
                </div>
              )}
            {notesEditorVisible && (
              <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="automated-call-live-notes"
                    className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400"
                  >
                    Live notes
                  </label>
                  <HbButton
                    variant="ghost"
                    size="sm"
                    onClick={handleManualNotesSave}
                    disabled={!canTriggerNotesSave}
                  >
                    Save now
                  </HbButton>
                </div>
                <textarea
                  id="automated-call-live-notes"
                  className="min-h-[120px] w-full rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 focus:border-emerald-400 focus:ring-0"
                  value={notesInput}
                  onChange={handleNotesChange}
                  rows={4}
                  placeholder="Record what was said, updates for the tech, or adjustments for follow-up."
                />
                {notesSaveStatusText && (
                  <p className="text-xs text-slate-400">{notesSaveStatusText}</p>
                )}
              </div>
            )}
            </div>
          </>
        )}
      </div>
    </HbCard>
  );
}
