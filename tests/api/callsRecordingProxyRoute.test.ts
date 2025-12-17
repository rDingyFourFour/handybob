import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { setupSupabaseMock, type SupabaseMockState } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockFetchTwilioRecording = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("@/lib/domain/twilio.server", () => ({
  fetchTwilioRecording: (...args: unknown[]) => mockFetchTwilioRecording(...args),
}));

let GET: typeof import("@/app/api/calls/recording/[callId]/route").GET;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let supabaseState: SupabaseMockState;

function buildContext(callId: string) {
  return { params: { callId } };
}

describe("Call recording proxy route", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    const routeModule =
      await vi.importActual<typeof import("@/app/api/calls/recording/[callId]/route")>(
        "@/app/api/calls/recording/[callId]/route",
      );
    GET = routeModule.GET;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentWorkspace.mockRejectedValueOnce(new Error("Unauthorized"));
    const response = await GET({} as NextRequest, buildContext("call-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the call does not belong to the workspace", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-2",
          workspace_id: "workspace-2",
          twilio_recording_url: "https://example.com",
        },
      ],
      error: null,
    };

    const response = await GET({} as NextRequest, buildContext("call-2"));
    expect(response.status).toBe(404);
  });

  it("returns 404 and logs when the recording URL is missing", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-3",
          workspace_id: "workspace-1",
          twilio_recording_url: null,
        },
      ],
      error: null,
    };

    const response = await GET({} as NextRequest, buildContext("call-3"));
    expect(response.status).toBe(404);
    expect(
      warnSpy.mock.calls.some((args) => args[0] === "[calls-recording-proxy-missing]"),
    ).toBe(true);
  });

  it("returns 502 and logs when Twilio fails", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-4",
          workspace_id: "workspace-1",
          twilio_recording_url: "https://example.com/recording",
        },
      ],
      error: null,
    };
    mockFetchTwilioRecording.mockResolvedValue({
      success: false,
      code: "upstream_failure",
      status: 500,
      message: "boom",
    });

    const response = await GET({} as NextRequest, buildContext("call-4"));
    expect(response.status).toBe(502);
    expect(
      warnSpy.mock.calls.some((args) => args[0] === "[calls-recording-proxy-upstream-failure]"),
    ).toBe(true);
  });

  it("streams audio when Twilio returns success", async () => {
    const recordingResponse = new Response("audio-bytes", {
      headers: {
        "content-type": "audio/wav",
        "content-length": "12",
      },
    });
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-5",
          workspace_id: "workspace-1",
          twilio_recording_url: "https://example.com/recording",
        },
      ],
      error: null,
    };
    mockFetchTwilioRecording.mockResolvedValue({
      success: true,
      response: recordingResponse,
    });

    const response = await GET({} as NextRequest, buildContext("call-5"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-length")).toBe("12");
    expect(
      logSpy.mock.calls.some(
        (args) =>
          args[0] === "[calls-recording-proxy-success]" &&
          args[1]?.callId === "call-5" &&
          args[1]?.bytes === 12,
      ),
    ).toBe(true);
  });
});
