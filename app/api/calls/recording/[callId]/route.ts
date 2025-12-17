import { NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { fetchTwilioRecording } from "@/lib/domain/twilio.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  callId: string;
};

export async function GET(
  _req: NextRequest,
  context: { params: RouteParams },
) {
  const { callId } = context.params;
  if (!callId) {
    return new NextResponse(JSON.stringify({ error: "Missing callId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = await createServerClient();
  let workspaceId: string;
  try {
    const workspaceContext = await getCurrentWorkspace({ supabase });
    workspaceId = workspaceContext.workspace.id;
  } catch {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: callRow, error: callError } = await supabase
    .from("calls")
    .select("id, workspace_id, twilio_recording_url")
    .eq("id", callId)
    .maybeSingle();

  if (callError) {
    console.error("[calls-recording-proxy-call-fetch-failed]", {
      callId,
      workspaceId,
      message: callError instanceof Error ? callError.message : "unknown",
    });
    return new NextResponse(JSON.stringify({ error: "Unable to load call" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!callRow || callRow.workspace_id !== workspaceId) {
    return new NextResponse(JSON.stringify({ error: "Call not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const recordingUrl = callRow.twilio_recording_url;
  if (!recordingUrl) {
    console.warn("[calls-recording-proxy-missing]", { callId, workspaceId });
    return new NextResponse(JSON.stringify({ error: "Recording missing" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const recordingResult = await fetchTwilioRecording(recordingUrl);
  if (!recordingResult.success) {
    console.warn("[calls-recording-proxy-upstream-failure]", {
      callId,
      workspaceId,
      status: recordingResult.status,
      code: recordingResult.code,
    });
    return new NextResponse(JSON.stringify({ error: "Unable to stream recording" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const upstreamResponse = recordingResult.response;
  const contentType = upstreamResponse.headers.get("content-type") ?? "audio/mpeg";
  const contentLengthHeader = upstreamResponse.headers.get("content-length") ?? undefined;
  const parsedLength =
    typeof contentLengthHeader === "string" && contentLengthHeader.length > 0
      ? Number(contentLengthHeader)
      : undefined;
  const bytes =
    typeof parsedLength === "number" && Number.isFinite(parsedLength) ? parsedLength : undefined;
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "private, no-store",
  });
  if (contentLengthHeader) {
    headers.set("content-length", contentLengthHeader);
  }

  console.log("[calls-recording-proxy-success]", {
    callId,
    workspaceId,
    bytes,
  });

  return new NextResponse(upstreamResponse.body, {
    status: 200,
    headers,
  });
}
