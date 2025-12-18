"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { updateCallSessionAutomatedNotes } from "@/lib/domain/calls/sessions";

const SaveAutomatedCallNotesSchema = z.object({
  workspaceId: z.string().min(1),
  callId: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export type SaveAutomatedCallNotesPayload = z.infer<typeof SaveAutomatedCallNotesSchema>;

type SaveAutomatedCallNotesSuccess = {
  ok: true;
  callId: string;
  notes: string | null;
};

type SaveAutomatedCallNotesFailure = {
  ok: false;
  code:
    | "workspace_unavailable"
    | "wrong_workspace"
    | "invalid_payload"
    | "call_not_found"
    | "update_failed";
  error: string;
};

export type SaveAutomatedCallNotesActionResult =
  | SaveAutomatedCallNotesSuccess
  | SaveAutomatedCallNotesFailure;

export async function saveAutomatedCallNotesAction(
  payload: SaveAutomatedCallNotesPayload,
): Promise<SaveAutomatedCallNotesActionResult> {
  const parsed = SaveAutomatedCallNotesSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn("[askbob-automated-call-notes-save-failure]", {
      workspaceId: payload.workspaceId,
      callId: payload.callId ?? null,
      reason: "invalid_payload",
      errors: parsed.error.flatten(),
      hasNotes: Boolean(payload.notes?.trim()),
    });
    return {
      ok: false,
      code: "invalid_payload",
      error: "Call notes payload is invalid.",
    };
  }

  const { workspaceId, callId, notes } = parsed.data;
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, code: "workspace_unavailable", error: "Workspace context is unavailable." };
  }

  if (workspace.id !== workspaceId) {
    return {
      ok: false,
      code: "wrong_workspace",
      error: "The call does not belong to the requested workspace.",
    };
  }

  const hasNotes = Boolean(notes?.trim());
  console.log("[askbob-automated-call-notes-save-request]", {
    workspaceId,
    callId,
    hasNotes,
  });

  try {
    const savedNotes = await updateCallSessionAutomatedNotes({
      supabase,
      workspaceId,
      callId,
      notes,
    });
    console.log("[askbob-automated-call-notes-save-success]", {
      workspaceId,
      callId,
      hasNotes: Boolean(savedNotes),
    });
    return {
      ok: true,
      callId,
      notes: savedNotes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const reason = message.includes("Call not found") ? "call_not_found" : "update_failed";
    console.warn("[askbob-automated-call-notes-save-failure]", {
      workspaceId,
      callId,
      reason,
      errorMessage: message,
      hasNotes,
    });
    if (reason === "call_not_found") {
      return { ok: false, code: "call_not_found", error: "Call not found." };
    }
    return { ok: false, code: "update_failed", error: message };
  }
}
