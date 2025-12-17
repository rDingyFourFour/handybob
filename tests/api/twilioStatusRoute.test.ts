import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();
const mockUpdateTwilioStatus = vi.fn();
const mockValidateRequest = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/lib/domain/calls/sessions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/calls/sessions")>("@/lib/domain/calls/sessions");
  return {
    __esModule: true,
    ...actual,
    updateCallSessionTwilioStatus: (...args: Parameters<typeof actual.updateCallSessionTwilioStatus>) =>
      mockUpdateTwilioStatus(...args),
  };
});

vi.mock("twilio", () => ({
  __esModule: true,
  default: {
    validateRequest: (...args: unknown[]) => mockValidateRequest(...(args as [string, string, string, Record<string, string>])),
  },
}));

let POST: typeof import("@/app/api/twilio/calls/status/route").POST;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

function buildRequest(
  params: Record<string, string>,
  signature: string | null | undefined = "signature",
  callId?: string,
) {
  const query = callId ? `?callId=${encodeURIComponent(callId)}` : "";
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
  });
  if (typeof signature === "string") {
    headers.set("x-twilio-signature", signature);
  }
  const normalizedParams = { ...params };
  const entries = Object.entries(normalizedParams);
  const formDataMock: FormData = {
    get: (key: string) => (normalizedParams[key] ?? null),
    forEach(callback: (value: string, key: string) => void) {
      entries.forEach(([key, value]) => callback(value, key));
    },
  } as unknown as FormData;

  return {
    url: `https://app.test/api/twilio/calls/status${query}`,
    method: "POST",
    headers,
    formData: async () => formDataMock,
  } as unknown as NextRequest;
}

describe("Twilio status callback route", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "token";
    mockValidateRequest.mockReturnValue(true);
    const actualModule = await vi.importActual<typeof import("@/app/api/twilio/calls/status/route")>(
      "@/app/api/twilio/calls/status/route",
    );
    POST = actualModule.POST;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("rejects requests with an invalid signature", async () => {
    mockValidateRequest.mockReturnValue(false);

    const response = await POST(buildRequest({ CallSid: "call-1" }, "bad-signature"));

    expect(response.status).toBe(403);
    expect(mockUpdateTwilioStatus).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some(
        (args) => args[0] === "[twilio-call-status-callback-rejected]" && args[1]?.reason === "invalid_signature",
      ),
    ).toBe(true);
  });

  it("rejects requests with a missing signature header", async () => {
    const response = await POST(buildRequest({ CallSid: "call-2" }, null));

    expect(response.status).toBe(403);
    expect(mockUpdateTwilioStatus).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some(
        (args) => args[0] === "[twilio-call-status-callback-rejected]" && args[1]?.reason === "missing_signature",
      ),
    ).toBe(true);
  });

  it("updates the call session when a valid callback arrives", async () => {
    const supabaseState = setupSupabaseMock({
      calls: {
        data: [
          {
            id: "call-123",
            twilio_call_sid: "call-1",
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const response = await POST(
      buildRequest(
        {
          CallSid: "call-1",
          CallStatus: "ringing",
          ErrorCode: "123",
          ErrorMessage: "Busy line",
        },
        "signature",
        "call-123",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateTwilioStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-123",
        twilioStatus: "ringing",
        errorCode: "123",
        errorMessage: "Busy line",
      }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.some((args) => args[0] === "[twilio-call-status-callback-received]")).toBe(true);
    expect(logSpy.mock.calls.some((args) => args[0] === "[twilio-call-status-callback-updated]")).toBe(true);
  });

  it("logs unmatched when the callback SID does not resolve a call row", async () => {
    const supabaseState = setupSupabaseMock({
      calls: {
        data: [],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const response = await POST(
      buildRequest({
        CallSid: "missing-sid",
        CallStatus: "completed",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateTwilioStatus).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((args) => args[0] === "[twilio-call-status-callback-unmatched]")).toBe(true);
  });
});
