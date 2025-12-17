import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { createAdminClient } from "@/utils/supabase/admin";
import { updateCallSessionTwilioStatus } from "@/lib/domain/calls/sessions";

const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = formDataToRecord(formData);
  const callSid = params.CallSid ?? null;
  const callStatus = params.CallStatus ?? null;
  const errorCode = params.ErrorCode ?? null;
  const errorMessage = params.ErrorMessage ?? null;
  const queryParams = getQueryParams(req.url);
  const callIdFromParams = queryParams.get("callId");
  const workspaceIdFromParams = queryParams.get("workspaceId");
  const signature = req.headers.get(TWILIO_SIGNATURE_HEADER);

  const verificationResult = verifyTwilioSignature(signature, params, req.url);
  if (!verificationResult.valid) {
    const rejectionLog: Record<string, unknown> = {
      reason: verificationResult.reason,
    };
    if (callSid) rejectionLog.sid = callSid;
    if (callIdFromParams) rejectionLog.callId = callIdFromParams;
    if (workspaceIdFromParams) rejectionLog.workspaceId = workspaceIdFromParams;
    if (verificationResult.detail) rejectionLog.detail = verificationResult.detail;

    console.warn("[twilio-call-status-callback-rejected]", rejectionLog);
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  console.log("[twilio-call-status-callback-received]", {
    status: callStatus ?? "unknown",
    sid: callSid,
  });

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
    console.warn("[twilio-call-status-callback-unmatched]", { sid: callSid, callIdFromParams });
    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const updateResult = await updateCallSessionTwilioStatus({
    supabase,
    callId,
    twilioStatus: callStatus ?? "unknown",
    errorCode: errorCode ?? undefined,
    errorMessage,
  });

  console.log("[twilio-call-status-callback-update]", {
    callId,
    callSid,
    workspaceId: workspaceIdFromParams,
    incomingStatus: callStatus ?? "unknown",
    currentStatus: updateResult.currentStatus,
    applied: updateResult.applied,
    errorCode,
  });

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type TwilioSignatureRejectionReason = "missing_token" | "missing_signature" | "invalid_signature";

type TwilioSignatureVerificationResult = {
  valid: boolean;
  reason?: TwilioSignatureRejectionReason;
  detail?: string;
};

function verifyTwilioSignature(
  signature: string | null,
  params: Record<string, string>,
  url: string,
): TwilioSignatureVerificationResult {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return { valid: false, reason: "missing_token" };
  }

  if (!signature) {
    return { valid: false, reason: "missing_signature" };
  }

  try {
    const isValid = twilio.validateRequest(authToken, signature, url, params);
    return { valid: isValid, reason: isValid ? undefined : "invalid_signature" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "validation error";
    return { valid: false, reason: "invalid_signature", detail };
  }
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
