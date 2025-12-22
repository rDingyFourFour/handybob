"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import { isTerminalTwilioDialStatus, sanitizeAutomatedCallNotes } from "@/lib/domain/calls/sessions";
import type { CallPostEnrichmentResult } from "@/lib/domain/askbob/types";

const callPostEnrichmentSchema = z.object({
  workspaceId: z.string().min(1),
  callId: z.string().min(1),
});

type CallPostEnrichmentPayload = z.infer<typeof callPostEnrichmentSchema>;

type CallPostEnrichmentSuccess = {
  ok: true;
  result: CallPostEnrichmentResult;
  durationMs: number;
};

type CallPostEnrichmentFailure = {
  ok: false;
  code: string;
  message: string;
  durationMs?: number;
};

type CallPostEnrichmentResponse = CallPostEnrichmentSuccess | CallPostEnrichmentFailure;

type CallRow = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  twilio_status: string | null;
  twilio_recording_sid: string | null;
  twilio_recording_url: string | null;
  summary: string | null;
  outcome_notes: string | null;
  transcript: string | null;
};

function buildSanitizedNotes(call: CallRow): string | null {
  const segments = [call.summary, call.outcome_notes, call.transcript]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!segments.length) {
    return null;
  }
  return sanitizeAutomatedCallNotes(segments.join("\n"));
}

export async function runAskBobCallPostEnrichmentAction(
  payload: CallPostEnrichmentPayload,
): Promise<CallPostEnrichmentResponse> {
  const start = Date.now();
  let parsed: CallPostEnrichmentPayload;
  try {
    parsed = callPostEnrichmentSchema.parse(payload);
  } catch (error) {
    console.error("[askbob-call-post-enrichment-ui-failure] invalid payload", {
      errors: error instanceof z.ZodError ? error.flatten() : error,
    });
    return {
      ok: false,
      code: "invalid_payload",
      message: "Call enrichment needs a call ID and workspace.",
    };
  }

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return {
      ok: false,
      code: "workspace_unavailable",
      message: "Workspace context is unavailable.",
    };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-call-post-enrichment-ui-failure] workspace mismatch", {
      workspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      callId: parsed.callId,
    });
    return {
      ok: false,
      code: "wrong_workspace",
      message: "This call does not belong to the current workspace.",
    };
  }

  const { data: call, error: callError } = await supabase
    .from<CallRow>("calls")
    .select(
      "id, workspace_id, job_id, direction, from_number, to_number, twilio_status, twilio_recording_sid, twilio_recording_url, summary, outcome_notes, transcript",
    )
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.callId)
    .maybeSingle();

  if (callError || !call) {
    console.error("[askbob-call-post-enrichment-ui-failure] call not found", {
      workspaceId: workspace.id,
      callId: parsed.callId,
      userId: user.id,
      error: callError,
    });
    return {
      ok: false,
      code: "call_not_found",
      message: "We could not find that call to enrich.",
      durationMs: Date.now() - start,
    };
  }
  if (call.workspace_id !== workspace.id) {
    console.error("[askbob-call-post-enrichment-ui-failure] call workspace mismatch", {
      workspaceId: workspace.id,
      callId: call.id,
      callWorkspaceId: call.workspace_id,
    });
    return {
      ok: false,
      code: "call_not_found",
      message: "We could not find that call to enrich.",
      durationMs: Date.now() - start,
    };
  }

  const isTerminal = isTerminalTwilioDialStatus(call.twilio_status);
  console.log("[askbob-call-post-enrichment-ui-request]", {
    workspaceId: workspace.id,
    callId: call.id,
    isTerminal,
  });

  if (!isTerminal) {
    console.log("[askbob-call-post-enrichment-ui-failure] call not terminal", {
      workspaceId: workspace.id,
      callId: call.id,
      isTerminal,
    });
    return {
      ok: false,
      code: "not_terminal",
      message: "Post-call enrichment is available once the call is terminal.",
      durationMs: Date.now() - start,
    };
  }

  const sanitizedNotes = buildSanitizedNotes(call);
  const hasNotes = Boolean(sanitizedNotes);
  const hasRecording = Boolean(call.twilio_recording_sid || call.twilio_recording_url);

  try {
    const result = await runAskBobTask(supabase, {
      task: "call.post_enrichment",
      workspaceId: workspace.id,
      callId: call.id,
      jobId: call.job_id ?? null,
      direction: call.direction ?? null,
      fromNumber: call.from_number ?? null,
      toNumber: call.to_number ?? null,
      twilioStatus: call.twilio_status ?? null,
      hasRecording,
      hasNotes,
      notesText: sanitizedNotes ?? null,
    });
    const durationMs = Date.now() - start;
    console.log("[askbob-call-post-enrichment-ui-success]", {
      workspaceId: workspace.id,
      callId: call.id,
      isTerminal,
      durationMs,
    });
    return {
      ok: true,
      result: result as CallPostEnrichmentResult,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const message =
      error instanceof Error ? error.message : "AskBob could not enrich this call right now.";
    console.error("[askbob-call-post-enrichment-ui-failure]", {
      workspaceId: workspace.id,
      callId: call.id,
      isTerminal,
      errorMessage: message,
    });
    return {
      ok: false,
      code: "askbob_failed",
      message: "AskBob could not enrich this call right now.",
      durationMs,
    };
  }
}
