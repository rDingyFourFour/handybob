"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import {
  AskBobCallPurpose,
  ASKBOB_CALL_INTENT_LABELS,
  ASKBOB_CALL_INTENTS,
  ASKBOB_CALL_PERSONA_DEFAULT,
  ASKBOB_CALL_PERSONA_LABELS,
  ASKBOB_CALL_PERSONA_STYLES,
  type AskBobCallIntent,
  type AskBobCallPersonaStyle,
} from "@/lib/domain/askbob/types";
import { runAskBobCallScriptAction } from "@/app/(app)/askbob/call-script-actions";

export type StartCallWithScriptPayload = {
  jobId: string;
  customerId?: string | null;
  customerDisplayName?: string | null;
  customerPhone: string;
  scriptBody: string;
  scriptSummary?: string | null;
};

type AskBobCallAssistPanelProps = {
  stepNumber: number;
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  customerDisplayName?: string | null;
  customerPhoneNumber?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  diagnosisSummary?: string | null;
  materialsSummary?: string | null;
  lastQuoteSummary?: string | null;
  followupSummary?: string | null;
  followupCallRecommended?: boolean;
  followupCallPurpose?: string | null;
  followupCallTone?: string | null;
  followupCallIntents?: AskBobCallIntent[] | null;
  followupCallIntentsToken?: number;
  stepCompleted?: boolean;
  stepCollapsed?: boolean;
  onToggleCollapse?: () => void;
  callScriptSummary?: string | null;
  onCallScriptSummaryChange?: (summary: string | null) => void;
  resetToken?: number;
  onCallScriptPersonaChange?: (persona: AskBobCallPersonaStyle | null) => void;
  userId?: string | null;
  onStartCallWithScript?: (payload: StartCallWithScriptPayload) => void;
  onScrollIntoView?: () => void;
};

type ScriptResult = {
  scriptBody: string;
  openingLine: string;
  closingLine: string;
  keyPoints: string[];
  suggestedDurationMinutes?: number | null;
};

const CALL_TONE_DEFAULT = "friendly and clear";
const CALL_PURPOSE_OPTIONS: { value: AskBobCallPurpose; label: string }[] = [
  { value: "intake", label: "Intake call" },
  { value: "scheduling", label: "Scheduling call" },
  { value: "followup", label: "Follow-up call" },
];

const CALL_PERSONA_OPTIONS: { value: AskBobCallPersonaStyle; label: string }[] =
  ASKBOB_CALL_PERSONA_STYLES.map((value) => ({
    value,
    label: ASKBOB_CALL_PERSONA_LABELS[value],
  }));

const CALL_PURPOSE_KEYWORDS: [RegExp, AskBobCallPurpose][] = [
  [/schedule|visit|appointment|book/i, "scheduling"],
  [/follow(?:-| )?up|quote|decision|approval|check[- ]?in/i, "followup"],
  [/intake|intro|initial|new customer/i, "intake"],
];

const CALL_INTENT_OPTIONS: { value: AskBobCallIntent; label: string }[] =
  ASKBOB_CALL_INTENTS.map((value) => ({
    value,
    label: ASKBOB_CALL_INTENT_LABELS[value],
  }));

function getCallIntentsForPurpose(purpose: AskBobCallPurpose): AskBobCallIntent[] {
  switch (purpose) {
    case "intake":
      return ["intake_information"];
    case "scheduling":
      return ["schedule_visit"];
    case "followup":
      return ["quote_followup"];
    default:
      return ["general_checkin"];
  }
}

function guessCallPurposeCategory(
  followupPurpose: string | null,
  fallback: AskBobCallPurpose,
): AskBobCallPurpose {
  if (!followupPurpose) {
    return fallback;
  }
  for (const [pattern, category] of CALL_PURPOSE_KEYWORDS) {
    if (pattern.test(followupPurpose)) {
      return category;
    }
  }
  return fallback;
}

function deriveCallPurpose(params: {
  followupCallRecommended?: boolean;
  followupCallPurpose?: string | null;
  lastQuoteSummary?: string | null;
}): AskBobCallPurpose {
  const base: AskBobCallPurpose =
    Boolean(params.followupCallRecommended) || Boolean(params.lastQuoteSummary)
      ? "followup"
      : "intake";
  return guessCallPurposeCategory(params.followupCallPurpose ?? null, base);
}

