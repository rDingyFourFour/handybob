"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { isTerminalTwilioStatus } from "@/lib/domain/calls/sessions";

export type GetCallSessionDialStatusResult = {
  callId: string;
  twilioCallSid: string | null;
  twilioStatus: string | null;
  twilioStatusUpdatedAt: string | null;
  isTerminal: boolean;
  hasRecording: boolean;
  recordingDurationSeconds: number | null;
};

export async function getCallSessionDialStatus({
  callId,
}: {
  callId: string;
}): Promise<GetCallSessionDialStatusResult> {
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });
  const workspaceId = workspace.id;

  console.log("[askbob-automated-call-status-poll-request]", {
    workspaceId,
    callId,
  });

  const { data: callRow, error: fetchError } = await supabase
    .from("calls")
    .select(
      "id, workspace_id, twilio_call_sid, twilio_status, twilio_status_updated_at, twilio_recording_url, twilio_recording_sid, twilio_recording_duration_seconds"
    )
    .eq("id", callId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError) {
    console.warn("[askbob-automated-call-status-poll-failure]", {
      workspaceId,
      callId,
      reason: "call_fetch_error",
      message: fetchError instanceof Error ? fetchError.message : "unknown",
    });
    throw new Error("Failed to load call");
  }

  if (!callRow) {
    console.warn("[askbob-automated-call-status-poll-failure]", {
      workspaceId,
      callId,
      reason: "call_not_found",
    });
    throw new Error("Call not found");
  }

  const sanitizedStatus = callRow.twilio_status?.trim() ?? null;
  const result: GetCallSessionDialStatusResult = {
    callId: callRow.id,
    twilioCallSid: callRow.twilio_call_sid ?? null,
    twilioStatus: callRow.twilio_status ?? null,
    twilioStatusUpdatedAt: callRow.twilio_status_updated_at ?? null,
    isTerminal: isTerminalTwilioStatus(sanitizedStatus),
    hasRecording: Boolean(callRow.twilio_recording_url || callRow.twilio_recording_sid),
    recordingDurationSeconds: callRow.twilio_recording_duration_seconds ?? null,
  };

  console.log("[askbob-automated-call-status-poll-success]", {
    workspaceId,
    callId,
    status: sanitizedStatus,
  });

  return result;
}
