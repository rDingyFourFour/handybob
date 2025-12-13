"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useActionState } from "react";

import HbButton from "@/components/ui/hb-button";
import {
  CALL_OUTCOME_CODE_OPTIONS,
  CallOutcomeCode,
  getCallOutcomeCodeMetadata,
} from "@/lib/domain/communications/callOutcomes";
import { SaveCallOutcomeResponse, saveCallOutcomeAction } from "../actions/saveCallOutcome";

const NOTES_MAX_LENGTH = 1000;

const REACH_OPTIONS: Array<{ value: boolean | null; label: string }> = [
  { value: true, label: "Reached" },
  { value: false, label: "No answer" },
  { value: null, label: "Not sure" },
];

type SavedOutcome = {
  reachedCustomer: boolean | null;
  outcomeCode: CallOutcomeCode | null;
  notes: string | null;
  recordedAt: string | null;
};

type CallOutcomeCaptureCardProps = {
  callId: string;
  workspaceId: string;
  initialOutcomeCode: CallOutcomeCode | null;
  initialReachedCustomer: boolean | null;
  initialNotes: string | null;
  initialRecordedAt: string | null;
  hasAskBobScriptHint: boolean;
};

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
  hasAskBobScriptHint,
}: CallOutcomeCaptureCardProps) {
  const [savedOutcome, setSavedOutcome] = useState<SavedOutcome>(() => ({
    reachedCustomer: initialReachedCustomer,
    outcomeCode: initialOutcomeCode,
    notes: initialNotes,
    recordedAt: initialRecordedAt,
  }));
  const [isEditing, setIsEditing] = useState(false);
  const [editingState, setEditingState] = useState<{
    reachedCustomer: boolean | null;
    outcomeCode: CallOutcomeCode | null;
    notes: string;
  }>({
    reachedCustomer: initialReachedCustomer,
    outcomeCode: initialOutcomeCode,
    notes: initialNotes ?? "",
  });

  const [actionState, formAction, pending] = useActionState<SaveCallOutcomeResponse, FormData>(
    saveCallOutcomeAction,
    null,
  );

  useEffect(() => {
    if (actionState?.ok) {
      startTransition(() => {
        setSavedOutcome({
          reachedCustomer: actionState.reachedCustomer,
          outcomeCode: actionState.outcomeCode,
          notes: actionState.notes,
          recordedAt: actionState.recordedAtIso,
        });
        setIsEditing(false);
      });
    }
  }, [actionState]);

  useEffect(() => {
    if (!isEditing) {
      startTransition(() => {
        setEditingState({
          reachedCustomer: savedOutcome.reachedCustomer,
          outcomeCode: savedOutcome.outcomeCode,
          notes: savedOutcome.notes ?? "",
        });
      });
    }
  }, [isEditing, savedOutcome]);

  const recordedLabel = useMemo(() => formatRecordedAtLabel(savedOutcome.recordedAt), [savedOutcome.recordedAt]);

  const hasRecordedOutcome = Boolean(savedOutcome.recordedAt);

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

  const outcomeLabel = getCallOutcomeCodeMetadata(savedOutcome.outcomeCode).label;

  const handleReachSelection = (value: boolean | null) => {
    setEditingState((prev) => ({ ...prev, reachedCustomer: value }));
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
              onClick={() => setIsEditing(true)}
            >
              {hasRecordedOutcome ? "Edit outcome" : "Record outcome"}
            </HbButton>
          </div>
        </div>
      )}

      {isEditing && (
        <form action={formAction} className="space-y-4" method="post">
          <input type="hidden" name="callId" value={callId} />
          <input type="hidden" name="workspaceId" value={workspaceId} />
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
                value={editingState.outcomeCode ?? ""}
                onChange={(event) =>
                  setEditingState((prev) => ({
                    ...prev,
                    outcomeCode: (event.target.value as CallOutcomeCode) || null,
                  }))
                }
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
                rows={3}
                value={editingState.notes}
                onChange={(event) =>
                  setEditingState((prev) => ({ ...prev, notes: event.target.value }))
                }
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
              {actionState?.ok === false && actionState.error && (
                <p className="text-xs text-amber-400">{actionState.error}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-sm font-semibold text-slate-200"
                onClick={() => setIsEditing(false)}
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
