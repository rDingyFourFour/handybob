import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import { parseCallSpeechPlan } from "@/lib/domain/calls/sessions";
import {
  ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT,
  ASKBOB_AUTOMATED_VOICE_DEFAULT,
} from "@/lib/domain/askbob/speechPlan";
import {
  TWILIO_SIGNATURE_HEADER,
  verifyTwilioSignature,
} from "@/lib/domain/twilio/signature";

const DEFAULT_GUARD_MESSAGE = "Thank you for your time. We're following up on your job.";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildScriptSpeechText(scriptSummary: string | null) {
  if (!scriptSummary) {
    return DEFAULT_GUARD_MESSAGE;
  }
  const parts = scriptSummary
    .split(/\r?\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const snippet = parts.length ? parts.slice(0, 2).join(" ") : scriptSummary.trim();
  return snippet || DEFAULT_GUARD_MESSAGE;
}

function buildGreetingLine(greetingStyle: string) {
  const tone = greetingStyle.toLowerCase();
  return `Thank you for your time. We're following up in a ${tone} tone.`;
}

function buildResponseBody(plan: {
  voice: string;
  greetingStyle: string;
  allowVoicemail: boolean;
  scriptSummary: string | null;
}) {
  const lines: string[] = [];
  lines.push(`<Say voice="${plan.voice}">${escapeXml(buildGreetingLine(plan.greetingStyle))}</Say>`);
  lines.push(`<Say voice="${plan.voice}">${escapeXml(buildScriptSpeechText(plan.scriptSummary))}</Say>`);
  if (plan.allowVoicemail) {
    lines.push(`<Pause length="1"/>`);
    lines.push(
      `<Say voice="${plan.voice}">${escapeXml(
        "If we don't connect, we'll leave a voicemail with these updates and next steps.",
      )}</Say>`,
    );
    lines.push(
      `<Say voice="${plan.voice}">${escapeXml(
        "Please call us back when you are ready to confirm or reschedule.",
      )}</Say>`,
    );
  }
  return `<Response>${lines.join("")}</Response>`;
}

function recordParams(record: Record<string, string>, key: string, value?: string | null) {
  if (value && !(key in record)) {
    record[key] = value;
  }
}

function getRequestUrl(req: NextRequest): string | null {
  if (req.nextUrl?.href) {
    return req.nextUrl.href;
  }
  if (typeof req.url === "string" && req.url.length > 0) {
    return req.url;
  }
  return null;
}

async function collectParams(req: NextRequest): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  const requestUrl = getRequestUrl(req);
  const searchParams = req.nextUrl?.searchParams;
  if (searchParams) {
    searchParams.forEach((value, key) => {
      recordParams(params, key, value);
    });
  } else if (requestUrl) {
    const queryIndex = requestUrl.indexOf("?");
    const queryString = queryIndex >= 0 ? requestUrl.slice(queryIndex + 1) : "";
    const fallbackSearchParams = new URLSearchParams(queryString);
    fallbackSearchParams.forEach((value, key) => {
      recordParams(params, key, value);
    });
  }
  if (req.method === "POST") {
    const formData = await req.formData();
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        recordParams(params, key, value);
      }
    });
  }
  return params;
}

async function handleRequest(req: NextRequest) {
  const params = await collectParams(req);
  const signature = req.headers.get(TWILIO_SIGNATURE_HEADER);
  const requestUrl = getRequestUrl(req);
  if (!requestUrl) {
    console.warn("[twilio-outbound-voice-twiml-rejected]", {
      reason: "missing_request_url",
    });
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const verification = verifyTwilioSignature(signature, params, requestUrl);
  if (!verification.valid) {
    const rejectionLog: Record<string, unknown> = {
      reason: verification.reason,
      detail: verification.detail,
    };
    const sid = params.CallSid ?? null;
    if (sid) {
      rejectionLog.sid = sid;
    }
    console.warn("[twilio-outbound-voice-twiml-rejected]", rejectionLog);
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const callSid = params.CallSid ?? null;
  const callIdFromParams = params.callId ?? null;
  const workspaceIdFromParams = params.workspaceId ?? null;
  const supabase = createAdminClient();
  let callRow: { id: string; workspace_id: string; summary?: string | null } | null = null;

  if (callSid) {
    const { data, error } = await supabase
      .from("calls")
      .select("id, workspace_id, summary")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();
    if (error) {
      console.warn("[twilio-outbound-voice-twiml-db-error]", {
        reason: "call_sid_query",
        error,
      });
    }
    callRow = data ?? null;
  }

  if (!callRow && callIdFromParams) {
    const { data, error } = await supabase
      .from("calls")
      .select("id, workspace_id, summary")
      .eq("id", callIdFromParams)
      .maybeSingle();
    if (error) {
      console.warn("[twilio-outbound-voice-twiml-db-error]", {
        reason: "call_id_query",
        error,
      });
    }
    callRow = data ?? null;
  }

  const planFromSummary = parseCallSpeechPlan(callRow?.summary ?? null);
  const plan = planFromSummary ?? {
    voice: ASKBOB_AUTOMATED_VOICE_DEFAULT,
    greetingStyle: ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT,
    allowVoicemail: false,
    scriptSummary: null,
  };

  console.log("[twilio-outbound-voice-twiml-served]", {
    callId: callRow?.id ?? callIdFromParams ?? null,
    workspaceId: callRow?.workspace_id ?? workspaceIdFromParams ?? null,
    twilioCallSid: callSid,
    voicemailEnabled: plan.allowVoicemail,
  });

  const twiml = buildResponseBody(plan);
  return new NextResponse(twiml, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
