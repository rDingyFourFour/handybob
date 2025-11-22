import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import { processCallById } from "@/app/calls/processCallAction";

// Twilio recording status callback
// - Twilio POSTs here after <Record> completes with RecordingUrl, CallSid, etc.
// - We attach the recording to the existing calls row (matched via twilio_call_sid) and mark status.
// - No TwiML response needed; just 200/4xx JSON for observability.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const callSid = getString(formData, "CallSid");
  const recordingUrl = getString(formData, "RecordingUrl");
  const duration = getString(formData, "RecordingDuration");

  // Expected Twilio recording callback payload: CallSid, RecordingUrl, RecordingDuration (form-encoded).
  // DB: attach recording_url + duration to existing call row (matched by CallSid), set status=voicemail_recorded.
  // Edge cases: returns 404 if no call found; repeated callbacks will overwrite same fields (idempotent-ish). Auto-processing is gated by env flag.
  if (!callSid || !recordingUrl) {
    console.warn("[voice-recording] Missing CallSid or RecordingUrl");
    return NextResponse.json({ error: "Missing CallSid or RecordingUrl" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const canonicalUrl = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;

  const { data: existingCall, error: fetchError } = await supabase
    .from("calls")
    .select("id")
    .eq("twilio_call_sid", callSid)
    .maybeSingle();

  if (fetchError) {
    console.error("[voice-recording] Failed to fetch call by CallSid:", fetchError.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (!existingCall?.id) {
    console.warn("[voice-recording] No call found for CallSid", callSid);
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("calls")
    .update({
      recording_url: canonicalUrl,
      status: "voicemail_recorded",
      duration_seconds: parseInt(duration ?? "0", 10) || null,
    })
    .eq("id", existingCall.id);

  if (updateError) {
    console.error("[voice-recording] Failed to update call with recording:", updateError.message);
    return NextResponse.json({ error: "Failed to attach recording" }, { status: 500 });
  }

  // Optional automation: kick off transcription + summary after recording arrives.
  // Set ENABLE_AUTO_CALL_PROCESSING=false to disable. Errors are logged but don't fail the webhook.
  if (process.env.ENABLE_AUTO_CALL_PROCESSING === "true") {
    processCallById(existingCall.id).catch((err) =>
      console.error("[voice-recording] Auto-processing failed:", err instanceof Error ? err.message : err),
    );
  }

  return NextResponse.json({ ok: true });
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}
