// Twilio SMS webhook: validates the request signature and hands SMS payload handling (logging + placeholder response) to `handleInboundSms`.
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { handleInboundSms } from "@/lib/domain/sms";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";

async function parseFormData(formData: FormData) {
  const data: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      data[key] = value;
    }
  });
  return data;
}

function validateTwilioSignature(req: NextRequest, params: Record<string, string>) {
  if (!TWILIO_AUTH_TOKEN) {
    return { valid: true };
  }

  const signature = req.headers.get(TWILIO_SIGNATURE_HEADER);
  if (!signature) {
    return {
      valid: false,
      reason: "missing Twilio signature header",
    };
  }

  try {
    const valid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, req.url, params);
    return { valid, reason: valid ? undefined : "signature mismatch" };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "validation failure" };
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO [TECH_DEBT #3]: fully implement inbound SMS handling.
// - Match or create a customer by From/To, attach to workspace/job context.
// - Insert messages rows with direction=inbound, via=sms, body, and link to the customer/job.
// - Optionally trigger automations when certain keywords arrive.
// Until that work is complete, this route safely responds with TwiML while logging received payloads.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = await parseFormData(formData);
  const validation = validateTwilioSignature(req, params);

  if (!validation.valid) {
    console.warn("[sms-webhook] Twilio signature invalid:", validation.reason);
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const fromNumber = params.From ?? "unknown";
  const toNumber = params.To ?? "unknown";
  const body = params.Body ?? "";

  const responseXml = await handleInboundSms({
    from: fromNumber,
    to: toNumber,
    body,
  });

  return new NextResponse(responseXml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
