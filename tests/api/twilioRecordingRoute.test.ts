import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();
const mockUpdateRecordingMetadata = vi.fn();
const mockValidateRequest = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/lib/domain/calls/sessions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/calls/sessions")>(
    "@/lib/domain/calls/sessions",
  );
  return {
    __esModule: true,
    ...actual,
    updateCallSessionRecordingMetadata: (...args: Parameters<typeof actual.updateCallSessionRecordingMetadata>) =>
      mockUpdateRecordingMetadata(...args),
  };
});

vi.mock("twilio", () => ({
  __esModule: true,
  default: {
    validateRequest: (...args: unknown[]) =>
      mockValidateRequest(...(args as [string, string, string, Record<string, string>])),
  },
}));

let POST: typeof import("@/app/api/twilio/calls/recording/route").POST;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

function buildRequest(
  params: Record<string, string | null>,
  signature: string | null | undefined = "signature",
  callId?: string,
  workspaceId?: string,
) {
  const queryParts = [];
  if (callId) {
    queryParts.push(`callId=${encodeURIComponent(callId)}`);
  }
  if (workspaceId) {
    queryParts.push(`workspaceId=${encodeURIComponent(workspaceId)}`);
  }
  const query = queryParts.length ? `?${queryParts.join("&")}` : "";
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
      entries.forEach(([key, value]) => {
        if (value !== null) {
          callback(value, key);
        }
      });
    },
  } as unknown as FormData;

  return {
    url: `https://app.test/api/twilio/calls/recording${query}`,
    method: "POST",
    headers,
    formData: async () => formDataMock,
  } as unknown as NextRequest;
}

describe("Twilio recording callback route", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "token";
    mockValidateRequest.mockReturnValue(true);
    const supabaseState = setupSupabaseMock();
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
    const actualModule =
      await vi.importActual<typeof import("@/app/api/twilio/calls/recording/route")>(
        "@/app/api/twilio/calls/recording/route",
      );
    POST = actualModule.POST;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("rejects invalid signatures", async () => {
    mockValidateRequest.mockReturnValue(false);

    const response = await POST(
      buildRequest(
        {
          CallSid: "call-1",
          RecordingSid: "rec-1",
          RecordingUrl: "https://example.com",
          RecordingDuration: "45",
        },
        "bad-signature",
        "call-1",
        "workspace-1",
      ),
    );

    expect(response.status).toBe(403);
    expect(mockUpdateRecordingMetadata).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some(
        (args) =>
          args[0] === "[twilio-call-recording-callback-rejected]" &&
          args[1]?.reason === "invalid_signature",
      ),
    ).toBe(true);
  });

  it("handles unmatched calls gracefully", async () => {
    mockUpdateRecordingMetadata.mockResolvedValue(null);

    const response = await POST(
      buildRequest(
        {
          CallSid: "call-2",
          RecordingSid: "rec-2",
          RecordingUrl: "https://example.com",
          RecordingDuration: "60",
        },
        "signature",
        "call-missing",
        "workspace-1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateRecordingMetadata).toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some(
        (args) => args[0] === "[twilio-call-recording-callback-unmatched]",
      ),
    ).toBe(true);
  });

  it("applies recording metadata when the call is found", async () => {
    mockUpdateRecordingMetadata.mockResolvedValue({
      callId: "call-3",
      workspaceId: "workspace-1",
      applied: true,
      duplicate: false,
    });

    const response = await POST(
      buildRequest(
        {
          CallSid: "call-3",
          RecordingSid: "rec-3",
          RecordingUrl: "https://example.com/recording.mp3",
          RecordingDuration: "123",
        },
        "signature",
        "call-3",
        "workspace-1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateRecordingMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingSid: "rec-3",
        recordingUrl: "https://example.com/recording.mp3",
        recordingDurationSeconds: 123,
        callId: "call-3",
        workspaceId: "workspace-1",
        twilioCallSid: "call-3",
      }),
    );
    expect(
      logSpy.mock.calls.some(
        (args) =>
          args[0] === "[twilio-call-recording-callback-applied]" &&
          args[1]?.callId === "call-3" &&
          args[1]?.recordingSid === "rec-3",
      ),
    ).toBe(true);
  });

  it("treats duplicate callbacks as no-ops", async () => {
    mockUpdateRecordingMetadata.mockResolvedValue({
      callId: "call-4",
      workspaceId: "workspace-1",
      applied: false,
      duplicate: true,
    });

    const response = await POST(
      buildRequest(
        {
          CallSid: "call-4",
          RecordingSid: "rec-4",
          RecordingUrl: "https://example.com",
          RecordingDuration: "90",
        },
        "signature",
        "call-4",
        "workspace-1",
      ),
    );

    expect(response.status).toBe(200);
    expect(
      logSpy.mock.calls.some(
        (args) =>
          args[0] === "[twilio-call-recording-callback-duplicate]" &&
          args[1]?.callId === "call-4",
      ),
    ).toBe(true);
  });
});
