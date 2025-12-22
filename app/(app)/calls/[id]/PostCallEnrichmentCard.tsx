"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { runAskBobCallPostEnrichmentAction } from "@/app/(app)/askbob/call-post-enrichment-actions";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";
import { cacheCallOutcomePrefill } from "@/utils/askbob/callOutcomePrefillCache";
import { getCallOutcomeCodeMetadata, type CallOutcomeCode } from "@/lib/domain/communications/callOutcomes";
import type { CallPostEnrichmentResult } from "@/lib/domain/askbob/types";

const DRAFT_PREVIEW_LIMIT = 420;
const OUTCOME_NOTES_LIMIT = 140;

type PostCallEnrichmentCardProps = {
  workspaceId: string;
  callId: string;
  jobId?: string | null;
  customerId?: string | null;
  direction: string | null;
  isTerminal: boolean;
  hasRecordingMetadata: boolean;
  hasOutcome: boolean;
  initialResult?: CallPostEnrichmentResult | null;
};

function formatReachedLabel(value: boolean | null) {
  if (value === true) {
    return "Reached";
  }
  if (value === false) {
    return "Not reached";
  }
  return "Unknown";
}

function buildOutcomeNotes(result: CallPostEnrichmentResult): string | null {
  const raw = result.outcomeRationale?.trim() ?? "";
  if (!raw) {
    return null;
  }
  const collapsed = raw.replace(/\s+/g, " ");
  if (collapsed.length <= OUTCOME_NOTES_LIMIT) {
    return collapsed;
  }
  return `${collapsed.slice(0, OUTCOME_NOTES_LIMIT - 3).trimEnd()}...`;
}

