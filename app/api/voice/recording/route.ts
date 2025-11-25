// Twilio Voice recording callback: validates payload, delegates call lookup/recording attach to `attachRecordingToCall`, and optionally triggers auto-processing.
import { NextRequest, NextResponse } from "next/server";

import { attachRecordingToCall, RecordingCallbackError } from "@/lib/domain/calls";
import { processCallById } from "@/app/calls/processCallAction";

// Recording status callback:
// - Twilio posts `CallSid`, `RecordingUrl`, and `RecordingDuration` after <Record>.
// - We match the call by `twilio_call_sid`, attach the recording URL (canonicalizing to .mp3), update status/duration, and optionally enqueue auto-processing.
// - Returns JSON with `ok: true`; errors log details but return 4xx/5xx so Twilio can retry.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const callSid = getString(formData, "CallSid");
  const recordingUrl = getString(formData, "RecordingUrl");
  const duration = getString(formData, "RecordingDuration");

  if (!callSid || !recordingUrl) {
    console.warn("[voice-recording] Missing CallSid or RecordingUrl");
    return NextResponse.json({ error: "Missing CallSid or RecordingUrl" }, { status: 400 });
  }

  try {
    const callId = await attachRecordingToCall({
      callSid,
      recordingUrl,
      durationSeconds: parseInt(duration ?? "0", 10) || null,
    });

    if (process.env.ENABLE_AUTO_CALL_PROCESSING === "true") {
      processCallById(callId).catch((err) =>
        console.error("[voice-recording] Auto-processing failed:", err instanceof Error ? err.message : err),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RecordingCallbackError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[voice-recording] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}