export default function AskBobCallAssistPanel({
  stepNumber,
  workspaceId,
  jobId,
  customerId,
  customerDisplayName,
  customerPhoneNumber,
  jobTitle,
  jobDescription,
  diagnosisSummary,
  materialsSummary,
  lastQuoteSummary,
  followupSummary,
  followupCallRecommended,
  followupCallPurpose,
  followupCallTone,
  followupCallIntents,
  followupCallIntentsToken,
  stepCompleted = false,
  stepCollapsed = false,
  onToggleCollapse,
  callScriptSummary,
  onCallScriptSummaryChange,
  resetToken,
  onCallScriptPersonaChange,
  userId,
  onStartCallWithScript,
}: AskBobCallAssistPanelProps) {
  const normalizedFollowupCallPurpose = followupCallPurpose?.trim() ?? null;
  const normalizedFollowupCallTone = followupCallTone?.trim() ?? null;
  const trimmedLastQuoteSummary = lastQuoteSummary?.trim() ?? null;
  const initialCallPurpose = deriveCallPurpose({
    followupCallRecommended,
    followupCallPurpose: normalizedFollowupCallPurpose,
    lastQuoteSummary: trimmedLastQuoteSummary,
  });
  const effectiveCustomerName = customerDisplayName?.trim()
    ? customerDisplayName.trim()
    : null;
  const effectiveCustomerPhone = customerPhoneNumber?.trim()
    ? customerPhoneNumber.trim()
    : null;
  const readyToCallLabel =
    effectiveCustomerName && effectiveCustomerPhone
      ? `Ready to call: ${effectiveCustomerName} at ${effectiveCustomerPhone}`
      : effectiveCustomerName
        ? `Ready to call: ${effectiveCustomerName}`
        : effectiveCustomerPhone
          ? `Ready to call: ${effectiveCustomerPhone}`
          : null;
  const hasReadyCallInfo = Boolean(readyToCallLabel);
  const [callPurpose, setCallPurpose] = useState<AskBobCallPurpose>(initialCallPurpose);
  const [callIntents, setCallIntents] = useState<AskBobCallIntent[]>(() =>
    getCallIntentsForPurpose(initialCallPurpose),
  );
  const [callTone, setCallTone] = useState<string>(normalizedFollowupCallTone ?? CALL_TONE_DEFAULT);
  const [hasManuallySetPurpose, setHasManuallySetPurpose] = useState(false);
  const [hasManuallySetCallIntents, setHasManuallySetCallIntents] = useState(false);
  const [hasManuallySetTone, setHasManuallySetTone] = useState(false);
  const [callPersonaStyle, setCallPersonaStyle] = useState<AskBobCallPersonaStyle>(
    ASKBOB_CALL_PERSONA_DEFAULT,
  );
  const [hasPersonaSelection, setHasPersonaSelection] = useState(false);
  const [scriptResult, setScriptResult] = useState<ScriptResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHandledResetTokenRef = useRef<number | null>(null);
  const lastFollowupCallIntentsTokenRef = useRef<number | null>(null);
  const [copyFeedbackMessage, setCopyFeedbackMessage] = useState<string | null>(null);
  const resetCopyFeedback = useCallback(() => {
    if (copyFeedbackTimeoutRef.current) {
      clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = null;
    }
    setCopyFeedbackMessage(null);
  }, []);
  const triggerCopyFeedback = useCallback((message: string) => {
    if (copyFeedbackTimeoutRef.current) {
      clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = null;
    }
    setCopyFeedbackMessage(message);
    if (typeof window === "undefined") {
      return;
    }
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopyFeedbackMessage(null);
      copyFeedbackTimeoutRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    if (!callScriptSummary) {
      setScriptResult(null);
      setErrorMessage(null);
      resetCopyFeedback();
      setCallPersonaStyle(ASKBOB_CALL_PERSONA_DEFAULT);
      setHasPersonaSelection(false);
    }
  }, [callScriptSummary, resetCopyFeedback]);

  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    if (lastHandledResetTokenRef.current === resetToken) {
      return;
    }
    lastHandledResetTokenRef.current = resetToken;
    setCallPersonaStyle(ASKBOB_CALL_PERSONA_DEFAULT);
    setHasPersonaSelection(false);
    const resetPurpose = deriveCallPurpose({
      followupCallRecommended,
      followupCallPurpose: normalizedFollowupCallPurpose,
      lastQuoteSummary: trimmedLastQuoteSummary,
    });
    setCallIntents(getCallIntentsForPurpose(resetPurpose));
    setHasManuallySetCallIntents(false);
  }, [resetToken]);

  useEffect(() => {
    if (
      followupCallIntentsToken === undefined ||
      !followupCallIntents ||
      !followupCallIntents.length
    ) {
      return;
    }
    if (lastFollowupCallIntentsTokenRef.current === followupCallIntentsToken) {
      return;
    }
    lastFollowupCallIntentsTokenRef.current = followupCallIntentsToken;
    if (hasManuallySetCallIntents) {
      return;
    }
    setCallIntents(followupCallIntents);
    setHasManuallySetCallIntents(false);
  }, [followupCallIntents, followupCallIntentsToken, hasManuallySetCallIntents]);

  useEffect(() => {
    return () => {
      resetCopyFeedback();
    };
  }, [resetCopyFeedback]);

  useEffect(() => {
    if (hasManuallySetPurpose) {
      return;
    }
    const derivedPurpose = deriveCallPurpose({
      followupCallRecommended,
      followupCallPurpose: normalizedFollowupCallPurpose,
      lastQuoteSummary: trimmedLastQuoteSummary,
    });
    setCallPurpose(derivedPurpose);
  }, [
    followupCallRecommended,
    normalizedFollowupCallPurpose,
    hasManuallySetPurpose,
    trimmedLastQuoteSummary,
  ]);

  useEffect(() => {
    if (hasManuallySetTone) {
      return;
    }
    if (normalizedFollowupCallTone) {
      setCallTone(normalizedFollowupCallTone);
      return;
    }
    setCallTone(CALL_TONE_DEFAULT);
  }, [normalizedFollowupCallTone, hasManuallySetTone]);

  useEffect(() => {
    if (hasManuallySetCallIntents) {
      return;
    }
    setCallIntents(getCallIntentsForPurpose(callPurpose));
  }, [callPurpose, hasManuallySetCallIntents]);

  const resetLocalState = () => {
    setScriptResult(null);
    setErrorMessage(null);
    const resetPurpose = deriveCallPurpose({
      followupCallRecommended,
      followupCallPurpose: normalizedFollowupCallPurpose,
      lastQuoteSummary: trimmedLastQuoteSummary,
    });
    setCallPurpose(resetPurpose);
    setCallIntents(getCallIntentsForPurpose(resetPurpose));
    setCallTone(normalizedFollowupCallTone ?? CALL_TONE_DEFAULT);
    setHasManuallySetPurpose(false);
    setHasManuallySetTone(false);
    resetCopyFeedback();
    setCallPersonaStyle(ASKBOB_CALL_PERSONA_DEFAULT);
    setHasPersonaSelection(false);
    setHasManuallySetCallIntents(false);
    onCallScriptPersonaChange?.(null);
  };

  const handleReset = () => {
    resetLocalState();
    onCallScriptSummaryChange?.(null);
  };

  const handleToggleCallIntent = (intent: AskBobCallIntent) => {
    setCallIntents((previous) => {
      const alreadySelected = previous.includes(intent);
      const nextIntents = alreadySelected
        ? previous.filter((value) => value !== intent)
        : [...previous, intent];
      return nextIntents;
    });
    setHasManuallySetCallIntents(true);
  };

  const handleGenerate = async () => {
    if (isGenerating) {
      return;
    }
    resetCopyFeedback();
    setIsGenerating(true);
    setErrorMessage(null);
    if (!callIntents.length) {
      setErrorMessage("Choose at least one call goal before generating a script.");
      setIsGenerating(false);
      return;
    }
    const personaStyleForPayload = hasPersonaSelection ? callPersonaStyle : undefined;
    try {
      const result = await runAskBobCallScriptAction({
        workspaceId,
        jobId,
        customerId: customerId ?? null,
        jobTitle: jobTitle ?? null,
        jobDescription: jobDescription ?? null,
        diagnosisSummary: diagnosisSummary ?? null,
        materialsSummary: materialsSummary ?? null,
        lastQuoteSummary: lastQuoteSummary ?? null,
        followupSummary: followupSummary ?? null,
        callPurpose,
        callTone,
        callPersonaStyle: personaStyleForPayload,
        callIntents,
        extraDetails: null,
      });

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      const newScript: ScriptResult = {
        scriptBody: result.scriptBody,
        openingLine: result.openingLine,
        closingLine: result.closingLine,
        keyPoints: result.keyPoints,
        suggestedDurationMinutes: result.suggestedDurationMinutes ?? null,
      };
      setScriptResult(newScript);
      onCallScriptPersonaChange?.(personaStyleForPayload ?? null);

      const summaryParts = [
        `${callPurpose.charAt(0).toUpperCase() + callPurpose.slice(1)} call script`,
        result.keyPoints.length
          ? `${result.keyPoints.length} key point${result.keyPoints.length === 1 ? "" : "s"}`
          : null,
        lastQuoteSummary ? `for ${lastQuoteSummary}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      onCallScriptSummaryChange?.(summaryParts || "Call script ready");
    } catch (error) {
      console.error("[askbob-call-script-client] generation failed", error);
      setErrorMessage("AskBob could not generate a call script right now. Please try again in a moment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const hasScript = Boolean(scriptResult);
  const rawKeyPoints = scriptResult?.keyPoints ?? [];
  const keyPointsForCopy = rawKeyPoints
    .map((point) => point?.trim() ?? "")
    .filter(Boolean);
  const hasKeyPoints = keyPointsForCopy.length > 0;
  const toggleLabel = stepCollapsed ? "Show step" : "Hide step";

  const buildFullScriptClipboardText = (): string => {
    if (!scriptResult) {
      return "";
    }
    const parts: string[] = [];
    if (scriptResult.openingLine) {
      parts.push(scriptResult.openingLine);
    }
    if (scriptResult.scriptBody) {
      parts.push(scriptResult.scriptBody);
    }
    if (scriptResult.closingLine) {
      parts.push(scriptResult.closingLine);
    }
    return parts.join("\n\n").trim();
  };

  const buildKeyPointsClipboardText = () =>
    keyPointsForCopy.map((point) => `- ${point}`).join("\n");

  const fullScriptClipboardText = buildFullScriptClipboardText();
  const canLaunchCall =
    Boolean(fullScriptClipboardText && effectiveCustomerPhone && onStartCallWithScript);

  const handleCopyFullScript = async () => {
    if (!scriptResult) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    const text = buildFullScriptClipboardText();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      triggerCopyFeedback("Copied full script");
    } catch {
      // ignore clipboard failures
    }
  };

  const handleCopyKeyPoints = async () => {
    if (!hasKeyPoints) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    const text = buildKeyPointsClipboardText();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      triggerCopyFeedback("Copied key points");
    } catch {
      // ignore clipboard failures
    }
  };

  const handleStartCall = () => {
    if (!canLaunchCall || !fullScriptClipboardText) {
      return;
    }
    console.log("[askbob-call-assist-call-click]", {
      workspaceId,
      userId: userId ?? null,
      jobId,
      hasScript: Boolean(scriptResult),
      hasCustomerPhone: Boolean(effectiveCustomerPhone),
      callPurpose,
      callTone,
    });
    onStartCallWithScript?.({
      jobId,
      customerId,
      customerDisplayName,
      customerPhone: effectiveCustomerPhone,
      scriptBody: fullScriptClipboardText,
      scriptSummary: callScriptSummary ?? null,
    });
  };

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob call assistant</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="hb-heading-3 text-xl font-semibold">
                Step {stepNumber} · Prepare a phone call with AskBob
              </h2>
              {stepCompleted && (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.3em] text-emerald-200">
                  Done
                </span>
              )}
            </div>
            {readyToCallLabel && (
              <p className="text-xs text-slate-400">{readyToCallLabel}</p>
            )}
            {callScriptSummary && (
              <p className="text-sm text-slate-300">{callScriptSummary}</p>
            )}
            {followupCallRecommended && normalizedFollowupCallPurpose && (
              <p className="text-xs text-emerald-200">
                AskBob follow-up suggests calling for: {normalizedFollowupCallPurpose}
              </p>
            )}
            {followupCallRecommended && normalizedFollowupCallTone && (
              <p className="text-xs text-slate-400">Suggested tone: {normalizedFollowupCallTone}</p>
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
              disabled={!hasScript}
            >
              Reset this step
            </HbButton>
          </div>
        </div>
        <p className="text-sm text-slate-300">
          AskBob drafts a professional call script using the job context and your chosen tone.
        </p>
      </div>
      {!stepCollapsed && (
        <div className="space-y-4">
          {hasReadyCallInfo && (
            <div className="space-y-1 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Call info</p>
              <div className="space-y-0.5">
                {effectiveCustomerName && (
                  <p className="text-sm text-slate-100">{effectiveCustomerName}</p>
                )}
                {effectiveCustomerPhone && (
                  <p className="text-sm text-slate-100">{effectiveCustomerPhone}</p>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Use this info with the script below when you place the call.
              </p>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs uppercase tracking-[0.3em] text-slate-500">
              Call purpose
              <select
                value={callPurpose}
                onChange={(event) => {
                  setCallPurpose(event.target.value as AskBobCallPurpose);
                  setHasManuallySetPurpose(true);
                }}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                {CALL_PURPOSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs uppercase tracking-[0.3em] text-slate-500">
              Call tone
              <input
                type="text"
                value={callTone}
                onChange={(event) => {
                  setCallTone(event.target.value);
                  setHasManuallySetTone(true);
                }}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="friendly and clear"
              />
            </label>
          </div>
          <label className="space-y-1 text-xs uppercase tracking-[0.3em] text-slate-500">
            Call style
            <select
              name="callPersonaStyle"
              value={callPersonaStyle}
              onChange={(event) => {
                setCallPersonaStyle(event.target.value as AskBobCallPersonaStyle);
                setHasPersonaSelection(true);
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {CALL_PERSONA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call goals</p>
            <div className="flex flex-wrap gap-2">
              {CALL_INTENT_OPTIONS.map((option) => {
                const selected = callIntents.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.3em] transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                        : "border-slate-800 bg-slate-950 text-slate-200"
                    }`}
                    aria-pressed={selected}
                    onClick={() => handleToggleCallIntent(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400">
              Pick one or more call goals so AskBob can structure the script around them.
            </p>
          </div>
          {lastQuoteSummary && (
            <p className="text-xs text-slate-500">
              Quote context: {lastQuoteSummary}
            </p>
          )}
          <div className="space-y-3">
            <HbButton
              variant="primary"
              size="md"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating call script…" : "Generate call script with AskBob"}
            </HbButton>
            {errorMessage && <p className="text-xs text-rose-400">{errorMessage}</p>}
          </div>
          {hasScript ? (
            <div className="space-y-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Suggested call script</p>
              <p className="text-xs text-slate-400">
                Tone: {ASKBOB_CALL_PERSONA_LABELS[callPersonaStyle]}
              </p>
              {callIntents.length ? (
                <p className="text-xs text-slate-400">
                  Call goals: {callIntents.map((intent) => ASKBOB_CALL_INTENT_LABELS[intent]).join("; ")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <HbButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyFullScript}
                >
                  Copy full script
                </HbButton>
                {hasKeyPoints && (
                  <HbButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyKeyPoints}
                  >
                    Copy key points
                  </HbButton>
                )}
                {canLaunchCall && (
                  <HbButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleStartCall}
                    disabled={isGenerating}
                  >
                    Start call with this script
                  </HbButton>
                )}
              </div>
              {copyFeedbackMessage && (
                <p className="text-xs text-emerald-400">{copyFeedbackMessage}</p>
              )}
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Opening line</p>
                  <p className="text-sm text-slate-100">{scriptResult?.openingLine}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Script body</p>
                  <p className="text-sm text-slate-200 whitespace-pre-line">{scriptResult?.scriptBody}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Closing line</p>
                  <p className="text-sm text-slate-100">{scriptResult?.closingLine}</p>
                </div>
                {scriptResult?.keyPoints.length ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Key points to hit</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-slate-200">
                      {scriptResult.keyPoints.map((point, index) => (
                        <li key={`${point}-${index}`}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {scriptResult?.suggestedDurationMinutes ? (
                  <p className="text-xs text-slate-400">
                    Expected call duration: ~{scriptResult.suggestedDurationMinutes} minute
                    {scriptResult.suggestedDurationMinutes === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Call script not yet generated. Click the button above once you’re ready for AskBob to draft a script.
            </p>
          )}
        </div>
      )}
    </HbCard>
  );
}
