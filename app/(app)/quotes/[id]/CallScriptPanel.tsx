"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { OutboundCallScriptResult } from "@/app/(app)/calls/outboundCallAiActions";
import {
  CallScriptActionResponse,
  GenerateCallScriptForQuoteActionInput,
} from "./callScriptActions";

type CallScriptPanelProps = {
  quoteId: string;
  callScriptAction: (input: GenerateCallScriptForQuoteActionInput) => Promise<CallScriptActionResponse>;
  jobId?: string | null;
  workspaceId?: string | null;
};

const ERROR_MESSAGE =
  "We couldn’t generate a call script. Please try again or write your own notes manually.";

export default function CallScriptPanel({
  quoteId,
  callScriptAction,
  jobId,
  workspaceId,
}: CallScriptPanelProps) {
  // CHANGE: inside the client component that renders quote actions
  const [callScriptResult, setCallScriptResult] = useState<OutboundCallScriptResult | null>(null);
  const [callScriptError, setCallScriptError] = useState<string | null>(null);
  const [callScriptCopied, setCallScriptCopied] = useState(false);
  const [hasUsedCallScript, setHasUsedCallScript] = useState(false);
  const [coveredKeyPoints, setCoveredKeyPoints] = useState<boolean[]>(() =>
    callScriptResult?.keyPoints?.map(() => false) ?? [],
  );
  const [isPending, startTransition] = useTransition();
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoggedViewRef = useRef(false);

  const callScriptLoading = isPending;

  async function runCallScriptAction() {
    // CHANGE: log client-side event when user clicks
    console.log("[call-script-ui] generate clicked", { quoteId });
    setCallScriptError(null);
    setCallScriptCopied(false);

    try {
      const response = await callScriptAction({ quoteId });
      if (response.ok) {
        setCallScriptResult(response.data);
        setHasUsedCallScript(false);
        setCallScriptError(null);
      } else {
        setCallScriptError(response.message ?? ERROR_MESSAGE);
      }
    } catch (error) {
      console.error("[call-script-ui] generateCallScriptForQuoteAction failed", error);
      setCallScriptError(ERROR_MESSAGE);
    }
  }

  // CHANGE: add handler for generating call script
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

  // CHANGE: add helper to format call script for clipboard
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

  // CHANGE: add copy handler for call script
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

  const keyPoints = callScriptResult?.keyPoints ?? [];
  const totalPoints = keyPoints.length;
  const coveredCount = coveredKeyPoints.filter(Boolean).length;
  const hasPoints = totalPoints > 0;
  const progressPercent = hasPoints ? (coveredCount / totalPoints) * 100 : 0;

  useEffect(() => {
    // CHANGE: Reset key point checklist whenever a new script arrives.
    // CHANGE: Suppress the set-state-in-effect lint because the effect only runs on script updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoveredKeyPoints(callScriptResult?.keyPoints?.map(() => false) ?? []);
  }, [callScriptResult]);

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-100">Call script helper</h3>
        <p className="text-xs text-slate-400">
          Generate a quick call script based on this quote so you have a guide for what to say when
          you call.
        </p>
      </div>

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

      {callScriptError && (
        <p className="text-sm text-rose-400">{callScriptError}</p>
      )}
      {!callScriptResult && (
        <>
          {/* // CHANGE: Guide users when no script exists yet. */}
          <p className="text-sm text-slate-400">
            No call script generated yet. Create a script to see talking points here.
          </p>
        </>
      )}

      {callScriptResult && (
        <div className="space-y-3 rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call script</p>
            {callScriptResult.channelSuggestion && (
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Suggested: {callScriptResult.channelSuggestion}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-50">{callScriptResult.subject}</p>
            <p className="text-xs text-slate-400">{callScriptResult.opening}</p>
          </div>
          {hasPoints && (
            <>
              {/* // CHANGE: Surface progress and checklist for talking points. */}
              <div className="space-y-3 pb-2">
                <div className="space-y-1 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                  <p>{coveredCount} of {totalPoints} talking points covered</p>
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
                          className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${checked ? "border-emerald-500 bg-emerald-500 text-slate-50" : "border-slate-600 bg-slate-900 text-slate-400"}`}
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
                          className={`flex-1 whitespace-pre-wrap text-sm ${checked ? "line-through text-slate-500" : "text-slate-200"}`}
                        >
                          {point}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
          <p className="text-xs text-slate-400">{callScriptResult.closing}</p>
          <div className="flex justify-end">
            {!hasUsedCallScript ? (
              <HbButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHasUsedCallScript(true);
                  console.log("[call-script-metrics]", {
                    event: "call_script_used",
                    quoteId,
                    jobId: jobId ?? null,
                    workspaceId: workspaceId ?? null,
                    subjectLength: callScriptResult.subject?.length ?? null,
                    keyPointsCount: Array.isArray(callScriptResult.keyPoints)
                      ? callScriptResult.keyPoints.length
                      : null,
                  });
                }}
              >
                Mark script used
              </HbButton>
            ) : (
              <p className="text-xs text-emerald-400">Script marked as used</p>
            )}
          </div>
        </div>
      )}
    </HbCard>
  );
}
