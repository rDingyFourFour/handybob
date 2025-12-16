import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { createAdminClient } from "@/utils/supabase/admin";
import { updateCallSessionTwilioStatus } from "@/lib/domain/calls/sessions";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";
let twilioAuthTokenWarningLogged = false;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const signatureResult = validateTwilioSignature(req, formData);

  if (!signatureResult.valid) {
    console.warn(
      "[twilio-status-callback] Twilio signature validation failed:",
      signatureResult.reason ?? "unknown",
    );
    return new NextResponse(JSON.stringify({ error: "Invalid Twilio signature" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const callSid = getString(formData, "CallSid");
  const callStatus = getString(formData, "CallStatus");
  const errorCode = getString(formData, "ErrorCode");
  const errorMessage = getString(formData, "ErrorMessage");
  const queryParams = getQueryParams(req.url);
  const callIdFromParams = queryParams.get("callId");

  const supabase = createAdminClient();
  let callId: string | null = null;

  if (callSid) {
    const { data: callBySid } = await supabase
      .from("calls")
      .select("id")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();
    callId = callBySid?.id ?? null;
  }

  if (!callId) {
    callId = callIdFromParams;
  }

  if (!callId) {
    console.warn("[twilio-status-callback] Unable to resolve call session", { callSid, callIdFromParams });
    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  await updateCallSessionTwilioStatus({
    supabase,
    callId,
    twilioStatus: callStatus ?? "unknown",
    errorCode: errorCode ?? undefined,
    errorMessage,
  });

  console.log("[calls-twilio-status-callback]", {
    callId,
    callSid,
    workspaceId: queryParams.get("workspaceId"),
    twilioStatus: callStatus,
    errorCode,
  });

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type TwilioSignatureResult = {
  valid: boolean;
  reason?: string;
};

function validateTwilioSignature(req: NextRequest, formData: FormData): TwilioSignatureResult {
  if (!TWILIO_AUTH_TOKEN) {
    if (!twilioAuthTokenWarningLogged) {
      console.warn("[twilio-status-callback] TWILIO_AUTH_TOKEN not configured; skipping signature validation.");
      twilioAuthTokenWarningLogged = true;
    }
    return { valid: true };
  }

  const signature = req.headers.get(TWILIO_SIGNATURE_HEADER);
  if (!signature) {
    return { valid: false, reason: "missing Twilio signature header" };
  }

  try {
    const params = formDataToRecord(formData);
    const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, req.url, params);
    return { valid: isValid, reason: isValid ? undefined : "signature mismatch" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "validation error";
    return { valid: false, reason };
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function formDataToRecord(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !(key in params)) {
      params[key] = value;
    }
  });
  return params;
}

function getQueryParams(url: string) {
  const queryStart = url.indexOf("?");
  const search = queryStart === -1 ? "" : url.substring(queryStart + 1);
  return new URLSearchParams(search);
}
