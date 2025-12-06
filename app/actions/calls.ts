"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { normalizeCallOutcome } from "@/lib/domain/communications/callOutcomes";

export async function updateCallOutcomeAction(formData: FormData) {
  const callIdRaw = formData.get("callId");
  const callId = typeof callIdRaw === "string" ? callIdRaw.trim() : "";
  if (!callId) {
    console.error("[call-outcome-update] Missing callId in form data.");
    throw new Error("Unable to update call outcome.");
  }

  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const workspaceId = workspaceContext.workspace?.id;
  if (!workspaceId) {
    console.error("[call-outcome-update] Workspace context missing.");
    throw new Error("Unable to update call outcome right now.");
  }

  const outcomeRaw = formData.get("outcome");
  const normalizedOutcome = normalizeCallOutcome(
    typeof outcomeRaw === "string" ? outcomeRaw : null
  );
  if (typeof outcomeRaw === "string" && outcomeRaw.trim() && !normalizedOutcome) {
    console.error("[call-outcome-update] Invalid outcome value received.", {
      callId,
      workspaceId,
      outcomeRaw,
    });
    throw new Error("Unable to update call outcome right now.");
  }

  const notesRaw = formData.get("outcomeNotes");
  const trimmedNotes =
    typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

  const payload = {
    outcome: normalizedOutcome,
    outcome_notes: trimmedNotes,
    outcome_recorded_at: normalizedOutcome ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("calls")
    .update(payload)
    .eq("workspace_id", workspaceId)
    .eq("id", callId)
    .select("id")
    .single();

  const success = !error && Boolean(data?.id);
  console.log("[call-outcome-update]", {
    callId,
    workspaceId,
    outcome: normalizedOutcome,
    hasNotes: Boolean(trimmedNotes),
    success,
  });

  if (error) {
    console.error("[call-outcome-update] Supabase error updating outcome:", error);
    throw new Error(error.message || "Unable to update call outcome right now.");
  }

  revalidatePath(`/calls/${callId}`);
}
