"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import { ASKBOB_CALL_INTENT_LABELS, type AskBobCallIntent } from "@/lib/domain/askbob/types";
import { readAndClearAskBobCallContext } from "@/utils/askbob/callContextCache";

type AskBobCallContextStripProps = {
  callId: string;
  jobId: string | null;
  scriptBody: string;
  scriptSummary?: string | null;
};

export default function AskBobCallContextStrip({
  callId,
  jobId,
  scriptBody,
  scriptSummary,
}: AskBobCallContextStripProps) {
  const [storedIntents] = useState<AskBobCallIntent[] | null>(() => {
    if (!jobId) {
      return null;
    }
    const cached = readAndClearAskBobCallContext(jobId);
    return cached?.intents ?? null;
  });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) {
      return;
    }
    console.log("[calls-session-askbob-context-visible]", {
      callId,
      jobId,
      hasScriptBody: Boolean(scriptBody),
      intentsCount: storedIntents?.length ?? null,
    });
    loggedRef.current = true;
  }, [callId, jobId, scriptBody, storedIntents]);

  const intentLabels = useMemo(
    () =>
      storedIntents
        ?.map((intent) => ASKBOB_CALL_INTENT_LABELS[intent])
        .filter(Boolean) ?? [],
    [storedIntents],
  );

  const handleCopyScript = async () => {
    if (!scriptBody || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(scriptBody);
      setCopyFeedback("Copied script");
      window.setTimeout(() => setCopyFeedback(null), 2000);
    } catch (error) {
      console.error("[calls-session-askbob-strip] clipboard.copy failed", error);
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
              AskBob
            </span>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Prepared call script for this job
            </p>
          </div>
          {intentLabels.length > 0 && (
            <p className="text-xs text-slate-400">
              Primary goals: {intentLabels.join(" · ")}
            </p>
          )}
          {scriptSummary && (
            <p className="text-xs text-slate-400">{scriptSummary}</p>
          )}
        </div>
        {scriptBody && (
          <div className="flex flex-col items-end gap-1">
            <HbButton
              variant="ghost"
              size="xs"
              className="text-[11px] uppercase tracking-[0.3em]"
              onClick={handleCopyScript}
            >
              Copy script
            </HbButton>
            {copyFeedback && (
              <p className="text-[11px] text-emerald-400">{copyFeedback}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
