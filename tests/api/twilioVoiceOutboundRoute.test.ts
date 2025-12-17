import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { SPEECH_PLAN_METADATA_MARKER } from "@/lib/domain/askbob/speechPlan";

const createAdminClientMock = vi.fn();
const mockVerifyTwilioSignature = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/lib/domain/twilio/signature", () => ({
  TWILIO_SIGNATURE_HEADER: "x-twilio-signature",
  verifyTwilioSignature: (...args: Parameters<typeof mockVerifyTwilioSignature>) =>
    mockVerifyTwilioSignature(...args),
}));

let GET: typeof import("@/app/api/twilio/voice/outbound/route").GET;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

function buildRequest(params: Record<string, string>, signature = "signature") {
  const queryString = Object.keys(params).length
    ? `?${new URLSearchParams(params).toString()}`
    : "";
  const url = new URL(`https://app.test/api/twilio/voice/outbound${queryString}`);
  const headers = new Headers();
  if (signature) {
    headers.set("x-twilio-signature", signature);
  }
  return {
    url: url.toString(),
    method: "GET",
    headers,
    nextUrl: url,
  } as unknown as NextRequest;
}

describe("Twilio outbound voice TwiML route", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    const actualModule = await vi.importActual<typeof import("@/app/api/twilio/voice/outbound/route")>(
      "@/app/api/twilio/voice/outbound/route",
    );
    GET = actualModule.GET;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("rejects requests with an invalid signature", async () => {
    mockVerifyTwilioSignature.mockReturnValue({ valid: false, reason: "invalid_signature" });

    const response = await GET(buildRequest({ CallSid: "call-1" }, "bad-signature"));

    expect(response.status).toBe(403);
    expect(warnSpy.mock.calls.some((call) => call[0] === "[twilio-outbound-voice-twiml-rejected]")).toBe(
      true,
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("serves TwiML for valid sessions including voicemail copy when enabled", async () => {
    mockVerifyTwilioSignature.mockReturnValue({ valid: true });
    const summary = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} Hello there${SPEECH_PLAN_METADATA_MARKER}${JSON.stringify(
      {
        voice: "alloy",
        greetingStyle: "Professional",
        allowVoicemail: true,
        scriptSummary: "Hello there",
      },
    )}`;
    const supabaseState = setupSupabaseMock({
      calls: {
        data: [
          {
            id: "call-123",
            workspace_id: "workspace-1",
            summary,
            twilio_call_sid: "call-1",
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const response = await GET(buildRequest({ CallSid: "call-1" }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("<Say voice=\"alloy\">");
    expect(text).toContain("If we don&#39;t connect");
    expect(
      logSpy.mock.calls.some((call) => call[0] === "[twilio-outbound-voice-twiml-served]"),
    ).toBe(true);
  });

  it("skips voicemail copy when the plan disallows it", async () => {
    mockVerifyTwilioSignature.mockReturnValue({ valid: true });
    const summary = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} Hello there${SPEECH_PLAN_METADATA_MARKER}${JSON.stringify(
      {
        voice: "alloy",
        greetingStyle: "Professional",
        allowVoicemail: false,
        scriptSummary: "Hello there",
      },
    )}`;
    const supabaseState = setupSupabaseMock({
      calls: {
        data: [
          {
            id: "call-124",
            workspace_id: "workspace-1",
            summary,
            twilio_call_sid: "call-2",
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const response = await GET(buildRequest({ CallSid: "call-2" }));
    const text = await response.text();

    expect(text).not.toContain("If we don&#39;t connect");
    expect(text).not.toContain("Please call us back");
  });
});
