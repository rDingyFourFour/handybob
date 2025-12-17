import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCallSessionDialStatus } from "@/app/(app)/calls/actions/getCallSessionDialStatus";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

describe("getCallSessionDialStatus", () => {
  let query: ReturnType<typeof createQueryMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    query = createQueryMock();
    createServerClientMock.mockReturnValue({
      from: vi.fn(() => query),
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
          error: null,
        })),
      },
    });
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
  });

  it("rejects when the caller is unauthorized", async () => {
    mockGetCurrentWorkspace.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(getCallSessionDialStatus({ callId: "call-1" })).rejects.toThrow("Unauthorized");
  });

  it("rejects when the call does not belong to the workspace", async () => {
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(getCallSessionDialStatus({ callId: "call-2" })).rejects.toThrow("Call not found");
  });

  it("returns null-safe data before Twilio populates the status", async () => {
    query.maybeSingle.mockResolvedValue({
      data: {
        id: "call-3",
        workspace_id: "workspace-1",
        twilio_call_sid: null,
        twilio_status: null,
        twilio_status_updated_at: null,
        twilio_recording_url: null,
        twilio_recording_sid: null,
        twilio_recording_duration_seconds: null,
      },
      error: null,
    });

    const result = await getCallSessionDialStatus({ callId: "call-3" });
    expect(result).toEqual({
      callId: "call-3",
      twilioCallSid: null,
      twilioStatus: null,
      twilioStatusUpdatedAt: null,
      isTerminal: false,
      hasRecording: false,
      recordingDurationSeconds: null,
    });
  });

  it("marks terminal statuses and recording flags correctly", async () => {
    query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: "call-4",
          workspace_id: "workspace-1",
          twilio_call_sid: "sid-1",
          twilio_status: "ringing",
          twilio_status_updated_at: "2023-01-01T00:00:00Z",
          twilio_recording_url: null,
          twilio_recording_sid: null,
          twilio_recording_duration_seconds: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "call-4",
          workspace_id: "workspace-1",
          twilio_call_sid: "sid-1",
          twilio_status: "completed",
          twilio_status_updated_at: "2023-01-01T00:00:10Z",
          twilio_recording_url: "https://example.com/rec.mp3",
          twilio_recording_sid: "rec-1",
          twilio_recording_duration_seconds: 45,
        },
        error: null,
      });

    const pendingResult = await getCallSessionDialStatus({ callId: "call-4" });
    expect(pendingResult.isTerminal).toBe(false);
    expect(pendingResult.hasRecording).toBe(false);

    const completedResult = await getCallSessionDialStatus({ callId: "call-4" });
    expect(completedResult.isTerminal).toBe(true);
    expect(completedResult.hasRecording).toBe(true);
    expect(completedResult.recordingDurationSeconds).toBe(45);
  });
});

function createQueryMock() {
  const maybeSingle = vi.fn();
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle,
  };
  return query;
}
