"use client";

import { useMemo, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { callLiveGuidanceAction } from "@/app/(app)/askbob/call-live-guidance-actions";
import type { CallLiveGuidanceResult } from "@/lib/domain/askbob/types";

type AskBobLiveGuidanceCardProps = {
  workspaceId: string;
  callId: string;
  customerId: string;
  jobId?: string | null;
  direction: string;
  fromNumber: string | null;
  toNumber: string | null;
  customerName?: string | null;
  jobTitle?: string | null;
};

const GUIDANCE_MODES = [
  { label: "Intake", value: "intake" },
  { label: "Scheduling", value: "scheduling" },
] as const;

const NOTE_QUICK_ADDITIONS = [
  {
    label: "Availability change",
    value: "Customer now prefers later afternoons for visits.",
  },
  { label: "Pricing concern", value: "Customer is pushing back on pricing today." },
  {
    label: "Access constraint",
    value: "Need gate code or plan to coordinate access with the homeowner.",
  },
  {
    label: "Communication preference",
    value: "Customer prefers text updates and will reply in the evening.",
  },
];

function determineNotesLengthBucket(length: number): string {
  if (length === 0) return "none";
  if (length <= 200) return "short";
  if (length <= 500) return "medium";
  if (length <= 1000) return "long";
  return "very_long";
}

function buildCycleTimestampLabel(): string {
  try {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "just now";
  }
}

export default function AskBobLiveGuidanceCard({
  workspaceId,
  callId,
  customerId,
  jobId,
  direction,
  fromNumber,
  toNumber,
  customerName,
  jobTitle,
}: AskBobLiveGuidanceCardProps) {
  const normalizedDirection = (direction ?? "outbound").toLowerCase();
  const callGuidanceSessionId = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `session-${Math.random().toString(36).slice(2)}`,
    [],
  );
  const [guidanceMode, setGuidanceMode] = useState<string>("");
  const [notesText, setNotesText] = useState("");
  const [lastGuidanceResult, setLastGuidanceResult] = useState<CallLiveGuidanceResult | null>(
    null,
  );
  const [lastGuidanceGeneratedAtLabel, setLastGuidanceGeneratedAtLabel] = useState<string | null>(
    null,
  );
  const [lastCycleIndex, setLastCycleIndex] = useState<number | null>(null);
  const [cycleIndex, setCycleIndex] = useState(1);
  const [isRequesting, setIsRequesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!customerId || normalizedDirection !== "inbound") {
    return null;
  }

  const formatPrimaryLabel = () => {
    if (lastGuidanceResult) {
      return isRequesting ? "Updating guidance…" : "Update guidance";
    }
    return isRequesting ? "Generating guidance…" : "Generate guidance";
  };

  const appendNoteSnippet = (snippet: string) => {
    setNotesText((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length) {
        return `${trimmed}\n${snippet}`;
      }
      return snippet;
    });
  };

  const listForSection = (items: string[], title: string) => {
    if (!items.length) {
      return null;
    }
    return (
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{title}</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-200">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="leading-snug">
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const handleGenerate = async () => {
    if (!guidanceMode) {
      return;
    }
    const trimmedNotes = notesText.trim();
    const notesPresent = Boolean(trimmedNotes);
    const notesLengthBucket = determineNotesLengthBucket(trimmedNotes.length);
    setErrorMessage(null);
    setIsRequesting(true);
    console.log("[askbob-call-live-guidance-ui-request]", {
      callId,
      workspaceId,
      customerId,
      jobId: jobId ?? null,
      guidanceMode,
      cycleIndex,
      callGuidanceSessionId,
      notesPresent,
      notesLengthBucket,
      priorGuidanceSummary: lastGuidanceResult?.summary ?? null,
      direction: normalizedDirection,
    });
    try {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      formData.set("callId", callId);
      formData.set("customerId", customerId);
      formData.set("guidanceMode", guidanceMode);
      formData.set("callGuidanceSessionId", callGuidanceSessionId);
      formData.set("cycleIndex", cycleIndex.toString());
      if (trimmedNotes.length) {
        formData.set("notesText", trimmedNotes);
      }
      if (jobId) {
        formData.set("jobId", jobId);
      }
      if (lastGuidanceResult?.summary) {
        formData.set("priorGuidanceSummary", lastGuidanceResult.summary);
      }
      if (fromNumber) {
        formData.set("fromNumber", fromNumber);
      }
      if (toNumber) {
        formData.set("toNumber", toNumber);
      }
      const response = await callLiveGuidanceAction(formData);
      if (!response.success) {
        const message = response.message ?? "AskBob could not generate guidance.";
        setErrorMessage(message);
        console.log("[askbob-call-live-guidance-ui-failure]", {
          callId,
          workspaceId,
          customerId,
          jobId: jobId ?? null,
          guidanceMode,
          cycleIndex,
          callGuidanceSessionId,
          notesPresent,
          notesLengthBucket,
          errorMessage: message,
          direction: normalizedDirection,
        });
        return;
      }
      const timestampLabel = buildCycleTimestampLabel();
      setLastGuidanceResult(response.result);
      setLastGuidanceGeneratedAtLabel(timestampLabel);
      setLastCycleIndex(cycleIndex);
      setCycleIndex((prev) => prev + 1);
      console.log("[askbob-call-live-guidance-ui-success]", {
        callId,
        workspaceId,
        customerId,
        jobId: jobId ?? null,
        guidanceMode,
        cycleIndex,
        callGuidanceSessionId,
        notesPresent,
        notesLengthBucket,
        changedRecommendation: response.result.changedRecommendation,
        direction: normalizedDirection,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AskBob could not generate guidance.";
      setErrorMessage(message);
      console.log("[askbob-call-live-guidance-ui-failure]", {
        callId,
        workspaceId,
        customerId,
        jobId: jobId ?? null,
        guidanceMode,
        cycleIndex,
        callGuidanceSessionId,
        notesPresent,
        notesLengthBucket,
        errorMessage: message,
        direction: normalizedDirection,
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleReset = () => {
    setLastGuidanceResult(null);
    setGuidanceMode("");
    setNotesText("");
    setErrorMessage(null);
    setLastGuidanceGeneratedAtLabel(null);
    setLastCycleIndex(null);
    setCycleIndex(1);
  };

  return (
    <HbCard className="space-y-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob live guidance</p>
        <h3 className="hb-heading-3 text-xl font-semibold text-white">
          Coaching for {jobTitle ? jobTitle : customerName ? customerName : "customer"}
        </h3>
        <p className="text-sm text-slate-400">
          Generate structured coaching for this inbound call before you talk or while you’re on the line.
        </p>
        {lastCycleIndex && lastGuidanceGeneratedAtLabel && (
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-slate-400">
            <span>Cycle {lastCycleIndex}</span>
            <span>{lastGuidanceGeneratedAtLabel}</span>
          </div>
        )}
        {lastGuidanceResult?.changedRecommendation && (
          <span className="inline-flex items-center rounded-full border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
            Plan changed
          </span>
        )}
      </div>

      <div className="space-y-2 text-sm text-slate-200">
        <label className="text-xs uppercase tracking-[0.3em] text-slate-500" htmlFor="live-notes">
          Live notes
        </label>
        <textarea
          id="live-notes"
          rows={4}
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-0"
          placeholder="Capture what the customer is saying, including new constraints, objections, or commitments."
          value={notesText}
          onChange={(event) => setNotesText(event.target.value)}
          disabled={isRequesting}
        />
        <p className="text-xs text-slate-500">
          Capture availability changes, pricing objections, access constraints, or communication preferences.
        </p>
        <div className="flex flex-wrap gap-2">
          {NOTE_QUICK_ADDITIONS.map((snippet) => (
            <button
              key={snippet.label}
              type="button"
              onClick={() => appendNoteSnippet(snippet.value)}
              disabled={isRequesting}
              className="rounded-full border border-slate-700/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200 hover:border-slate-500"
            >
              {snippet.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 text-sm text-slate-200">
        <label className="text-xs uppercase tracking-[0.3em] text-slate-500" htmlFor="guidance-mode">
          Guidance mode
        </label>
        <select
          id="guidance-mode"
          name="guidanceMode"
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
          value={guidanceMode}
          onChange={(event) => setGuidanceMode(event.target.value)}
          disabled={isRequesting}
        >
          <option value="">Select guidance mode</option>
          {GUIDANCE_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <HbButton
          variant="primary"
          size="md"
          disabled={!guidanceMode || isRequesting}
          onClick={handleGenerate}
          className="w-full md:w-auto"
          data-testid="askbob-live-guidance-generate"
        >
          {formatPrimaryLabel()}
        </HbButton>
        <HbButton
          variant="ghost"
          size="md"
          onClick={handleReset}
          disabled={isRequesting || (!lastGuidanceResult && !guidanceMode)}
          data-testid="askbob-live-guidance-reset"
        >
          Reset this step
        </HbButton>
      </div>

      {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}

      {lastGuidanceResult && (
        <>
          <div className="space-y-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</p>
              <p className="text-sm text-slate-100">{lastGuidanceResult.summary}</p>
            </div>
            {lastGuidanceResult.phasedPlan.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Phased plan</p>
                <ol className="mt-2 space-y-2 text-sm text-slate-200">
                  {lastGuidanceResult.phasedPlan.map((item, index) => (
                    <li key={`phase-${index}`} className="leading-snug">
                      <span className="font-semibold text-slate-100">{`Phase ${index + 1}. `}</span>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Next best question</p>
              <p className="text-sm text-slate-100">
                {lastGuidanceResult.nextBestQuestion || "Ask a clarifying question to keep things moving."}
              </p>
            </div>
            {lastGuidanceResult.riskFlags.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Risk flags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lastGuidanceResult.riskFlags.map((flag, index) => (
                    <span
                      key={`risk-${index}`}
                      className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-200"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {lastGuidanceResult.changedRecommendation && lastGuidanceResult.changedReason && (
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">
                {lastGuidanceResult.changedReason}
              </p>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Opening line</p>
              <p className="text-sm text-slate-100">{lastGuidanceResult.openingLine}</p>
            </div>

            {listForSection(lastGuidanceResult.questions, "Questions")}
            {listForSection(lastGuidanceResult.confirmations, "Confirmations")}
            {listForSection(lastGuidanceResult.nextActions, "Next actions")}
            {listForSection(lastGuidanceResult.guardrails, "Guardrails")}
          </div>
        </>
      )}
    </HbCard>
  );
}
