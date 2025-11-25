// Twilio Voice inbound webhook: records a fallback call row via `recordLegacyInboundCall` before returning the TwiML produced by `handleTwilioVoiceEvent`.
import { NextRequest, NextResponse } from "next/server";

import { handleTwilioVoiceEvent, recordLegacyInboundCall } from "@/lib/domain/calls";

// Twilio inbound voice endpoint:
// - Receives call metadata (From, To, CallSid) and must always reply with TwiML that records a voicemail.
// - Expected payload: `From`, `To`, `CallSid` (form-encoded) plus optional `CallerName`, `CallStatus`.
// - Persists a `calls` row tagged to `VOICE_FALLBACK_USER_ID` (legacy single-tenant).
// - Always returns TwiML so Twilio can continue; logs failures but still responds with valid XML.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const event = {
    from: getString(formData, "From"),
    to: getString(formData, "To"),
    callSid: getString(formData, "CallSid"),
  };

  if (!event.callSid) {
    console.warn("[voice-inbound] Missing CallSid; call row cannot be correlated.");
  }

  await recordLegacyInboundCall(event);
  const twiml = await handleTwilioVoiceEvent(event);

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}