export default function PostCallEnrichmentCard({
  workspaceId,
  callId,
  jobId,
  customerId,
  direction,
  isTerminal,
  hasRecordingMetadata,
  hasOutcome,
  initialResult = null,
}: PostCallEnrichmentCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "failure">(
    initialResult ? "success" : "idle",
  );
  const [result, setResult] = useState<CallPostEnrichmentResult | null>(initialResult);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const lastRequestRef = useRef(0);

  const draftPreview = useMemo(() => {
    const trimmed = result?.suggestedFollowupDraft?.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.length <= DRAFT_PREVIEW_LIMIT) {
      return trimmed;
    }
    return `${trimmed.slice(0, DRAFT_PREVIEW_LIMIT - 3).trimEnd()}...`;
  }, [result?.suggestedFollowupDraft]);

  const outcomeLabel = result?.suggestedOutcomeCode
    ? getCallOutcomeCodeMetadata(result.suggestedOutcomeCode).label
    : "Not suggested";

  const reachedLabel = result ? formatReachedLabel(result.suggestedReachedCustomer) : "Unknown";

  const handleGenerate = async () => {
    if (!isTerminal || status === "loading") {
      return;
    }
    setErrorMessage(null);
    setStatus("loading");
    const requestId = Date.now();
    lastRequestRef.current = requestId;
    const response = await runAskBobCallPostEnrichmentAction({
      workspaceId,
      callId,
    });
    if (lastRequestRef.current !== requestId) {
      return;
    }
    if (!response.ok) {
      setStatus("failure");
      setErrorMessage(response.message ?? "AskBob could not enrich this call right now.");
      return;
    }
    setResult(response.result);
    setStatus("success");
  };

  const handleApplyOutcome = () => {
    if (!result) {
      return;
    }
    const suggestedNotes = buildOutcomeNotes(result);
    cacheCallOutcomePrefill({
      callId,
      workspaceId,
      suggestedReachedCustomer: result.suggestedReachedCustomer ?? null,
      suggestedOutcomeCode: (result.suggestedOutcomeCode as CallOutcomeCode | null) ?? null,
      suggestedNotes,
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("calls-outcome-prefill-suggested"));
    }
  };

  const handleOpenComposer = () => {
    const draftBody = result?.suggestedFollowupDraft?.trim();
    if (!draftBody || !jobId) {
      return;
    }
    const draftKey = cacheAskBobMessageDraft({
      body: draftBody,
      jobId,
      customerId,
      origin: "call_post_enrichment",
      workspaceId,
      callId,
    });
    const params = new URLSearchParams({
      compose: "1",
      origin: "call_post_enrichment",
      jobId,
    });
    if (customerId) {
      params.set("customerId", customerId);
    }
    if (draftKey) {
      params.set("draftKey", draftKey);
    }
    console.log("[calls-after-call-open-composer-click]", {
      workspaceId,
      callId,
      draftSource: "call_post_enrichment",
      hasDraft: Boolean(draftBody),
    });
    router.push(`/messages?${params.toString()}`);
  };

  const handleCopyDraft = async () => {
    if (!result?.suggestedFollowupDraft?.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.suggestedFollowupDraft.trim());
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("idle");
    }
  };

  const hasResult = Boolean(result);
  const hasRiskFlags = Boolean(result?.riskFlags?.length);
  const canGenerate = isTerminal && status !== "loading";
  const canOpenComposer = Boolean(result?.suggestedFollowupDraft?.trim()) && Boolean(jobId);

  return (
    <HbCard className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Post-call enrichment</p>
        <h3 className="hb-heading-3 text-xl font-semibold">Post-call enrichment</h3>
        <p className="text-sm text-slate-400">
          Generate a structured recap and suggested follow-up once the call is terminal.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-slate-800 px-2 py-0.5">
            {direction ? direction.toUpperCase() : "UNKNOWN"}
          </span>
          <span className="rounded-full border border-slate-800 px-2 py-0.5">
            {isTerminal ? "Terminal" : "In progress"}
          </span>
          <span className="rounded-full border border-slate-800 px-2 py-0.5">
            {hasRecordingMetadata ? "Recording" : "No recording"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <HbButton
          variant="primary"
          size="md"
          className="w-full"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          {status === "loading" ? "Generating..." : "Generate recap"}
        </HbButton>
        {!isTerminal && (
          <p className="text-xs text-slate-500">Enrichment is available after the call ends.</p>
        )}
        {status === "loading" && (
          <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-100">
            Generating recap...
          </div>
        )}
        {status === "success" && hasResult && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
            Recap ready to review.
          </div>
        )}
        {status === "failure" && errorMessage && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100">
            {errorMessage}
          </div>
        )}
      </div>

      {hasResult && result && (
        <div className="space-y-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</p>
            <p className="text-sm text-slate-200">{result.summaryParagraph}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Key moments</p>
            {result.keyMoments.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-200">
                {result.keyMoments.map((moment, index) => (
                  <li key={`${moment}-${index}`} className="flex gap-2">
                    <span className="text-slate-400">•</span>
                    <span>{moment}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No key moments captured.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Suggested outcome</p>
            <div className="mt-2 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Reached</p>
                <p className="text-sm font-semibold text-slate-100">{reachedLabel}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Outcome</p>
                <p className="text-sm font-semibold text-slate-100">{outcomeLabel}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Rationale</p>
                <p className="text-sm text-slate-200">
                  {result.outcomeRationale ?? "No rationale provided."}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Confidence</p>
                <p className="text-sm font-semibold text-slate-100">
                  {result.confidenceLabel.toUpperCase()}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              <span>Suggested follow-up draft</span>
              <span className="text-[11px] text-slate-400">
                {result.suggestedFollowupDraft.length} characters
              </span>
            </div>
            {draftPreview ? (
              <div className="mt-2 space-y-2">
                <pre
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {draftPreview}
                </pre>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleCopyDraft}
                    className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 hover:text-slate-100"
                  >
                    {copyState === "copied" ? "Copied" : "Copy"}
                  </button>
                  {draftPreview !== result.suggestedFollowupDraft.trim() && (
                    <span className="text-[11px] text-slate-500">Preview is clamped</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No follow-up draft was suggested.</p>
            )}
            {!hasOutcome && (
              <p className="mt-2 text-xs text-amber-200">
                Record the call outcome to unlock the official AskBob after-call generator.
              </p>
            )}
          </div>

          {hasRiskFlags && (
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Risk flags</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-200">
                {result.riskFlags.map((flag, index) => (
                  <li key={`${flag}-${index}`} className="flex gap-2">
                    <span className="text-rose-300">•</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <HbButton size="sm" variant="secondary" className="flex-1" onClick={handleApplyOutcome}>
              Apply suggested outcome
            </HbButton>
            <HbButton
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={handleOpenComposer}
              disabled={!canOpenComposer}
            >
              Open composer with suggested follow-up
            </HbButton>
          </div>
        </div>
      )}
    </HbCard>
  );
}
