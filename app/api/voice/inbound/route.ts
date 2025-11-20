import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { createAdminClient } from "@/utils/supabase/admin";

// Inbound Voice webhook (Twilio)
// 1) Twilio sends a POST to /api/voice/inbound with call metadata (From, To, CallSid, etc.).
// 2) We create a calls row for the workspace owner (single-tenant assumption for now).
//    TODO: map `To` -> user_id for multi-tenant routing once each user has their own Twilio number.
// 3) We respond with TwiML that greets the caller and uses <Record> with a recordingStatusCallback
//    that will be handled by /api/voice/recording to process the voicemail.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_USER_ID = process.env.VOICE_FALLBACK_USER_ID;
const RECORDING_CALLBACK =
  process.env.VOICE_RECORDING_CALLBACK_URL ?? "/api/voice/recording";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const fromNumber = getString(formData, "From");
  const toNumber = getString(formData, "To");
  const callSid = getString(formData, "CallSid");

  const supabase = createAdminClient();

  // TODO: replace this with a lookup that maps `toNumber` -> user/workspace once per-tenant numbers exist.
  const userId = DEFAULT_USER_ID ?? null;
  if (!userId) {
    console.warn("[voice-inbound] VOICE_FALLBACK_USER_ID not set; skipping call insert.");
  } else {
    const { error } = await supabase.from("calls").insert({
      user_id: userId,
      from_number: fromNumber ?? null,
      to_number: toNumber ?? null,
      twilio_call_sid: callSid ?? null,
      direction: "inbound",
      status: "inbound_voicemail",
      started_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[voice-inbound] Failed to insert call row:", error.message);
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
