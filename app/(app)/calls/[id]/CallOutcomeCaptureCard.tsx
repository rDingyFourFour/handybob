"use client";

import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useActionState } from "react";

import HbButton from "@/components/ui/hb-button";
import {
  CALL_OUTCOME_CODE_OPTIONS,
  CallOutcome,
  CallOutcomeCode,
  getCallOutcomeCodeMetadata,
  getCallOutcomeMetadata,
  mapOutcomeCodeToLegacyOutcome,
} from "@/lib/domain/communications/callOutcomes";
import {
  CALL_OUTCOME_DB_CONSTRAINT_MISMATCH_MESSAGE,
  CALL_OUTCOME_SCHEMA_OUT_OF_DATE_MESSAGE,
} from "@/utils/calls/callOutcomeMessages";
import { SaveCallOutcomeResponse, saveCallOutcomeAction } from "../actions/saveCallOutcome";
import {
  readAndClearCallOutcomePrefill,
  type CallOutcomePrefillPayload,
} from "@/utils/askbob/callOutcomePrefillCache";
import type { CallAutomatedDialSnapshot } from "@/lib/domain/calls/sessions";

const NOTES_MAX_LENGTH = 1000;

const REACH_OPTIONS: Array<{ value: boolean | null; label: string }> = [
  { value: true, label: "Reached" },
  { value: false, label: "No answer" },
  { value: null, label: "Not sure" },
];

const PREFILL_CACHE_LOGGED = new Set<string>();
const PREFILL_CACHE_APPLIED = new Set<string>();

function hasPrefillPayloadSuggestion(payload: CallOutcomePrefillPayload | null) {
  if (!payload) {
    return false;
  }
  return (
    payload.suggestedReachedCustomer !== null ||
    Boolean(payload.suggestedOutcomeCode) ||
    Boolean(payload.suggestedNotes?.trim())
  );
}

type SavedOutcome = {
  reachedCustomer: boolean | null;
  outcomeCode: CallOutcomeCode | null;
  notes: string | null;
  recordedAt: string | null;
  legacyOutcome: CallOutcome | null;
};

type EditingState = {
  reachedCustomer: boolean | null;
  outcomeCode: CallOutcomeCode | null;
  notes: string;
};

type ActionStateTuple = [
  SaveCallOutcomeResponse | null,
  (formData: FormData | null | undefined) => unknown,
  boolean,
];

type CallOutcomeCaptureCardProps = {
  callId: string;
  workspaceId: string;
  initialOutcomeCode: CallOutcomeCode | null;
  initialReachedCustomer: boolean | null;
  initialNotes: string | null;
  initialRecordedAt: string | null;
  initialLegacyOutcome?: CallOutcome | null;
  hasAskBobScriptHint: boolean;
  actionStateOverride?: ActionStateTuple;
  jobId?: string | null;
  automatedDialSnapshot?: CallAutomatedDialSnapshot | null;
  isAutomatedCallContext?: boolean;
};

export async function callOutcomeCaptureFormAction(
  _prevState: SaveCallOutcomeResponse | null,
  formData?: FormData | null,
): Promise<SaveCallOutcomeResponse> {
  return saveCallOutcomeAction(formData ?? null);
}

function formatRecordedAtLabel(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const now = new Date();
  const isToday =
    parsed.getUTCFullYear() === now.getUTCFullYear() &&
    parsed.getUTCMonth() === now.getUTCMonth() &&
    parsed.getUTCDate() === now.getUTCDate();
  const timeLabel = parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isToday) {
    return `Recorded today at ${timeLabel}`;
  }
  const dateLabel = parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `Recorded ${dateLabel} at ${timeLabel}`;
}

