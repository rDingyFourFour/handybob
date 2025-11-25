import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { createAdminClient } from "@/utils/supabase/admin";

// Twilio inbound voice endpoint:
// - Receives call metadata (From, To, CallSid) and must always reply with TwiML that records a voicemail.
// - Expected payload: `From`, `To`, `CallSid` (form-encoded) plus optional `CallerName`, `CallStatus`.
// - Persists a `calls` row tagged to `VOICE_FALLBACK_USER_ID` (legacy single-tenant).
// - Always returns TwiML so Twilio can continue; logs failures but still responds with valid XML.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_USER_ID = process.env.VOICE_FALLBACK_USER_ID;

// Logs around this route make it easier to trace calls coming from Twilio Voice webhooks.
const RECORDING_CALLBACK =
  process.env.VOICE_RECORDING_CALLBACK_URL ?? "/api/voice/recording";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const fromNumber = getString(formData, "From");
  const toNumber = getString(formData, "To");
  const callSid = getString(formData, "CallSid");

  const supabase = createAdminClient();

  if (!callSid) {
    console.warn("[voice-inbound] Missing CallSid; call row cannot be correlated.");
  }

  const userId = DEFAULT_USER_ID ?? null;
  if (!userId) {
    console.warn("[voice-inbound] VOICE_FALLBACK_USER_ID not set; skipping call insert.");
  } else {
    try {
      const { error } = await supabase.from("calls").insert({
        user_id: userId,
        workspace_id: null,
        from_number: fromNumber ?? null,
        to_number: toNumber ?? null,
        twilio_call_sid: callSid ?? null,
        direction: "inbound",
        status: "inbound_voicemail",
        started_at: new Date().toISOString(),
      });

      if (error) {
        console.error("[voice-inbound] Failed to insert call row:", error.message, {
          user_id: userId,
          callSid,
        });
      } else {
        console.info("[voice-inbound] Call row created", {
          user_id: userId,
          twilio_call_sid: callSid,
          from: fromNumber,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error("[voice-inbound] Unexpected error inserting call:", message);
    }
  }

  const response = new twilio.twiml.VoiceResponse();
  response.say(
    { voice: "alice" },
    "Hey, this is HandyBob. Please leave a detailed message with your name, the work you need, and the best time to reach you after the beep."
  );
  response.record({
    maxLength: 120,
    playBeep: true,
    recordingStatusCallback: RECORDING_CALLBACK,
    recordingStatusCallbackMethod: "POST",
    trim: "do-not-trim",
  });
  response.say({ voice: "alice" }, "We did not receive your message. Goodbye.");

  return new NextResponse(response.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}
