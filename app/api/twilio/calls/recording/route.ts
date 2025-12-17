import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import {
  updateCallSessionRecordingMetadata,
} from "@/lib/domain/calls/sessions";
import {
  TWILIO_SIGNATURE_HEADER,
  verifyTwilioSignature,
  formDataToRecord,
} from "@/lib/domain/twilio/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = formDataToRecord(formData);
  const callSid = params.CallSid ?? null;
  const recordingSid = params.RecordingSid ?? null;
  const recordingUrl = params.RecordingUrl ?? null;
  const durationValue = params.RecordingDuration ?? null;
  const parsedDuration =
    durationValue !== null && durationValue !== undefined
      ? Number(durationValue)
      : null;
  const recordingDurationSeconds =
    typeof parsedDuration === "number" && Number.isFinite(parsedDuration) ? parsedDuration : null;
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

    console.warn("[twilio-call-recording-callback-rejected]", rejectionLog);
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  console.log("[twilio-call-recording-callback-received]", {
    sid: callSid,
    recordingSid,
  });

  const supabase = createAdminClient();
  const updateResult = await updateCallSessionRecordingMetadata({
    supabase,
    recordingSid,
    recordingUrl,
    recordingDurationSeconds,
    recordingReceivedAt: new Date().toISOString(),
    callId: callIdFromParams ?? undefined,
    workspaceId: workspaceIdFromParams ?? undefined,
    twilioCallSid: callSid ?? undefined,
  });

  if (!updateResult) {
    console.warn("[twilio-call-recording-callback-unmatched]", {
      sid: callSid,
      recordingSid,
      callId: callIdFromParams,
      workspaceId: workspaceIdFromParams,
    });
    return new NextResponse(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (updateResult.applied) {
    console.log("[twilio-call-recording-callback-applied]", {
      callId: updateResult.callId,
      workspaceId: updateResult.workspaceId,
      recordingSid,
      duration: recordingDurationSeconds,
    });
  } else if (updateResult.duplicate) {
    console.log("[twilio-call-recording-callback-duplicate]", {
      callId: updateResult.callId,
      workspaceId: updateResult.workspaceId,
      recordingSid,
    });
  }

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function getQueryParams(url: string) {
  const queryStart = url.indexOf("?");
  const search = queryStart === -1 ? "" : url.substring(queryStart + 1);
  return new URLSearchParams(search);
}