export default function CallOutcomeCaptureCard({
  callId,
  workspaceId,
  initialOutcomeCode,
  initialReachedCustomer,
  initialNotes,
  initialRecordedAt,
  initialLegacyOutcome,
  jobId,
  hasAskBobScriptHint,
  actionStateOverride,
  automatedDialSnapshot,
  isAutomatedCallContext,
}: CallOutcomeCaptureCardProps) {
  const hasExistingOutcome =
    Boolean(initialRecordedAt) ||
    Boolean(initialOutcomeCode) ||
    Boolean(initialNotes?.trim()) ||
    Boolean(initialLegacyOutcome);
  const [savedOutcome, setSavedOutcome] = useState<SavedOutcome>(() => ({
    reachedCustomer: initialReachedCustomer,
    outcomeCode: initialOutcomeCode,
    notes: initialNotes,
    recordedAt: initialRecordedAt,
    legacyOutcome: initialLegacyOutcome ?? null,
  }));
  const showTerminalCallBanner =
    Boolean(isAutomatedCallContext && automatedDialSnapshot?.isTerminal && !hasExistingOutcome);
  const showInProgressCallBanner =
    Boolean(isAutomatedCallContext && automatedDialSnapshot?.isInProgress && !hasExistingOutcome);
  const initialNotesValue = initialNotes ?? "";
  const [initialPrefillPayload] = useState<CallOutcomePrefillPayload | null>(() => {
    if (typeof window === "undefined" || hasExistingOutcome) {
      return null;
    }
    return readAndClearCallOutcomePrefill(callId);
  });
  const initialPrefillSuggestion =
    !hasExistingOutcome &&
    initialPrefillPayload &&
    initialPrefillPayload.workspaceId === workspaceId &&
    hasPrefillPayloadSuggestion(initialPrefillPayload)
      ? {
          reachedCustomer: initialPrefillPayload.suggestedReachedCustomer ?? null,
          outcomeCode: initialPrefillPayload.suggestedOutcomeCode ?? null,
          notes: initialPrefillPayload.suggestedNotes ?? "",
        }
      : null;
  const initialPrefillApplied = Boolean(initialPrefillSuggestion);
  const [isEditing, setIsEditing] = useState(!hasExistingOutcome);
  const [editingState, setEditingState] = useState<EditingState>(() => {
    if (initialPrefillSuggestion) {
      return initialPrefillSuggestion;
    }
    return {
      reachedCustomer: initialReachedCustomer,
      outcomeCode: initialOutcomeCode,
      notes: initialNotesValue,
    };
  });
  const dirtyRef = useRef(false);
  const editingStateRef = useRef(editingState);
  const isEditingRef = useRef(isEditing);
  const outcomeSelectRef = useRef<HTMLSelectElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const setEditingStateWithRef = (nextState: EditingState | ((prev: EditingState) => EditingState)) => {
    setEditingState((prev) => {
      const resolved = typeof nextState === "function"
        ? (nextState as (prev: EditingState) => EditingState)(prev)
        : nextState;
      editingStateRef.current = resolved;
      return resolved;
    });
  };
  const lastActionStateRef = useRef<SaveCallOutcomeResponse | null>(null);

  const hookTuple = useActionState<SaveCallOutcomeResponse, FormData | null | undefined>(
    callOutcomeCaptureFormAction,
    null,
  );
  const actionStateTuple = actionStateOverride ?? hookTuple;
  const [actionState, formAction, pending] = actionStateTuple;
  const actionErrorMessage =
    actionState?.code === "schema_not_applied"
      ? CALL_OUTCOME_SCHEMA_OUT_OF_DATE_MESSAGE
      : actionState?.code === "db_constraint_rejects_value"
      ? CALL_OUTCOME_DB_CONSTRAINT_MISMATCH_MESSAGE
      : actionState?.error ?? null;

  useLayoutEffect(() => {
    editingStateRef.current = editingState;
  }, [editingState]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!actionState || actionState === lastActionStateRef.current) {
      return;
    }
    lastActionStateRef.current = actionState;
    const notesLength = actionState.notes?.length ?? 0;
    if (actionState.ok) {
      console.log("[calls-outcome-save-success]", {
        callId,
        reachedCustomer: actionState.reachedCustomer,
        outcomeCode: actionState.outcomeCode,
        notesLength,
      });
      startTransition(() => {
        setConfirmationMessage("Saved just now");
        setSavedOutcome({
          reachedCustomer: actionState.reachedCustomer,
          outcomeCode: actionState.outcomeCode,
          notes: actionState.notes,
          recordedAt: actionState.recordedAtIso,
          legacyOutcome: mapOutcomeCodeToLegacyOutcome(actionState.outcomeCode ?? null),
        });
        setIsEditing(false);
      });
      const shouldNudge =
        Boolean(isAutomatedCallContext) && Boolean(automatedDialSnapshot?.isTerminal);
      if (shouldNudge) {
        const status = automatedDialSnapshot?.twilioStatus ?? null;
        console.log("[calls-after-call-outcome-saved-nudge]", {
          callId,
          status,
          hasAutomatedCallContext: Boolean(isAutomatedCallContext),
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("calls-after-call-outcome-saved", {
              detail: {
                callId,
                status,
                hasAutomatedCallContext: Boolean(isAutomatedCallContext),
              },
            }),
          );
        }
      }
    } else {
      console.log("[calls-outcome-save-failure]", {
        callId,
        reachedCustomer: actionState.reachedCustomer ?? null,
        outcomeCode: actionState.outcomeCode ?? null,
        notesLength,
        error: actionState.error,
        code: actionState.code,
      });
    }
  }, [
    actionState,
    callId,
    automatedDialSnapshot?.isTerminal,
    automatedDialSnapshot?.twilioStatus,
    isAutomatedCallContext,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (hasExistingOutcome) {
      return;
    }
    const logStatus = (status: "hit" | "miss", reason: string | null, source: "mount" | "event") => {
      const key = `${callId}:${status}:${reason ?? "none"}:${source}`;
      if (PREFILL_CACHE_LOGGED.has(key)) {
        return;
      }
      console.log(`[calls-outcome-prefill-suggested-${status}]`, {
        callId,
        workspaceId,
        reason,
        source,
      });
      PREFILL_CACHE_LOGGED.add(key);
    };
    if (!initialPrefillApplied) {
      if (!initialPrefillPayload) {
        logStatus("miss", "no_payload", "mount");
      } else if (initialPrefillPayload.workspaceId !== workspaceId) {
        logStatus("miss", "workspace_mismatch", "mount");
      } else if (!hasPrefillPayloadSuggestion(initialPrefillPayload)) {
        logStatus("miss", "empty_payload", "mount");
      } else {
        logStatus("miss", "changed", "mount");
      }
    } else {
      logStatus("hit", null, "mount");
      PREFILL_CACHE_APPLIED.add(callId);
    }
    const attemptPrefill = (source: "event") => {
      if (PREFILL_CACHE_APPLIED.has(callId)) {
        return;
      }
      const payload = readAndClearCallOutcomePrefill(callId);
      if (!payload) {
        logStatus("miss", "no_payload", source);
        return;
      }
      if (payload.workspaceId !== workspaceId) {
        logStatus("miss", "workspace_mismatch", source);
        return;
      }
      if (!hasPrefillPayloadSuggestion(payload)) {
        logStatus("miss", "empty_payload", source);
        return;
      }
      const currentState = editingStateRef.current;
      const initialReachedValue = initialReachedCustomer ?? null;
      const currentReachedValue = currentState.reachedCustomer ?? null;
      const initialOutcomeValue = initialOutcomeCode ?? "";
      const currentOutcomeValue =
        outcomeSelectRef.current?.value ?? (currentState.outcomeCode ?? "");
      const currentNotesValue = notesRef.current?.value ?? currentState.notes;
      const hasUserEdits =
        dirtyRef.current ||
        currentReachedValue !== initialReachedValue ||
        currentOutcomeValue !== initialOutcomeValue ||
        currentNotesValue !== initialNotesValue;
      const canApply = !hasUserEdits;
      if (!canApply) {
        logStatus("miss", "dirty", source);
        return;
      }
      const nextOutcomeCode = payload.suggestedOutcomeCode ?? null;
      const nextNotes = payload.suggestedNotes ?? "";
      flushSync(() => {
        setEditingStateWithRef({
          reachedCustomer: payload.suggestedReachedCustomer ?? null,
          outcomeCode: nextOutcomeCode,
          notes: nextNotes,
        });
      });
      if (outcomeSelectRef.current) {
        outcomeSelectRef.current.value = nextOutcomeCode ?? "";
      }
      if (notesRef.current) {
        notesRef.current.value = nextNotes;
      }
      if (!isEditingRef.current) {
        setIsEditing(true);
      }
      logStatus("hit", null, source);
      PREFILL_CACHE_APPLIED.add(callId);
    };
    const handler = () => attemptPrefill("event");
    window.addEventListener("calls-outcome-prefill-suggested", handler);
    return () => {
      window.removeEventListener("calls-outcome-prefill-suggested", handler);
    };
  }, [
    callId,
    workspaceId,
    hasExistingOutcome,
    initialNotesValue,
    initialOutcomeCode,
    initialReachedCustomer,
    initialPrefillApplied,
    initialPrefillPayload,
  ]);

  useEffect(() => {
    if (!isEditing) {
      dirtyRef.current = false;
      startTransition(() => {
        setEditingStateWithRef({
          reachedCustomer: savedOutcome.reachedCustomer,
          outcomeCode: savedOutcome.outcomeCode,
          notes: savedOutcome.notes ?? "",
        });
      });
    }
  }, [isEditing, savedOutcome]);

  const recordedLabel = useMemo(() => {
    if (savedOutcome.recordedAt) {
      return formatRecordedAtLabel(savedOutcome.recordedAt);
    }
    if (savedOutcome.legacyOutcome) {
      return "Recorded with legacy outcome data.";
    }
    return null;
  }, [savedOutcome.recordedAt, savedOutcome.legacyOutcome]);

  const hasRecordedOutcome =
    Boolean(savedOutcome.recordedAt) ||
    Boolean(savedOutcome.outcomeCode) ||
    Boolean(savedOutcome.legacyOutcome) ||
    Boolean(savedOutcome.notes?.trim());

  const notesPreview = useMemo(() => {
    if (!savedOutcome.notes) {
      return null;
    }
    const trimmed = savedOutcome.notes.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
  }, [savedOutcome.notes]);

  const reachedLabel = savedOutcome.reachedCustomer === true
    ? "Yes"
    : savedOutcome.reachedCustomer === false
    ? "No"
    : "Not sure";

  const outcomeMetadata = getCallOutcomeCodeMetadata(savedOutcome.outcomeCode);
  const legacyOutcomeMetadata = getCallOutcomeMetadata(savedOutcome.legacyOutcome);
  const outcomeLabel = outcomeMetadata.value ? outcomeMetadata.label : legacyOutcomeMetadata.label;
  const markDirty = () => {
    dirtyRef.current = true;
    setConfirmationMessage(null);
  };
  const beginEditing = () => {
    dirtyRef.current = false;
    setConfirmationMessage(null);
    setIsEditing(true);
  };
  const handleReachSelection = (value: boolean | null) => {
    markDirty();
    setEditingStateWithRef((prev) => ({ ...prev, reachedCustomer: value }));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call outcome</p>
        <h3 className="text-lg font-semibold text-white">Call outcome</h3>
        <p className="text-sm text-slate-400">
          Log what happened on this call so follow-ups and reports stay accurate.
        </p>
        {hasAskBobScriptHint && (
          <p className="text-xs italic text-slate-400">This was an AskBob-assisted call.</p>
        )}
        {showTerminalCallBanner && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            Call ended. Please record the outcome.
          </div>
        )}
        {showInProgressCallBanner && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-400">
            Call is in progress. Outcome can be recorded after it ends.
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="space-y-2">
          {hasRecordedOutcome ? (
              <div className="space-y-2 text-sm text-slate-200">
                <p className="font-semibold text-slate-100">Outcome recorded</p>
                <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
                  <span>Reached: {reachedLabel}</span>
                  <span>Outcome: {outcomeLabel}</span>
                </div>
                {notesPreview && (
                  <p className="text-sm text-slate-300">Notes: {notesPreview}</p>
                )}
                {confirmationMessage && (
                  <p className="text-xs text-emerald-300">{confirmationMessage}</p>
                )}
                {recordedLabel && <p className="text-xs text-slate-400">{recordedLabel}</p>}
              </div>
          ) : (
            <p className="text-sm text-slate-400">Outcome not recorded yet.</p>
          )}
            <div className="text-right">
              <HbButton
                type="button"
                variant="primary"
                size="sm"
                onClick={beginEditing}
              >
                {hasRecordedOutcome ? "Edit outcome" : "Record outcome"}
              </HbButton>
            </div>
        </div>
      )}

      {isEditing && (
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callId" value={callId} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="jobId" value={jobId ?? ""} />
          <input
            type="hidden"
            name="reachedCustomer"
            value={
              editingState.reachedCustomer === null
                ? ""
                : editingState.reachedCustomer
                ? "true"
                : "false"
            }
          />
          <fieldset className="space-y-4" disabled={pending}>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Reached customer</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REACH_OPTIONS.map((option) => {
                  const active = editingState.reachedCustomer === option.value;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => handleReachSelection(option.value)}
                      className={`rounded-full border px-3 py-1 text-sm transition ${
                        active
                          ? "border-slate-600 bg-slate-800 text-white"
                          : "border-slate-800 bg-slate-950/60 text-slate-300"
                      }`}
                      aria-pressed={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="text-sm text-slate-200">
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Outcome code</span>
              <select
                name="outcomeCode"
                ref={outcomeSelectRef}
                value={editingState.outcomeCode ?? ""}
                onChange={(event) => {
                  markDirty();
                  setEditingStateWithRef((prev) => ({
                    ...prev,
                    outcomeCode: (event.target.value as CallOutcomeCode) || null,
                  }));
                }}
                data-editing-outcome-code={editingState.outcomeCode ?? ""}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-slate-600 focus:outline-none"
              >
                <option value="">Select outcome…</option>
                {CALL_OUTCOME_CODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-200">
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Notes (optional)</span>
              <textarea
                name="notes"
                ref={notesRef}
                rows={3}
                value={editingState.notes}
                onChange={(event) => {
                  markDirty();
                  setEditingStateWithRef((prev) => ({ ...prev, notes: event.target.value }));
                }}
                data-editing-notes={editingState.notes}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-slate-600 focus:outline-none"
                maxLength={NOTES_MAX_LENGTH}
              />
            </label>
            <p className="text-xs text-slate-500">
              Keep it concise (up to {NOTES_MAX_LENGTH} characters) and focused on what happened.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-400">
              {pending ? "Saving…" : "We’ll store the reach, outcome, and notes when you save."}
              {actionState?.ok === false && actionErrorMessage && (
                <p className="text-xs text-amber-400">{actionErrorMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-sm font-semibold text-slate-200"
                onClick={() => {
                  dirtyRef.current = false;
                  setConfirmationMessage(null);
                  setIsEditing(false);
                }}
                disabled={pending}
              >
                Cancel
              </button>
              <HbButton type="submit" variant="primary" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save outcome"}
              </HbButton>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
