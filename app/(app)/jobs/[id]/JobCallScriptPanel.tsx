"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { OutboundCallScriptResult } from "@/app/(app)/calls/outboundCallAiActions";
import { generateCallScriptForQuoteAction } from "@/app/(app)/quotes/[id]/callScriptActions";
import {
  createPhoneCallMessageAction,
  updateMessageOutcomeAction,
} from "./phoneCallMessageActions";

export type PhoneMessageSummary = {
  id: string;
  channel: string | null;
  body: string | null;
  created_at: string | null;
  outcome?: string | null;
};

type JobCallScriptPanelProps = {
  quoteId: string;
  jobId: string;
  workspaceId: string;
  latestPhoneMessage?: PhoneMessageSummary | null;
  latestCallScript?: OutboundCallScriptResult | null;
  customerName?: string | null;
  customerFirstName?: string | null;
  customerPhone?: string | null;
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

const CALL_OUTCOME_OPTIONS = [
  { value: "", label: "Not recorded yet" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "talked_to_customer", label: "Talked to customer" },
  { value: "no_answer", label: "No answer" },
  { value: "call_rescheduled", label: "Call rescheduled" },
];

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
}: JobCallScriptPanelProps) {
  const [callScriptResult, setCallScriptResult] = useState<OutboundCallScriptResult | null>(
    initialLatestCallScript ?? null,
  );
  const [callScriptError, setCallScriptError] = useState<string | null>(null);
  const [callScriptCopied, setCallScriptCopied] = useState(false);
  const [hasUsedCallScript, setHasUsedCallScript] = useState(false);
  const [callOutcomeNotes, setCallOutcomeNotes] = useState("");
  const [callOutcome, setCallOutcome] = useState("not_set");
  const [isSavingCallOutcome, setIsSavingCallOutcome] = useState(false);
  const [lastCallOutcomeSaved, setLastCallOutcomeSaved] = useState(false);
  const [callOutcomeError, setCallOutcomeError] = useState<string | null>(null);
  const [latestPhoneMessage, setLatestPhoneMessage] = useState<PhoneMessageSummary | null>(
    initialLatestPhoneMessage ?? null,
  );
  const [showGuidedCall, setShowGuidedCall] = useState(false);
  const [isPending, startTransition] = useTransition();
  const callScriptLoading = isPending;
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoggedViewRef = useRef(false);

  useEffect(() => {
    setLatestPhoneMessage(initialLatestPhoneMessage ?? null);
  }, [initialLatestPhoneMessage]);

  useEffect(() => {
    setCallScriptResult(initialLatestCallScript ?? null);
  }, [initialLatestCallScript]);

  useEffect(() => {
    if (!callScriptResult && showGuidedCall) {
      setShowGuidedCall(false);
    }
  }, [callScriptResult, showGuidedCall]);

  async function runCallScriptAction() {
    console.log("[call-script-ui] generate clicked", { quoteId });
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
  }

  const handleGenerateCallScript = () => {
    if (callScriptLoading) {
      return;
    }
    setCallScriptError(null);
    setCallScriptCopied(false);
    console.log("[call-script-metrics]", {
      event: "call_script_generate_click",
      quoteId,
    });
    startTransition(() => runCallScriptAction());
  };

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
      });
      console.log("[call-script-ui] copied", { quoteId });
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCallScriptCopied(false);
      }, 2000);
    } catch (error) {
      console.log("[call-script-ui] copy failed", { quoteId, error });
    }
  };

  useEffect(() => {
    if (!callScriptResult) {
      hasLoggedViewRef.current = false;
    } else if (!hasLoggedViewRef.current) {
      console.log("[call-script-metrics]", {
        event: "call_script_view",
        quoteId,
      });
      hasLoggedViewRef.current = true;
    }

    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, [callScriptResult, quoteId]);

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
          setLatestPhoneMessage({
            id: result.messageId,
            channel: "phone",
            body,
            created_at: new Date().toISOString(),
            outcome: outcomeLabel,
          });
        console.log("[call-script-metrics]", {
          event: "phone_call_note_saved",
          jobId,
          quoteId,
          workspaceId,
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

  const latestLogBody = latestPhoneMessage?.body?.trim();
  const latestLogTimestamp = latestPhoneMessage
    ? formatTimestamp(latestPhoneMessage.created_at)
    : null;

  const handleLatestOutcomeChange = (nextOutcome: string | null) => {
    setLatestPhoneMessage((prev) => (prev ? { ...prev, outcome: nextOutcome } : prev));
  };

  const callTypeLabel = "Quote follow-up";

  const hasCallScript = Boolean(callScriptResult);
  const guidedCallButtonLabel = hasCallScript
    ? showGuidedCall
      ? "Hide"
      : "Start call"
    : "No script yet";
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
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-100">Phone call script</h3>
        <p className="text-xs text-slate-400">
          Use this to guide a quick call with the customer about their quote.
        </p>
      </div>
      {latestLogBody && (
        <div className="space-y-2 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Last call log</p>
            <span className="text-[10px] uppercase tracking-[0.4em] text-slate-500">
              {latestPhoneMessage?.channel === "phone" ? "Phone" : "Call"}
            </span>
          </div>
          <div className="space-y-1 text-xs text-slate-400">
            {latestPhoneMessage?.id && (
              <CallOutcomeEditor
                key={`call-outcome-${latestPhoneMessage.id}-${latestPhoneMessage.outcome ?? "unset"}`}
                messageId={latestPhoneMessage.id}
                workspaceId={workspaceId}
                initialOutcome={latestPhoneMessage.outcome}
                onOutcomeChange={handleLatestOutcomeChange}
              />
            )}
            <p>Call type: {callTypeLabel}</p>
            {latestLogTimestamp && <p>Call time: {latestLogTimestamp}</p>}
          </div>
          <div className="max-h-44 overflow-auto rounded border border-slate-800/60 bg-slate-950/60 px-3 py-3 text-xs text-slate-200 whitespace-pre-wrap">
            {latestLogBody}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <HbButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleGenerateCallScript}
          disabled={callScriptLoading}
        >
          {callScriptResult ? "Regenerate call script" : "Generate call script"}
        </HbButton>
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
        {callScriptLoading && <p className="text-xs text-slate-400">Generating…</p>}
        {callScriptCopied && (
          <p className="text-xs text-emerald-400">Copied to clipboard.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Guided call</p>
          <p className="text-xs text-slate-400">
            Open a live guidance panel to follow the script while you’re on the phone.
          </p>
        </div>
        <HbButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={!hasCallScript}
          onClick={() => setShowGuidedCall((prev) => !prev)}
        >
          {guidedCallButtonLabel}
        </HbButton>
      </div>
      {callScriptError && (
        <p className="text-sm text-rose-400">{callScriptError}</p>
      )}
      {showGuidedCall && callScriptResult && (
        <div className="space-y-6 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call log</p>
            <div className="space-y-1 text-sm text-slate-100">
              <p>Call type: {callTypeLabel}</p>
              {latestPhoneMessage?.id ? (
                <CallOutcomeEditor
                  key={`guided-outcome-${latestPhoneMessage.id}-${latestPhoneMessage.outcome ?? "unset"}`}
                  messageId={latestPhoneMessage.id}
                  workspaceId={workspaceId}
                  initialOutcome={latestPhoneMessage.outcome}
                  onOutcomeChange={handleLatestOutcomeChange}
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
              onClick={() => setShowGuidedCall(false)}
            >
              Done
            </HbButton>
          </div>
        </div>
      )}
      {callScriptResult && (
        <div className="space-y-3 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call script</p>
            {callScriptResult.channelSuggestion && (
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Channel: {callScriptResult.channelSuggestion}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-50">{callScriptResult.subject}</p>
            <p className="text-xs text-slate-400">{callScriptResult.opening}</p>
          </div>
          {callScriptResult.keyPoints.length > 0 && (
            <ul className="space-y-1 text-sm text-slate-200">
              {callScriptResult.keyPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-[0.1rem] h-3 w-3 rounded-full border border-slate-600 bg-slate-900" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
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
        </div>
      )}
    </HbCard>
  );
}
