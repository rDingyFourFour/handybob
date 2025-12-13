"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  CALL_OUTCOME_CODE_VALUES,
  CallOutcomeCode,
  mapOutcomeCodeToLegacyOutcome,
} from "@/lib/domain/communications/callOutcomes";

const NOTES_MAX_LENGTH = 1000;

type SaveCallOutcomeSuccess = {
  ok: true;
  callId: string;
  reachedCustomer: boolean | null;
  outcomeCode: CallOutcomeCode | null;
  notes: string | null;
  recordedAtIso: string | null;
};

type SaveCallOutcomeFailure = {
  ok: false;
  error: string;
  code:
    | "call_not_found"
    | "wrong_workspace"
    | "call_query_error"
    | "call_update_error"
    | "workspace_context_unavailable";
};

export type SaveCallOutcomeResponse = SaveCallOutcomeSuccess | SaveCallOutcomeFailure;

const callOutcomeSchema = z.object({
  callId: z.string().min(1),
  workspaceId: z.string().min(1),
  reachedCustomer: z
    .preprocess((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (value === null || value === undefined) {
        return null;
      }
      const normalized = String(value).trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      return null;
    }, z.union([z.boolean(), z.null()])),
  outcomeCode: z.preprocess(
    (value) => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.enum(CALL_OUTCOME_CODE_VALUES).nullable(),
  ),
  notes: z.string().max(NOTES_MAX_LENGTH).optional().nullable(),
  jobId: z
    .preprocess((value) => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }, z.string().min(1).nullable())
    .optional(),
});

function normalizeOutcomeNotes(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const collapsed = trimmed.replace(/\s+/g, " ");
  return collapsed || null;
}

export async function saveCallOutcomeAction(
  formData: FormData,
): Promise<SaveCallOutcomeResponse> {
  const parsed = callOutcomeSchema.parse({
    callId: formData.get("callId"),
    workspaceId: formData.get("workspaceId"),
    reachedCustomer: formData.get("reachedCustomer"),
    outcomeCode: formData.get("outcomeCode"),
    notes: typeof formData.get("notes") === "string" ? formData.get("notes") : null,
    jobId: formData.get("jobId"),
  });

  const normalizedNotes = normalizeOutcomeNotes(parsed.notes);
  const hasReached = parsed.reachedCustomer !== null;
  const hasOutcomeCode = Boolean(parsed.outcomeCode);
  const notesLength = normalizedNotes?.length ?? 0;

  console.log("[calls-outcome-ui-request]", {
    workspaceId: parsed.workspaceId,
    callId: parsed.callId,
    hasReached,
    hasOutcomeCode,
    notesLength,
  });

  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const workspace = workspaceContext.workspace;
  const userId = workspaceContext.user?.id ?? null;

  if (!workspace) {
    console.error("[calls-outcome-ui-failure] workspace context unavailable", {
      callId: parsed.callId,
      workspaceId: parsed.workspaceId,
    });
    return { ok: false, error: "Workspace unavailable", code: "workspace_context_unavailable" };
  }

  const { data: callRow, error: callError } = await supabase
    .from("calls")
    .select("id, workspace_id")
    .eq("id", parsed.callId)
    .maybeSingle();

  if (callError) {
    console.error("[calls-outcome-ui-failure] Failed to load call", {
      callId: parsed.callId,
      workspaceId: workspace.id,
      error: callError,
    });
    return { ok: false, error: "Failed to load call", code: "call_query_error" };
  }

  if (!callRow) {
    console.warn("[calls-outcome-ui-failure] Call not found", {
      callId: parsed.callId,
      workspaceId: workspace.id,
    });
    return { ok: false, error: "Call not found", code: "call_not_found" };
  }

  if (callRow.workspace_id !== workspace.id) {
    console.warn("[calls-outcome-ui-failure] Call belongs to a different workspace", {
      callId: parsed.callId,
      workspaceId: workspace.id,
      callWorkspaceId: callRow.workspace_id,
    });
    return { ok: false, error: "Wrong workspace", code: "wrong_workspace" };
  }

  const shouldRecordOutcome =
    parsed.reachedCustomer !== null || parsed.outcomeCode !== null || normalizedNotes !== null;
  const recordedAtIso = shouldRecordOutcome ? new Date().toISOString() : null;
  const recordedBy = shouldRecordOutcome ? userId : null;
  const legacyOutcome = mapOutcomeCodeToLegacyOutcome(parsed.outcomeCode);

  const { data: updateData, error: updateError } = await supabase
    .from("calls")
    .update({
      reached_customer: parsed.reachedCustomer,
      outcome_code: parsed.outcomeCode,
      outcome_notes: normalizedNotes,
      outcome_recorded_at: recordedAtIso,
      outcome_recorded_by: recordedBy,
      outcome: legacyOutcome,
    })
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.callId)
    .select("id")
    .maybeSingle();

  if (updateError || !updateData?.id) {
    console.error("[calls-outcome-ui-failure] Failed to persist outcome", {
      callId: parsed.callId,
      workspaceId: workspace.id,
      error: updateError,
    });
    return { ok: false, error: "Unable to save outcome", code: "call_update_error" };
  }

  try {
    revalidatePath(`/calls/${parsed.callId}`);
  } catch (error) {
    console.warn("[calls-outcome-ui-revalidate-failure]", {
      callId: parsed.callId,
      workspaceId: workspace.id,
      error,
    });
  }

  if (parsed.jobId) {
    try {
      revalidatePath(`/jobs/${parsed.jobId}`);
    } catch (error) {
      console.warn("[calls-outcome-ui-revalidate-failure]", {
        callId: parsed.callId,
        workspaceId: workspace.id,
        jobId: parsed.jobId,
        error,
      });
    }
  }

  console.log("[calls-outcome-ui-success]", {
    workspaceId: workspace.id,
    callId: parsed.callId,
    hasJobId: Boolean(parsed.jobId),
    reachedCustomer: parsed.reachedCustomer,
    outcomeCode: parsed.outcomeCode,
  });

  return {
    ok: true,
    callId: parsed.callId,
    reachedCustomer: parsed.reachedCustomer,
    outcomeCode: parsed.outcomeCode,
    notes: normalizedNotes,
    recordedAtIso,
  };
}
