"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { getCallSessionDialStatus } from "@/app/(app)/calls/actions/getCallSessionDialStatus";
import { saveAutomatedCallNotesAction } from "@/app/(app)/calls/actions/saveAutomatedCallNotesAction";

const NOTES_AUTOSAVE_DEBOUNCE_MS = 750;
const NOTES_SAVE_MIN_INTERVAL_MS = 2000;

type Props = {
  workspaceId: string;
  callId: string;
  initialNotes?: string | null;
};

export default function AutomatedCallNotesCard({ workspaceId, callId, initialNotes }: Props) {
  const [notesInput, setNotesInput] = useState(initialNotes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const notesRef = useRef(notesInput);
  const notesDirtyRef = useRef(false);
  const lastSavedNotesRef = useRef<string | null>(initialNotes ?? null);
  const lastSaveTimestampRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!callId) {
      return;
    }
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    notesDirtyRef.current = false;
    setNotesDirty(false);
    setSaveState("idle");
    lastSavedNotesRef.current = initialNotes ?? null;

    if (initialNotes !== undefined) {
      const normalized = initialNotes ?? "";
      setNotesInput(normalized);
      notesRef.current = normalized;
      return;
    }

    let cancelled = false;
    getCallSessionDialStatus({ callId })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (notesDirtyRef.current) {
          return;
        }
        const normalized = result.automatedCallNotes ?? "";
        setNotesInput(normalized);
        notesRef.current = normalized;
        lastSavedNotesRef.current = result.automatedCallNotes;
        setSaveState("idle");
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
  }, [callId, initialNotes]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!callId) {
      return;
    }
    console.log("[calls-session-askbob-automated-notes-visible]", {
      workspaceId,
      callId,
      source: "call_session",
    });
  }, [callId, workspaceId]);

  const runNotesSave = useCallback(async () => {
    if (!callId || !notesDirtyRef.current) {
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
    const valueToSave = notesRef.current;
    const hasNotes = Boolean(valueToSave.trim());
    console.log("[calls-session-askbob-automated-notes-save-request]", {
      workspaceId,
      callId,
      source: "call_session",
      hasNotes,
    });
    try {
      const result = await saveAutomatedCallNotesAction({
        workspaceId,
        callId,
        notes: valueToSave,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      lastSaveTimestampRef.current = Date.now();
      const normalized = result.notes ?? "";
      lastSavedNotesRef.current = result.notes;
      console.log("[calls-session-askbob-automated-notes-save-success]", {
        workspaceId,
        callId,
        source: "call_session",
        hasNotes: Boolean(normalized.trim()),
      });
      if (notesRef.current === valueToSave) {
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
    } catch (error) {
      notesDirtyRef.current = true;
      setNotesDirty(true);
      setSaveState("error");
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn("[calls-session-askbob-automated-notes-save-failure]", {
        workspaceId,
        callId,
        source: "call_session",
        errorMessage: message,
      });
    }
  }, [callId, workspaceId]);

  const scheduleNotesSave = useCallback(
    (options?: { immediate?: boolean; force?: boolean }) => {
      if (!callId) {
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
    [callId, runNotesSave],
  );

  const handleNotesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
    setNotesInput(nextValue);
    notesRef.current = nextValue;
    notesDirtyRef.current = true;
    setNotesDirty(true);
    setSaveState("idle");
    scheduleNotesSave();
  },
    [scheduleNotesSave],
  );

  const handleManualSave = useCallback(() => {
    scheduleNotesSave({ immediate: true, force: true });
  }, [scheduleNotesSave]);

  const notesSaveStatusText =
    saveState === "saving"
      ? "Saving..."
      : saveState === "saved"
      ? "Saved"
      : saveState === "error"
      ? "Failed to save"
      : null;

  const canTriggerSave = Boolean(callId && (notesDirty || saveState === "error"));

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4 text-sm text-slate-200">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
          Automated call notes
        </p>
        <button
          type="button"
          onClick={handleManualSave}
          disabled={!canTriggerSave}
          className="text-sm font-semibold text-sky-300 disabled:text-slate-500"
        >
          Save now
        </button>
      </div>
      <textarea
        className="min-h-[120px] w-full rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 focus:border-emerald-400 focus:ring-0"
        value={notesInput}
        onChange={handleNotesChange}
        rows={4}
        placeholder="Record what was said, updates for the tech, or insights for follow-up."
      />
      {notesSaveStatusText && (
        <p className="text-xs text-slate-400">{notesSaveStatusText}</p>
      )}
    </div>
  );
}
